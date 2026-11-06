/* 离线缓存：首次联网打开后，手机可离线使用。修改静态文件时请把 CACHE 版本号 +1。 */
const CACHE = 'idphoto-v5';
const CACHE_PREFIX = 'idphoto-';

// MediaPipe 在运行时用同一段 SIMD 探测代码选择 wasm 变体；这里保持同步，
// 只预缓存当前浏览器真正会加载的那一对，避免多下载约 13MB。
const SIMD_TEST = new Uint8Array([
  0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0,
  10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11
]);
const SIMD_WASM = [
  './vendor/mediapipe/wasm/vision_wasm_internal.js',
  './vendor/mediapipe/wasm/vision_wasm_internal.wasm'
];
const NOSIMD_WASM = [
  './vendor/mediapipe/wasm/vision_wasm_nosimd_internal.js',
  './vendor/mediapipe/wasm/vision_wasm_nosimd_internal.wasm'
];
const BASE_SHELL = [
  './',
  './index.html',
  './styles.css',
  './specs.js',
  './app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './vendor/lib/heic2any.min.js',
  './vendor/mediapipe/vision_bundle.mjs',
  './vendor/models/selfie_segmenter.tflite',
  './vendor/models/blaze_face_short_range.tflite'
];

async function supportsSimd() {
  try {
    await WebAssembly.instantiate(SIMD_TEST);
    return true;
  } catch (e) {
    return false;
  }
}

async function buildShell() {
  const pair = (await supportsSimd()) ? SIMD_WASM : NOSIMD_WASM;
  return BASE_SHELL.concat(pair);
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const shell = await buildShell();
    // 逐个缓存，单个资源失败不阻断整体安装
    await Promise.all(shell.map(async url => {
      try {
        const res = await fetch(url, { cache: 'reload' });
        if (res && res.ok) await cache.put(url, res);
      } catch (e) { /* ignore */ }
    }));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    // 只清理本应用的旧缓存；GitHub Pages 下同一 origin 还有其他项目，
    // 不能把别人的 Cache Storage 一起删掉。
    await Promise.all(keys.filter(k => k.startsWith(CACHE_PREFIX) && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req, { ignoreSearch: true });
    if (cached) return cached;
    try {
      const res = await fetch(req);
      if (res && res.ok) {
        // wasm / 模型等首次用到时顺手缓存，之后离线可用
        cache.put(req, res.clone()).catch(() => {});
      }
      return res;
    } catch (err) {
      if (req.mode === 'navigate') {
        const fallback = await cache.match('./index.html');
        if (fallback) return fallback;
      }
      throw err;
    }
  })());
});
