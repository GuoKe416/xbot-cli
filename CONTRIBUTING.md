# 贡献指南

## 提交 PR

从 `main` 创建功能分支，或通过 Fork 提交 PR。一个 PR 解决一个明确问题，说明改动目的、验证结果和兼容性影响。维护者完成评审和检查后使用 **Squash and merge**；合并提交采用 PR 标题。

PR 标题遵循 [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/)，例如：

```text
feat(cli): 添加任务日志筛选
fix(flow): 保留超时后的运行标识
docs(agent): 补充错误恢复示例
refactor(core): 统一传输错误处理
feat(cli)!: 调整任务结果的 JSON 字段
```

本地临时提交无需逐条符合此格式。影响现有调用方式、JSON 字段、退出码或默认行为的不兼容改动，在标题标记 `!`，并在 PR 说明中写清旧行为、新行为和迁移方式。也可在最终合并提交正文使用 `BREAKING CHANGE:`。

`0.x` 阶段 `fix` 升 patch，`feat` 和不兼容变更升 minor；`1.0.0` 由维护者单独决定。普通开发 PR 不修改项目版本或发布 tag，Release Please 的发版 PR 统一更新 npm、Rust、两个 lockfile 和变更记录。详见[发布说明](docs/releasing.md)。

## 开发与验证

环境为 Windows x64、Node.js 22+、Rust stable 和 MSVC 构建工具。在仓库根目录运行：

```powershell
npm ci --ignore-scripts
npm run check
npm test
npm run test:package
```

根据改动验证相关行为：命令或输出契约变更补充有意义的测试；npm 启动器、打包或发布流程变更验证实际安装路径；仅文档改动检查内容和链接即可。PR 写明实际执行的检查，未验证的路径也应说明。

修改用户可见行为时，同步 README、CLI 参考或内置指南。Agent 依赖稳定的 JSON、退出码及 stdout/stderr 分离；需要更改时明确兼容性影响。模拟后端测试不能替代真实影刀运行验收。

不提交生成的可执行文件、`target/`、`dist/`、个人配置、凭据或运行数据。锁文件需要提交；依赖更新应包含其对应锁文件变更。发布配置、身份绑定和仓库规则由维护者管理，贡献者无需 npm 发布权限。Agent 提交的代码遵守相同约定。
