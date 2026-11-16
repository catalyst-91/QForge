{
  "targets": [{
    "target_name": "qforge_ndi",
    "sources": ["src/qforge_ndi.c"],
    "include_dirs": ["include"],
    "defines": ["NAPI_VERSION=8"],
    "conditions": [
      ["OS=='mac'", { "xcode_settings": { "MACOSX_DEPLOYMENT_TARGET": "11.0" } }]
    ]
  }]
}
