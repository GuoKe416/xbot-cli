# 浏览器自动化：xbot web

`xbot web` 提供类似 Playwright CLI 的命令交互，通过影刀内置 browser-use-mcp 执行。`xbot-cli` 与 `xbot` 等价；`browser` 是 `web` 的兼容别名。

前提：已打开 Studio 应用，并有安装影刀扩展的浏览器；或使用内置影刀浏览器。CLI 自动补充后端要求的 `explanation`。这里使用影刀当前浏览器上下文，没有独立的命名会话。

## 从快照到操作

```bash
xbot web open baidu.com --json
xbot web snapshot --json
# 用当前快照中的实际 ref 替换 e4、e7
xbot web fill e4 "影刀 RPA" --json
xbot web press Enter --ref e4 --json
xbot web click e7 --json
```

裸域名会补全为 `https://`。`open` 不带 URL 时打开 `about:blank`。只在用户指定浏览器类型时传 `--mode`（别名 `--browser`），例如 `--mode cef`。需要用户已经打开的活动页时用 `web active`，它的别名是 `web attach`；在受控页内跳转用 `web goto <url>`。

元素 ref 必须来自当前页面的快照，不能编造或复用其他页面的编号。页面变化后依据返回的新快照选择目标；保留后端的快照元数据，快照可能只包含增量变化，不能默认是完整页面。这里只接受快照 ref，不把 CSS 或 Playwright locator 表达式当作 ref。

## 常用命令

下列 `e4` 都是语法占位示例。执行前替换为实际 ref；解析业务结果时显式加 `--json`。

| 命令 | 用途 |
|---|---|
| `xbot web open [url]` | 打开页面并建立上下文 |
| `xbot web active` / `attach` | 附着当前活动页 |
| `xbot web snapshot` | 获取页面快照 |
| `xbot web click e4` | 左键点击，可用 `--button right` 或 `middle` |
| `xbot web dblclick e4` | 双击 |
| `xbot web fill e4 "内容"` | 清空并填写输入框 |
| `xbot web type "内容"` | 向当前焦点输入文字 |
| `xbot web press Enter` | 在当前页面按键 |
| `xbot web press Control+A --ref e4` | 对指定元素按键 |
| `xbot web hover e4` | 悬停 |
| `xbot web check e4` / `uncheck e4` | 勾选或取消勾选 |
| `xbot web select e4 value1 value2` | 按 option value 选择一个或多个选项 |
| `xbot web goto https://example.com` | 当前受控页跳转 |
| `xbot web reload` | 刷新 |
| `xbot web go-back` / `go-forward` | 后退或前进，别名 `back` / `forward` |
| `xbot web close` | 关闭当前受控页 |

日期选择控件应展开面板后使用专用日期工具，不用 `fill` 直接填写；文件上传、下载使用专用工具。

## 输出与恢复

打开、附着、导航和常用交互成功后会自动获取快照。需要减少输出时可加 `--no-snapshot`，之后再主动调用 `web snapshot`。`close` 不获取关闭后的快照；只读 `eval` 和底层兼容调用也不承诺自动快照。

动作已经成功，但后续快照失败时，CLI 仍返回成功（`ok: true`、退出 0），并带有 warning 和 `applied: true`。先读取警告，再单独执行 `web snapshot`，不要为了获得快照而重复点击、输入或提交。操作本身超时或响应中断时也不要自动重试，先确认页面状态。

```bash
xbot web click e4 --no-snapshot --json
xbot web snapshot --format text
xbot web snapshot --output after-click.txt --json
```

`snapshot --output <file>`（别名 `--filename`）保存快照文本，不覆盖已有文件。已有文件冲突时选择新路径。普通输出仍遵守终端文本、管道 JSON 的规则；需要文本快照时显式 `--format text`。

## 选择器与只读求值

元素操作可传 `--name "搜索按钮"` 指定暂存选择器名称。省略时 CLI 自动生成唯一中文临时名；操作会将选择器暂存在后端，调用 `web_review` 前不会写入项目元素库。`press` 只有指定 `--ref` 时才接受 `--name`。

```bash
xbot web click e4 --name "搜索按钮" --json
xbot web eval "return await activePage.title();" --json
```

`web eval` 是只读 Playwright 异步函数体，注入 `activePage`；需要结果时必须 `return` 可序列化值。顶层不能直接访问 `document`，页面 DOM 读取放在 `activePage.evaluate(...)` 中。只在快照或专用工具不足以获得所需事实时使用，不用求值绕过交互命令或进行写入。

## 专用工具与开发

```bash
xbot tool browser list
xbot tool browser schema web_download
xbot tool browser call web_download @args.json
```

选择器构建、表格、上传、下载、日期和验证码使用专用工具，先查询当前 schema，不猜参数。`web act <json>`、`browser act <json>` 保留为隐藏兼容入口，常用交互优先上表命令。

本接口不提供 Playwright CLI 的 sessions、tabs、storage、trace 或独立 screenshot 命令。后端实际可用的其他能力通过 `tool browser list/schema` 发现。

写 Web CodeFlow 前查询 `wiki/guides/web/codeflow` 和 SDK 签名。XPath 必须来自当前页面验证；弹窗内 XPath 带弹窗作用域；所有轮询有界。不要向日志或汇报复制 Cookie、Token、密码、验证码或无关的完整页面内容。
