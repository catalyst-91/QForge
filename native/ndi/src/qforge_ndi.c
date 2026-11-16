// QForge NDI bridge: a small Node-API module that loads the NDI® runtime at run time
// (bundled libndi on macOS, the installed NDI Runtime on Windows) and exposes find / send / receive.
// NDI® is a registered trademark of Vizrt NDI AB. https://ndi.video
#define NAPI_VERSION 8
#include <node_api.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>
#include <stdbool.h>
#include <stdint.h>
#include "Processing.NDI.Lib.h"

#ifdef _WIN32
#include <windows.h>
typedef HANDLE qf_thread;
#define qf_sleep_ms(ms) Sleep(ms)
#define strdup _strdup
static void *qf_dlopen(const char *path) {
  wchar_t w[2048]; MultiByteToWideChar(CP_UTF8, 0, path, -1, w, 2048);
  return (void *)LoadLibraryExW(w, NULL, LOAD_WITH_ALTERED_SEARCH_PATH);
}
static void *qf_dlsym(void *h, const char *n) { return (void *)GetProcAddress((HMODULE)h, n); }
#else
#include <dlfcn.h>
#include <pthread.h>
#include <unistd.h>
typedef pthread_t qf_thread;
#define qf_sleep_ms(ms) usleep((ms) * 1000)
static void *qf_dlopen(const char *path) { return dlopen(path, RTLD_NOW | RTLD_LOCAL); }
static void *qf_dlsym(void *h, const char *n) { return dlsym(h, n); }
#endif

static const NDIlib_v6 *NDI = NULL;
static void *ndi_lib = NULL;
static NDIlib_find_instance_t finder = NULL;

#define CHECK(call) do { if ((call) != napi_ok) { napi_throw_error(env, NULL, "N-API call failed: " #call); return NULL; } } while (0)
#define NEED_NDI() do { if (!NDI) { napi_throw_error(env, NULL, "NDI is not loaded"); return NULL; } } while (0)

static napi_value make_str(napi_env env, const char *s) { napi_value v; napi_create_string_utf8(env, s ? s : "", NAPI_AUTO_LENGTH, &v); return v; }
static napi_value make_num(napi_env env, double d) { napi_value v; napi_create_double(env, d, &v); return v; }
static napi_value make_bool(napi_env env, bool b) { napi_value v; napi_get_boolean(env, b, &v); return v; }
static char *get_str(napi_env env, napi_value v) {
  size_t len = 0; if (napi_get_value_string_utf8(env, v, NULL, 0, &len) != napi_ok) return NULL;
  char *s = (char *)malloc(len + 1); napi_get_value_string_utf8(env, v, s, len + 1, &len); return s;
}
static double get_num(napi_env env, napi_value v, double def) { double d; return napi_get_value_double(env, v, &d) == napi_ok ? d : def; }

// load(path) -> { ok, version, error }
static napi_value js_load(napi_env env, napi_callback_info info) {
  size_t argc = 1; napi_value argv[1]; napi_value out;
  CHECK(napi_get_cb_info(env, info, &argc, argv, NULL, NULL));
  CHECK(napi_create_object(env, &out));
  if (NDI) { napi_set_named_property(env, out, "ok", make_bool(env, true)); napi_set_named_property(env, out, "version", make_str(env, NDI->version())); return out; }
  char *path = argc ? get_str(env, argv[0]) : NULL;
  if (!path) { napi_set_named_property(env, out, "ok", make_bool(env, false)); napi_set_named_property(env, out, "error", make_str(env, "no library path")); return out; }
  ndi_lib = qf_dlopen(path);
  free(path);
  if (!ndi_lib) { napi_set_named_property(env, out, "ok", make_bool(env, false)); napi_set_named_property(env, out, "error", make_str(env, "NDI runtime library not found")); return out; }
  const NDIlib_v6 *(*load_fn)(void) = (const NDIlib_v6 *(*)(void))qf_dlsym(ndi_lib, "NDIlib_v6_load");
  if (!load_fn) { napi_set_named_property(env, out, "ok", make_bool(env, false)); napi_set_named_property(env, out, "error", make_str(env, "this NDI runtime is too old (NDI 6 needed)")); return out; }
  const NDIlib_v6 *api = load_fn();
  if (!api || !api->initialize()) { napi_set_named_property(env, out, "ok", make_bool(env, false)); napi_set_named_property(env, out, "error", make_str(env, "NDI could not start (unsupported CPU?)")); return out; }
  NDI = api;
  napi_set_named_property(env, out, "ok", make_bool(env, true));
  napi_set_named_property(env, out, "version", make_str(env, NDI->version()));
  return out;
}

