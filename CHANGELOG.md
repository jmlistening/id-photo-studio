# Changelog

## [1.0.0] - 2026-11-06

### Added

- 17 个证件照规格预设：一寸、小一寸、大一寸、二寸、小二寸、大二寸、身份证、社保卡、护照、驾驶证、美签、日签、申根/韩国签证、四六级、教资/公务员、考研、计算机等级。
- 自定义 mm / px / DPI、宽高比锁定、横竖互换。
- 拖拽 / 四角缩放 / 网格 / 重置裁剪；按住对比原图。
- 双引擎换底：纯色底色键 + MediaPipe 人像分割；容差、羽化、去溢色、笔刷修补、蒙版反相。
- 白、标准蓝、深蓝、红、正红、浅灰、自定义色；轻微渐变。
- JPG / PNG 导出；JPG 目标 KB 二分压缩（PNG 为无损格式，质量与目标 KB 不适用）；300 / 350 DPI 元数据写入；文件名清洗。
- JPG、PNG、WebP、HEIC 导入；EXIF 方向纠正；透明 PNG 直接使用 alpha。
- PWA + Service Worker 离线缓存；手机添加到主屏幕。
- Windows 一键启动器（PowerShell 静态服务器，无需安装运行环境）。
- 浏览器自测、导出测试、AI 测试、Service Worker 测试。
- GitHub Actions CI 与 GitHub Pages 部署 workflow。
- 双语 README：英文默认 + 简体中文（`README.zh-CN.md`），顶部可切换。
- README 动图演示：导入、换底色、设置目标 KB、导出（8 帧，约 1MB）。

### Security / Privacy

- 照片只在浏览器内存中处理，不上传、不持久化。
- 无账号、无统计、无埋点、无第三方运行时字体或 CDN。
- 用 CSP `connect-src 'self'` 阻止 MediaPipe 上游运行时的匿名遥测外发；照片像素不在任何请求里。
- 本地服务器只读静态文件，使用应用文件白名单，`.git/`、`.work/`、`tests/` 等路径返回 404。
- 仓库不包含密钥、邮箱、本机绝对路径或真人照片；演示素材为程序生成的合成插画。MediaPipe 上游 wasm 中用于遥测的公共 Google key 已替换为等长占位符，遥测另由 CSP 阻止，详见 `THIRD_PARTY_NOTICES.md`。
- Service Worker 只清理本应用 `idphoto-` 前缀的缓存，不会删除同源其他项目的 Cache Storage。
- 第三方许可证全文收在 `vendor/LICENSES/`。
