# 玩播 · PlayCast

Electron + React + TypeScript 的本地直播互动工作台，将直播互动与游戏挑战、独立展示窗口连接起来。目前提供抖音连接和英雄联盟玩法；平台适配器与指标模块支持后续扩展。

## 功能

- 官方页面扫码登录，账号资料与本地加密凭据管理。
- 按账号、模式和玩法保存挑战；互动规则、手动校正及历史记录。
- 英雄击杀、防御塔及团队史诗野怪指标；具体支持范围见[游戏模式验收](docs/game-mode-acceptance.md)。
- 独立挑战/弹幕展示窗口，锁定、置顶、主题及设置编辑。
- 有界消息保留与列表窗口化、按上下文隔离查询、持久化失败恢复。

## 本地开发

需要 Node.js 22+。Windows PowerShell 可使用 npm.cmd。

```powershell
npm.cmd ci
npm.cmd run dev
```

Vite 地址为 http://127.0.0.1:5188。Electron 源码改动会先检查类型，再编译并通过正常关闭流程重启。

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd run smoke
```

## Windows 安装包与 Release

```powershell
npm.cmd run dist:win
npm.cmd run verify:package
npm.cmd run report:package -- release/package-report.json
```

输出为 `release/PlayCast-Setup-<version>-x64.exe`；`pack:win` 可生成免安装目录。保留完整运行时目录，不能单独移动 EXE。当前构建未配置代码签名和自动更新。资料目录保持为 `%APPDATA%/live-interaction-tool`，升级前退出应用；卸载默认保留资料。

GitHub Actions 提供 PR/主分支检查及 Windows 构建验收。`v<package.version>` 标签触发 Release 打包、SHA256 校验与发布；手动分支运行仅上传构建产物。首次构建可能下载 Electron/NSIS。详情见[开发与发布](docs/development.md)。

## 文档与贡献

- [使用说明](docs/user-guide.md)：账号、互动规则、展示窗口和数据管理。
- [架构](docs/architecture.md)、[性能测量](docs/performance.md)与[协议证据](docs/protocol-evidence.md)。
- [贡献指南](CONTRIBUTING.md)及[仓库指南](AGENTS.md)。

自动验收使用合成账号和隔离资料目录；真实扫码、直播互动和游戏会话仍需实际环境验证。此工具不能用于财务礼物结算。

## 许可证与素材

原始项目贡献采用 [MIT](LICENSE)。依赖、参考实现及素材分别保留其条款，见[第三方声明](THIRD_PARTY_NOTICES.md)与[素材来源](artwork/ASSET_PROVENANCE.md)。签名实现的参考授权和部分图片来源仍待核实，不能将完整发行包宣称为已清除所有第三方权利的 MIT 内容。