// findSources(waitMs, extraIps) -> [{ name, url }]
// extraIps: comma-separated addresses to ask directly (for sources on other subnets / no multicast)
static char *finder_ips = NULL;
static napi_value js_find(napi_env env, napi_callback_info info) {
  size_t argc = 2; napi_value argv[2]; NEED_NDI();
  CHECK(napi_get_cb_info(env, info, &argc, argv, NULL, NULL));
  uint32_t wait = argc ? (uint32_t)get_num(env, argv[0], 0) : 0;
  char *ips = NULL;
  if (argc > 1) { napi_valuetype ty; napi_typeof(env, argv[1], &ty); if (ty == napi_string) ips = get_str(env, argv[1]); }
  if (finder && ((ips && (!finder_ips || strcmp(ips, finder_ips))) || (!ips && finder_ips))) { NDI->find_destroy(finder); finder = NULL; }
  if (!finder) {
    free(finder_ips); finder_ips = ips ? strdup(ips) : NULL;
    NDIlib_find_create_t fc = { true, NULL, finder_ips && *finder_ips ? finder_ips : NULL };
    finder = NDI->find_create_v2(&fc);
  }
  free(ips);
  if (!finder) { napi_throw_error(env, NULL, "NDI finder could not start"); return NULL; }
  if (wait) NDI->find_wait_for_sources(finder, wait);
  uint32_t n = 0; const NDIlib_source_t *src = NDI->find_get_current_sources(finder, &n);
  napi_value arr; CHECK(napi_create_array_with_length(env, n, &arr));
  for (uint32_t i = 0; i < n; i++) {
    napi_value o; napi_create_object(env, &o);
    napi_set_named_property(env, o, "name", make_str(env, src[i].p_ndi_name));
    napi_set_named_property(env, o, "url", make_str(env, src[i].p_url_address));
    napi_set_element(env, arr, i, o);
  }
  return arr;
}

// ---------------------------------------------------------------- sender
typedef struct { NDIlib_send_instance_t send; uint8_t *buf[2]; size_t cap[2]; int cur; bool sent; } sender_t;
static void sender_free(sender_t *s) {
  if (!s) return;
  if (s->send) { if (s->sent) NDI->send_send_video_async_v2(s->send, NULL); NDI->send_destroy(s->send); }
  free(s->buf[0]); free(s->buf[1]); free(s);
}
static void sender_finalize(napi_env env, void *data, void *hint) { (void)env; (void)hint; if (NDI) sender_free((sender_t *)data); }
static sender_t *get_sender(napi_env env, napi_value v) { void *p = NULL; napi_get_value_external(env, v, &p); return (sender_t *)p; }

