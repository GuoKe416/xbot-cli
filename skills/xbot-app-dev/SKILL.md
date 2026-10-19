---
name: xbot-app-dev
description: 使用 xbot-cli 开发、维护、运行或发布影刀 ShadowBot 应用/指令（CodeFlow、VisualFlow），或进行浏览器自动化取数。包含工作流选择、共享安全规则和按需 references。
metadata:
  version: "8"
---

# 影刀应用与指令开发

通过 `xbot-cli` 调用影刀内置 shell-cli、studio-mcp 和 browser-use-mcp，零注入、零反射。不要使用旧的 `xbot_agent` / `python -m xbot_cli` 工作流。

本 Skill 随 npm 包 `xbot-cli` 分发，适用于 Windows x64 和 Node.js 22+。使用 `xbot-cli install --skills` 安装到当前工作区，或加 `--global` 安装到用户的 `.agents/skills`。运行影刀操作前需要客户端已启动并登录；帮助、schema 和 guide 可离线读取。

## 先读这些规则

1. 操作前先运行 `xbot-cli status`；不确定命令时用 `xbot-cli`、`xbot-cli <group>`、`xbot-cli help <path>` 逐层发现，再按需读 `schema <path>` 或 `guide <topic>`，不要猜 flag。裸根命令和纯分组显示简短帮助，退出 0，不调用后端。
2. 解析业务结果时显式加 `--json`：成功读 stdout 的 `ok/data`，失败读 stderr 的 `error/type/code/hint/retryable` 和可能的 `data`。默认业务输出在终端为文本、管道为 JSON；帮助和 guide 默认始终为文本，schema 默认始终为 JSON。失败可能已产生部分修改，不只按自然语言 message 分支，不盲目整批重试。
3. 修改前先读现状，最小修改，不直接编辑影刀应用目录文件。Studio 工作显式指定 `--expect-app <id>`，防止 GUI 切换后操作另一应用；它是断言，不负责切换应用。
4. 副作用命令可先用 `--dry-run`；它只做离线输入校验与预览，未验证当前应用、目标流程、权限和后端接受性，不等同运行验收。
5. `app publish`、`app recycle`、`app open --force` 必须展示动作并取得用户明确同意后，才能追加 `--yes`。绝不默认携带 `--yes`。
6. `flow check` 仅静态检查；`flow verify` 会实际运行。超时保留 `run_id`，用 `flow wait` 继续等待，不启动第二份流程。开发运行完成不自动发布；未实际运行的路径不得声称已验证。
7. 遵守当前工作区的 `AGENTS.md`、用户授权范围和项目实际提供的开发规范。不猜测团队规则，不依赖个人或团队专用服务。用户已有明确授权时不重复索要相同确认；授权不明确时先展示具体操作及影响。

## 三条核心工作流

### 查看上下文

```bash
xbot-cli status --json
xbot-cli app open <app-id> --json
xbot-cli flow list --expect-app <app-id> --json
xbot-cli flow get <flow-id> --expect-app <app-id> --json
```

### 开发 CodeFlow

```bash
xbot-cli flow create hello --kind code --expect-app <app-id> --json
xbot-cli flow params set hello --operations @params.json --expect-app <app-id> --json
xbot-cli flow code write hello --file hello.py --expect-app <app-id> --json
xbot-cli flow check hello --expect-app <app-id> --json
xbot-cli flow verify hello --timeout 600 --expect-app <app-id> --json
```

维护已有 CodeFlow 时，先 `flow get`，再用 `flow code edit` 做最小精确替换。

### 开发 VisualFlow

```bash
xbot-cli flow create report --kind visual --expect-app <app-id> --json
xbot-cli flow visual edit report --file ops.json --expect-app <app-id> --json
xbot-cli flow visual fill report --fills @fills.json --expect-app <app-id> --json
xbot-cli flow verify report --timeout 600 --expect-app <app-id> --json
xbot-cli flow visual snapshots report --expect-app <app-id> --json
```

## Reference 强触发索引

命中任一条件时，在下一步前读取对应 reference；同一文件只读一次。也可通过 `xbot-cli guide <topic>` 获取同一内容。

| 触发条件 | 必读 |
|---|---|
| 查询帮助、选择输出格式、解析 stdout/stderr、退出码、`--dry-run`、`--yes`、schema、上下文或原始工具 | [references/cli-contract.md](references/cli-contract.md) |
| 新建/修改/调试 CodeFlow、声明 In/Out、安装 pip 依赖 | [references/codeflow.md](references/codeflow.md) |
| 新建/修改/调试 VisualFlow、块字段、变量或快照 | [references/visualflow.md](references/visualflow.md) |
| 网页探索、交互、XPath、选择器、上传下载或验证码 | [references/browser.md](references/browser.md) |
| 维护既有应用、编辑模式冲突、运行失败、同步、发布或回收 | [references/recovery.md](references/recovery.md) |

原始通道使用 `tool studio list/schema/call`、`tool browser list/schema/call`；已发布应用使用 `task run/stop/status/logs`。旧 `code`、`visual`、`mcp` 入口只用于兼容。影刀官方细节通过 `xbot-cli wiki list/search/read` 查询；不要用记忆替代当前契约。
