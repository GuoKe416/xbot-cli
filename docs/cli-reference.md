# xbot-cli 命令与行为参考

面向 AI Agent 的影刀（ShadowBot）RPA CLI。通过影刀内置 shell-cli、studio-mcp 和 browser-use-mcp 操作，零注入、零反射。

命令按所操作的资源组织：

| 入口 | 职责 |
|---|---|
| `status` / `doctor` | 查看当前状态、诊断连接 |
| `app` | 创建、打开、保存、同步、发布和回收应用 |
| `flow` | Studio 流程的读取、参数、编辑、静态检查与运行 |
| `flow code` / `flow visual` | CodeFlow 源码和 VisualFlow 块 |
| `task` | 已发布应用的运行任务、状态、日志与停止 |
| `browser` | 浏览器上下文、快照与交互 |
| `tool studio` / `tool browser` | 按 schema 调用原始工具 |
| `wiki` / `schema` / `guide` | 领域知识、命令契约和开发指南 |

## 安装与 Agent 接入

Windows x64、Node.js 22+ 环境可通过 npm 安装预编译程序，无需安装 Rust。安装命令、发布状态和可复制的 Agent 指令见[项目 README](../README.md#安装与首次运行)。

```powershell
xbot-cli install --skills --json           # 当前工作区 .agents/skills
xbot-cli install --skills --global --json  # 用户 ~/.agents/skills
```

已有 Skill 内容不同时不会静默覆盖；先查看差异，确认覆盖后追加 `--yes`。自动化调用下文的业务命令时均应显式添加 `--json`，示例中的 `<...>` 需替换为实际标识。

## 开发流程

前提：影刀 Shell 已启动并登录。先确认应用，再读取和修改流程：

```bash
xbot-cli status
xbot-cli app open <app-id>
xbot-cli flow list --expect-app <app-id>
xbot-cli flow get main --expect-app <app-id>

# CodeFlow
xbot-cli flow create hello --kind code --expect-app <app-id>
xbot-cli flow params set hello --operations @params.json --expect-app <app-id>
xbot-cli flow code write hello --file hello.py --expect-app <app-id>
xbot-cli flow check hello --expect-app <app-id>
xbot-cli flow verify hello --timeout 600 --expect-app <app-id>

# VisualFlow
xbot-cli flow create report --kind visual --expect-app <app-id>
xbot-cli flow visual edit report --file ops.json --expect-app <app-id>
xbot-cli flow visual fill report --fills @fills.json --expect-app <app-id>
xbot-cli flow visual disable <block-id> --flow report --expect-app <app-id>
xbot-cli flow visual enable <block-id> --flow report --expect-app <app-id>
xbot-cli flow verify report --timeout 600 --expect-app <app-id>
xbot-cli flow visual snapshots report --expect-app <app-id>
```

`flow check` 检查整个应用的静态诊断（`scope: app`），传入流程时先核验目标，不启动流程。`flow verify` 解析目标并检查后实际运行，再读取 Out；失败时附日志尾部，用户暂停或停止则立即返回。修改操作成功、静态检查通过和实际运行成功是不同的结果，不应混为一谈。

已有运行超时时，使用返回的 `run_id` 继续等待，不重新启动：

```bash
xbot-cli flow wait <run-id> --timeout 600 --expect-app <app-id>
```

已发布应用使用独立的任务入口；`task_id` 与 Studio `run_id` 不可混用：

```bash
xbot-cli task run <app-id> --inputs-json @inputs.json
xbot-cli task status <task-id>
xbot-cli task logs <task-id>
xbot-cli task stop <task-id>
```

## 应用与流程上下文

`--expect-app <id>` 是 Studio 当前应用的前置断言，用于防止 GUI 切换后操作错误的应用。它不会打开或切换应用；不匹配时停止命令。`schema` 中的 `requires_studio` 标明适用命令；在其他命令上使用会返回参数错误。

多数流程命令的 `flow_id` 可省略：优先活动流程，类型不匹配时仅在唯一候选时选择，歧义返回 `FLOW_ID_REQUIRED` 和候选列表。自动推断适合交互探索，连续修改建议显式指定流程及 `--expect-app`。

`app open` 进入编辑模式；`app view` 是只读临时副本。`app sync` 上传并关闭 Studio。所有应用修改通过 CLI/MCP，不直接编辑影刀应用目录文件。

## 帮助、输出与恢复（v0.6）

裸调用用于发现命令，不需要先启动影刀：

```bash
xbot-cli                       # 简短根帮助
xbot-cli app                   # 应用操作与示例
xbot-cli flow code             # CodeFlow 操作与示例
xbot-cli tool studio           # 原始工具入口
xbot-cli app --help            # 详细帮助
xbot-cli help app              # 同上
xbot-cli app --json            # 紧凑结构化帮助，不是参数 schema
```

裸根命令和纯分组均显示简短帮助，写 stdout、退出 0；`-h`、`--help`、`help <path>` 默认显示详细文本帮助。帮助和版本查询不调用后端、不检查登录、不初始化应用。帮助在管道中也默认保持文本，便于 Agent 逐层发现；需要机器自省时显式运行 `schema <path>`。

业务结果默认使用 `--format auto`：stdout 是终端时显示简洁文本，重定向或管道中输出紧凑 JSON。脚本应显式使用 `--json`，避免依赖运行环境。

| 输出选项 | 行为 |
|---|---|
| `--format auto` | 按命令用途及 stdout 是否为终端选择输出，默认值 |
| `--format text` | 明确请求文本 |
| `--json` / `--format json` | 明确请求紧凑 JSON，两者等价 |
| `--format pretty` | JSON 缩进显示，字段与紧凑 JSON 相同 |

显式格式优先于自动选择。`schema` 默认始终输出 JSON；`guide` 默认输出 Markdown 文本；这两个默认值和帮助文本一样不随管道改变。请求 JSON 帮助得到当前层级的简短发现信息，不会展开完整参数 schema。`--version` 默认输出一行版本文本，追加 `--json` 则返回名称和版本字段。

成功结果写 stdout、退出 0。以下为 JSON 模式示例：

```json
{"ok":true,"data":{"verified":true,"run_id":"...","outputs":{"result":"ok"}}}
```

失败仅写 stderr、返回非零退出码，文本或 JSON 渲染跟随所选输出模式。JSON 示例：

```json
{"ok":false,"error":{"type":"operation","code":"FLOW_RUN_FAILED","message":"流程运行失败","hint":"...","retryable":false},"data":{"run_id":"...","log_tail":{}}}
```

分组 `xbot-cli app` 是发现请求；叶命令 `xbot-cli app open` 缺少必填应用 ID 才是参数错误，退出 2，并保留缺失参数、当前用法和修复提示。未知命令或选项也返回参数错误，不会自动改写为另一个操作。

JSON 消费者按 `error.type/code/retryable` 和 `data` 判断下一步，不解析自然语言 message。`data` 可包含已应用的修改或仍在运行的任务；失败不等于未执行，不要无条件整批重试。退出码沿用已有契约：

| 退出码 | 含义 |
|---|---|
| 0 | 成功 |
| 1 | 操作、API 或运行失败 |
| 2 | 参数或输入校验失败 |
| 3 | 认证、权限或配置问题 |
| 4 | 网络、离线或超时 |
| 5 | 冲突或资源占用 |
| 6 | 内部或协议错误 |
| 10 | 高风险操作需要确认 |

## 预览与确认

```bash
xbot-cli flow code write hello --file hello.py --expect-app <app-id> --dry-run
xbot-cli app publish <app-id> --log "版本说明" --dry-run
# 展示动作、确认目标并取得用户明确同意后：
xbot-cli app publish <app-id> --log "版本说明" --yes
```

`--dry-run` 使用与执行相同的本地输入解析和校验，返回动作与载荷预览，不执行后端操作。它保持离线：当前应用、流程推断、编辑权限、远端工具 schema 与后端是否接受载荷均未验证；`--expect-app` 也只记录为运行前条件。预览成功不代表实际操作会成功。

`app publish`、`app recycle`、`app open --force` 需要 `--yes`；缺少确认返回退出码 10。不要默认追加 `--yes`。开发完成不会自动发布。

## 自省与按需文档

```bash
xbot-cli
xbot-cli flow code
xbot-cli help flow code edit
xbot-cli schema
xbot-cli schema flow code edit
xbot-cli schema flow visual disable
xbot-cli schema tool studio call
xbot-cli guide
xbot-cli guide codeflow
```

先用根帮助找到资源，再读所选分组或命令帮助；仅在需要精确入参时查询对应 schema，不把全部参数定义装进 Agent 上下文。`schema` 从 clap 命令树读取参数，再附共享语义元数据：类型、位置、参数数量、枚举、默认值、别名、效果、上下文、dry-run 适用性、确认要求、JSON 输入形状、动态工具 schema 提示和示例。兼容入口查询会解析到推荐路径。`guide` 与安装后的 Skill references 使用同一份内容。

JSON 参数通常接受字面 JSON、`@file` 或 `-` stdin；源码文件参数接受路径或 `-` stdin。具体编码查看对应 schema 的 `input_shapes`。复杂输入优先文件或 stdin，避免 shell 引号和转义问题。

所有 `--timeout` 参数的范围为 1–86400 秒，范围也随参数 schema 返回。

原始工具也有明确的子命令：

```bash
xbot-cli tool studio list
xbot-cli tool studio schema app.run
xbot-cli tool studio call app.get_info '{}'
xbot-cli tool browser list
xbot-cli tool browser schema web_action
xbot-cli tool browser call web_get_active '{}'
```

工具清单默认返回名字和数量，`list --full` 才含长描述。先查询所选工具的实时 schema，原始调用的字段与实际效果由工具决定，不应假定包装器提供高层工作流的全部校验和确认。`schema tool ... call` 描述 CLI 入参，不替代后端工具 schema。

## 旧命令迁移

以下入口保留兼容，但不再出现在推荐命令树中。新脚本与新 Skill 使用右侧形式：

| 旧入口 | 推荐入口 |
|---|---|
| `code read/write/edit` | `flow code read/write/edit` |
| `visual list/edit/fill/variables/snapshots` | `flow visual list/edit/fill/variables/snapshots` |
| `visual toggle [flow] comment <id...>` | `flow visual disable <id...> --flow <flow>` |
| `visual toggle [flow] uncomment <id...>` | `flow visual enable <id...> --flow <flow>` |
| `app run/stop` | `task run/stop` |
| `app task-status/task-logs` | `task status/logs` |
| `mcp tools/schema/call` | `tool studio list/schema/call` |
| `browser tools/schema/call` | `tool browser list/schema/call` |

旧 `mcp <tool> [json]` 和 `flow visual toggle` 也仅用于兼容。`app new`、`flow new` 仍是 `create` 的别名。旧入口采用当前的帮助、输入校验和输出契约；叶命令缺少必填参数仍返回参数错误。

## 设计依据与验收要求

本设计参考社区指南与已投入使用的 Agent CLI，取相互一致的原则，不将其中任意一份当作唯一强制标准：

| 来源 | 本项目采用的原则 |
|---|---|
| [Command Line Interface Guidelines](https://clig.dev/#help) | 裸命令显示简短帮助，示例和下一步入口优先；结果与错误分流 |
| [Agent CLI Design Guide](https://github.com/Johnixr/agent-cli-guide/blob/main/GUIDE.md) | 按资源逐层发现，TTY 文本与非 TTY JSON，按需查询 schema，错误可恢复 |
| [CLI Agent Spec：帮助与版本纯度](https://cli-agent-spec.github.io/requirements/f-068-help-and-version-flag-purity/) | 裸调用帮助退出 0，发现路径不初始化应用或访问后端；帮助不隐式替代 schema |
| [Playwright CLI](https://playwright.dev/agent-cli/introduction) / [命令参考](https://playwright.dev/agent-cli/capabilities) | 简短反馈、显式 JSON 和按需文档，控制 Agent 上下文占用 |

这些来源在退出码数值、错误流和自动 JSON 条件上存在差异。本项目保持既有退出码及 stderr 错误契约；成功的 dry-run 退出 0；`NO_COLOR` 只影响颜色，不切换数据格式。帮助和指南是发现信息，默认文本；普通业务数据才按 TTY 自动选择格式。

以下为离线契约的验收矩阵，不能代替真实影刀客户端运行验收：

| 场景 | 预期结果 |
|---|---|
| 裸根命令、`app`、`flow code`、`tool studio` | 简短文本帮助；stdout；退出 0；无后端调用 |
| `--help`、`-h`、`help <path>` | 当前命令详细帮助；stdout；退出 0 |
| 帮助或 `guide` 输出被捕获、重定向或接入管道 | 默认仍是文本，不自动展开 schema |
| 分组加 `--json` | 有当前动作与用法的紧凑 JSON 帮助，不是完整参数 schema |
| `schema <path>` | 默认 JSON；包含精确参数与共享语义 |
| 业务命令默认格式 | stdout 为终端时文本，非终端时 JSON |
| 业务命令加 `--json` / `--format text` / `--format pretty` | 显式格式优先，pretty 为 JSON |
| `app open` 缺必填 ID、未知命令或选项 | stderr；退出 2；保留具体错误、用法与修复提示 |
| 后端未运行时查询帮助、版本、本地 schema 或 guide | 正常完成，不把连接失败当作发现失败 |

## 构建与验证范围

v0.6 在分离输入与执行边界的基础上，统一帮助、业务输出和机器自省的选择规则：

| 模块 | 职责 |
|---|---|
| `cli.rs` | 命令语法、类型和范围 |
| `input.rs` / `plan.rs` | 一次读取外部输入、规范化操作，供预览或执行 |
| `commands.rs` | 命令路由与兼容入口 |
| `app_cmds.rs` / `flow_cmds.rs` / `extra_cmds.rs` | 应用、运行状态与领域操作 |
| `help.rs` / `output.rs` | 离线逐层帮助、终端与 JSON 渲染、stdout/stderr 输出 |
| `core.rs` / `transport.rs` | 结果封装、错误、会话目标解析、子进程与 MCP 协议 |
| `schema_cmds.rs` | 参数和共享语义元数据的自省 |

输入先校验，再检查当前应用与确认要求，最后才执行。等待失败仍携带原运行标识；写入已完成但诊断失败时携带 `applied: true`。离线测试包含独立进程调用、本地假 MCP 服务、双管道大输出和运行状态恢复。

```powershell
cargo fmt --check
cargo check
cargo test
cargo clippy --all-targets -- -D warnings
npm run build
npm test
npm run test:package
npm pack
```

环境变量 `XBOT_SHELL_CLI`、`XBOT_MCP_ENDPOINT`、`XBOT_BROWSER_MCP_ENDPOINT`、`XBOT_LAUNCHER` 可覆盖标准安装默认值，用于非标准安装或隔离测试。离线单元测试和 mock 后端只能证明对应契约，不能代替真实客户端的开发、运行、同步或发布验收。

源码位于仓库根目录的 `src/`，集成测试位于 `tests/`。`npm run build` 将 Rust release 程序放入 `native/win32-x64/xbot-cli.exe`；`bin/xbot-cli.cjs` 是 npm 命令入口。`npm pack` 仅生成本地包，正式发布步骤见[发布说明](releasing.md)。

Skill 位于 `skills/xbot-app-dev/`，由构建嵌入 CLI，也随 npm 包提供。Agent 应遵守当前工作区 `AGENTS.md`、用户授权及项目实际提供的开发规范；不假定存在某个团队服务。已发布指令的名称、参数和调用契约不得擅自改变。