// senderCreate(name) -> handle
static napi_value js_sender_create(napi_env env, napi_callback_info info) {
  size_t argc = 1; napi_value argv[1]; NEED_NDI();
  CHECK(napi_get_cb_info(env, info, &argc, argv, NULL, NULL));
  char *name = argc ? get_str(env, argv[0]) : NULL;
  NDIlib_send_create_t sc; memset(&sc, 0, sizeof sc);
  sc.p_ndi_name = name ? name : "QForge"; sc.clock_video = false; sc.clock_audio = false;
  sender_t *s = (sender_t *)calloc(1, sizeof(sender_t));
  s->send = NDI->send_create(&sc);
  free(name);
  if (!s->send) { free(s); napi_throw_error(env, NULL, "NDI sender could not be created"); return NULL; }
  napi_value ext; CHECK(napi_create_external(env, s, sender_finalize, NULL, &ext));
  return ext;
}
// senderVideo(handle, Uint8Array, width, height, strideBytes, fourcc 'BGRA'|'RGBA'|'BGRX'|'RGBX'|'NV12'|'I420'|'UYVY', fpsN, fpsD)
// planar formats: tightly packed planes, luma stride = strideBytes
static napi_value js_sender_video(napi_env env, napi_callback_info info) {
  size_t argc = 8; napi_value argv[8]; NEED_NDI();
  CHECK(napi_get_cb_info(env, info, &argc, argv, NULL, NULL));
  sender_t *s = get_sender(env, argv[0]); if (!s || !s->send) return NULL;
  void *data = NULL; size_t len = 0; napi_typedarray_type tt; napi_value ab; size_t off;
  if (napi_get_typedarray_info(env, argv[1], &tt, &len, &data, &ab, &off) != napi_ok) { napi_throw_type_error(env, NULL, "expected a Uint8Array"); return NULL; }
  int w = (int)get_num(env, argv[2], 0), h = (int)get_num(env, argv[3], 0), stride = (int)get_num(env, argv[4], w * 4);
  char *fcc = get_str(env, argv[5]);
  int fn = (int)get_num(env, argv[6], 30000), fd = (int)get_num(env, argv[7], 1001);
  bool planar = fcc && (!strcmp(fcc, "NV12") || !strcmp(fcc, "I420"));
  bool uyvy = fcc && !strcmp(fcc, "UYVY");
  if (planar && stride < w) stride = w;
  if (uyvy && stride < w * 2) stride = w * 2;
  size_t need = (size_t)stride * (size_t)h; if (planar) need += need / 2;
  if (w <= 0 || h <= 0 || len < need) { free(fcc); napi_throw_range_error(env, NULL, "frame buffer too small"); return NULL; }
  // async send keeps the buffer until the next call, so alternate between two copies
  int i = s->cur ^ 1;
  if (s->cap[i] < need) { free(s->buf[i]); s->buf[i] = (uint8_t *)malloc(need); s->cap[i] = need; }
  memcpy(s->buf[i], data, need);
  NDIlib_video_frame_v2_t f; memset(&f, 0, sizeof f);
  f.xres = w; f.yres = h; f.frame_rate_N = fn; f.frame_rate_D = fd;
  f.picture_aspect_ratio = (float)w / (float)h; f.frame_format_type = NDIlib_frame_format_type_progressive;
  f.timecode = NDIlib_send_timecode_synthesize; f.p_data = s->buf[i]; f.line_stride_in_bytes = stride;
  f.FourCC = (fcc && !strcmp(fcc, "NV12")) ? NDIlib_FourCC_video_type_NV12 : (fcc && !strcmp(fcc, "I420")) ? NDIlib_FourCC_video_type_I420 : uyvy ? NDIlib_FourCC_video_type_UYVY : (fcc && !strcmp(fcc, "RGBA")) ? NDIlib_FourCC_video_type_RGBA : (fcc && !strcmp(fcc, "RGBX")) ? NDIlib_FourCC_video_type_RGBX : (fcc && !strcmp(fcc, "BGRX")) ? NDIlib_FourCC_video_type_BGRX : NDIlib_FourCC_video_type_BGRA;
  free(fcc);
  NDI->send_send_video_async_v2(s->send, &f);
  s->cur = i; s->sent = true;
  return NULL;
}
// senderAudio(handle, Float32Array planar, channels, samplesPerChannel, sampleRate)
static napi_value js_sender_audio(napi_env env, napi_callback_info info) {
  size_t argc = 5; napi_value argv[5]; NEED_NDI();
  CHECK(napi_get_cb_info(env, info, &argc, argv, NULL, NULL));
  sender_t *s = get_sender(env, argv[0]); if (!s || !s->send) return NULL;
  void *data = NULL; size_t len = 0; napi_typedarray_type tt; napi_value ab; size_t off;
  if (napi_get_typedarray_info(env, argv[1], &tt, &len, &data, &ab, &off) != napi_ok || tt != napi_float32_array) { napi_throw_type_error(env, NULL, "expected a Float32Array"); return NULL; }
  int ch = (int)get_num(env, argv[2], 2), n = (int)get_num(env, argv[3], 0), rate = (int)get_num(env, argv[4], 48000);
  if (ch <= 0 || n <= 0 || len < (size_t)(ch * n)) return NULL;
  NDIlib_audio_frame_v3_t a; memset(&a, 0, sizeof a);
  a.sample_rate = rate; a.no_channels = ch; a.no_samples = n; a.timecode = NDIlib_send_timecode_synthesize;
  a.FourCC = NDIlib_FourCC_audio_type_FLTP; a.p_data = (uint8_t *)data; a.channel_stride_in_bytes = n * 4;
  NDI->send_send_audio_v3(s->send, &a);
  return NULL;
}
static napi_value js_sender_connections(napi_env env, napi_callback_info info) {
  size_t argc = 1; napi_value argv[1]; NEED_NDI();
  CHECK(napi_get_cb_info(env, info, &argc, argv, NULL, NULL));
  sender_t *s = get_sender(env, argv[0]); if (!s || !s->send) return make_num(env, 0);
  return make_num(env, NDI->send_get_no_connections(s->send, 0));
}
static napi_value js_sender_destroy(napi_env env, napi_callback_info info) {
  size_t argc = 1; napi_value argv[1]; NEED_NDI();
  CHECK(napi_get_cb_info(env, info, &argc, argv, NULL, NULL));
  sender_t *s = get_sender(env, argv[0]); if (!s || !s->send) return NULL;
  if (s->sent) NDI->send_send_video_async_v2(s->send, NULL);
  NDI->send_destroy(s->send); s->send = NULL; s->sent = false;
  return NULL;
}

