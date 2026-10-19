# 浏览器自动化

前提：已打开 Studio 应用，并有装影刀扩展的浏览器；或使用内置影刀浏览器。CLI 自动补 browser-use-mcp 的 `explanation`。

```bash
xbot-cli browser open "https://example.com" --mode cef
xbot-cli browser snapshot
xbot-cli browser act '{"target":"locator","method":"click","refid":"e12","selector_name":"搜索按钮"}'
xbot-cli browser eval "return await activePage.title();"
```

`browser open` 不带 URL 时打开 `about:blank`；需要附着当前页时使用 `browser active`。

- 先 snapshot，再使用真实 refid；target 为 `locator` / `page` / `keyboard`。
- `browser eval` 是只读 Playwright 异步函数体，注入 `activePage`，必须 return 可序列化值；顶层不能直接用 document。
- 工具不确定时：

  ```bash
  xbot-cli tool browser list
  xbot-cli tool browser schema web_download
  xbot-cli tool browser call web_download @args.json
  ```

- 选择器构建、表格、上传、下载、日期和验证码使用专用工具，不猜参数。
- 写 Web CodeFlow 前查询 `wiki/guides/web/codeflow` 和 SDK 签名。
- XPath 必须来自当前页面验证；弹窗内 XPath 带弹窗作用域；所有轮询有界。
- 不输出 Cookie、Token、密码、验证码或完整页面。
