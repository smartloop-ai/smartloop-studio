// Non-macOS placeholder.
//
// AuthenticationServices is an Apple framework, so there is nothing to bind on
// Windows or Linux. The addon still has to build and load there — it is a plain
// dependency and electron-builder rebuilds it on every platform — so this
// exports the same names and reports that they are unavailable. index.js checks
// `supported` before calling anything, so this path is never hit in practice.
#include <napi.h>

Napi::Value Unsupported(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  auto deferred = Napi::Promise::Deferred::New(env);
  deferred.Reject(Napi::Error::New(env, "Native authentication is only available on macOS").Value());
  return deferred.Promise();
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("supported", Napi::Boolean::New(env, false));
  exports.Set("startWebAuthSession", Napi::Function::New(env, Unsupported));
  exports.Set("signInWithApple", Napi::Function::New(env, Unsupported));
  return exports;
}

NODE_API_MODULE(smartloop_auth, Init)
