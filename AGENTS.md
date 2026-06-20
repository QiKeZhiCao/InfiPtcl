# 粒子生成器 — Agent 指引

## 启动方式
- 直接双击 `index.html` 或 `file://` 打开即可运行全部功能，无需本地服务器

## 架构
- 无框架/无构建工具，纯 Canvas 2D + vanilla JS
- 模块通过 `window._` 全局命名空间通信，无 ES modules/imports
- 脚本加载顺序：`midi-parser.js` → `particle.js` → `ui.js` → `sequence.js` → `resize.js` → `export.js`
- `particle.js` 驱动 `requestAnimationFrame` 主循环，管理粒子数组与物理更新

## 默认行为
- `sequence.js` 初始化时自动加载默认时间戳 `[0.0, 0.3, 0.6, 0.6, 1.0, 1.5]` 并默认为连续发射模式

## 限制
- 无测试框架、无 CI、无 linter/formatter — 验证需手动在浏览器操作
- UI 文本和 git 提交信息均为中文
- 不依赖任何 CDN 或外部资源，完全离线可运行
