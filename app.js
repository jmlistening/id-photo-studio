/* 证件照小工具 —— 纯前端，本地处理，不上传。 */
(function () {
  'use strict';

  /* 开发期兜底：把脚本错误显示在页面上，便于无控制台时排查 */
  function showJsError(text) {
    try {
      let pre = document.getElementById('jserror');
      if (!pre) {
        pre = document.createElement('pre');
        pre.id = 'jserror';
        pre.style.cssText = 'position:fixed;left:0;bottom:0;z-index:10000;margin:0;background:#fee2e2;color:#991b1b;padding:8px 10px;font:12px/1.5 Consolas,monospace;max-width:100%;white-space:pre-wrap;';
        document.body.appendChild(pre);
      }
      pre.textContent = 'JS ERROR: ' + text;
    } catch (e) { /* ignore */ }
  }
  window.addEventListener('error', function (e) {
    showJsError((e.message || e.error) + '\n' + (e.filename || '') + ':' + (e.lineno || ''));
  });
  window.addEventListener('unhandledrejection', function (e) {
    const r = e.reason;
    showJsError(r && r.stack ? r.stack : String(r));
  });

  /* ============================================================
   * 常量与工具
   * ============================================================ */
  const WORK_MAX = 1600;
  const MAX_UNDO = 12;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const clamp01 = v => clamp(v, 0, 1);
  const $ = id => document.getElementById(id);

  function ensureCanvas(canvas, w, h) {
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }

  function normalizeHex(input) {
    if (!input) return null;
    let s = String(input).trim();
    if (s[0] !== '#') s = '#' + s;
    if (/^#[0-9a-fA-F]{3}$/.test(s)) {
      s = '#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3];
    }
    if (!/^#[0-9a-fA-F]{6}$/.test(s)) return null;
    return s.toUpperCase();
  }

  function hexToRgb(hex) {
    const h = normalizeHex(hex) || '#000000';
    return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  }

  function rgbToHex(r, g, b) {
    const f = n => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0').toUpperCase();
    return '#' + f(r) + f(g) + f(b);
  }

  function mixRgb(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }

  function mmToPx(mm, dpi) { return Math.round(mm / 25.4 * dpi); }
  function pxToMm(px, dpi) { return px / dpi * 25.4; }
  function fmt1(n) { return (Math.round(n * 10) / 10).toFixed(1); }

  function sanitizeName(s) {
    const clean = String(s || '').replace(/[\\/:*?"<>|]/g, '_').trim();
    return clean || '证件照';
  }

  function debounce(fn, ms) {
    let t = null;
    return function () {
      const args = arguments;
      clearTimeout(t);
      t = setTimeout(() => fn.apply(null, args), ms);
    };
  }

  /* ============================================================
   * 状态
   * ============================================================ */
  const state = {
    source: null,
    sourceW: 0,
    sourceH: 0,
    sourceName: '',

    workCanvas: document.createElement('canvas'),
    workW: 0,
    workH: 0,
    workData: null,

    maskCanvas: document.createElement('canvas'),
    maskCtx: null,
    softMaskCanvas: document.createElement('canvas'),
    fgCanvas: document.createElement('canvas'),
    previewCanvas: document.createElement('canvas'),

    hasImage: false,
    bgColor: '#FFFFFF',
    bgGradient: false,

    presetKey: '',
    presetName: '一寸',
    outW: 295,
    outH: 413,
    dpi: 300,
    mmW: 25,
    mmH: 35,

    crop: { x: 0, y: 0, w: 1, h: 1 },
    cropTouched: false,

    engine: 'auto',
    actualEngine: 'color',
    keyTolerance: 50,
    feather: 1,
    despill: 60,

    brushMode: false,
    brushErase: true,
    brushSize: 36,

    showOriginal: false,
    busyCount: 0,

    ai: {
      loaded: false,
      loading: false,
      running: false,
      promise: null,
      segmenter: null,
      faceDetector: null,
      error: null
    },

    bgAnalysis: null,
    face: null,
    undoStack: [],
    redoStack: [],

    view: { scale: 1, ox: 0, oy: 0, cw: 0, ch: 0 },
    pointer: {
      mode: null,
      handle: null,
      startCrop: null,
      startX: 0,
      startY: 0,
      lastWX: 0,
      lastWY: 0,
      stroke: false
    }
  };

  const els = {
    view: $('view'),
    canvasWrap: $('canvasWrap'),
    emptyState: $('emptyState'),
    busy: $('busy'),
    busyText: $('busyText'),
    toast: $('toast'),
    fileBanner: $('fileBanner'),
    fileInput: $('fileInput'),

    btnImport: $('btnImport'),
    btnUndo: $('btnUndo'),
    btnRedo: $('btnRedo'),
    btnCompare: $('btnCompare'),
    btnReset: $('btnReset'),
    btnFit: $('btnFit'),
    chkGrid: $('chkGrid'),
    zoomLabel: $('zoomLabel'),

    presetSelect: $('presetSelect'),
    outW: $('outW'),
    outH: $('outH'),
    mmW: $('mmW'),
    mmH: $('mmH'),
    dpiInput: $('dpiInput'),
    dpiTag: $('dpiTag'),
    btnSwap: $('btnSwap'),
    sizeHint: $('sizeHint'),

    swatches: $('swatches'),
    customColor: $('customColor'),
    hexInput: $('hexInput'),
    chkGradient: $('chkGradient'),

    engineSelect: $('engineSelect'),
    engineTag: $('engineTag'),
    engineHint: $('engineHint'),
    btnRekey: $('btnRekey'),
    btnBrush: $('btnBrush'),
    btnInvert: $('btnInvert'),
    tolerance: $('tolerance'),
    tolVal: $('tolVal'),
    feather: $('feather'),
    featherVal: $('featherVal'),
    despill: $('despill'),
    despillVal: $('despillVal'),
    brushTools: $('brushTools'),
    brushErase: $('brushErase'),
    brushAdd: $('brushAdd'),
    brushSize: $('brushSize'),
    brushVal: $('brushVal'),

    formatSelect: $('formatSelect'),
    quality: $('quality'),
    chkTargetKb: $('chkTargetKb'),
    targetKb: $('targetKb'),
    fileName: $('fileName'),
    btnExport: $('btnExport'),
    exportInfo: $('exportInfo'),
    statusLine: $('statusLine')
  };

  const specByKey = new Map();
  let firstSpecKey = null;

  function buildSpecMap() {
    PHOTO_SPECS.forEach(group => {
      group.items.forEach((spec, idx) => {
        const key = group.group + '|' + idx;
        specByKey.set(key, spec);
        if (!firstSpecKey) firstSpecKey = key;
      });
    });
  }

  /* ============================================================
   * 初始化
   * ============================================================ */
  function init() {
    buildSpecMap();
    populatePresets();
    populateSwatches();
    bindEvents();
    applySpec(firstSpecKey, false);
    updateUndoButtons();
    updateExportInfo();
    if (location.protocol === 'file:') els.fileBanner.classList.remove('hidden');
    new ResizeObserver(() => renderView()).observe(els.canvasWrap);
    window.addEventListener('resize', () => renderView());

    const params = new URLSearchParams(location.search);
    if (params.get('selftest') === '1') {
      runSelfTests();
      return;
    }
    if (params.get('aitest') === '1') {
      runAITest();
      return;
    }
    if (params.get('exporttest') === '1') {
      runExportTest();
      return;
    }
    if (params.get('swtest') === '1') {
      runSWTest();
      return;
    }
    registerSW();
    if (params.get('demo') === '1') {
      loadDemo();
    }
  }

  function populatePresets() {
    const sel = els.presetSelect;
    sel.innerHTML = '';
    PHOTO_SPECS.forEach(group => {
      const og = document.createElement('optgroup');
      og.label = group.group;
      group.items.forEach((spec, idx) => {
        const opt = document.createElement('option');
        opt.value = group.group + '|' + idx;
        opt.textContent = spec.name;
        og.appendChild(opt);
      });
      sel.appendChild(og);
    });
    const custom = document.createElement('option');
    custom.value = '__custom';
    custom.textContent = '自定义';
    sel.appendChild(custom);
  }

  function populateSwatches() {
    els.swatches.innerHTML = '';
    BG_COLORS.forEach(c => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'swatch';
      b.style.background = c.value;
      b.dataset.color = c.value;
      b.title = c.name + ' ' + c.value;
      b.addEventListener('click', () => setBgColor(c.value));
      els.swatches.appendChild(b);
    });
  }

  function bindEvents() {
    els.btnImport.addEventListener('click', () => els.fileInput.click());
    els.fileInput.addEventListener('change', () => {
      const f = els.fileInput.files && els.fileInput.files[0];
      if (f) importFile(f);
      els.fileInput.value = '';
    });

    els.canvasWrap.addEventListener('dragenter', e => { e.preventDefault(); e.stopPropagation(); });
    els.canvasWrap.addEventListener('dragover', e => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'copy'; });
    els.canvasWrap.addEventListener('drop', e => {
      e.preventDefault();
      e.stopPropagation();
      const f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) importFile(f);
    });
    document.addEventListener('dragover', e => { if (!e.target.closest('#canvasWrap')) e.preventDefault(); });
    document.addEventListener('drop', e => { if (!e.target.closest('#canvasWrap')) e.preventDefault(); });

    document.addEventListener('paste', e => {
      const items = e.clipboardData && e.clipboardData.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type && items[i].type.indexOf('image/') === 0) {
          const f = items[i].getAsFile();
          if (f) {
            e.preventDefault();
            importFile(f);
            break;
          }
        }
      }
    });

    els.btnUndo.addEventListener('click', undo);
    els.btnRedo.addEventListener('click', redo);
    els.btnReset.addEventListener('click', () => {
      if (state.source) loadBitmap(state.source, state.sourceName);
    });
    els.btnFit.addEventListener('click', () => {
      if (!state.hasImage) return;
      state.cropTouched = false;
      fitCropToAspect();
      renderView();
      updateExportInfo();
    });
    els.chkGrid.addEventListener('change', () => renderView());

    els.btnCompare.addEventListener('pointerdown', e => {
      e.preventDefault();
      if (!state.hasImage) return;
      state.showOriginal = true;
      renderView();
    });
    const endCompare = () => {
      if (!state.showOriginal) return;
      state.showOriginal = false;
      renderView();
    };
    els.btnCompare.addEventListener('pointerup', endCompare);
    els.btnCompare.addEventListener('pointerleave', endCompare);
    els.btnCompare.addEventListener('pointercancel', endCompare);

    els.presetSelect.addEventListener('change', () => {
      const v = els.presetSelect.value;
      if (v === '__custom') {
        state.presetKey = '__custom';
        state.presetName = '自定义';
        syncSizeInputs();
        return;
      }
      applySpec(v, true);
    });

    els.outW.addEventListener('change', onSizeInput);
    els.outH.addEventListener('change', onSizeInput);
    els.mmW.addEventListener('change', onMmInput);
    els.mmH.addEventListener('change', onMmInput);
    els.dpiInput.addEventListener('change', onDpiInput);
    els.btnSwap.addEventListener('click', () => {
      const t1 = state.outW; state.outW = state.outH; state.outH = t1;
      const t2 = state.mmW; state.mmW = state.mmH; state.mmH = t2;
      state.presetKey = '__custom';
      state.presetName = '自定义';
      syncSizeInputs();
      syncPresetSelect();
      if (state.hasImage) { refitCropToAspect(); renderView(); }
      updateExportInfo();
    });

    els.customColor.addEventListener('input', () => setBgColor(els.customColor.value));
    els.hexInput.addEventListener('change', () => {
      const hex = normalizeHex(els.hexInput.value);
      if (hex) setBgColor(hex);
      else els.hexInput.value = state.bgColor;
    });
    els.chkGradient.addEventListener('change', () => {
      state.bgGradient = els.chkGradient.checked;
      if (state.hasImage) renderComposite();
    });

    els.engineSelect.addEventListener('change', () => {
      state.engine = els.engineSelect.value;
      if (!state.hasImage) return;
      if (state.engine === 'color') {
        pushUndo();
        applyColorKey();
        renderComposite();
      } else if (state.engine === 'ai') {
        pushUndo();
        runAI(false);
      } else {
        if (state.bgAnalysis && state.bgAnalysis.solid) {
          pushUndo();
          applyColorKey();
          renderComposite();
        } else {
          pushUndo();
          runAI(true);
        }
      }
    });

    els.btnRekey.addEventListener('click', () => {
      if (!state.hasImage) return;
      if (state.engine === 'ai' || (state.engine === 'auto' && state.bgAnalysis && !state.bgAnalysis.solid)) {
        pushUndo();
        runAI(false);
      } else {
        pushUndo();
        applyColorKey();
        renderComposite();
      }
    });

    els.btnBrush.addEventListener('click', () => {
      state.brushMode = !state.brushMode;
      els.btnBrush.classList.toggle('primary', state.brushMode);
      els.btnBrush.classList.toggle('ghost', !state.brushMode);
      els.brushTools.classList.toggle('hidden', !state.brushMode);
      els.view.style.cursor = state.brushMode ? 'crosshair' : 'default';
      if (!state.brushMode) {
        state.pointer.stroke = false;
        state.pointer.mode = null;
      }
    });
    els.brushErase.addEventListener('click', () => {
      state.brushErase = true;
      els.brushErase.classList.add('active');
      els.brushAdd.classList.remove('active');
    });
    els.brushAdd.addEventListener('click', () => {
      state.brushErase = false;
      els.brushAdd.classList.add('active');
      els.brushErase.classList.remove('active');
    });
    els.brushSize.addEventListener('input', () => { els.brushVal.textContent = els.brushSize.value; });
    els.tolerance.addEventListener('input', () => { els.tolVal.textContent = els.tolerance.value; });
    els.tolerance.addEventListener('change', () => {
      state.keyTolerance = parseInt(els.tolerance.value, 10) || 50;
      if (state.hasImage && state.actualEngine === 'color') {
        pushUndo();
        applyColorKey();
        renderComposite();
      }
    });
    els.feather.addEventListener('input', () => {
      state.feather = parseFloat(els.feather.value) || 0;
      els.featherVal.textContent = els.feather.value;
      if (state.hasImage) requestComposite();
    });
    els.despill.addEventListener('input', () => {
      state.despill = parseInt(els.despill.value, 10) || 0;
      els.despillVal.textContent = els.despill.value;
      if (state.hasImage) requestComposite();
    });
    els.btnInvert.addEventListener('click', () => {
      if (!state.hasImage) return;
      pushUndo();
      const a = getMaskAlpha();
      for (let i = 0; i < a.length; i++) a[i] = 255 - a[i];
      setMaskAlpha(a);
      state.actualEngine = 'manual';
      setEngineTag('手动');
      updateStatus();
      renderComposite();
    });

    els.chkTargetKb.addEventListener('change', () => {
      els.targetKb.disabled = !els.chkTargetKb.checked;
    });
    els.formatSelect.addEventListener('change', () => {
      syncExportControls();
      updateExportInfo();
    });
    els.quality.addEventListener('change', updateExportInfo);
    els.targetKb.addEventListener('change', updateExportInfo);
    els.btnExport.addEventListener('click', exportPhoto);

    els.view.addEventListener('pointerdown', onPointerDown);
    els.view.addEventListener('pointermove', onPointerMove);
    els.view.addEventListener('pointerup', onPointerUp);
    els.view.addEventListener('pointercancel', onPointerUp);
    els.view.addEventListener('pointerleave', () => {
      if (!state.pointer.mode && !state.pointer.stroke) els.view.style.cursor = state.brushMode ? 'crosshair' : 'default';
    });

    document.addEventListener('keydown', e => {
      const tag = (e.target && e.target.tagName || '').toLowerCase();
      const typing = tag === 'input' || tag === 'textarea' || tag === 'select';
      if (typing) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (state.hasImage) exportPhoto();
      } else if (e.key === 'Escape' && state.brushMode) {
        state.brushMode = false;
        els.btnBrush.classList.remove('primary');
        els.btnBrush.classList.add('ghost');
        els.brushTools.classList.add('hidden');
        els.view.style.cursor = 'default';
      }
    });

    els.targetKb.disabled = !els.chkTargetKb.checked;
    syncExportControls();
  }

  /* ============================================================
   * 规格与尺寸
   * ============================================================ */
  function applySpec(key, render) {
    const spec = specByKey.get(key);
    if (!spec) return;
    state.presetKey = key;
    state.presetName = spec.name;
    state.outW = spec.w;
    state.outH = spec.h;
    state.dpi = spec.dpi;
    state.mmW = spec.mmW != null ? spec.mmW : pxToMm(spec.w, spec.dpi);
    state.mmH = spec.mmH != null ? spec.mmH : pxToMm(spec.h, spec.dpi);
    if (spec.bg) setBgColor(spec.bg, false);
    syncSizeInputs();
    syncPresetSelect();
    if (state.hasImage) {
      refitCropToAspect();
      if (render !== false) renderComposite();
    }
    updateExportInfo();
    updateStatus();
  }

  function syncPresetSelect() {
    if (els.presetSelect.value !== state.presetKey) {
      els.presetSelect.value = state.presetKey || '__custom';
    }
  }

  function syncSizeInputs() {
    els.outW.value = state.outW;
    els.outH.value = state.outH;
    els.mmW.value = fmt1(state.mmW);
    els.mmH.value = fmt1(state.mmH);
    els.dpiInput.value = state.dpi;
    els.dpiTag.textContent = state.dpi + ' DPI';
    els.sizeHint.textContent = state.presetName + ' · ' + state.outW + '×' + state.outH + 'px · ' +
      fmt1(state.mmW) + '×' + fmt1(state.mmH) + 'mm @ ' + state.dpi + 'DPI';
  }

  function onSizeInput() {
    const w = parseInt(els.outW.value, 10);
    const h = parseInt(els.outH.value, 10);
    if (!(w > 0) || !(h > 0)) return;
    state.outW = clamp(w, 1, 10000);
    state.outH = clamp(h, 1, 10000);
    state.mmW = pxToMm(state.outW, state.dpi);
    state.mmH = pxToMm(state.outH, state.dpi);
    state.presetKey = '__custom';
    state.presetName = '自定义';
    syncSizeInputs();
    syncPresetSelect();
    if (state.hasImage) { refitCropToAspect(); renderView(); }
    updateExportInfo();
  }

  function onMmInput() {
    const w = parseFloat(els.mmW.value);
    const h = parseFloat(els.mmH.value);
    if (!(w > 0) || !(h > 0)) return;
    state.mmW = w;
    state.mmH = h;
    state.outW = mmToPx(w, state.dpi);
    state.outH = mmToPx(h, state.dpi);
    state.presetKey = '__custom';
    state.presetName = '自定义';
    syncSizeInputs();
    syncPresetSelect();
    if (state.hasImage) { refitCropToAspect(); renderView(); }
    updateExportInfo();
  }

  function onDpiInput() {
    const d = parseInt(els.dpiInput.value, 10);
    if (!(d > 0)) return;
    state.dpi = clamp(d, 72, 1200);
    state.outW = mmToPx(state.mmW, state.dpi);
    state.outH = mmToPx(state.mmH, state.dpi);
    state.presetKey = '__custom';
    state.presetName = '自定义';
    syncSizeInputs();
    syncPresetSelect();
    if (state.hasImage) { refitCropToAspect(); renderView(); }
    updateExportInfo();
  }

  function normAspect() {
    if (!state.sourceW || !state.sourceH) return 1;
    return (state.outW / state.outH) * (state.sourceH / state.sourceW);
  }

  function fitCropToAspect() {
    if (!state.hasImage) return;
    const r = normAspect();
    const margin = 0.015;
    let w, h;
    if (r >= 1) {
      w = 1 - margin * 2;
      h = w / r;
      if (h > 1 - margin * 2) { h = 1 - margin * 2; w = h * r; }
    } else {
      h = 1 - margin * 2;
      w = h * r;
      if (w > 1 - margin * 2) { w = 1 - margin * 2; h = w / r; }
    }
    state.crop = {
      x: clamp(0.5 - w / 2, 0, 1 - w),
      y: clamp(0.015, 0, 1 - h),
      w: w,
      h: h
    };
    state.cropTouched = false;
  }

  function refitCropToAspect() {
    if (!state.hasImage) return;
    if (!state.cropTouched) {
      fitCropToAspect();
    } else {
      const cx = state.crop.x + state.crop.w / 2;
      const cy = state.crop.y + state.crop.h / 2;
      const r = normAspect();
      let w = state.crop.w;
      let h = w / r;
      if (h > 1) { h = 1; w = h * r; }
      if (w > 1) { w = 1; h = w / r; }
      state.crop = {
        x: clamp(cx - w / 2, 0, 1 - w),
        y: clamp(cy - h / 2, 0, 1 - h),
        w: w,
        h: h
      };
    }
    renderView();
    updateExportInfo();
  }

  /* ============================================================
   * 导入与解码
   * ============================================================ */
  async function importFile(file) {
    if (!file) return;
    const isImage = (file.type && file.type.indexOf('image/') === 0) ||
      /\.(jpe?g|png|webp|avif|heic|heif|bmp)$/i.test(file.name || '');
    if (!isImage) { toast('请选择图片文件', true); return; }
    showBusy('读取照片…');
    try {
      const bitmap = await decodeImage(file);
      await loadBitmap(bitmap, file.name);
      toast('已导入：' + file.name);
    } catch (e) {
      console.error(e);
      toast('无法读取这张照片：' + (e && e.message ? e.message : e), true);
    } finally {
      hideBusy();
    }
  }

  async function decodeImage(file) {
    const opts = { imageOrientation: 'from-image', premultiplyAlpha: 'none', colorSpaceConversion: 'default' };
    try {
      return await createImageBitmap(file, opts);
    } catch (firstErr) {
      const heic = /heic|heif/i.test(file.type || '') || /\.(heic|heif)$/i.test(file.name || '');
      if (heic && typeof window.heic2any === 'function') {
        showBusy('转换 HEIC…');
        const out = await window.heic2any({ blob: file, toType: 'image/jpeg', quality: 0.95 });
        const blob = Array.isArray(out) ? out[0] : out;
        try {
          return await createImageBitmap(blob, { imageOrientation: 'from-image' });
        } catch (e) {
          return await createImageBitmap(blob);
        }
      }
      try {
        return await createImageBitmap(file);
      } catch (e) {
        throw firstErr;
      }
    }
  }

  async function loadBitmap(bitmap, name) {
    resetImageState();
    state.source = bitmap;
    state.sourceW = bitmap.width || bitmap.naturalWidth || 0;
    state.sourceH = bitmap.height || bitmap.naturalHeight || 0;
    if (!state.sourceW || !state.sourceH) throw new Error('图片尺寸为空');
    state.sourceName = name || '照片';
    state.hasImage = true;

    const scale = Math.min(1, WORK_MAX / Math.max(state.sourceW, state.sourceH));
    state.workW = Math.max(1, Math.round(state.sourceW * scale));
    state.workH = Math.max(1, Math.round(state.sourceH * scale));

    ensureCanvas(state.workCanvas, state.workW, state.workH);
    const wctx = state.workCanvas.getContext('2d', { willReadFrequently: true });
    wctx.clearRect(0, 0, state.workW, state.workH);
    wctx.drawImage(bitmap, 0, 0, state.workW, state.workH);
    state.workData = wctx.getImageData(0, 0, state.workW, state.workH);

    ensureCanvas(state.maskCanvas, state.workW, state.workH);
    state.maskCtx = state.maskCanvas.getContext('2d', { willReadFrequently: true });
    state.maskCtx.clearRect(0, 0, state.workW, state.workH);

    const transparent = detectTransparency(state.workData);
    if (transparent) {
      applyTransparencyMask(state.workData);
      state.bgAnalysis = { solid: true, transparent: true, mean: [255, 255, 255], coverage: 1, std: 0 };
      state.actualEngine = 'alpha';
      setEngineTag('透明底');
      setHint('检测到透明背景，已直接使用原图透明通道。');
    } else {
      state.bgAnalysis = analyzeBackground(state.workData);
      applyColorKey();
    }

    state.cropTouched = false;
    fitCropToAspect();
    state.undoStack.length = 0;
    state.redoStack.length = 0;
    updateUndoButtons();

    els.emptyState.classList.add('hidden');
    els.btnCompare.disabled = false;
    els.btnReset.disabled = false;
    els.btnExport.disabled = false;
    renderComposite();
    updateExportInfo();
    updateStatus();
    tryBuiltinFace();

    if (!transparent && state.bgAnalysis && !state.bgAnalysis.solid && location.protocol !== 'file:' && state.engine !== 'color') {
      setTimeout(() => {
        if (state.hasImage && state.engine !== 'color') runAI(true);
      }, 250);
    }
  }

  function resetImageState() {
    state.hasImage = false;
    state.undoStack.length = 0;
    state.redoStack.length = 0;
    state.bgAnalysis = null;
    state.face = null;
    state.ai.error = null;
    state.crop = { x: 0, y: 0, w: 1, h: 1 };
    state.cropTouched = false;
    state.showOriginal = false;
  }

  function detectTransparency(imgData) {
    const d = imgData.data;
    const total = imgData.width * imgData.height;
    let count = 0;
    for (let i = 3; i < d.length; i += 4) {
      if (d[i] < 250) {
        count++;
        if (count > total * 0.02) return true;
      }
    }
    return false;
  }

  function applyTransparencyMask(imgData) {
    const W = imgData.width;
    const H = imgData.height;
    const d = imgData.data;
    const alpha = new Uint8ClampedArray(W * H);
    for (let i = 0, j = 3; i < alpha.length; i++, j += 4) alpha[i] = d[j];
    setMaskAlpha(alpha);
  }

  /* ============================================================
   * 背景分析 / 色键抠图
   * ============================================================ */
  function analyzeBackground(imgData) {
    const W = imgData.width;
    const H = imgData.height;
    const d = imgData.data;
    const bx = Math.max(2, Math.round(W * 0.04));
    const by = Math.max(2, Math.round(H * 0.05));
    const samples = [];
    const add = (x, y) => {
      const i = (y * W + x) * 4;
      if (d[i + 3] < 8) return;
      samples.push(d[i], d[i + 1], d[i + 2]);
    };
    for (let y = 0; y < by; y++) {
      for (let x = 0; x < W; x += 2) add(x, y);
    }
    for (let y = 0; y < H; y += 2) {
      for (let x = 0; x < bx; x++) add(x, y);
      for (let x = W - bx; x < W; x++) add(x, y);
    }
    const count = samples.length / 3;
    if (!count) return { mean: [255, 255, 255], coverage: 0, std: 999, solid: false };

    const bins = new Map();
    for (let i = 0; i < samples.length; i += 3) {
      const r = samples[i], g = samples[i + 1], b = samples[i + 2];
      const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
      let bin = bins.get(key);
      if (!bin) { bin = { n: 0, r: 0, g: 0, b: 0 }; bins.set(key, bin); }
      bin.n++; bin.r += r; bin.g += g; bin.b += b;
    }
    let best = null;
    bins.forEach(bin => { if (!best || bin.n > best.n) best = bin; });
    const coverage = best.n / count;
    const mean = [best.r / best.n, best.g / best.n, best.b / best.n];

    let sum2 = 0;
    let near = 0;
    for (let i = 0; i < samples.length; i += 3) {
      const dr = samples[i] - mean[0];
      const dg = samples[i + 1] - mean[1];
      const db = samples[i + 2] - mean[2];
      const dist2 = dr * dr + dg * dg + db * db;
      if (dist2 < 60 * 60) { sum2 += dist2; near++; }
    }
    const std = near ? Math.sqrt(sum2 / near) : 999;
    const solid = coverage > 0.4 && std < 30;
    return { mean: mean, coverage: coverage, std: std, solid: solid };
  }

  function buildColorKeyMask(imgData, bg, tolerance) {
    const W = imgData.width;
    const H = imgData.height;
    const d = imgData.data;
    const n = W * H;
    const t0 = 10 + tolerance * 0.2;
    const t1 = 30 + tolerance * 0.9;
    const dist = new Float32Array(n);
    const br = bg[0], bgc = bg[1], bb = bg[2];

    for (let i = 0, p = 0; i < n; i++, p += 4) {
      const dr = d[p] - br;
      const dg = d[p + 1] - bgc;
      const db = d[p + 2] - bb;
      dist[i] = Math.sqrt(dr * dr + dg * dg + db * db);
    }

    const bgMask = new Uint8Array(n);
    const queue = new Int32Array(n);
    let head = 0;
    let tail = 0;

    const seed = (i) => {
      if (!bgMask[i] && dist[i] < t0) {
        bgMask[i] = 1;
        queue[tail++] = i;
      }
    };
    for (let x = 0; x < W; x++) seed(x);
    for (let y = 0; y < H; y++) {
      seed(y * W);
      seed(y * W + W - 1);
    }
    if (tail === 0) {
      const seedLoose = (i) => {
        if (!bgMask[i] && dist[i] < t1) {
          bgMask[i] = 1;
          queue[tail++] = i;
        }
      };
      for (let x = 0; x < W; x++) seedLoose(x);
      for (let y = 0; y < H; y++) {
        seedLoose(y * W);
        seedLoose(y * W + W - 1);
      }
    }

    while (head < tail) {
      const i = queue[head++];
      const x = i % W;
      const y = (i / W) | 0;
      if (x > 0 && !bgMask[i - 1] && dist[i - 1] < t1) { bgMask[i - 1] = 1; queue[tail++] = i - 1; }
      if (x < W - 1 && !bgMask[i + 1] && dist[i + 1] < t1) { bgMask[i + 1] = 1; queue[tail++] = i + 1; }
      if (y > 0 && !bgMask[i - W] && dist[i - W] < t1) { bgMask[i - W] = 1; queue[tail++] = i - W; }
      if (y < H - 1 && !bgMask[i + W] && dist[i + W] < t1) { bgMask[i + W] = 1; queue[tail++] = i + W; }
    }

    const alpha = new Uint8ClampedArray(n);
    for (let i = 0; i < n; i++) {
      if (bgMask[i]) {
        const dd = dist[i];
        alpha[i] = dd <= t0 ? 0 : dd >= t1 ? 255 : Math.round((dd - t0) / (t1 - t0) * 255);
      } else {
        alpha[i] = 255;
      }
    }
    return alpha;
  }

  function applyColorKey() {
    if (!state.workData || !state.bgAnalysis) return;
    const alpha = buildColorKeyMask(state.workData, state.bgAnalysis.mean, state.keyTolerance);
    setMaskAlpha(alpha);
    state.actualEngine = 'color';
    setEngineTag('色键');
    if (state.bgAnalysis.solid) {
      setHint('纯色背景，色键模式：边缘最干净、完全离线。');
    } else {
      setHint('背景不是纯色，色键只能处理接近底色的部分；复杂背景请用“人像 AI”。');
    }
    updateStatus();
  }

  function setMaskAlpha(alpha) {
    if (!state.workW || !state.workH) return;
    const img = new ImageData(state.workW, state.workH);
    const d = img.data;
    const len = Math.min(alpha.length, state.workW * state.workH);
    for (let i = 0, j = 0; i < len; i++, j += 4) {
      d[j] = 255;
      d[j + 1] = 255;
      d[j + 2] = 255;
      d[j + 3] = alpha[i];
    }
    state.maskCtx.putImageData(img, 0, 0);
  }

  function getMaskAlpha() {
    const img = state.maskCtx.getImageData(0, 0, state.workW, state.workH);
    const d = img.data;
    const a = new Uint8ClampedArray(state.workW * state.workH);
    for (let i = 0, j = 3; i < a.length; i++, j += 4) a[i] = d[j];
    return a;
  }

  /* ============================================================
   * AI 抠图
   * ============================================================ */
  function ensureAI() {
    if (state.ai.loaded) return Promise.resolve();
    if (state.ai.loading) return state.ai.promise;
    if (location.protocol === 'file:') {
      return Promise.reject(new Error('直接打开文件时无法加载 AI，请双击 启动.bat 打开'));
    }

    state.ai.loading = true;
    state.ai.promise = (async () => {
      showBusy('首次加载 AI 模型（约 15MB）…');
      const mp = await import('./vendor/mediapipe/vision_bundle.mjs');
      const wasmPath = new URL('vendor/mediapipe/wasm', document.baseURI).href.replace(/\/$/, '');
      const fileset = await mp.FilesetResolver.forVisionTasks(wasmPath);
      const modelPath = new URL('vendor/models/selfie_segmenter.tflite', document.baseURI).href;

      let segmenter;
      try {
        segmenter = await mp.ImageSegmenter.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: modelPath, delegate: 'GPU' },
          runningMode: 'IMAGE',
          outputCategoryMask: false,
          outputConfidenceMasks: true
        });
      } catch (gpuErr) {
        segmenter = await mp.ImageSegmenter.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: modelPath },
          runningMode: 'IMAGE',
          outputCategoryMask: false,
          outputConfidenceMasks: true
        });
      }
      state.ai.segmenter = segmenter;

      try {
        const facePath = new URL('vendor/models/blaze_face_short_range.tflite', document.baseURI).href;
        state.ai.faceDetector = await mp.FaceDetector.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: facePath },
          runningMode: 'IMAGE',
          minDetectionConfidence: 0.5
        });
      } catch (e) {
        state.ai.faceDetector = null;
      }

      state.ai.loaded = true;
      state.ai.loading = false;
      hideBusy();
    })().catch(err => {
      state.ai.loading = false;
      state.ai.error = err;
      state.ai.promise = null;
      hideBusy();
      throw err;
    });
    return state.ai.promise;
  }

  async function runAI(auto) {
    if (!state.hasImage) return;
    if (state.ai.running) return;
    if (location.protocol === 'file:') {
      toast('直接打开文件时 AI 不可用，请双击 启动.bat 打开', true);
      return;
    }
    state.ai.running = true;
    showBusy(state.ai.loaded ? 'AI 抠图中…' : '首次加载 AI 模型（约 15MB）…');
    try {
      await ensureAI();
      setBusyText('AI 抠图中…');
      await new Promise(r => setTimeout(r, 30));
      const result = state.ai.segmenter.segment(state.workCanvas);
      const masks = result && result.confidenceMasks;
      if (!masks || !masks.length) throw new Error('没有分割结果');
      const mask = masks.length > 1 ? masks[1] : masks[0];
      const vals = mask.getAsFloat32Array();
      const mw = mask.width;
      const mh = mask.height;
      let maxV = 0;
      for (let i = 0; i < vals.length; i++) if (vals[i] > maxV) maxV = vals[i];
      const vScale = maxV > 1.5 ? 1 / 255 : 1;

      const W = state.workW;
      const H = state.workH;
      const alphaF = new Float32Array(W * H);
      for (let y = 0; y < H; y++) {
        const sy = (y + 0.5) * mh / H - 0.5;
        const y0 = clamp(Math.floor(sy), 0, mh - 1);
        const y1 = clamp(y0 + 1, 0, mh - 1);
        const fy = clamp(sy - y0, 0, 1);
        for (let x = 0; x < W; x++) {
          const sx = (x + 0.5) * mw / W - 0.5;
          const x0 = clamp(Math.floor(sx), 0, mw - 1);
          const x1 = clamp(x0 + 1, 0, mw - 1);
          const fx = clamp(sx - x0, 0, 1);
          const v00 = vals[y0 * mw + x0] * vScale;
          const v10 = vals[y0 * mw + x1] * vScale;
          const v01 = vals[y1 * mw + x0] * vScale;
          const v11 = vals[y1 * mw + x1] * vScale;
          const v0 = v00 * (1 - fx) + v10 * fx;
          const v1 = v01 * (1 - fx) + v11 * fx;
          alphaF[y * W + x] = v0 * (1 - fy) + v1 * fy;
        }
      }

      let refined = alphaF;
      if (W * H <= 4000000) {
        const guide = new Float32Array(W * H);
        const wd = state.workData.data;
        for (let i = 0, p = 0; i < W * H; i++, p += 4) {
          guide[i] = (wd[p] * 0.299 + wd[p + 1] * 0.587 + wd[p + 2] * 0.114) / 255;
        }
        refined = guidedFilter(alphaF, guide, W, H, 3, 0.001);
      }

      const alpha = new Uint8ClampedArray(W * H);
      for (let i = 0; i < W * H; i++) {
        alpha[i] = clamp(refined[i] * 255, 0, 255);
      }
      setMaskAlpha(alpha);
      state.actualEngine = 'ai';
      setEngineTag('人像 AI');
      setHint('AI 人像模式：适合复杂背景；发丝边缘可再用笔刷修。');
      updateStatus();

      if (state.ai.faceDetector) {
        try {
          const det = state.ai.faceDetector.detect(state.workCanvas);
          const face = pickLargestFace(det);
          if (face) {
            state.face = face;
            if (!state.cropTouched) autoPositionCrop(face);
          }
        } catch (e) { /* face detection is optional */ }
      }
      renderComposite();
    } catch (e) {
      console.error(e);
      state.ai.error = e;
      if (auto) {
        applyColorKey();
        setHint('AI 加载失败，已退回色键模式。可以手动用笔刷修补。');
        updateStatus('AI 不可用，已退回色键');
      } else {
        toast('AI 抠图失败：' + (e && e.message ? e.message : e), true);
      }
    } finally {
      state.ai.running = false;
      hideBusy();
    }
  }

  function pickLargestFace(det) {
    const list = (det && det.detections) || [];
    let best = null;
    let bestArea = 0;
    for (let i = 0; i < list.length; i++) {
      const b = list[i].boundingBox;
      if (!b) continue;
      let x = b.originX != null ? b.originX : b.x;
      let y = b.originY != null ? b.originY : b.y;
      let w = b.width;
      let h = b.height;
      if (w <= 1.5 && h <= 1.5) {
        x *= state.workW; y *= state.workH; w *= state.workW; h *= state.workH;
      }
      const area = w * h;
      if (area > bestArea) {
        bestArea = area;
        best = { x: x / state.workW, y: y / state.workH, w: w / state.workW, h: h / state.workH };
      }
    }
    return best;
  }

  async function tryBuiltinFace() {
    if (!('FaceDetector' in window) || !state.hasImage) return;
    try {
      const fd = new FaceDetector({ fastMode: true, maxDetectedFaces: 5 });
      const faces = await fd.detect(state.workCanvas);
      if (faces && faces.length) {
        let best = null;
        let area = 0;
        for (let i = 0; i < faces.length; i++) {
          const b = faces[i].boundingBox;
          if (!b) continue;
          const ar = b.width * b.height;
          if (ar > area) { area = ar; best = b; }
        }
        if (best) {
          const face = {
            x: (best.x != null ? best.x : best.originX) / state.workW,
            y: (best.y != null ? best.y : best.originY) / state.workH,
            w: best.width / state.workW,
            h: best.height / state.workH
          };
          state.face = face;
          if (!state.cropTouched) autoPositionCrop(face);
        }
      }
    } catch (e) { /* optional */ }
  }

  function autoPositionCrop(face) {
    if (!state.hasImage) return;
    const r = normAspect();
    let ch = clamp(face.h / 0.48, 0.2, 1);
    let cw = ch * r;
    if (cw > 1) { cw = 1; ch = cw / r; }
    if (ch > 1) { ch = 1; cw = ch * r; }
    const fx = face.x + face.w / 2;
    state.crop = {
      x: clamp(fx - cw / 2, 0, 1 - cw),
      y: clamp(face.y - 0.10 * ch, 0, 1 - ch),
      w: cw,
      h: ch
    };
    state.cropTouched = false;
    renderView();
    updateExportInfo();
  }

  /* ============================================================
   * 引导滤波（AI 蒙版边缘细化）
   * ============================================================ */
  function boxFilter(src, W, H, r) {
    const integral = new Float64Array((W + 1) * (H + 1));
    const stride = W + 1;
    for (let y = 0; y < H; y++) {
      let rowSum = 0;
      for (let x = 0; x < W; x++) {
        rowSum += src[y * W + x];
        integral[(y + 1) * stride + (x + 1)] = integral[y * stride + (x + 1)] + rowSum;
      }
    }
    const out = new Float32Array(W * H);
    for (let y = 0; y < H; y++) {
      const y0 = Math.max(0, y - r);
      const y1 = Math.min(H - 1, y + r);
      for (let x = 0; x < W; x++) {
        const x0 = Math.max(0, x - r);
        const x1 = Math.min(W - 1, x + r);
        const area = (x1 - x0 + 1) * (y1 - y0 + 1);
        const sum = integral[(y1 + 1) * stride + (x1 + 1)] -
          integral[y0 * stride + (x1 + 1)] -
          integral[(y1 + 1) * stride + x0] +
          integral[y0 * stride + x0];
        out[y * W + x] = sum / area;
      }
    }
    return out;
  }

  function guidedFilter(p, I, W, H, r, eps) {
    const meanI = boxFilter(I, W, H, r);
    const meanP = boxFilter(p, W, H, r);
    const I2 = new Float32Array(W * H);
    const IP = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) {
      I2[i] = I[i] * I[i];
      IP[i] = I[i] * p[i];
    }
    const corrI = boxFilter(I2, W, H, r);
    const corrIP = boxFilter(IP, W, H, r);
    const a = new Float32Array(W * H);
    const b = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) {
      const varI = corrI[i] - meanI[i] * meanI[i];
      const cov = corrIP[i] - meanI[i] * meanP[i];
      a[i] = cov / (varI + eps);
      b[i] = meanP[i] - a[i] * meanI[i];
    }
    const meanA = boxFilter(a, W, H, r);
    const meanB = boxFilter(b, W, H, r);
    const q = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) q[i] = meanA[i] * I[i] + meanB[i];
    return q;
  }

  /* ============================================================
   * 合成与渲染
   * ============================================================ */
  function paintBackground(ctx, w, h) {
    const rgb = hexToRgb(state.bgColor);
    if (state.bgGradient) {
      const top = mixRgb(rgb, [255, 255, 255], 0.10);
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, rgbToHex(top[0], top[1], top[2]));
      g.addColorStop(1, state.bgColor);
      ctx.fillStyle = g;
    } else {
      ctx.fillStyle = state.bgColor;
    }
    ctx.fillRect(0, 0, w, h);
  }

  function despillCanvas(canvas, bgHex, strengthPct) {
    const W = canvas.width;
    const H = canvas.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const img = ctx.getImageData(0, 0, W, H);
    const d = img.data;
    const bg = hexToRgb(bgHex);
    const f = clamp(strengthPct, 0, 100) / 100;
    for (let i = 0; i < d.length; i += 4) {
      const a = d[i + 3];
      if (a === 0 || a === 255) continue;
      const af = a / 255;
      const inv = 1 - af;
      const denom = Math.max(af, 0.05);
      for (let c = 0; c < 3; c++) {
        const p = d[i + c];
        const unmix = (p - inv * bg[c]) / denom;
        const target = clamp(unmix, 0, 255);
        d[i + c] = p + (target - p) * f;
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  let compositePending = false;
  function requestComposite() {
    if (compositePending) return;
    compositePending = true;
    requestAnimationFrame(() => {
      compositePending = false;
      renderComposite();
    });
  }

  function renderComposite() {
    if (!state.hasImage) { renderView(); return; }
    const W = state.workW;
    const H = state.workH;

    ensureCanvas(state.softMaskCanvas, W, H);
    const smctx = state.softMaskCanvas.getContext('2d');
    smctx.clearRect(0, 0, W, H);
    if (state.feather > 0) smctx.filter = 'blur(' + state.feather + 'px)';
    smctx.drawImage(state.maskCanvas, 0, 0);
    smctx.filter = 'none';

    ensureCanvas(state.fgCanvas, W, H);
    const fctx = state.fgCanvas.getContext('2d', { willReadFrequently: true });
    fctx.clearRect(0, 0, W, H);
    fctx.drawImage(state.workCanvas, 0, 0);
    fctx.globalCompositeOperation = 'destination-in';
    fctx.drawImage(state.softMaskCanvas, 0, 0);
    fctx.globalCompositeOperation = 'source-over';
    if (state.despill > 0 && !state.pointer.stroke) {
      despillCanvas(state.fgCanvas, state.bgColor, state.despill);
    }

    ensureCanvas(state.previewCanvas, W, H);
    const pctx = state.previewCanvas.getContext('2d');
    paintBackground(pctx, W, H);
    pctx.drawImage(state.fgCanvas, 0, 0);
    renderView();
  }

  function cropViewRect() {
    const v = state.view;
    return {
      x: v.ox + state.crop.x * state.workW * v.scale,
      y: v.oy + state.crop.y * state.workH * v.scale,
      w: state.crop.w * state.workW * v.scale,
      h: state.crop.h * state.workH * v.scale
    };
  }

  function renderView() {
    const canvas = els.view;
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;
    if (!cw || !ch) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const pw = Math.round(cw * dpr);
    const ph = Math.round(ch * dpr);
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw;
      canvas.height = ph;
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    ctx.fillStyle = '#22262d';
    ctx.fillRect(0, 0, cw, ch);

    if (!state.hasImage) {
      els.zoomLabel.textContent = '100%';
      return;
    }

    const pad = 18;
    const scale = Math.max(0.0001, Math.min((cw - pad * 2) / state.workW, (ch - pad * 2) / state.workH));
    const ox = (cw - state.workW * scale) / 2;
    const oy = (ch - state.workH * scale) / 2;
    state.view = { scale: scale, ox: ox, oy: oy, cw: cw, ch: ch };

    const img = state.showOriginal ? state.workCanvas : state.previewCanvas;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, ox, oy, state.workW * scale, state.workH * scale);

    const cr = cropViewRect();
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, cw, ch);
    ctx.rect(cr.x, cr.y, cr.w, cr.h);
    ctx.fillStyle = 'rgba(8, 10, 14, 0.56)';
    ctx.fill('evenodd');
    ctx.restore();

    ctx.strokeStyle = 'rgba(255,255,255,0.96)';
    ctx.lineWidth = 2;
    ctx.strokeRect(cr.x + 0.5, cr.y + 0.5, cr.w - 1, cr.h - 1);

    if (els.chkGrid.checked) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1;
      for (let i = 1; i < 3; i++) {
        const x = cr.x + cr.w * i / 3;
        const y = cr.y + cr.h * i / 3;
        ctx.beginPath(); ctx.moveTo(x, cr.y); ctx.lineTo(x, cr.y + cr.h); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cr.x, y); ctx.lineTo(cr.x + cr.w, y); ctx.stroke();
      }
      ctx.restore();
    }

    const hs = 5;
    const corners = [
      [cr.x, cr.y], [cr.x + cr.w, cr.y],
      [cr.x, cr.y + cr.h], [cr.x + cr.w, cr.y + cr.h]
    ];
    for (let i = 0; i < corners.length; i++) {
      const x = corners[i][0];
      const y = corners[i][1];
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = 'rgba(0,0,0,0.45)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.rect(x - hs, y - hs, hs * 2, hs * 2);
      ctx.fill();
      ctx.stroke();
    }

    if (state.showOriginal) {
      ctx.fillStyle = 'rgba(17,24,39,0.75)';
      ctx.fillRect(12, 12, 58, 24);
      ctx.fillStyle = '#fff';
      ctx.font = '12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('原图', 41, 24);
      ctx.textAlign = 'start';
      ctx.textBaseline = 'alphabetic';
    }

    els.zoomLabel.textContent = Math.round(scale * 100) + '%';
  }

  /* ============================================================
   * 指针交互：裁剪 + 笔刷
   * ============================================================ */
  function canvasPoint(e) {
    const r = els.view.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function viewToWork(p) {
    return {
      x: (p.x - state.view.ox) / state.view.scale,
      y: (p.y - state.view.oy) / state.view.scale
    };
  }

  function hitTestCrop(p) {
    const cr = cropViewRect();
    const hs = 14;
    const corners = [
      { handle: 'nw', x: cr.x, y: cr.y },
      { handle: 'ne', x: cr.x + cr.w, y: cr.y },
      { handle: 'sw', x: cr.x, y: cr.y + cr.h },
      { handle: 'se', x: cr.x + cr.w, y: cr.y + cr.h }
    ];
    for (let i = 0; i < corners.length; i++) {
      if (Math.abs(p.x - corners[i].x) <= hs && Math.abs(p.y - corners[i].y) <= hs) {
        return { type: 'resize', handle: corners[i].handle };
      }
    }
    if (p.x >= cr.x && p.x <= cr.x + cr.w && p.y >= cr.y && p.y <= cr.y + cr.h) {
      return { type: 'move' };
    }
    return null;
  }

  function onPointerDown(e) {
    if (!state.hasImage) return;
    els.view.setPointerCapture(e.pointerId);
    const p = canvasPoint(e);

    if (state.brushMode) {
      pushUndo();
      state.pointer.stroke = true;
      const w = viewToWork(p);
      state.pointer.lastWX = w.x;
      state.pointer.lastWY = w.y;
      drawDab(w.x, w.y, state.brushErase);
      requestComposite();
      return;
    }

    const hit = hitTestCrop(p);
    if (!hit) return;
    pushUndo();
    state.pointer.mode = hit.type;
    state.pointer.handle = hit.handle || null;
    state.pointer.startCrop = { x: state.crop.x, y: state.crop.y, w: state.crop.w, h: state.crop.h };
    state.pointer.startX = p.x;
    state.pointer.startY = p.y;
  }

  function onPointerMove(e) {
    if (!state.hasImage) return;
    const p = canvasPoint(e);

    if (state.pointer.stroke) {
      const w = viewToWork(p);
      drawBrushLine(state.pointer.lastWX, state.pointer.lastWY, w.x, w.y, state.brushErase);
      state.pointer.lastWX = w.x;
      state.pointer.lastWY = w.y;
      requestComposite();
      return;
    }

    if (state.pointer.mode === 'move') {
      const dx = (p.x - state.pointer.startX) / state.view.scale / state.workW;
      const dy = (p.y - state.pointer.startY) / state.view.scale / state.workH;
      const c = state.pointer.startCrop;
      state.crop.x = clamp(c.x + dx, 0, 1 - state.crop.w);
      state.crop.y = clamp(c.y + dy, 0, 1 - state.crop.h);
      state.cropTouched = true;
      renderView();
      updateExportInfo();
      return;
    }

    if (state.pointer.mode === 'resize') {
      const w = viewToWork(p);
      resizeCropFromPointer(state.pointer.handle, {
        x: w.x / state.workW,
        y: w.y / state.workH
      });
      state.cropTouched = true;
      renderView();
      updateExportInfo();
      return;
    }

    if (state.brushMode) {
      els.view.style.cursor = 'crosshair';
    } else {
      const hit = hitTestCrop(p);
      if (hit && hit.type === 'resize') {
        const h = hit.handle;
        els.view.style.cursor = (h === 'nw' || h === 'se') ? 'nwse-resize' : 'nesw-resize';
      } else if (hit && hit.type === 'move') {
        els.view.style.cursor = 'move';
      } else {
        els.view.style.cursor = 'default';
      }
    }
  }

  function onPointerUp(e) {
    if (state.pointer.stroke) {
      state.pointer.stroke = false;
      renderComposite();
      updateStatus();
    }
    state.pointer.mode = null;
    state.pointer.handle = null;
    state.pointer.startCrop = null;
    try { els.view.releasePointerCapture(e.pointerId); } catch (err) { }
    els.view.style.cursor = state.brushMode ? 'crosshair' : 'default';
  }

  function resizeCropFromPointer(handle, p) {
    const c = state.pointer.startCrop;
    if (!c) return;
    let ax, ay, sx, sy;
    if (handle === 'se') { ax = c.x; ay = c.y; sx = 1; sy = 1; }
    else if (handle === 'nw') { ax = c.x + c.w; ay = c.y + c.h; sx = -1; sy = -1; }
    else if (handle === 'ne') { ax = c.x; ay = c.y + c.h; sx = 1; sy = -1; }
    else { ax = c.x + c.w; ay = c.y; sx = -1; sy = 1; }

    const r = normAspect();
    const maxW = sx > 0 ? 1 - ax : ax;
    const maxH = sy > 0 ? 1 - ay : ay;
    let dx = clamp((p.x - ax) * sx, 0.02, maxW);
    let dy = clamp((p.y - ay) * sy, 0.02, maxH);
    let w = Math.max(dx, dy * r);
    let h = w / r;
    if (w > maxW) { w = maxW; h = w / r; }
    if (h > maxH) { h = maxH; w = h * r; }
    w = Math.max(w, 0.04);
    h = w / r;
    if (h > maxH) { h = maxH; w = h * r; }
    if (w > maxW) { w = maxW; h = w / r; }
    state.crop = {
      x: sx > 0 ? ax : ax - w,
      y: sy > 0 ? ay : ay - h,
      w: w,
      h: h
    };
    state.crop.x = clamp(state.crop.x, 0, 1 - w);
    state.crop.y = clamp(state.crop.y, 0, 1 - h);
  }

  function drawDab(wx, wy, erase) {
    if (!state.maskCtx) return;
    const r = clamp((state.brushSize / 2) / Math.max(0.05, state.view.scale), 1, 400);
    const ctx = state.maskCtx;
    const g = ctx.createRadialGradient(wx, wy, 0, wx, wy, r);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.65, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.save();
    ctx.globalCompositeOperation = erase ? 'destination-out' : 'source-over';
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(wx, wy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawBrushLine(x0, y0, x1, y1, erase) {
    const r = clamp((state.brushSize / 2) / Math.max(0.05, state.view.scale), 1, 400);
    const dx = x1 - x0;
    const dy = y1 - y0;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const step = Math.max(1, r * 0.35);
    const n = Math.max(1, Math.ceil(dist / step));
    for (let i = 1; i <= n; i++) {
      drawDab(x0 + dx * i / n, y0 + dy * i / n, erase);
    }
  }

  /* ============================================================
   * 撤销 / 重做
   * ============================================================ */
  function pushUndo() {
    if (!state.hasImage) return;
    const snap = {
      mask: getMaskAlpha(),
      crop: { x: state.crop.x, y: state.crop.y, w: state.crop.w, h: state.crop.h },
      bgColor: state.bgColor,
      bgGradient: state.bgGradient,
      actualEngine: state.actualEngine,
      tolerance: state.keyTolerance
    };
    state.undoStack.push(snap);
    if (state.undoStack.length > MAX_UNDO) state.undoStack.shift();
    state.redoStack.length = 0;
    updateUndoButtons();
  }

  function restoreSnapshot(snap) {
    state.crop = { x: snap.crop.x, y: snap.crop.y, w: snap.crop.w, h: snap.crop.h };
    state.bgGradient = snap.bgGradient;
    state.keyTolerance = snap.tolerance;
    els.tolerance.value = snap.tolerance;
    els.tolVal.textContent = snap.tolerance;
    els.chkGradient.checked = snap.bgGradient;
    setBgColor(snap.bgColor, false);
    setMaskAlpha(snap.mask);
    state.actualEngine = snap.actualEngine || 'color';
    state.cropTouched = true;
    renderComposite();
    updateExportInfo();
    updateStatus();
  }

  function undo() {
    if (!state.hasImage || !state.undoStack.length) return;
    const current = {
      mask: getMaskAlpha(),
      crop: { x: state.crop.x, y: state.crop.y, w: state.crop.w, h: state.crop.h },
      bgColor: state.bgColor,
      bgGradient: state.bgGradient,
      actualEngine: state.actualEngine,
      tolerance: state.keyTolerance
    };
    state.redoStack.push(current);
    const snap = state.undoStack.pop();
    restoreSnapshot(snap);
    updateUndoButtons();
  }

  function redo() {
    if (!state.hasImage || !state.redoStack.length) return;
    const current = {
      mask: getMaskAlpha(),
      crop: { x: state.crop.x, y: state.crop.y, w: state.crop.w, h: state.crop.h },
      bgColor: state.bgColor,
      bgGradient: state.bgGradient,
      actualEngine: state.actualEngine,
      tolerance: state.keyTolerance
    };
    state.undoStack.push(current);
    const snap = state.redoStack.pop();
    restoreSnapshot(snap);
    updateUndoButtons();
  }

  function updateUndoButtons() {
    els.btnUndo.disabled = !state.undoStack.length;
    els.btnRedo.disabled = !state.redoStack.length;
  }

  /* ============================================================
   * 状态提示
   * ============================================================ */
  function setBgColor(color, render) {
    const hex = normalizeHex(color);
    if (!hex) return;
    state.bgColor = hex;
    els.hexInput.value = hex;
    els.customColor.value = hex;
    const sw = document.querySelectorAll('.swatch');
    for (let i = 0; i < sw.length; i++) {
      sw[i].classList.toggle('active', (sw[i].dataset.color || '').toUpperCase() === hex);
    }
    if (render !== false && state.hasImage) renderComposite();
  }

  function setEngineTag(text) { els.engineTag.textContent = text; }
  function setHint(text) { els.engineHint.textContent = text; }

  function updateStatus(extra) {
    let s;
    if (!state.hasImage) {
      s = '导入一张照片开始';
    } else if (state.bgAnalysis && state.bgAnalysis.transparent) {
      s = '透明背景：直接使用原图透明通道';
    } else if (state.actualEngine === 'ai') {
      s = '人像 AI 已抠图';
    } else if (state.actualEngine === 'manual') {
      s = '手动蒙版';
    } else if (state.bgAnalysis && state.bgAnalysis.solid) {
      s = '检测到纯色背景，已用色键抠图';
    } else {
      s = '背景较复杂：可试“人像 AI”或手动笔刷';
    }
    if (extra) s += ' · ' + extra;
    els.statusLine.textContent = s;
  }

  function syncExportControls() {
    const isPng = els.formatSelect.value === 'png';
    els.quality.disabled = isPng;
    els.chkTargetKb.disabled = isPng;
    if (isPng) {
      els.chkTargetKb.checked = false;
      els.targetKb.disabled = true;
    } else {
      els.targetKb.disabled = !els.chkTargetKb.checked;
    }
  }

  function updateExportInfo() {
    const isPng = els.formatSelect.value === 'png';
    if (!state.hasImage) {
      els.exportInfo.textContent = isPng ? 'PNG 为无损格式，质量与目标 KB 不适用。' : '';
      return;
    }
    const sw = Math.max(1, Math.round(state.crop.w * state.sourceW));
    const sh = Math.max(1, Math.round(state.crop.h * state.sourceH));
    const low = sw < state.outW * 0.9 || sh < state.outH * 0.9;
    els.exportInfo.textContent = '裁切区约 ' + sw + '×' + sh + 'px → 输出 ' + state.outW + '×' + state.outH + 'px' +
      (low ? ' · 原图偏小，可能发糊' : '') +
      (isPng ? ' · PNG 为无损格式，质量与目标 KB 不适用' : '');
  }

  /* ============================================================
   * 忙碌提示 / Toast
   * ============================================================ */
  function showBusy(text) {
    state.busyCount++;
    els.busyText.textContent = text || '处理中…';
    els.busy.classList.remove('hidden');
  }

  function hideBusy() {
    state.busyCount = Math.max(0, state.busyCount - 1);
    if (state.busyCount === 0) els.busy.classList.add('hidden');
  }

  function setBusyText(text) {
    els.busyText.textContent = text;
  }

  let toastTimer = null;
  function toast(msg, isError) {
    els.toast.textContent = msg;
    els.toast.classList.toggle('error', !!isError);
    els.toast.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.add('hidden'), 3400);
  }

  /* ============================================================
   * 导出：编码、DPI、命名
   * ============================================================ */
  function encodeOnce(canvas, mime, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => {
        if (blob) resolve(blob);
        else reject(new Error('编码失败'));
      }, mime, quality);
    });
  }

  async function encodeTarget(canvas, mime, targetKb) {
    let lo = 0.3;
    let hi = 0.95;
    let best = null;
    let smallest = null;
    for (let i = 0; i < 8; i++) {
      const q = (lo + hi) / 2;
      const blob = await encodeOnce(canvas, mime, q);
      if (!smallest || blob.size < smallest.size) smallest = blob;
      if (blob.size <= targetKb * 1024) {
        best = blob;
        lo = q;
      } else {
        hi = q;
      }
    }
    return best || smallest;
  }

  function readU32(arr, off) {
    return ((arr[off] << 24) | (arr[off + 1] << 16) | (arr[off + 2] << 8) | arr[off + 3]) >>> 0;
  }

  function writeU32(arr, off, v) {
    arr[off] = (v >>> 24) & 255;
    arr[off + 1] = (v >>> 16) & 255;
    arr[off + 2] = (v >>> 8) & 255;
    arr[off + 3] = v & 255;
  }

  function patchJpegDpi(buffer, dpi) {
    const src = new Uint8Array(buffer);
    if (src.length < 4 || src[0] !== 0xFF || src[1] !== 0xD8) return src;
    let off = 2;
    while (off + 4 <= src.length) {
      if (src[off] !== 0xFF) break;
      const marker = src[off + 1];
      if (marker === 0xDA || marker === 0xD9) break;
      const len = (src[off + 2] << 8) | src[off + 3];
      if (len < 2) break;
      if (marker === 0xE0 && len >= 16 && src[off + 4] === 0x4A && src[off + 5] === 0x46 && src[off + 6] === 0x49 && src[off + 7] === 0x46) {
        src[off + 11] = 1;
        src[off + 12] = (dpi >>> 8) & 255;
        src[off + 13] = dpi & 255;
        src[off + 14] = (dpi >>> 8) & 255;
        src[off + 15] = dpi & 255;
        return src;
      }
      off += 2 + len;
    }
    const app0 = new Uint8Array([
      0xFF, 0xE0, 0x00, 0x10,
      0x4A, 0x46, 0x49, 0x46, 0x00,
      0x01, 0x01, 0x01,
      (dpi >>> 8) & 255, dpi & 255,
      (dpi >>> 8) & 255, dpi & 255,
      0x00, 0x00
    ]);
    const out = new Uint8Array(src.length + app0.length);
    out.set(src.subarray(0, 2), 0);
    out.set(app0, 2);
    out.set(src.subarray(2), 2 + app0.length);
    return out;
  }

  let crcTable = null;
  function crc32(bytes) {
    if (!crcTable) {
      crcTable = new Uint32Array(256);
      for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) {
          c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        }
        crcTable[n] = c >>> 0;
      }
    }
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) {
      c = crcTable[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    }
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function patchPngDpi(buffer, dpi) {
    const src = new Uint8Array(buffer);
    const sig = [137, 80, 78, 71, 13, 10, 26, 10];
    for (let i = 0; i < 8; i++) if (src[i] !== sig[i]) return src;
    const ppm = Math.round(dpi / 0.0254);
    const pHYs = new Uint8Array(9);
    writeU32(pHYs, 0, ppm);
    writeU32(pHYs, 4, ppm);
    pHYs[8] = 1;

    let off = 8;
    let ihdrEnd = -1;
    let existing = -1;
    while (off + 12 <= src.length) {
      const len = readU32(src, off);
      const type = String.fromCharCode(src[off + 4], src[off + 5], src[off + 6], src[off + 7]);
      const dataStart = off + 8;
      const crcStart = dataStart + len;
      if (type === 'IHDR') ihdrEnd = crcStart + 4;
      if (type === 'pHYs') { existing = off; break; }
      if (type === 'IEND') break;
      off = crcStart + 8;
    }

    if (existing >= 0) {
      const out = src.slice();
      out.set(pHYs, existing + 8);
      const crc = crc32(out.subarray(existing + 4, existing + 8 + 9));
      writeU32(out, existing + 8 + 9, crc);
      return out;
    }
    if (ihdrEnd < 0) return src;

    const chunk = new Uint8Array(21);
    writeU32(chunk, 0, 9);
    chunk[4] = 0x70; chunk[5] = 0x48; chunk[6] = 0x59; chunk[7] = 0x73;
    chunk.set(pHYs, 8);
    const crc = crc32(chunk.subarray(4, 17));
    writeU32(chunk, 17, crc);

    const out = new Uint8Array(src.length + chunk.length);
    out.set(src.subarray(0, ihdrEnd), 0);
    out.set(chunk, ihdrEnd);
    out.set(src.subarray(ihdrEnd), ihdrEnd + chunk.length);
    return out;
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  async function buildExportBlob() {
    const outW = state.outW;
    const outH = state.outH;
    const mime = els.formatSelect.value === 'png' ? 'image/png' : 'image/jpeg';
    const quality = clamp((parseInt(els.quality.value, 10) || 92) / 100, 0.3, 1);
    const targetKb = (mime === 'image/jpeg' && els.chkTargetKb.checked)
      ? Math.max(1, parseInt(els.targetKb.value, 10) || 0) : 0;

    const sx = state.crop.x * state.sourceW;
    const sy = state.crop.y * state.sourceH;
    const sw = Math.max(1, state.crop.w * state.sourceW);
    const sh = Math.max(1, state.crop.h * state.sourceH);

    const baseCanvas = document.createElement('canvas');
    baseCanvas.width = outW;
    baseCanvas.height = outH;
    const bctx = baseCanvas.getContext('2d');
    bctx.imageSmoothingEnabled = true;
    bctx.imageSmoothingQuality = 'high';
    bctx.drawImage(state.source, sx, sy, sw, sh, 0, 0, outW, outH);

    const maskOut = document.createElement('canvas');
    maskOut.width = outW;
    maskOut.height = outH;
    const mctx = maskOut.getContext('2d');
    const mSx = state.crop.x * state.workW;
    const mSy = state.crop.y * state.workH;
    const mSw = Math.max(1, state.crop.w * state.workW);
    const mSh = Math.max(1, state.crop.h * state.workH);
    const blurPx = state.feather * (outW / mSw);
    if (blurPx > 0.05) mctx.filter = 'blur(' + blurPx + 'px)';
    mctx.drawImage(state.maskCanvas, mSx, mSy, mSw, mSh, 0, 0, outW, outH);
    mctx.filter = 'none';

    const fg = document.createElement('canvas');
    fg.width = outW;
    fg.height = outH;
    const fctx = fg.getContext('2d', { willReadFrequently: true });
    fctx.drawImage(baseCanvas, 0, 0);
    fctx.globalCompositeOperation = 'destination-in';
    fctx.drawImage(maskOut, 0, 0);
    fctx.globalCompositeOperation = 'source-over';
    if (state.despill > 0) despillCanvas(fg, state.bgColor, state.despill);

    const result = document.createElement('canvas');
    result.width = outW;
    result.height = outH;
    const rctx = result.getContext('2d');
    paintBackground(rctx, outW, outH);
    rctx.drawImage(fg, 0, 0);

    let blob = null;
    let hitTarget = true;
    if (mime === 'image/jpeg' && targetKb > 0) {
      blob = await encodeTarget(result, mime, targetKb);
      hitTarget = blob.size <= targetKb * 1024;
    } else {
      blob = await encodeOnce(result, mime, quality);
    }

    const buf = await blob.arrayBuffer();
    const patched = mime === 'image/jpeg' ? patchJpegDpi(buf, state.dpi) : patchPngDpi(buf, state.dpi);
    const outBlob = new Blob([patched], { type: mime });
    const baseName = sanitizeName(els.fileName.value || '证件照');
    const ext = mime === 'image/png' ? 'png' : 'jpg';

    return {
      blob: outBlob,
      mime: mime,
      filename: baseName + '_' + outW + 'x' + outH + '.' + ext,
      hitTarget: hitTarget,
      targetKb: targetKb,
      outW: outW,
      outH: outH,
      dpi: state.dpi
    };
  }

  async function exportPhoto() {
    if (!state.hasImage) return;
    showBusy('导出中…');
    try {
      const res = await buildExportBlob();
      downloadBlob(res.blob, res.filename);
      const kb = Math.round(res.blob.size / 1024);
      els.exportInfo.textContent = '已导出 ' + res.filename + ' · ' + kb + ' KB · ' + res.dpi + ' DPI';
      if (res.targetKb > 0 && !res.hitTarget) {
        toast('压不到 ' + res.targetKb + 'KB，已导出最小可达的 ' + kb + 'KB', true);
      } else {
        toast('已导出：' + res.filename);
      }
      updateStatus('已导出');
    } catch (e) {
      console.error(e);
      toast('导出失败：' + (e && e.message ? e.message : e), true);
    } finally {
      hideBusy();
    }
  }

  function pngDpiFromBytes(buf) {
    if (buf[0] !== 137 || buf[1] !== 80 || buf[2] !== 78 || buf[3] !== 71) return null;
    for (let off = 8; off + 12 <= buf.length;) {
      const len = readU32(buf, off);
      const type = String.fromCharCode(buf[off + 4], buf[off + 5], buf[off + 6], buf[off + 7]);
      if (type === 'pHYs') {
        const unit = buf[off + 16];
        return unit === 1 ? Math.round(readU32(buf, off + 8) * 0.0254) : null;
      }
      off = off + 12 + len;
    }
    return null;
  }

  async function runExportTest() {
    const prevFormat = els.formatSelect.value;
    try {
      await loadDemo();
      const results = [];
      for (const format of ['jpeg', 'png']) {
        els.formatSelect.value = format;
        syncExportControls();
        const res = await buildExportBlob();
        const buf = new Uint8Array(await res.blob.arrayBuffer());
        let sigOk = false;
        let dpiOk = false;
        if (format === 'jpeg') {
          sigOk = buf[0] === 0xFF && buf[1] === 0xD8;
          for (let i = 0; i + 16 < buf.length; i++) {
            if (buf[i] === 0xFF && buf[i + 1] === 0xE0 && buf[i + 4] === 0x4A && buf[i + 5] === 0x46) {
              dpiOk = buf[i + 11] === 1 && (((buf[i + 12] << 8) | buf[i + 13]) === res.dpi);
              break;
            }
          }
        } else {
          sigOk = buf[0] === 137 && buf[1] === 80 && buf[2] === 78 && buf[3] === 71;
          dpiOk = pngDpiFromBytes(buf) === res.dpi;
        }
        const dimsOk = res.outW === 295 && res.outH === 413;
        results.push({ format, sigOk, dpiOk, dimsOk, size: buf.length, dims: res.outW + 'x' + res.outH, dpi: res.dpi });
      }
      const ok = results.every(r => r.sigOk && r.dpiOk && r.dimsOk);
      const pre = document.createElement('pre');
      pre.id = 'exporttest';
      pre.style.cssText = 'position:fixed;left:0;bottom:0;z-index:9999;background:#fff;padding:10px;font:12px monospace;';
      pre.textContent = 'EXPORTTEST ' + (ok ? 'PASS' : 'FAIL') + ' ' +
        results.map(r => r.format + ':size=' + r.size + ',dims=' + r.dims + ',dpi=' + r.dpi +
          ',sig=' + r.sigOk + ',dpiOk=' + r.dpiOk + ',dimsOk=' + r.dimsOk).join(' | ');
      document.body.appendChild(pre);
      document.title = ok ? 'EXPORTTEST PASS' : 'EXPORTTEST FAIL';
    } catch (e) {
      console.error(e);
      const pre = document.createElement('pre');
      pre.id = 'exporttest';
      pre.style.cssText = 'position:fixed;left:0;bottom:0;z-index:9999;background:#fee;color:#900;padding:10px;font:12px monospace;white-space:pre-wrap;';
      pre.textContent = 'EXPORTTEST FAIL ' + (e && e.stack ? e.stack : String(e));
      document.body.appendChild(pre);
      document.title = 'EXPORTTEST FAIL';
    } finally {
      els.formatSelect.value = prevFormat;
      syncExportControls();
    }
  }

  /* ============================================================
   * Service Worker（离线 / 添加到主屏幕）
   * ============================================================ */
  function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    const secure = location.protocol === 'https:' ||
      location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    if (!secure) return;
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(err => {
        console.warn('Service worker registration failed:', err);
      });
    });
  }

  async function runSWTest() {
    try {
      if (!('serviceWorker' in navigator)) throw new Error('no serviceWorker');
      await navigator.serviceWorker.register('./sw.js');
      await navigator.serviceWorker.ready;
      await new Promise(r => setTimeout(r, 1200));
      const keys = await caches.keys();
      const name = keys.filter(k => k.indexOf('idphoto') === 0)[0] || keys[0];
      let count = 0;
      let hasIndex = false;
      let hasApp = false;
      let hasModel = false;
      let hasBundle = false;
      let hasWasm = false;
      if (name) {
        const cache = await caches.open(name);
        const reqs = await cache.keys();
        count = reqs.length;
        for (let i = 0; i < reqs.length; i++) {
          const u = reqs[i].url;
          if (u.indexOf('/index.html') >= 0) hasIndex = true;
          if (u.indexOf('/app.js') >= 0) hasApp = true;
          if (u.indexOf('selfie_segmenter.tflite') >= 0) hasModel = true;
          if (u.indexOf('vision_bundle.mjs') >= 0) hasBundle = true;
          if (u.indexOf('vision_wasm_internal.wasm') >= 0 ||
              u.indexOf('vision_wasm_nosimd_internal.wasm') >= 0) hasWasm = true;
        }
      }
      const ok = hasIndex && hasApp && hasModel && hasBundle && hasWasm;
      const pre = document.createElement('pre');
      pre.id = 'swtest';
      pre.style.cssText = 'position:fixed;left:0;bottom:0;z-index:9999;background:#fff;padding:10px;font:12px monospace;';
      pre.textContent = 'SWTEST ' + (ok ? 'PASS' : 'FAIL') + ' cache=' + name + ' count=' + count +
        ' index=' + hasIndex + ' app=' + hasApp + ' model=' + hasModel +
        ' bundle=' + hasBundle + ' wasm=' + hasWasm;
      document.body.appendChild(pre);
      document.title = ok ? 'SWTEST PASS' : 'SWTEST FAIL';
    } catch (e) {
      const pre = document.createElement('pre');
      pre.id = 'swtest';
      pre.style.cssText = 'position:fixed;left:0;bottom:0;z-index:9999;background:#fee;color:#900;padding:10px;font:12px monospace;white-space:pre-wrap;';
      pre.textContent = 'SWTEST FAIL ' + (e && e.stack ? e.stack : String(e));
      document.body.appendChild(pre);
      document.title = 'SWTEST FAIL';
    }
  }

  /* ============================================================
   * 自测（?selftest=1）
   * ============================================================ */
  function assert(cond, msg) {
    if (!cond) throw new Error(msg);
  }

  async function runSelfTests() {
    const lines = [];
    let failures = 0;
    const test = (name, fn) => {
      try {
        fn();
        lines.push('PASS ' + name);
      } catch (e) {
        failures++;
        lines.push('FAIL ' + name + ' :: ' + e.message);
      }
    };
    const testAsync = async (name, fn) => {
      try {
        await fn();
        lines.push('PASS ' + name);
      } catch (e) {
        failures++;
        lines.push('FAIL ' + name + ' :: ' + e.message);
      }
    };

    test('尺寸换算 25mm@300dpi', () => assert(mmToPx(25, 300) === 295, 'got ' + mmToPx(25, 300)));
    test('尺寸换算 35mm@300dpi', () => assert(mmToPx(35, 300) === 413, 'got ' + mmToPx(35, 300)));
    test('尺寸换算 26mm@350dpi', () => assert(mmToPx(26, 350) === 358, 'got ' + mmToPx(26, 350)));
    test('尺寸换算 32mm@350dpi', () => assert(mmToPx(32, 350) === 441, 'got ' + mmToPx(32, 350)));
    test('文件名清洗', () => assert(sanitizeName('a/b:c') === 'a_b_c', 'got ' + sanitizeName('a/b:c')));

    await testAsync('纯色背景识别 + 色键蒙版', async () => {
      const c = document.createElement('canvas');
      c.width = 120;
      c.height = 80;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.fillStyle = '#438EDB';
      g.fillRect(0, 0, 120, 80);
      g.fillStyle = '#C0392B';
      g.fillRect(40, 20, 40, 40);
      const img = g.getImageData(0, 0, 120, 80);
      const an = analyzeBackground(img);
      assert(an.solid, '未识别为纯色背景');
      const a = buildColorKeyMask(img, an.mean, 50);
      assert(a[0] < 30, '角落 alpha=' + a[0]);
      const center = 40 * 120 + 60;
      assert(a[center] > 225, '红色区域 alpha=' + a[center]);
    });

    await testAsync('JPEG DPI 写入', async () => {
      const c = document.createElement('canvas');
      c.width = 16;
      c.height = 16;
      const g = c.getContext('2d');
      g.fillStyle = '#fff';
      g.fillRect(0, 0, 16, 16);
      const blob = await encodeOnce(c, 'image/jpeg', 0.9);
      const buf = await blob.arrayBuffer();
      const out = patchJpegDpi(buf, 300);
      let ok = false;
      for (let i = 0; i + 16 < out.length; i++) {
        if (out[i] === 0xFF && out[i + 1] === 0xE0 && out[i + 4] === 0x4A && out[i + 5] === 0x46) {
          const units = out[i + 11];
          const xd = (out[i + 12] << 8) | out[i + 13];
          const yd = (out[i + 14] << 8) | out[i + 15];
          ok = units === 1 && xd === 300 && yd === 300;
          break;
        }
      }
      assert(ok, '未找到 300 DPI 的 APP0');
    });

    await testAsync('PNG DPI 写入', async () => {
      const c = document.createElement('canvas');
      c.width = 16;
      c.height = 16;
      const g = c.getContext('2d');
      g.fillStyle = '#fff';
      g.fillRect(0, 0, 16, 16);
      const blob = await encodeOnce(c, 'image/png', 1);
      const buf = await blob.arrayBuffer();
      const out = patchPngDpi(buf, 300);
      let ok = false;
      for (let off = 8; off + 12 <= out.length;) {
        const len = readU32(out, off);
        const type = String.fromCharCode(out[off + 4], out[off + 5], out[off + 6], out[off + 7]);
        if (type === 'pHYs') {
          ok = readU32(out, off + 8) === Math.round(300 / 0.0254);
          break;
        }
        off = off + 12 + len;
      }
      assert(ok, '未找到 pHYs');
    });

    await testAsync('目标 KB 编码', async () => {
      const c = document.createElement('canvas');
      c.width = 200;
      c.height = 200;
      const g = c.getContext('2d');
      const grad = g.createLinearGradient(0, 0, 200, 200);
      grad.addColorStop(0, '#f00');
      grad.addColorStop(1, '#00f');
      g.fillStyle = grad;
      g.fillRect(0, 0, 200, 200);
      const blob = await encodeTarget(c, 'image/jpeg', 30);
      assert(blob && blob.size > 0, '编码为空');
      assert(blob.size <= 30 * 1024, '未压到 30KB 以内: ' + blob.size);
    });

    const pre = document.createElement('pre');
    pre.id = 'selftest';
    pre.textContent = lines.join('\n') + '\n\n' + (failures ? 'SELFTEST FAIL (' + failures + ')' : 'SELFTEST PASS');
    document.body.appendChild(pre);
    document.title = failures ? 'SELFTEST FAIL' : 'SELFTEST PASS';
  }

  /* ============================================================
   * 演示图（?demo=1）
   * ============================================================ */
  function makeDemoImage() {
    const c = document.createElement('canvas');
    c.width = 600;
    c.height = 800;
    const g = c.getContext('2d');
    g.fillStyle = '#438EDB';
    g.fillRect(0, 0, 600, 800);

    g.fillStyle = '#2b3442';
    g.beginPath();
    g.moveTo(30, 800);
    g.quadraticCurveTo(70, 640, 220, 615);
    g.lineTo(380, 615);
    g.quadraticCurveTo(530, 640, 570, 800);
    g.closePath();
    g.fill();

    g.fillStyle = '#e8b98f';
    g.fillRect(268, 470, 64, 105);

    g.beginPath();
    g.ellipse(300, 380, 108, 138, 0, 0, Math.PI * 2);
    g.fill();

    g.fillStyle = '#2a1f1a';
    g.beginPath();
    g.ellipse(300, 292, 118, 92, 0, Math.PI, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.ellipse(204, 380, 26, 82, 0, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.ellipse(396, 380, 26, 82, 0, 0, Math.PI * 2);
    g.fill();

    g.fillStyle = '#fff';
    g.beginPath(); g.ellipse(262, 382, 22, 12, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(338, 382, 22, 12, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#2a1f1a';
    g.beginPath(); g.arc(262, 382, 9, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(338, 382, 9, 0, Math.PI * 2); g.fill();

    g.strokeStyle = '#2a1f1a';
    g.lineWidth = 5;
    g.beginPath(); g.moveTo(240, 348); g.quadraticCurveTo(262, 338, 284, 348); g.stroke();
    g.beginPath(); g.moveTo(316, 348); g.quadraticCurveTo(338, 338, 360, 348); g.stroke();

    g.strokeStyle = '#c98b62';
    g.lineWidth = 3;
    g.beginPath(); g.moveTo(300, 392); g.lineTo(300, 432); g.stroke();

    g.fillStyle = '#b04a4a';
    g.beginPath(); g.ellipse(300, 462, 28, 10, 0, 0, Math.PI * 2); g.fill();

    g.fillStyle = '#f3f4f6';
    g.beginPath();
    g.moveTo(270, 620);
    g.lineTo(300, 680);
    g.lineTo(330, 620);
    g.closePath();
    g.fill();

    return c;
  }

  async function loadDemo() {
    try {
      await loadBitmap(makeDemoImage(), 'demo');
      setBgColor('#FFFFFF');
      renderComposite();
    } catch (e) {
      console.error(e);
    }
  }

  async function runAITest() {
    try {
      await loadDemo();
      await runAI(false);
      if (state.ai.error) throw state.ai.error;
      const a = getMaskAlpha();
      let sum = 0;
      let min = 255;
      let max = 0;
      let soft = 0;
      for (let i = 0; i < a.length; i++) {
        sum += a[i];
        if (a[i] < min) min = a[i];
        if (a[i] > max) max = a[i];
        if (a[i] > 10 && a[i] < 245) soft++;
      }
      const pre = document.createElement('pre');
      pre.id = 'aitest';
      pre.style.cssText = 'position:fixed;left:0;bottom:0;z-index:9999;background:#fff;padding:10px;font:12px monospace;';
      pre.textContent = 'AITEST PASS loaded=' + state.ai.loaded +
        ' mean=' + (sum / a.length).toFixed(1) +
        ' min=' + min + ' max=' + max + ' soft=' + soft;
      document.body.appendChild(pre);
      document.title = 'AITEST PASS';
    } catch (e) {
      console.error(e);
      const pre = document.createElement('pre');
      pre.id = 'aitest';
      pre.style.cssText = 'position:fixed;left:0;bottom:0;z-index:9999;background:#fee;color:#900;padding:10px;font:12px monospace;white-space:pre-wrap;';
      pre.textContent = 'AITEST FAIL ' + (e && e.stack ? e.stack : String(e));
      document.body.appendChild(pre);
      document.title = 'AITEST FAIL';
    }
  }

  /* ============================================================
   * 启动
   * ============================================================ */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
