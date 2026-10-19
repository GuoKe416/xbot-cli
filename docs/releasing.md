# 发布 xbot-cli

代码仓库为 [`wn0x00/xbot-cli`](https://github.com/wn0x00/xbot-cli)，npm 包名为 [`@guanzhu.me/xbot-cli`](https://www.npmjs.com/package/@guanzhu.me/xbot-cli)，安装后的命令名仍是 `xbot-cli`。发布目标是 Windows x64；npm 包自带编译后的可执行文件，用户安装时不需要 Rust。项目使用 MIT 许可证。

## 本地构建与验包

维护者需要 Windows x64、Node.js 22 或更新版本和 Rust stable（含 MSVC 构建工具）。CI 使用 Node.js 24。所有命令从仓库根目录运行：

```powershell
npm ci --ignore-scripts
cargo fmt --all -- --check
cargo clippy --locked --all-targets -- -D warnings
npm run build
npm test
npm run test:package
```

`npm run build` 编译 Rust release，并把可执行文件放入 `native/win32-x64/`。`npm test` 验证 Rust 命令契约和 Node 启动器。`npm run test:package` 执行 `npm pack`，把生成的 `.tgz` 离线安装到独立临时前缀，再验证安装后的命令、JSON 输出和 Skill；通过后保留 `dist/guanzhu.me-xbot-cli-<version>.tgz`。这个文件就是应发布的制品。

`npm pack` 的 `prepack` 会构建并检查程序的架构和版本；`test:package` 还会检查实际包内文件白名单。普通打包不要用 `--ignore-scripts` 跳过检查；下面发布 `.tgz` 时使用它，是为了直接发布已经检查过的文件。npm 包名和版本取自 `package.json`；版本必须与 Cargo 一致，Rust 程序名与 CLI 命令名仍为 `xbot-cli`。`.backups/`、`.local-archive/`、`target/` 和本地配置不属于发布内容。

## 首次发布

首次发布采用本地 npm 登录，把已经验证的制品公开发布到 `@guanzhu.me` scope，再为这个包配置 GitHub trusted publisher。npm 的配置入口位于已有包的 Settings 页面；后续 CI 才使用绑定的 OIDC 身份。官方也支持 staged publishing 创建新包，本项目采用直接发布流程。[npm scoped 公开包发布说明](https://docs.npmjs.com/creating-and-publishing-scoped-public-packages/)、[trusted publisher 配置说明](https://docs.npmjs.com/trusted-publishers/)。

确认使用有权向 `@guanzhu.me` scope 发布的 npm 账号，并按 npm 登录和发布提示完成验证。PowerShell 中带 `@` 的包参数使用单引号包围：

```powershell
npm login --registry=https://registry.npmjs.org
npm whoami --registry=https://registry.npmjs.org
npm publish ./dist/guanzhu.me-xbot-cli-0.6.0.tgz --access public --ignore-scripts --registry=https://registry.npmjs.org
npm view '@guanzhu.me/xbot-cli@0.6.0' version dist.integrity --registry=https://registry.npmjs.org
```

`@guanzhu.me/xbot-cli` 是完整 npm 包名，最终以 npm registry 接受发布为准；GitHub 仓库归属不等于 npm scope 发布权限。公开 scoped 包发布时保留 `--access public`。每个包的每个版本只能发布一次；如果 `@guanzhu.me/xbot-cli@0.6.0` 已存在，应更新版本并重新构建、测试。

## 配置 GitHub trusted publisher

在 GitHub 仓库 Settings → Environments 创建 `npm` 环境。它用于匹配发布身份，无需设置审批规则；如果维护者需要，也可以自行增加保护规则。

在 npm 网站的 [`@guanzhu.me/xbot-cli` 包页面](https://www.npmjs.com/package/@guanzhu.me/xbot-cli)进入 Settings → Trusted publishing，添加 GitHub Actions。这里选择的是 scoped npm 包；下面填写的是 GitHub 仓库身份：

| 字段 | 值 |
| --- | --- |
| Organization or user | `wn0x00` |
| Repository | `xbot-cli` |
| Workflow filename | `publish.yml` |
| Environment name | `npm` |
| Allowed actions | 允许直接 `npm publish` |

工作流使用 GitHub 托管的 `windows-latest`。这是 npm 支持的 GitHub-hosted runner 范围内的 Windows x64 环境，构建与发布无需切换系统。发布 job 使用 Node.js 24、npm 11.8.0 和 `id-token: write`；无需创建 `NPM_TOKEN` secret。[npm 的 OIDC 要求](https://docs.npmjs.com/trusted-publishers/)、[GitHub 托管 runner 列表](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)。

配置字段区分大小写，`package.json` 中的 `repository.url` 必须指向本仓库。新配置首次 OIDC 发布需在两天内完成，否则要删除过期配置后重新添加。首次本地发布完成后，等下一个版本准备好再创建此配置，可以避免配置过期。公开仓库通过 OIDC 发布公开包时，npm 自动生成 provenance。[npm 配置与有效期](https://docs.npmjs.com/trusted-publishers/)。

## 后续版本

先同步 `package.json`、`Cargo.toml` 和两个 lockfile 的版本，执行本地检查，再提交发布内容。例如下一版为 `0.6.1`：

```powershell
git add .
git commit -m "Release 0.6.1"
git push origin main
git tag v0.6.1
git push origin v0.6.1
gh workflow run publish.yml --ref v0.6.1
```

`publish.yml` 必须已存在于默认分支及所选 tag。工作流仅手动触发，推送 tag 本身不会发布；通过 `--ref` 选择版本 tag。在 GitHub Actions 页面手动运行时，也必须选择对应 tag。

发布工作流先检查 tag 恰好等于 `v<package.json version>`，再验证仓库地址、格式、Clippy、测试和实际安装的 `.tgz`。构建 job 只有读取仓库权限；发布 job 下载同一次运行中验收通过的制品，核对 SHA-256 后执行 `npm publish <archive>`，不会重新打包，也不会自动创建 GitHub Release。

普通 `ci.yml` 在 push 和 pull request 时运行相同的本地检查，并把 `.tgz` 上传为工作流制品。它不会发布。CI 通过只证明 CLI、启动器与 npm 安装路径通过自动化检查；影刀应用的真实运行仍需在已登录、已启动影刀的本机验证。
