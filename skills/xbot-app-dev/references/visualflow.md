# VisualFlow 开发与维护

## 工作流

Studio 命令建议追加 `--expect-app <app-id>` 核对当前应用；它不会打开或切换应用。

```bash
xbot-cli status
xbot-cli app open <app-id>
xbot-cli flow list
xbot-cli flow get main                       # 自动读取 VisualFlow 详细块
xbot-cli flow params list main
xbot-cli flow visual variables main
xbot-cli wiki read wiki/guides/visualflow wiki/guides/visualflow/value-types
xbot-cli flow visual edit main --file ops.json
xbot-cli flow visual fill main --fills @fills.json
xbot-cli flow verify main --timeout 600
xbot-cli flow visual snapshots main               # 需要块级运行证据时
```

新建流程：

```bash
xbot-cli flow create report --kind visual
xbot-cli flow visual list report --detail
```

插入操作 `ops.json`：

```json
{
  "op":"insert",
  "block_index":-1,
  "blocks":[{"prototype_name":"programing.snippet","comment":"print test message"}]
}
```

`fills.json` 可直接是 fills 数组：

```json
[
  {"block_id":"使用 insert 返回的真实 id","inputs":{"snippet":"print('hi')"}}
]
```

## 规则

- 块原型来自本地 `block_catalog.md` / `block_detail.md` 或 `wiki.read`，不要编造。
- `flow visual edit` 只插/删实例，字段用 `flow visual fill`。
- 长多行 snippet 用普通字符串；空字符串才用 `{"text":""}`。
- 数组、对象、变量、表达式、选择器按官方 value-types 使用语义包装。
- `fill_errors` 是部分成功：只重试失败 block_id。
- 禁用：`flow visual disable <block-id...> --flow main`；启用：`flow visual enable <block-id...> --flow main`。省略 `--flow` 时按当前上下文解析流程。
- 长流程分页：`flow visual list main --detail --offset 0 --limit 20`。
- `flow visual variables` 是静态作用域，`flow visual snapshots` 是运行值，不要混淆。
- 流程 In/Out 使用 `flow params list/set`；Visual Out 的产出块输出须与参数同名。

## 验收

`flow check` 检查整个应用的静态诊断，传入流程时先核验目标（`scope: app`），不启动流程；`flow verify` 检查后实际运行。需要定位块级问题时，再读 `flow visual snapshots` 和错误中的 `log_tail`。运行超时后用 `flow wait <run-id> --timeout 600` 继续等待，不重新启动。已发布指令的参数、名称和调用契约不得擅自改变。
