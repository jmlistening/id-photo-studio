# Third-party licenses

This directory keeps the license texts for the code and models vendored under
`vendor/`. The app never loads these files at runtime; they are shipped so that
redistributing the static site also redistributes the required notices.

| Component | Vendored path | Version | License | Upstream |
| --- | --- | --- | --- | --- |
| MediaPipe Tasks Vision | `vendor/mediapipe/` | 1.2.0 (as embedded in `vision_bundle.mjs`) | Apache-2.0 | https://github.com/google-ai-edge/mediapipe |
| MediaPipe Selfie Segmenter | `vendor/models/selfie_segmenter.tflite` | bundled with Tasks Vision 1.2.0 | Apache-2.0 | https://ai.google.dev/edge/mediapipe/solutions/vision/image_segmenter |
| MediaPipe BlazeFace | `vendor/models/blaze_face_short_range.tflite` | bundled with Tasks Vision 1.2.0 | Apache-2.0 | https://ai.google.dev/edge/mediapipe/solutions/vision/face_detector |
| heic2any | `vendor/lib/heic2any.min.js` | 0.0.4 | MIT | https://github.com/alexcorvi/heic2any |
| libheif (inside heic2any's wasm) | bundled in `vendor/lib/heic2any.min.js` | as built into heic2any 0.0.4 | LGPL-3.0 | https://github.com/strukturag/libheif |

License texts:

- `Apache-2.0.txt` — Apache License 2.0 (MediaPipe code and models).
- `heic2any-MIT.md` — MIT license and copyright notice for heic2any.
- `LGPL-3.0.txt` — GNU Lesser General Public License 3.0 (libheif).

## libheif source / relinking

heic2any 0.0.4 ships a WebAssembly build that includes libheif. If you need to
relink or rebuild it, the corresponding source is available at:

- https://github.com/alexcorvi/heic2any/tree/0.0.4 (heic2any 0.0.4 source tree; contains the prebuilt `src/libheif.js`)
- https://github.com/strukturag/libheif (upstream libheif source)

heic2any 0.0.4 does not record which libheif revision produced its prebuilt
`src/libheif.js`, so the exact corresponding source cannot be identified from
the published package alone. See `LIBHEIF-SOURCE-OFFER.md` for the written
source offer and how to request a relinkable build.

You can replace `vendor/lib/heic2any.min.js` with your own build; the app only
depends on the global `heic2any` function.

## MediaPipe telemetry and embedded key

The upstream MediaPipe Tasks Vision runtime contains an anonymous usage logger
that posts to `https://odml.pa.googleapis.com/v1/log` about 60 seconds after a
task is created. This project blocks that request with a
`Content-Security-Policy: connect-src 'self'` (see `index.html` and
`server.ps1`). The logger's request contains platform/version/timing fields,
not photo pixels.

The compiled MediaPipe wasm also embeds a public Google API key used by that
upstream logger. In this repository the embedded key
has been replaced with a same-length placeholder in both vendored wasm
variants, so no Google API key is present in the published files. The CSP
additionally blocks the logger request. This is documented here so secret
scanners and redistributors know the vendored binaries differ from upstream in
exactly this one string.
