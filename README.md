# xbot-cli

[npm 安装包：@guanzhu.me/xbot-cli](https://www.npmjs.com/package/@guanzhu.me/xbot-cli) · [GitHub Releases 下载](https://github.com/wn0x00/xbot-cli/releases) · [v0.6.0 版本说明](https://github.com/wn0x00/xbot-cli/releases/tag/v0.6.0)

面向 AI Agent 的影刀（ShadowBot）RPA 命令行工具。通过影刀客户端内置的 shell-cli、studio-mcp 和 browser-use-mcp 管理应用、编辑流程、运行验证及浏览器自动化。

Agent 可以逐层查询帮助和参数 schema，通过稳定的 JSON 结果判断下一步，并安装随包提供的开发 Skill。CLI 使用 Rust 实现，通过 npm 分发预编译程序。

## 安装与首次运行

当前分发目标为 **Windows x64，Node.js 22 或更高版本**。npm 包包含原生可执行文件，不需要用户安装 Rust，也不在 `postinstall` 阶段下载程序。执行影刀操作前，需要本机已安装影刀客户端并启动、登录；帮助、版本、命令 schema 和内置指南可离线使用。

通过 npm 安装。**npm 包名是 `@guanzhu.me/xbot-cli`，安装后的命令名仍是 `xbot-cli`。**

```powershell
npm install -g '@guanzhu.me/xbot-cli'
xbot-cli --version
xbot-cli
xbot-cli status --json
```

不进行全局安装也可调用：

```powershell
npx --yes --package '@guanzhu.me/xbot-cli' xbot-cli --help
```

这里的 `npx --yes` 是 npm 的安装确认选项，不是 xbot-cli 的操作确认。需要可重复执行的 Agent 环境时，固定版本，例如 `npm install -g '@guanzhu.me/xbot-cli@0.6.0'`。PowerShell 中带 `@` 的 npm 包参数使用单引号包围。

也可从源码构建并直接运行：

```powershell
npm run build
node .\bin\xbot-cli.cjs --help
```

源码构建需要 Windows x64、Rust stable 和 MSVC 构建工具，详见[本地开发](#本地开发)。

## 让 Agent 使用

### 安装开发 Skill

在 Agent 的工作目录运行：

```powershell
xbot-cli install --skills --json
```

这会写入当前目录的 `.agents/skills/xbot-app-dev/`。若希望多个工作区共用，可安装到用户目录：

```powershell
xbot-cli install --skills --global --json
```

请使用支持 `.agents/skills` 的 Agent，或明确让 Agent 阅读生成的 `SKILL.md`。不支持自动加载 Skill 的工具也可以直接阅读下方指令。已有 Skill 内容不同时，CLI 会返回冲突；先查看差异，确认覆盖后再追加 `--yes`。

Skill 和按需指南覆盖 CodeFlow、VisualFlow、浏览器操作及错误恢复，不包含个人或团队专用服务配置。工作区的 `AGENTS.md` 和用户当前授权仍需遵守。

### 可复制的 Agent 指令

把下面的片段放入项目的 Agent 指令中，并提供要操作的应用 ID、流程和任务目标：

```text
使用 xbot-cli 操作影刀。先阅读已安装的 xbot-app-dev/SKILL.md，
并遵守当前工作区的 AGENTS.md 和用户授权范围。

1. 先运行 xbot-cli status --json。用根帮助、分组帮助和 help <path>
   逐层发现命令；只查询当前任务需要的 schema <path>、guide <topic>。
2. 解析业务结果时显式使用 --json。分别捕获 stdout、stderr 和退出码：
   成功读 stdout 的 ok/data；失败读 stderr 的 error 和可能存在的 data。
3. 修改前先读现状。Studio 操作显式传入 --expect-app <app-id> 和流程 ID；
   --expect-app 只断言当前应用，不会切换应用。复杂输入优先 @file 或 stdin。
4. 修改可先用 --dry-run 预览。它仅做离线校验，不证明权限、当前应用
   或真实运行正常。不要直接编辑影刀应用目录。
5. flow check 只做静态检查；flow verify 会实际运行。
   超时后用返回的 run_id 调用 flow wait，不重新启动第二份流程。
   控制台 task 命令使用 task_id，不能与 Studio run_id 混用。
6. 失败先检查 error.code、retryable、hint 及 data 中的已应用修改和运行状态。
   不盲目重试整个写入操作；retryable=true 也不代表写入一定可以安全重放。
7. 不默认附加 --yes。发布、回收和强制打开仅在用户明确授权后执行；
   已有授权继续有效，开发完成不自动发布。
8. 汇报区分写入成功、静态检查通过和真实运行成功；给出 app_id、flow_id、
   run_id/task_id、Out 或日志证据。未运行的路径明确标为未验证。
```

### 一个典型工作流

下面是维护 CodeFlow 的示例；将 `<app-id>` 和 `<flow-id>` 替换为实际标识，准备好 `updated.py` 后再执行写入。流程可能包含业务副作用，应在任务授权范围内运行。

```powershell
xbot-cli status --json
xbot-cli app open <app-id> --json
xbot-cli flow list --expect-app <app-id> --json
xbot-cli flow get <flow-id> --expect-app <app-id> --json
xbot-cli schema flow code write --json

xbot-cli flow code write <flow-id> --file updated.py --expect-app <app-id> --dry-run --json
xbot-cli flow code write <flow-id> --file updated.py --expect-app <app-id> --json
xbot-cli flow check <flow-id> --expect-app <app-id> --json
xbot-cli flow verify <flow-id> --timeout 600 --expect-app <app-id> --json
```

维护已有代码时，优先使用 `flow code edit` 做精确替换。需要 VisualFlow、参数声明或浏览器操作时，先按需阅读指南：

```powershell
xbot-cli guide codeflow
xbot-cli guide visualflow
xbot-cli guide browser
xbot-cli guide recovery
```

若等待超时，保留已有运行并继续查询：

```powershell
xbot-cli flow wait <run-id> --timeout 600 --expect-app <app-id> --json
```

已发布应用通过控制台任务运行，使用另一套标识：

```powershell
xbot-cli task run <app-id> --inputs-json @inputs.json --json
xbot-cli task status <task-id> --json
xbot-cli task logs <task-id> --json
```

## 命令与输出契约

| 入口 | 用途 |
|---|---|
| `status` / `doctor` | 当前上下文与连接诊断 |
| `app` | 应用创建、打开、保存、同步、发布和回收 |
| `flow` | 流程读取、参数、静态检查、实际运行与等待 |
| `flow code` / `flow visual` | CodeFlow 源码和 VisualFlow 块 |
| `task` | 已发布应用的控制台任务 |
| `browser` | 浏览器上下文、快照与交互 |
| `tool studio` / `tool browser` | 原始工具的发现、schema 和调用 |
| `wiki` / `schema` / `guide` | 官方知识库、命令参数与内置开发指南 |
| `install --skills` | 安装 Agent Skill |

裸调用 `xbot-cli` 或 `xbot-cli app` 返回简短帮助并退出 0。`help <path>` 和 `--help` 返回详细帮助；完整机器参数定义由 `schema <path>` 提供。叶命令缺参才返回参数错误。

普通业务结果默认在终端显示文本、在管道中显示 JSON。**Agent 应显式使用 `--json`**，避免依赖终端检测。帮助和 `guide` 默认是文本，`schema` 默认是 JSON；`--format text/json/pretty` 可明确选择格式。

成功写 stdout、退出 0；失败写 stderr、退出非零码。JSON 消费者应解析字段，不匹配自然语言消息。以下仅展示封装形状，实际 `data` 随命令变化：

```json
{"ok":true,"data":{"run_id":"...","outputs":{}}}
```

```json
{"ok":false,"error":{"type":"operation","code":"FLOW_RUN_FAILED","message":"流程运行失败","retryable":false},"data":{"run_id":"..."}}
```

| 退出码 | 含义与恢复方向 |
|---|---|
| 0 | 成功，检查 `data` 中的具体结果 |
| 1 | 操作或运行失败，读取错误与已有执行结果 |
| 2 | 参数或输入错误，查帮助/schema 后修正 |
| 3 | 认证、权限或配置问题，按提示处理 |
| 4 | 网络、离线或超时，先确认已有任务状态 |
| 5 | 冲突或资源占用，检查当前状态 |
| 6 | 内部或协议错误，保留诊断信息 |
| 10 | 需要明确确认，核实已有用户授权后处理 |

失败可能伴随 `applied: true` 或仍在运行的任务，不能理解为“没有执行”。`--dry-run` 只预览本地载荷；`--expect-app` 只在实际执行时断言当前应用。两者都不代替真实运行验收。

完整参数语义、兼容命令、确认边界和设计依据见 [CLI 参考](docs/cli-reference.md)；Agent 也可运行 `xbot-cli guide cli-contract`。

## 项目目录

```text
xbot-cli/
├── Cargo.toml / Cargo.lock   Rust 程序与依赖锁定
├── src/                     命令、帮助、输出、工作流与传输实现
├── tests/                   Rust 集成测试
├── package.json             npm 分发与开发命令
├── bin/xbot-cli.cjs          Node 启动器
├── native/win32-x64/         构建生成的 xbot-cli.exe
├── scripts/                 构建及 npm 包验证脚本
├── skills/xbot-app-dev/      Agent Skill 与按需参考文档
├── docs/                    CLI 参考与发布说明
└── .github/workflows/       持续集成与发布工作流
```

Rust 源码、Skill 和文档进入 GitHub 仓库；原生程序由构建生成，随 npm 包分发。个人本地配置、逆向材料、备份及运行数据不属于发布内容。

## 本地开发

从仓库根目录运行：

```powershell
npm run build          # 构建 Rust release，并准备 npm 包中的原生程序
npm test               # 项目自动化测试
npm run test:package   # 检查 npm 包与启动器
npm pack               # 生成本地 .tgz，不发布
```

Rust 也可单独构建和检查：

```powershell
cargo fmt --check
cargo test
cargo clippy --all-targets -- -D warnings
cargo build --release
```

直接 `cargo build` 的产物位于 `target/`；准备 npm 包使用 `npm run build`。离线测试和模拟后端验证命令契约，不代表已通过真实影刀客户端的运行、同步或发布验收。

非标准客户端安装可使用 `XBOT_SHELL_CLI`、`XBOT_MCP_ENDPOINT`、`XBOT_BROWSER_MCP_ENDPOINT`、`XBOT_LAUNCHER` 覆盖默认路径或连接地址。不要把账号凭据、生产环境配置或运行日志提交到仓库。

源码托管于 [wn0x00/xbot-cli](https://github.com/wn0x00/xbot-cli)，npm 包名为 [`@guanzhu.me/xbot-cli`](https://www.npmjs.com/package/@guanzhu.me/xbot-cli)，CLI 命令名为 `xbot-cli`。配置发布身份及正式发布步骤见[发布说明](docs/releasing.md)。

## 参与开发与发版

从功能分支或 Fork 提交 PR，使用 `feat(cli): ...`、`fix(flow): ...` 等 Conventional Commits 标题，并以 Squash 方式合并。开发检查、兼容性要求和 PR 说明见[贡献指南](CONTRIBUTING.md)。普通开发 PR 不手动修改版本号。

Release Please 根据合并到 `main` 的变更更新发版 PR，统一维护 Rust、npm 版本及变更记录。维护者合并发版 PR 后，工作流创建版本 tag 和 GitHub Release，再触发构建、安装验证、npm OIDC 发布和 Release 附件上传。发布身份的配置、首次验收及失败重试见[发布说明](docs/releasing.md)。

## 许可

本项目使用 [MIT License](LICENSE)。
