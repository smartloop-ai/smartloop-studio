{
  "targets": [
    {
      "target_name": "smartloop_auth",
      "defines": ["NAPI_DISABLE_CPP_EXCEPTIONS", "NODE_ADDON_API_DISABLE_DEPRECATED"],
      "include_dirs": ["<!@(node -p \"require('node-addon-api').include_dir\")"],
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
