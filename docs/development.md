# 开发、验证和发布

## 环境与日常命令

使用 Node.js 22+，Windows x64 用于 Electron 和安装包验收。克隆后执行 `npm ci`；PowerShell 受脚本策略限制时使用 `npm.cmd`。

```powershell
npm.cmd run dev
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd run smoke
```

Vite 固定监听 `127.0.0.1:5188`，端口占用会失败。React 页面支持热更新；Electron `.cts` 改动先检查类型，再编译和请求正常退出后重启。关闭确认未完成时不会强杀进程，先处理应用内提示。主进程生成文件与 public bootstrap 不提交 Git。

`npm start` 会先完成正式构建。`npm run pack:win` 生成 `release/win-unpacked/`；`npm run dist:win` 先测试和构建，再生成 NSIS 安装包。

```powershell
npm.cmd run dist:win
npm.cmd run verify:package
npm.cmd run report:package -- release/package-report.json
npm.cmd run benchmark -- release/win-unpacked/PlayCast.exe 5 release/benchmark-fresh.json fresh
npm.cmd run benchmark -- release/win-unpacked/PlayCast.exe 5 release/benchmark-warm.json warm
```

包验收使用独立临时资料目录。也可传入实际安装目录的 EXE：`npm run verify:package -- "C:/Applications/PlayCast/PlayCast.exe"`。不要只复制 EXE；它依赖同目录 Electron 运行时。

## 验收范围

单元测试使用 Node 内置测试框架，Electron smoke 使用合成平台/账号/游戏数据。不得让 smoke 连接用户真实游戏。真实扫码登录、官方直播互动与实际游戏会话需要另外人工验证，记录环境和结果。

现有构建未配置代码签名或自动更新。用户升级时应先退出应用，保留 `%APPDATA%/live-interaction-tool`；卸载默认保留资料，删除资料应在应用内明确执行恢复初始状态。

## GitHub Actions

`ci.yml` 在主分支 push、PR 和手动触发时安装锁定依赖，检查类型、测试、构建并执行 smoke。`release.yml` 在 `v*` 标签或手动运行时构建 Windows 安装包、验收并生成 SHA256 校验。手动分支构建只上传构建产物；与 package 版本一致的标签才进入 Release 发布任务。

更新版本示例：

```powershell
npm.cmd version patch --no-git-tag-version
git add package.json package-lock.json
git commit -m "chore: release 0.2.3"
git tag v0.2.3
```

推送版本提交和标签会触发对应流程。发布前核对 [第三方声明](../THIRD_PARTY_NOTICES.md) 和素材来源；原始贡献使用 MIT，不代表参考实现及外部素材自动取得 MIT 授权。
