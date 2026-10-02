# Platform Account Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** 先交付可复用的平台账号层、真实个人空间及完整本地退出流程，为已批准的单玩法流程提供基础。

**Architecture:** 平台注册表提供能力和账号接口，当前仅注册抖音。主进程管理 Cookie、官方账号请求和凭据加密；React 只接收白名单化资料和认证状态。此计划是总设计的第一批，可独立测试交付；游戏指标、礼物目录和引导流程作为下一批，不把未完成项宣称为已实现。

**Tech Stack:** Electron 44、React 19、UnoCSS、Vite 6、Node test。

**Spec:** ../specs/2026-09-28-single-gameplay-design.md

## Global Constraints

- 端口 5188；仅修改 live-interaction-tool，不修改参考仓库。
- 官方扫码由用户操作；不在输出、快照或挑战存档暴露凭据。
- 不使用外部转发服务；网络失败不等同于登录失效。
- 退出本应用账号不影响其他浏览器。安全保存不可用时不写入明文。
- 当前目录无 Git 仓库，原地工作，不创建分支或初始化 Git；提交步骤以文件保存及测试记录代替。

## Task 1: 账号资料模型与安全存储

**Files:** Create electron/account-profile.cjs, electron/credential-vault.cjs, tests/account-profile.test.cjs, tests/credential-vault.test.cjs.

**Interfaces:** parseDouyinProfile(response) 返回白名单 profile 或 null；createCredentialVault({directory,safeStorage,platformId}) 返回 read/write/clear。profile 为 {id,displayId,nickname,avatar,signature,followerCount,followingCount}。

- [x] 写测试：合法资料保留公开字段、缺失计数为 null、不传播 sessionid；非成功状态不可认证。
  ```js
  assert.equal(parseDouyinProfile({status_code:0,data:{sec_uid:'u',nickname:'N'}}).followerCount,null)
  assert.equal(parseDouyinProfile({status_code:1,data:{sec_uid:'u'}}),null)
  ```
- [x] 运行 node --test tests/account-profile.test.cjs tests/credential-vault.test.cjs，确认因功能缺失失败。
- [x] 实现解析器：要求成功状态及稳定 ID，https 头像 URL 白名单化；安全存储使用系统加密与原子替换，仅允许已注册的平台标识构造文件名。
  ```js
  const encrypted=safeStorage.encryptString(JSON.stringify(cookies))
  fs.writeFileSync(temporary,encrypted)
  fs.renameSync(temporary,file)
  ```
- [x] 测试真实临时目录保存、恢复、清除及平台隔离；只替换操作系统加密边界。禁用加密必须拒绝保存，错误不含输入。

## Task 2: 抖音认证与平台接口

**Files:** Create electron/platforms.cjs; modify electron/douyin-session.cjs, electron/douyin.cjs, electron/product.cjs, electron/main.cjs; extend tests/douyin-auth.test.cjs; create tests/platforms.test.cjs.

**Interfaces:** auth.snapshot() 扩展 status/profile；auth.verify() 通过官方网窗口同源 fetch 请求 /webcast/user/me/；恢复安全存档先于 verify；平台接口包含 descriptor/getAccount/login/refreshAccount/logout/connect/disconnect/dispose。

- [x] 写失败测试：有效凭据不等于认证成功；官方成功响应后才有 profile；注销后待返回的请求不能恢复资料；无 ID / 风控错误只标记验证不可用。
  ```js
  await auth.importCredential('sessionid=dummy')
  assert.equal(auth.snapshot().profile,null)
  await auth.verify()
  assert.equal(auth.snapshot().status,'authenticated')
  ```
- [x] 验证失败，然后接入受限官网请求窗口、超时和代次检查；登录窗口独立保留；关闭窗口或登录 Cookie 改变后检查认证。
- [x] 平台注册表校验必要方法及唯一 ID，拒绝不存在平台；用第二个测试适配器检查注销调用不串平台。
- [x] 在 product.snapshot 提供 platforms/platform/account；保留 douyin 字段兼容现有视图。logout 暂停挑战，停止采集，清空资料及平台存储，保留挑战进度。
- [x] 运行全部单元测试。登录网络请求不进入模拟测试路径，测试边界注入 transport。

## Task 3: 个人空间与退出登录 UI

**Files:** Create src/components/AccountPanel.jsx and src/account.css; modify src/main.jsx, src/browser-preview.js; extend electron/main.cjs smoke checks.

**Interfaces:** AccountPanel({account,platform,act,busy,preview})，操作为 login、refreshAuth、logout；使用现有 Modal 和设计颜色，不新增图片生成依赖。

- [x] 先扩展 Electron smoke：点击「个人空间」显示未认证态；导入假凭据不显示已登录；退出后凭据配置为空、进度保留且挑战暂停。
  ```js
  document.querySelector('[aria-label="个人空间"]').click()
  if(!document.querySelector('[data-testid="account-panel"]'))throw Error('个人空间未打开')
  ```
- [x] 构建并运行 smoke，确认新控件不存在导致失败。
- [x] 实现账户卡、缺失值、刷新状态、确认退出、加载/错误状态；昵称为普通文本，头像失败有本地占位。浏览器预览资料必须标记演练，禁止访问真实账号。
- [x] 运行 npm.cmd test、npm.cmd run build、npm.cmd run smoke；检查常规及小窗口截图，回归旧消息和挑战功能。

## Task 4: 复核与后续计划衔接

- [x] 复核敏感信息、退出并发、网络超时、失败提示和账号恢复，修复测试能捕获的问题。
- [x] README 写明真实账号及平台端失效仍需用户扫码实测，不将合成响应测试当成实际登录成功。
- [x] 记录后续批次：五指标与规则模型、真实礼物目录协议验证、首次引导与玩法 UI。若真实账号认证请求被站点风控阻断，报告限制并保持未认证状态，不绕过验证。

## 执行记录

- 基线：19 个单元测试通过。
- 采用当前会话顺序执行，暂不分派实现代理；无 Git 仓库，无法使用工作树或提交审查流程。
- 账号批次已实现；代码审查发现并修复 Chromium Cookie 明文旁路、跨账号恢复混合、退出失败时旧验证请求复活三项问题。只分派了只读审查代理。
- 凭据运行分区调整为内存，系统加密存档作为唯一新增持久化来源；旧持久会话先加密迁移后清理，失败不删除旧数据。
- 单元测试 32 项通过；构建通过；Electron 冒烟验证资料、退出、原有挑战及弹幕、两种外窗尺寸。截图位于外部 account-space 目录，包含合成测试资料标识。
- 内置浏览器不可用（unsupported Codex auth method: apikey）；使用应用本身的 Electron 冒烟及 capturePage 验证，没有安装额外浏览器依赖。
- 未完成的总设计部分：五种指标及简化规则、真实礼物目录、完整首次引导、跨平台消息归一化；不纳入本批次完成声明。真实扫码与在线认证返回仍需用户实测。
