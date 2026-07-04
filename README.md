# InfiPtcl（粒子无限）

<img src="https://img.shields.io/badge/Vibe%20Coding-crafted%20with%20%E2%9D%A4%EF%B8%8F%20by%20AI-8B5CFE?style=flat-square" alt="Vibe Coding">

基于 HTML5 Canvas 的实时粒子效果生成器。纯前端、零依赖、离线运行。

## 快速开始

- 在线体验：[https://infiptcl.netlify.app/](https://infiptcl.netlify.app/)
- 本地运行：双击 `index.html` 在浏览器中打开即可使用。推荐 Chrome/Edge 86+。

## 功能概览

### 发射模式
- 连续发射 / 固定序列两种模式切换
- 跟随鼠标 / 固定点发射
- 发射器坐标支持点击定位和手动输入

### 粒子参数
- 发射量（1~800 个/秒，可随机化）
- 发射区半径、大小区间、角度方向
- 渐隐开始时间与持续时长（范围区间）
- 透明度区间（0%~100%）

### 外观
- **图片模式**：上传多张纹理（PNG/JPEG/WebP/SVG），支持动画播放和拖拽排序
- **文本模式**：自定义文字，13 种内置字体，支持导入外部字体
- **调色器**：HSL 变化区间随机着色 / 十六进制颜色列表取值

### 运动物理
- 速度区间、加速度（独立 X/Y 轴）、空气阻力
- 初始旋转角度、旋转速度区间
- 边界检测自动移除

### 时间戳序列
- JSON 格式时间戳手动输入
- MIDI 文件导入，音轨选择与合并
- 播放/暂停/跳转/循环控制，空格键快捷操作

### PNG 序列渲染
- 自定义帧率与时长
- 透明背景导出
- 进度显示与取消支持

### 项目文件管理
- `.json`（Base64 内嵌资源）和 `.zip`（结构化压缩包）两种格式
- 完整状态持久化（粒子参数、外观、序列、调色器等）

### UI
- 暗色主题，自定义 MapleMono 等宽中文字体
- 右侧可拖拽面板，融合导航标签快速定位
- 菱形滑块、iOS 风格开关、毛玻璃效果
- Toast 弹窗通知系统

## 文件结构

```
index.html          入口页面
particle.js         粒子引擎核心（物理/渲染/主循环）
ui.js               UI 控制绑定
sequence.js         时间戳序列播放与 MIDI 导入
render.js           PNG 序列渲染导出
io.js               项目文件导入/导出
toast.js            Toast 弹窗通知
theme.css           视觉主题（颜色/字体/动效）
ui.css              布局框架（定位/尺寸/响应式）
jszip.min.js        第三方：ZIP 读写
midi-parser.js      第三方：MIDI 解析
MapleMono-NF-CN-Regular.ttf  默认 UI 字体
```

## 技术栈

- **渲染**：HTML5 Canvas 2D
- **语言**：Vanilla JavaScript（IIFE + `window._` 全局命名空间）
- **样式**：CSS3（Flexbox/Grid/Animation/backdrop-filter）
- **动画循环**：`requestAnimationFrame`
- **第三方**：jszip.min.js、midi-parser.js
- **无构建工具、无框架**，开箱即用

## 许可

参见 [LICENSE](LICENSE)
