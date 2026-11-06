# Third-party notices

This project vendors the following third-party components. They are included under `vendor/` so the app can run fully offline and does not depend on a CDN at runtime.

| Component | Version / source | License | Used for |
| --- | --- | --- | --- |
| [MediaPipe Tasks Vision](https://github.com/google-ai-edge/mediapipe) | 1.2.0; `vendor/mediapipe/vision_bundle.mjs` + wasm runtime | Apache-2.0 | On-device portrait segmentation and face detection |
| [MediaPipe Selfie Segmenter](https://ai.google.dev/edge/mediapipe/solutions/vision/image_segmenter) | bundled with Tasks Vision 1.2.0; `vendor/models/selfie_segmenter.tflite` | Apache-2.0 | Portrait matte / alpha mask |
| [MediaPipe BlazeFace](https://ai.google.dev/edge/mediapipe/solutions/vision/face_detector) | bundled with Tasks Vision 1.2.0; `vendor/models/blaze_face_short_range.tflite` | Apache-2.0 | Optional face detection for auto crop |
| [heic2any](https://github.com/alexcorvi/heic2any) | 0.0.4; `vendor/lib/heic2any.min.js` | MIT | HEIC/HEIF decoding in the browser |
| [libheif](https://github.com/strukturag/libheif) | as built into heic2any 0.0.4's wasm | LGPL-3.0 | HEIF container/codec support |

License texts are kept in [`vendor/LICENSES/`](vendor/LICENSES/):

- [`Apache-2.0.txt`](vendor/LICENSES/Apache-2.0.txt) — MediaPipe code and models.
- [`heic2any-MIT.md`](vendor/LICENSES/heic2any-MIT.md) — heic2any MIT notice.
- [`LGPL-3.0.txt`](vendor/LICENSES/LGPL-3.0.txt) — libheif.

## Notes

- The vendored files are copies of the upstream distributions, except for path placement, removal of the unused MediaPipe module-runtime variant, and replacement of the embedded telemetry API key with a same-length placeholder in the two wasm files.
- MediaPipe model files are distributed by Google under Apache-2.0; see the upstream model cards for details.
- `heic2any` is MIT-licensed; its wasm build conveys libheif under LGPL-3.0. heic2any 0.0.4 distributes a prebuilt `src/libheif.js` and does not record which libheif revision produced it. The upstream libheif source is at <https://github.com/strukturag/libheif>; the heic2any 0.0.4 source tree is at <https://github.com/alexcorvi/heic2any/tree/0.0.4>. If you need the corresponding source or a relinkable build of the bundled libheif, open an issue and we will provide it (see [`vendor/LICENSES/LIBHEIF-SOURCE-OFFER.md`](vendor/LICENSES/LIBHEIF-SOURCE-OFFER.md)). To relink, replace `vendor/lib/heic2any.min.js` with your own build; the app only calls the global `heic2any` function.
- The synthetic demo portrait in `docs/demo/` and the application icons were generated for this project and are licensed under the same MIT license as the project.

## MediaPipe telemetry and embedded key

The upstream MediaPipe Tasks Vision runtime includes an anonymous usage logger
that posts to `https://odml.pa.googleapis.com/v1/log` about 60 seconds after a
task is created. The payload contains platform/version/task/timing fields, not
photo pixels. This project blocks that request with
`Content-Security-Policy: connect-src 'self'` in `index.html` and in the local
server's responses.

The compiled MediaPipe wasm also embeds a public Google API key used by that
upstream logger. In this repository the embedded key has been replaced
with a same-length placeholder in both vendored wasm variants, so no Google API
key is present in the published files. The CSP additionally blocks the logger
request. This is disclosed so redistributors and secret scanners know the
vendored binaries differ from upstream in exactly this one string.

If you believe a notice is missing or incorrect, please open an issue.