// ---------------------------------------------------------------- receiver (own thread)
typedef struct { uint8_t *data; int w, h, stride; } vmsg_t;
typedef struct { float *data; int ch, n, rate; } amsg_t;
typedef struct {
  NDIlib_recv_instance_t recv; qf_thread thread; volatile int stop; volatile int vpending;
  napi_threadsafe_function tsv, tsa; bool audio; int connected;
} recv_t;

static void call_video(napi_env env, napi_value cb, void *ctx, void *data) {
  recv_t *r = (recv_t *)ctx; vmsg_t *m = (vmsg_t *)data;
  if (env && cb && m) {
    napi_value ab, args[4], undef; void *dst = NULL;
    size_t bytes = (size_t)m->stride * (size_t)m->h;
    napi_create_arraybuffer(env, bytes, &dst, &ab);
    memcpy(dst, m->data, bytes);
    args[0] = ab; args[1] = make_num(env, m->w); args[2] = make_num(env, m->h); args[3] = make_num(env, m->stride);
    napi_get_undefined(env, &undef);
    napi_call_function(env, undef, cb, 4, args, NULL);
  }
  if (m) { free(m->data); free(m); }
  if (r) r->vpending = 0;
}
static void call_audio(napi_env env, napi_value cb, void *ctx, void *data) {
  (void)ctx; amsg_t *m = (amsg_t *)data;
  if (env && cb && m) {
    napi_value ab, ta, args[3], undef; void *dst = NULL;
    size_t count = (size_t)m->ch * (size_t)m->n;
    napi_create_arraybuffer(env, count * 4, &dst, &ab); memcpy(dst, m->data, count * 4);
    napi_create_typedarray(env, napi_float32_array, count, ab, 0, &ta);
    args[0] = ta; args[1] = make_num(env, m->ch); args[2] = make_num(env, m->rate);
    napi_get_undefined(env, &undef);
    napi_call_function(env, undef, cb, 3, args, NULL);
  }
  if (m) { free(m->data); free(m); }
}
#ifdef _WIN32
static DWORD WINAPI recv_loop(LPVOID arg)
#else
static void *recv_loop(void *arg)
#endif
{
  recv_t *r = (recv_t *)arg;
  while (!r->stop) {
    NDIlib_video_frame_v2_t v; NDIlib_audio_frame_v3_t a;
    NDIlib_frame_type_e t = NDI->recv_capture_v3(r->recv, &v, r->audio ? &a : NULL, NULL, 100);
    if (t == NDIlib_frame_type_video) {
      if (!r->vpending && v.p_data) {   // drop frames while the page is still drawing the last one
        vmsg_t *m = (vmsg_t *)malloc(sizeof(vmsg_t));
        int w = v.xres, h = v.yres, row = w * 4;
        m->data = (uint8_t *)malloc((size_t)row * (size_t)h);
        bool opaque = v.FourCC != NDIlib_FourCC_video_type_RGBA;   // RGBX: make alpha solid
        for (int y = 0; y < h; y++) {
          uint8_t *d = m->data + (size_t)y * row; const uint8_t *sp = v.p_data + (size_t)y * v.line_stride_in_bytes;
          memcpy(d, sp, row);
          if (opaque) for (int x = 3; x < row; x += 4) d[x] = 255;
        }
        m->w = w; m->h = h; m->stride = row;
        r->vpending = 1;
        if (napi_call_threadsafe_function(r->tsv, m, napi_tsfn_nonblocking) != napi_ok) { free(m->data); free(m); r->vpending = 0; }
      }
      NDI->recv_free_video_v2(r->recv, &v);
    } else if (t == NDIlib_frame_type_audio && r->audio) {
      amsg_t *m = (amsg_t *)malloc(sizeof(amsg_t));
      m->ch = a.no_channels; m->n = a.no_samples; m->rate = a.sample_rate;
      m->data = (float *)malloc((size_t)m->ch * (size_t)m->n * sizeof(float));
      NDIlib_audio_frame_interleaved_32f_t il; memset(&il, 0, sizeof il); il.p_data = m->data;
      NDIlib_audio_frame_v2_t a2; memset(&a2, 0, sizeof a2);
      a2.sample_rate = a.sample_rate; a2.no_channels = a.no_channels; a2.no_samples = a.no_samples; a2.timecode = a.timecode;
      a2.p_data = (float *)a.p_data; a2.channel_stride_in_bytes = a.channel_stride_in_bytes;
      if (a.FourCC == NDIlib_FourCC_audio_type_FLTP) NDI->util_audio_to_interleaved_32f_v2(&a2, &il);
      NDI->recv_free_audio_v3(r->recv, &a);
      if (napi_call_threadsafe_function(r->tsa, m, napi_tsfn_nonblocking) != napi_ok) { free(m->data); free(m); }
    } else if (t == NDIlib_frame_type_error) {
      qf_sleep_ms(50);
    }
    r->connected = NDI->recv_get_no_connections(r->recv);
  }
  return 0;
}
static void recv_stop(recv_t *r) {
  if (!r || !r->recv) return;
  r->stop = 1;
#ifdef _WIN32
  WaitForSingleObject(r->thread, 3000); CloseHandle(r->thread);
#else
  pthread_join(r->thread, NULL);
#endif
  NDI->recv_destroy(r->recv); r->recv = NULL;
  napi_release_threadsafe_function(r->tsv, napi_tsfn_abort);
  if (r->tsa) napi_release_threadsafe_function(r->tsa, napi_tsfn_abort);
}
static void recv_finalize(napi_env env, void *data, void *hint) { (void)env; (void)hint; recv_t *r = (recv_t *)data; if (NDI) recv_stop(r); free(r); }

