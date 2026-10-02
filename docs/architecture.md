# 架构与扩展边界

PlayCast 使用 Electron 主进程管理窗口、账号、平台连接、采集和本地持久化；React 渲染进程负责工作台、独立展示窗口及设置编辑器。`shared/domain.ts` 描述业务快照，`shared/ipc.ts` 描述 preload 允许的操作。共享契约应以类型导入，不给渲染进程暴露 Node 或 Electron 对象。

## 模块职责

| 位置 | 职责 |
| --- | --- |
| `electron/main.cts` | 生命周期、IPC 授权、窗口协调及游戏轮询 |
| `electron/product.cts` | 账号、房间、挑战和展示状态的业务协调 |
| `electron/platforms.cts` | 平台适配器注册、能力声明与连接状态 |
| `electron/challenge*.cts` | 挑战计算、草稿与历史记录 |
| `electron/local-store.cts` | 合并写入、恢复和持久化错误状态 |
| `electron/display-windows.cts` | 独立窗口、锁定及关闭确认 |
| `src/components/` | 按功能划分的 React 组件 |
| `src/` 中的 hooks/helpers | 查询、消息窗口、编辑草稿及导航状态 |

新增平台时实现适配器契约并声明消息、登录和礼物能力；界面根据能力隐藏或禁用不支持的功能。新增玩法时扩展指标描述与计算，不把平台协议逻辑放进 React 组件。

## 必须保留的约束

渲染进程使用 `contextIsolation`、sandbox，禁止 `nodeIntegration`。主进程验证 IPC 发送者、顶层 frame、窗口身份及上下文版本。账号、房间和数据源切换使旧异步结果失效；展示快照不包含凭据、完整账号资料或原始游戏响应。

游戏轮询在连接时每 1000 ms、等待时每 3000 ms 运行，串行等待请求完成；合并状态发布避免高频互动触发全量更新。消息列表按类型限制保留量并使用窗口化渲染。修改频率前应测量影响。

关闭和原生窗口重建必须等待未保存编辑确认、持久化 flush 和上下文复核；不能用强制退出绕过。恢复初始状态使用持久化意图标记，失败或中断后先完成清理再读取旧数据。

包名 `live-interaction-tool`、appId `com.playcast.desktop`、存储格式及用户资料目录属于兼容性边界。调整品牌名称不应隐式迁移用户数据。
