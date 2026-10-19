# CodeFlow 开发与维护

## 工作流

Studio 命令建议追加 `--expect-app <app-id>`，它核对当前应用而不切换应用。以下流程名称应替换为实际返回的 `flow_id`。

```bash
xbot-cli status
xbot-cli app open <app-id>                 # 维护已有应用；新建用 app create
xbot-cli flow list
xbot-cli flow create hello --kind code     # 记录返回的 flow_id
xbot-cli flow params list hello
xbot-cli flow params set hello --operations @params.json
xbot-cli flow code write hello --file hello.py  # 新流程全量写
xbot-cli flow check hello                 # 只做静态检查
xbot-cli flow verify hello --timeout 600
```

维护已有代码先读后改，优先精确替换，不整份重写：

```bash
xbot-cli flow get hello
xbot-cli flow code edit hello --old @before.txt --new @after.txt
xbot-cli flow verify hello --timeout 600
```

`params.json` 可为 operations 数组或 `{"operations":[...]}`：

```json
[
  {"op":"upsert","name":"text","direction":"In","type":"str","value":"测试默认值"},
  {"op":"upsert","name":"result","direction":"Out","type":"str"}
]
```

## 源码契约

权威文档：`xbot-cli wiki read wiki/guides/codeflow wiki/guides/flow-parameters`。

- 唯一入口 `def main(args):`，不要增加 `main()` 或 `if __name__ == "__main__":`。
- 默认骨架：

  ```python
  import xbot
  from xbot import print, sleep
  from . import package
  from .package import variables as glv

  def main(args):
      if args is None:
          args = {}
      text = args.get("text", "测试默认值")
      args["result"] = text
      print(text)
  ```

- 日志使用 `from xbot import print`；需要级别时使用 `xbot.logging`。
- Out 必须先声明，再写回同一个 `args["参数名"]`；普通 return 不进入 Flow Out。
- 只在 `args is None` 时初始化，不用 truthiness 替换空容器。
- 默认按 Python 3.7 兼容；确认应用升级后才使用新语法。
- 保留无关行为、命名和局部风格，不借机格式化。
- 日志不输出 Cookie、Token、密码、验证码或完整页面。

第三方依赖只装进应用 venv：

```bash
xbot-cli tool studio call python_pip @pip.json
```

```json
{"operation":"install","packages":[{"package_name":"requests","version":"2.32.3"}]}
```

## 验收

`flow check` 检查整个应用的静态诊断，传入流程时先核验目标（`scope: app`），不启动流程。`flow verify` 检查后实际运行并返回 `run_id` 和 `outputs`。失败时错误 `data` 自动带 `log_tail`；超时用 `flow wait <run-id> --timeout 600` 继续等待，不重新启动。写入成功不代表静态或运行验证通过；未实际运行的路径不能宣称已验证。
