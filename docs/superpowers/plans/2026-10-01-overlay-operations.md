# 挑战展示窗可读性与快捷操作实施计划

> **For agentic workers:** 按当前会话逐项实施并复核；使用测试先行与完成前验证，不创建新会话。

**Goal:** 固定规则行高，展示窗提供与主页面同步的挑战控制及连接状态。

**Architecture:** Electron 主进程只投影精简操作状态并提供白名单命令；复用独立设置窗口的直播连接／游戏检测页。React 使用现有事件推送，不新增轮询或持久化缓存。

**Tech Stack:** Electron、React、Vite、node:test、现有隔离 Electron smoke 工具。

**Spec:** 当前用户已确认的方案：规则 44–48px、文字 17–18px、真实礼物图标；底部状态与开始／继续／暂停；独立连接／检测面板。

## Global Constraints

- 不构建安装包，不接触真实用户凭据和存档。
- 不改变自动计数、基线、暂停恢复语义，不自动开始挑战。
- 锁定时除解锁按钮外鼠标穿透，服务端也拒绝操作。
- 展示／配置窗不获取 Cookie、账号资料、完整游戏快照或消息历史。
- 账号切换销毁配置窗，直播间变化只保留同账号的配置窗并更新上下文。

### 1. 精简投影与有限操作

文件：electron/display-operations.cjs、electron/overlay-state.cjs、electron/main.cjs、electron/display-windows.cjs。

- [ ] 添加投影及 IPC 测试，覆盖未登录、错模式、锁定、旧挑战、旧上下文、同账号连接生命周期；运行确认失败。
- [ ] 实现精简状态、开始／暂停／连接／断开白名单及直播／游戏页路由。
- [ ] 跑相关 node:test，确认权限隔离未回归。

### 2. 展示布局与独立操作页

文件：src/components/OverlayDisplay.jsx、DisplayWindow.jsx、DisplaySettingsWindow.jsx、DisplayOperations.jsx、src/rift-overlay.css、display-settings.css。

- [ ] 添加组件测试验证按钮状态、真实图标、隐藏场景不泄漏内容。
- [ ] 规则固定 46px；大数安全省略并保留完整 title；标题状态稳定橙色；底部连接与挑战操作不被庆祝遮盖。
- [ ] 设置窗添加直播连接、游戏检测页；外观依旧实时保存；连接显式提交。
- [ ] 主页面和展示操作均复用 product.action，无本地重复状态。

### 3. 隔离 UI 验收

文件：tests/display-operations-smoke.cjs、tests/guided-smoke.cjs。

- [ ] build + 隔离 smoke：开始→暂停→继续，直播连接／断开／重连，模式不匹配，锁定。
- [ ] 300×420、320×440、420×520；0／2／4／多礼物规则、长名、大数、完整 HH:mm、分页、庆祝。
- [ ] 全量 npm test，并检查截图和应用 console；报告真实验证范围。
