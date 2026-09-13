{
  "targets": [
    {
      "target_name": "smartloop_auth",
      "defines": ["NAPI_DISABLE_CPP_EXCEPTIONS", "NODE_ADDON_API_DISABLE_DEPRECATED"],
      # `include`, not `include_dir`: the former is an absolute, quoted path;
      # the latter is relative to the cwd node-gyp happens to run in. gyp writes
      # the MSVS project into native/build/, so a relative path lands one level
      # too deep there and MSBuild reports "cannot open include file: napi.h" —
      # which is exactly how the Windows CI build failed. Absolute can't slip.
      "include_dirs": ["<!@(node -p \"require('node-addon-api').include\")"],
      "conditions": [
        ["OS=='mac'", {
          "sources": ["src/auth.mm"],
          "xcode_settings": {
            "CLANG_ENABLE_OBJC_ARC": "YES",
            "GCC_ENABLE_CPP_EXCEPTIONS": "NO",
            "CLANG_CXX_LIBRARY": "libc++",
            "CLANG_CXX_LANGUAGE_STANDARD": "c++17",
            "MACOSX_DEPLOYMENT_TARGET": "10.15"
          },
          "link_settings": {
            "libraries": [
              "$(SDKROOT)/System/Library/Frameworks/AuthenticationServices.framework",
              "$(SDKROOT)/System/Library/Frameworks/AppKit.framework",
              "$(SDKROOT)/System/Library/Frameworks/Foundation.framework"
            ]
          }
        }],
        ["OS!='mac'", {
          "sources": ["src/unsupported.cc"]
        }]
      ]
    }
  ]
}
