// macOS AuthenticationServices bindings for the Electron main process.
//
// Why this exists: OAuth 2.0 for Native Apps (RFC 8252 §8.12) rules out
// embedded user-agents — the host app can read what is typed, there is no SSO
// with the system browser, and password managers do not reach into them.
// Providers enforce this: Google refuses to render in anything that
// self-identifies as an embedded browser. App Review says the same thing in
// guideline 4.0 — social login is acceptable through ASWebAuthenticationSession,
// and Sign in with Apple must complete without leaving the app.
//
// Electron ships no binding for either API, so this is it. Two entry points:
//
//   startWebAuthSession(url, scheme) -> Promise<callbackURL>
//       ASWebAuthenticationSession. A system-owned browser sheet that shares
//       Safari's cookie jar, so an already-signed-in Google account needs no
//       password. Returns the custom-scheme URL the provider redirects to.
//
//   signInWithApple({ nonce, requestEmail, requestName }) -> Promise<credential>
//       The native Sign in with Apple sheet, with Touch ID. Never leaves the app.
//
// Threading: both callbacks arrive on the main queue, which in Electron's main
// process is also the JavaScript thread. They are marshalled through a
// ThreadSafeFunction anyway — it keeps the addon correct if it is ever loaded
// where the two threads differ — but it must be a NON-blocking call. A blocking
// one waits for a queue that only this same thread can drain, which deadlocks
// the app the moment a sheet is dismissed.

#import <AppKit/AppKit.h>
#import <AuthenticationServices/AuthenticationServices.h>

#include <napi.h>
#include <memory>
#include <string>