// receiverCreate(sourceName, { url, lowBandwidth, audio }, onVideo(ArrayBuffer RGBA, w, h, stride), onAudio(Float32Array interleaved, channels, rate)) -> handle
static napi_value js_recv_create(napi_env env, napi_callback_info info) {
  size_t argc = 4; napi_value argv[4]; NEED_NDI();
  CHECK(napi_get_cb_info(env, info, &argc, argv, NULL, NULL));
  char *name = get_str(env, argv[0]);
  bool low = false, audio = false; napi_value v; char *url = NULL;
  if (argc > 1) {
    napi_valuetype ty; napi_typeof(env, argv[1], &ty);
    if (ty == napi_object) {
      if (napi_get_named_property(env, argv[1], "lowBandwidth", &v) == napi_ok) napi_get_value_bool(env, v, &low);
      if (napi_get_named_property(env, argv[1], "audio", &v) == napi_ok) napi_get_value_bool(env, v, &audio);
      if (napi_get_named_property(env, argv[1], "url", &v) == napi_ok) { napi_valuetype t2; napi_typeof(env, v, &t2); if (t2 == napi_string) url = get_str(env, v); }
    }
  }
  NDIlib_source_t src; memset(&src, 0, sizeof src); src.p_ndi_name = name; if (url && *url) src.p_url_address = url;
  NDIlib_recv_create_v3_t rc; memset(&rc, 0, sizeof rc);
  rc.source_to_connect_to = src; rc.color_format = NDIlib_recv_color_format_RGBX_RGBA;
  rc.bandwidth = low ? NDIlib_recv_bandwidth_lowest : NDIlib_recv_bandwidth_highest; rc.allow_video_fields = false;
  rc.p_ndi_recv_name = "QForge";
  recv_t *r = (recv_t *)calloc(1, sizeof(recv_t));
  r->recv = NDI->recv_create_v3(&rc);
  free(name); free(url);
  if (!r->recv) { free(r); napi_throw_error(env, NULL, "NDI receiver could not be created"); return NULL; }
  r->audio = audio && argc > 3;
  napi_value rn; napi_create_string_utf8(env, "qforge-ndi-video", NAPI_AUTO_LENGTH, &rn);
  CHECK(napi_create_threadsafe_function(env, argv[2], NULL, rn, 2, 1, NULL, NULL, r, call_video, &r->tsv));
  if (r->audio) { napi_value an; napi_create_string_utf8(env, "qforge-ndi-audio", NAPI_AUTO_LENGTH, &an); CHECK(napi_create_threadsafe_function(env, argv[3], NULL, an, 64, 1, NULL, NULL, r, call_audio, &r->tsa)); }
  // the event loop may exit while a receiver exists (it is stopped explicitly)
  napi_unref_threadsafe_function(env, r->tsv); if (r->tsa) napi_unref_threadsafe_function(env, r->tsa);
#ifdef _WIN32
  r->thread = CreateThread(NULL, 0, recv_loop, r, 0, NULL);
#else
  pthread_create(&r->thread, NULL, recv_loop, r);
#endif
  napi_value ext; CHECK(napi_create_external(env, r, recv_finalize, NULL, &ext));
  return ext;
}
static napi_value js_recv_destroy(napi_env env, napi_callback_info info) {
  size_t argc = 1; napi_value argv[1]; NEED_NDI();
  CHECK(napi_get_cb_info(env, info, &argc, argv, NULL, NULL));
  void *p = NULL; napi_get_value_external(env, argv[0], &p);
  recv_stop((recv_t *)p);
  return NULL;
}
static napi_value js_recv_connected(napi_env env, napi_callback_info info) {
  size_t argc = 1; napi_value argv[1]; NEED_NDI();
  CHECK(napi_get_cb_info(env, info, &argc, argv, NULL, NULL));
  void *p = NULL; napi_get_value_external(env, argv[0], &p);
  recv_t *r = (recv_t *)p; return make_bool(env, r && r->recv && r->connected > 0);
}

NAPI_MODULE_INIT() {
  napi_property_descriptor d[] = {
    { "load", NULL, js_load, NULL, NULL, NULL, napi_default, NULL },
    { "findSources", NULL, js_find, NULL, NULL, NULL, napi_default, NULL },
    { "senderCreate", NULL, js_sender_create, NULL, NULL, NULL, napi_default, NULL },
    { "senderVideo", NULL, js_sender_video, NULL, NULL, NULL, napi_default, NULL },
    { "senderAudio", NULL, js_sender_audio, NULL, NULL, NULL, napi_default, NULL },
    { "senderConnections", NULL, js_sender_connections, NULL, NULL, NULL, napi_default, NULL },
    { "senderDestroy", NULL, js_sender_destroy, NULL, NULL, NULL, napi_default, NULL },
    { "receiverCreate", NULL, js_recv_create, NULL, NULL, NULL, napi_default, NULL },
    { "receiverDestroy", NULL, js_recv_destroy, NULL, NULL, NULL, napi_default, NULL },
    { "receiverConnected", NULL, js_recv_connected, NULL, NULL, NULL, napi_default, NULL },
  };
  napi_define_properties(env, exports, sizeof d / sizeof d[0], d);
  return exports;
}
