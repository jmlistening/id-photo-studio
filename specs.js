/* 证件照规格与底色预设。规格会随地区和年份变化，数值可自行增改。 */
(function () {
  'use strict';

  window.PHOTO_SPECS = [
    { group: '常用尺寸', items: [
      { name: '一寸', w: 295, h: 413, dpi: 300, mmW: 25, mmH: 35, bg: '#FFFFFF', note: '最通用' },
      { name: '小一寸', w: 260, h: 378, dpi: 300, mmW: 22, mmH: 32, bg: '#FFFFFF', note: '驾驶证等' },
      { name: '大一寸', w: 390, h: 567, dpi: 300, mmW: 33, mmH: 48, bg: '#FFFFFF', note: '护照、部分签证' },
      { name: '二寸', w: 413, h: 579, dpi: 300, mmW: 35, mmH: 49, bg: '#FFFFFF', note: '' },
      { name: '小二寸', w: 413, h: 531, dpi: 300, mmW: 35, mmH: 45, bg: '#FFFFFF', note: '申根签证等' },
      { name: '大二寸', w: 413, h: 626, dpi: 300, mmW: 35, mmH: 53, bg: '#FFFFFF', note: '' }
    ]},
    { group: '证件', items: [
      { name: '身份证', w: 358, h: 441, dpi: 350, mmW: 26, mmH: 32, bg: '#FFFFFF', note: '二代身份证数字相片' },
      { name: '社保卡', w: 358, h: 441, dpi: 350, mmW: 26, mmH: 32, bg: '#FFFFFF', note: '' },
      { name: '护照', w: 390, h: 567, dpi: 300, mmW: 33, mmH: 48, bg: '#FFFFFF', note: '' },
      { name: '驾驶证', w: 260, h: 378, dpi: 300, mmW: 22, mmH: 32, bg: '#FFFFFF', note: '' }
    ]},
    { group: '签证', items: [
      { name: '美国签证', w: 600, h: 600, dpi: 300, mmW: 51, mmH: 51, bg: '#FFFFFF', note: '2×2 英寸' },
      { name: '日本签证', w: 531, h: 531, dpi: 300, mmW: 45, mmH: 45, bg: '#FFFFFF', note: '' },
      { name: '申根/韩国签证', w: 413, h: 531, dpi: 300, mmW: 35, mmH: 45, bg: '#FFFFFF', note: '' }
    ]},
    { group: '考试', items: [
      { name: '四六级', w: 144, h: 192, dpi: 300, mmW: null, mmH: null, bg: '#FFFFFF', note: '以当次公告为准' },
      { name: '教资/公务员', w: 295, h: 413, dpi: 300, mmW: 25, mmH: 35, bg: '#FFFFFF', note: '各省要求不同' },
      { name: '考研', w: 480, h: 640, dpi: 300, mmW: null, mmH: null, bg: '#FFFFFF', note: '宽高比 3:4，以研招网为准' },
      { name: '计算机等级', w: 144, h: 192, dpi: 300, mmW: null, mmH: null, bg: '#FFFFFF', note: '' }
    ]}
  ];

  window.BG_COLORS = [
    { name: '白', value: '#FFFFFF' },
    { name: '标准蓝', value: '#438EDB' },
    { name: '深蓝', value: '#2E5FA3' },
    { name: '红', value: '#FF0000' },
    { name: '正红', value: '#D9001B' },
    { name: '浅灰', value: '#F2F2F2' }
  ];
})();
