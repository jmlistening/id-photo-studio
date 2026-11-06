# libheif source offer

`vendor/lib/heic2any.min.js` is the unmodified heic2any 0.0.4 distribution. It
contains a WebAssembly build of libheif, which is licensed under LGPL-3.0. The
full LGPL text is in `LGPL-3.0.txt`.

heic2any 0.0.4 ships a prebuilt `src/libheif.js` and does not record which
libheif revision was used to build it. The upstream heic2any source tree is at
<https://github.com/alexcorvi/heic2any/tree/0.0.4>; the upstream libheif source
is at <https://github.com/strukturag/libheif>.

If you need the corresponding source for the libheif build inside this
distribution, or a relinkable build of `heic2any.min.js`, open an issue at
<https://github.com/jmlistening/id-photo-studio/issues> and we will provide the
source and build information we can obtain from the upstream package, or a
rebuilt artifact under the same LGPL-3.0 terms. You can also replace
`vendor/lib/heic2any.min.js` with your own build; the app only calls the global
`heic2any` function.