namespace {

NSString* ToNSString(const std::string& value) {
  return [NSString stringWithUTF8String:value.c_str()];
}

std::string FromNSString(NSString* value) {
  return value ? std::string([value UTF8String]) : std::string();
}

// Base64url of an NSData, for handing Apple's raw token bytes to JavaScript.
NSString* ToUTF8OrNil(NSData* data) {
  if (!data) return nil;
  return [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
}

/**
 * Bridges one async AuthenticationServices call back to a JS promise.
 *
 * Settling exactly once is the point: the delegate and the completion handler
 * can both be reached in edge cases (a cancel racing a result), and resolving a
 * deferred twice aborts the process.
 */
class PromiseBridge {
 public:
  explicit PromiseBridge(Napi::Env env)
      : deferred_(Napi::Promise::Deferred::New(env)),
        tsfn_(Napi::ThreadSafeFunction::New(env, Napi::Function::New(env, [](const Napi::CallbackInfo&) {}),
                                            "SmartloopAuth", 0, 1)) {}

  Napi::Promise Promise() const { return deferred_.Promise(); }

  // Hand the resolver a builder so the value is constructed on the JS thread.
  void Resolve(std::function<Napi::Value(Napi::Env)> build) {
    Settle([this, build](Napi::Env env) { deferred_.Resolve(build(env)); });
  }

  void Reject(const std::string& code, const std::string& message) {
    Settle([this, code, message](Napi::Env env) {
      Napi::Error error = Napi::Error::New(env, message);
      error.Set("code", Napi::String::New(env, code));
      deferred_.Reject(error.Value());
    });
  }

 private:
  void Settle(std::function<void(Napi::Env)> action) {
    if (settled_.exchange(true)) return;
    // NonBlockingCall, never BlockingCall — see the threading note at the top.
    tsfn_.NonBlockingCall([action](Napi::Env env, Napi::Function) { action(env); });
    tsfn_.Release();
  }

  Napi::Promise::Deferred deferred_;
  Napi::ThreadSafeFunction tsfn_;
  std::atomic<bool> settled_{false};
};

}  // namespace

#pragma mark - Presentation anchor

/**
 * Where the system sheet attaches.
 *
 * Resolved from NSApp rather than taken from JavaScript: BrowserWindow's
 * native handle is an NSView pointer that has to be unwrapped and can go stale
 * if the window closes mid-flow, whereas the key window is always the one the
 * user is looking at.
 */
API_AVAILABLE(macos(10.15))
@interface SLAuthAnchor : NSObject <ASWebAuthenticationPresentationContextProviding,
                                    ASAuthorizationControllerPresentationContextProviding>
@end

@implementation SLAuthAnchor

+ (NSWindow*)resolveAnchor {
  return NSApp.keyWindow ?: NSApp.mainWindow ?: NSApp.windows.firstObject;
}

- (ASPresentationAnchor)anchor {
  return [SLAuthAnchor resolveAnchor];
}

- (ASPresentationAnchor)presentationAnchorForWebAuthenticationSession:(ASWebAuthenticationSession*)session {
  return [self anchor];
}

- (ASPresentationAnchor)presentationAnchorForAuthorizationController:(ASAuthorizationController*)controller {
  return [self anchor];
}

@end

#pragma mark - Sign in with Apple delegate

API_AVAILABLE(macos(10.15))
@interface SLAppleDelegate : NSObject <ASAuthorizationControllerDelegate>
@property(nonatomic, strong) SLAuthAnchor* anchor;
@end

@implementation SLAppleDelegate {
  std::shared_ptr<PromiseBridge> _bridge;
  // Held so ARC cannot collect the delegate while the sheet is up — the
  // controller keeps only a weak reference to it.
  SLAppleDelegate* _selfRef;
}

- (instancetype)initWithBridge:(std::shared_ptr<PromiseBridge>)bridge {
  if ((self = [super init])) {
    _bridge = bridge;
    _selfRef = self;
  }
  return self;
}

- (void)authorizationController:(ASAuthorizationController*)controller
    didCompleteWithAuthorization:(ASAuthorization*)authorization {
  auto bridge = _bridge;
  _selfRef = nil;

  if (![authorization.credential isKindOfClass:[ASAuthorizationAppleIDCredential class]]) {
    bridge->Reject("APPLE_UNEXPECTED_CREDENTIAL", "Apple returned an unexpected credential type");
    return;
  }

  ASAuthorizationAppleIDCredential* credential =
      (ASAuthorizationAppleIDCredential*)authorization.credential;

  // Copied out now: the credential is not safe to touch from the JS thread.
  std::string user = FromNSString(credential.user);
  std::string identityToken = FromNSString(ToUTF8OrNil(credential.identityToken));
  std::string authorizationCode = FromNSString(ToUTF8OrNil(credential.authorizationCode));
  std::string email = FromNSString(credential.email);

  NSPersonNameComponents* name = credential.fullName;
  std::string fullName;
  if (name) {
    NSString* formatted = [NSPersonNameComponentsFormatter
        localizedStringFromPersonNameComponents:name
                                          style:NSPersonNameComponentsFormatterStyleDefault
                                        options:0];
    fullName = FromNSString(formatted);
  }

  bridge->Resolve([user, identityToken, authorizationCode, email, fullName](Napi::Env env) {
    Napi::Object result = Napi::Object::New(env);
    result.Set("user", Napi::String::New(env, user));
    result.Set("identityToken", Napi::String::New(env, identityToken));
    result.Set("authorizationCode", Napi::String::New(env, authorizationCode));
    // Apple sends the name and email on the FIRST authorization only, and never
    // again — so an empty value here is normal for a returning user, not a
    // failure. The server keeps what it was given the first time.
    if (!email.empty()) result.Set("email", Napi::String::New(env, email));
    if (!fullName.empty()) result.Set("fullName", Napi::String::New(env, fullName));
    return result;
  });
}

- (void)authorizationController:(ASAuthorizationController*)controller
           didCompleteWithError:(NSError*)error {
  auto bridge = _bridge;
  _selfRef = nil;

  const char* code = "APPLE_FAILED";
  if (error.code == ASAuthorizationErrorCanceled) {
    code = "CANCELLED";
  } else if (error.code == ASAuthorizationErrorNotHandled || error.code == ASAuthorizationErrorUnknown) {
    code = "APPLE_UNAVAILABLE";
  }
  bridge->Reject(code, FromNSString(error.localizedDescription));
}

@end

#pragma mark - JS entry points

namespace {

Napi::Value StartWebAuthSession(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 2 || !info[0].IsString() || !info[1].IsString()) {
    Napi::TypeError::New(env, "startWebAuthSession(url, callbackScheme)").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  std::string url = info[0].As<Napi::String>();
  std::string scheme = info[1].As<Napi::String>();
  bool ephemeral = info.Length() > 2 && info[2].IsObject() &&
                   info[2].As<Napi::Object>().Get("ephemeral").ToBoolean().Value();

  auto bridge = std::make_shared<PromiseBridge>(env);

  if (@available(macOS 10.15, *)) {
    // AuthenticationServices dereferences the anchor without checking it, so a
    // window-less process crashes rather than erroring. Refuse up front.
    if (![SLAuthAnchor resolveAnchor]) {
      bridge->Reject("NO_WINDOW", "A visible window is required to present the sign-in sheet");
      return bridge->Promise();
    }

    SLAuthAnchor* anchor = [[SLAuthAnchor alloc] init];
    __block ASWebAuthenticationSession* session = nil;

    session = [[ASWebAuthenticationSession alloc]
              initWithURL:[NSURL URLWithString:ToNSString(url)]
        callbackURLScheme:ToNSString(scheme)
        completionHandler:^(NSURL* callbackURL, NSError* error) {
          // Captured so ARC keeps the session alive until it finishes.
          session = nil;
          if (error) {
            const char* code = error.code == ASWebAuthenticationSessionErrorCodeCanceledLogin
                                   ? "CANCELLED"
                                   : "WEB_AUTH_FAILED";
            bridge->Reject(code, FromNSString(error.localizedDescription));
            return;
          }
          std::string result = FromNSString(callbackURL.absoluteString);
          bridge->Resolve([result](Napi::Env env) { return Napi::String::New(env, result); });
        }];

    session.presentationContextProvider = anchor;
    // Off by default: sharing Safari's cookies is the whole point — it is what
    // turns an already-signed-in Google account into one click.
    session.prefersEphemeralWebBrowserSession = ephemeral;

    if (![session start]) {
      bridge->Reject("WEB_AUTH_START_FAILED", "The system refused to start the authentication session");
    }
  } else {
    bridge->Reject("UNSUPPORTED_OS", "ASWebAuthenticationSession requires macOS 10.15 or later");
  }

  return bridge->Promise();
}

Napi::Value SignInWithApple(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  auto bridge = std::make_shared<PromiseBridge>(env);

  std::string nonce;
  if (info.Length() > 0 && info[0].IsObject()) {
    Napi::Object options = info[0].As<Napi::Object>();
    if (options.Has("nonce") && options.Get("nonce").IsString()) {
      nonce = options.Get("nonce").As<Napi::String>();
    }
  }

  if (@available(macOS 10.15, *)) {
    if (![SLAuthAnchor resolveAnchor]) {
      bridge->Reject("NO_WINDOW", "A visible window is required to present the sign-in sheet");
      return bridge->Promise();
    }

    ASAuthorizationAppleIDProvider* provider = [[ASAuthorizationAppleIDProvider alloc] init];
    ASAuthorizationAppleIDRequest* request = [provider createRequest];
    request.requestedScopes = @[ ASAuthorizationScopeFullName, ASAuthorizationScopeEmail ];
    // Bound to the nonce the caller generated, so the identity token cannot be
    // replayed into a session it was not issued for.
    if (!nonce.empty()) request.nonce = ToNSString(nonce);

    SLAppleDelegate* delegate = [[SLAppleDelegate alloc] initWithBridge:bridge];
    SLAuthAnchor* anchor = [[SLAuthAnchor alloc] init];
    delegate.anchor = anchor;

    ASAuthorizationController* controller =
        [[ASAuthorizationController alloc] initWithAuthorizationRequests:@[ request ]];
    controller.delegate = delegate;
    controller.presentationContextProvider = anchor;
    [controller performRequests];
  } else {
    bridge->Reject("UNSUPPORTED_OS", "Sign in with Apple requires macOS 10.15 or later");
  }

  return bridge->Promise();
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("supported", Napi::Boolean::New(env, true));
  exports.Set("startWebAuthSession", Napi::Function::New(env, StartWebAuthSession));
  exports.Set("signInWithApple", Napi::Function::New(env, SignInWithApple));
  return exports;
}

}  // namespace

NODE_API_MODULE(smartloop_auth, Init)
