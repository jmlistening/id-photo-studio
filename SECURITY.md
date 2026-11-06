# Security Policy

## Supported versions

| Version | Supported |
| --- | --- |
| 1.x | ✅ |
| < 1.0 | ❌ |

## Reporting a vulnerability

Please use GitHub's **private vulnerability reporting** for this repository:

1. Open the **Security** tab.
2. Click **Report a vulnerability**.
3. Include reproduction steps, affected browser/OS, and the impact you observed.

Please do not open a public issue for a sensitive report. I will acknowledge reports as soon as possible and coordinate a fix before public disclosure.

## Privacy model

This project is designed around a small, explicit trust boundary:

- **No backend.** There is no server-side code, account system, database, or upload endpoint.
- **No photo upload.** Image decoding, masking, compositing and encoding happen in the browser's Canvas / TypedArray.
- **No analytics or tracking.** No Google Analytics, Sentry, cookies, or third-party runtime fonts. The upstream MediaPipe runtime contains an anonymous usage logger; the app blocks its request with a `Content-Security-Policy: connect-src 'self'` in `index.html` and in the local server's responses. See `THIRD_PARTY_NOTICES.md` for exactly what that logger would have sent.
- **No persistence of photos.** Photos are not written to localStorage, IndexedDB, or the filesystem.
- **Static assets only.** The local launcher and any static host serve HTML/CSS/JS/wasm/model files; they never receive image bytes. The launcher uses an explicit allowlist (`index.html`, `app.js`, `specs.js`, `styles.css`, `sw.js`, `manifest.webmanifest`, `icons/`, `vendor/`, and the OG image); `.git/`, `.work/`, `tests/` and other local paths return 404.
- **Vendored dependencies.** MediaPipe, heic2any and models are pinned under `vendor/` and are not fetched from a CDN at runtime. Required license texts live in `vendor/LICENSES/`.

### Out of scope

The following are outside the app's trust boundary:

- malicious browser extensions, input methods, or a compromised operating system;
- a static host logging normal HTTP metadata (IP address, timestamps, requested asset paths);
- a user voluntarily sharing an exported image with someone else;
- social engineering or physical access to the device.

## Repository hygiene

- No `.env`, project-owned API keys, tokens, private keys, email addresses, local absolute paths, or real ID photos are committed.
- The upstream MediaPipe wasm embeds a public Google API key for its telemetry logger. In the vendored copy that key has been replaced with a same-length placeholder, so the repository contains no usable API key; the CSP additionally blocks the telemetry request. See `THIRD_PARTY_NOTICES.md`.
- Demo images are generated synthetic illustrations; screenshot assets contain no real person.
- `部署包.zip`, `.work/` and other local artifacts are excluded by `.gitignore`.
