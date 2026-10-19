# 发布 xbot-cli

源码仓库为 [`wn0x00/xbot-cli`](https://github.com/wn0x00/xbot-cli)，npm 包为 [`@guanzhu.me/xbot-cli`](https://www.npmjs.com/package/@guanzhu.me/xbot-cli)，安装后的命令仍是 `xbot-cli`。发布目标是 Windows x64，npm 包自带原生程序。

## 发布渠道

| 渠道 | 用途 |
| --- | --- |
| [npmjs](https://www.npmjs.com/package/@guanzhu.me/xbot-cli) | 正式安装来源：`npm install -g '@guanzhu.me/xbot-cli'`，registry 为 `registry.npmjs.org`。 |
| [GitHub Releases](https://github.com/wn0x00/xbot-cli/releases) | 版本说明、Windows 可执行程序压缩包、同版 npm `.tgz` 和校验文件。[v0.6.0](https://github.com/wn0x00/xbot-cli/releases/tag/v0.6.0) 是首次版本入口。 |
| [GitHub Packages](https://github.com/users/wn0x00/packages?repo_name=xbot-cli) | 独立服务，其 npm registry 为 `npm.pkg.github.com`。本项目未向这里发布，它不会自动镜像 npmjs 的包。 |

## 日常发版

1. 开发者按[贡献指南](../CONTRIBUTING.md)提交 PR，通过检查和评审后 Squash 合并到 `main`。
2. `release-please.yml` 根据提交类型更新一个发版 PR，其中包含 `CHANGELOG.md`，以及 `package.json`、`package-lock.json`、`Cargo.toml`、`Cargo.lock` 中的项目版本。普通开发 PR 不手动改版本。
3. 维护者检查版本、变更记录和 CI，再合并发版 PR。Release Please 创建 `v<version>` tag 和 GitHub Release，并显式 dispatch `publish.yml`，使用该 tag 作为 ref。
4. `publish.yml` 校验 tag、包名及仓库身份，完成 Rust 检查、测试和 npm 安装验收。发布 job 核对制品校验值，通过 OIDC 将这份 `.tgz` 发布到 npm；随后为对应 GitHub Release 上传附件。

显式 dispatch 是链路的一部分：不能只依赖 `GITHUB_TOKEN` 创建的 tag 再触发另一个工作流。发版 PR 的分支也通过显式 dispatch 运行 `ci.yml`，无需额外的长期 GitHub token。[Release Please](https://github.com/googleapis/release-please-action)、[GitHub 工作流触发规则](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow)。人工推送版本 tag 也可触发发布工作流；日常发版使用发版 PR。

当前采用 `0.x` 版本策略：`fix` 升 patch，`feat` 升 minor，带 `!` 或 `BREAKING CHANGE:` 的不兼容变更也升 minor，并必须提供迁移说明。`docs`、`chore` 等变更通常随下一次功能或修复发布。是否进入 `1.0.0` 由维护者单独决定。

## 配置发布身份

GitHub 仓库需要允许 Actions 创建 PR，并创建名为 `npm` 的 Environment。若为该环境配置人工审批，发布将停在审批步骤。合并方式、必需检查和评审人数在仓库 Settings 中配置；文档中的协作约定不会自动启用 Rulesets。

npm trusted publisher 必须绑定如下身份，字段区分大小写：

| 字段 | 值 |
| --- | --- |
| 包 | `@guanzhu.me/xbot-cli` |
| GitHub owner / repository | `wn0x00/xbot-cli` |
| Workflow filename | `publish.yml` |
| Environment name | `npm` |
| Allowed actions | 直接 `npm publish` |

包已存在后，具有包写权限且启用 2FA 的维护者可以在 npm 包 Settings → Trusted publishing 配置，也可使用 npm 11.15+ 的 `npm trust`。以下命令使用固定 CLI 版本，不修改全局 npm；按提示完成 npm 身份验证：

```powershell
npx --yes npm@11.21.1 trust list '@guanzhu.me/xbot-cli' --registry=https://registry.npmjs.org
npx --yes npm@11.21.1 trust github '@guanzhu.me/xbot-cli' --repo wn0x00/xbot-cli --file publish.yml --environment npm --allow-publish --registry=https://registry.npmjs.org
```

先检查已有绑定；一致时保留，不要重复创建。若需要更换绑定，先核实旧配置，再按 [npm trust 文档](https://docs.npmjs.com/cli/v11/commands/npm-trust/)撤销并重新配置。发布 job 使用 GitHub 托管 runner、Node.js 24 和支持 OIDC 的 npm，授予 `id-token: write`，无需设置 `NPM_TOKEN`。

新绑定必须在两天内成功完成首次 OIDC 发布，否则需要重新创建。公开仓库通过 OIDC 发布公开包会生成 provenance。[npm trusted publishing](https://docs.npmjs.com/trusted-publishers/)。配置成功本身不代表发布已验收：应以新版本的 Actions 发布成功、npm 版本及完整性校验、Release 附件齐全为准。`0.6.0` 的本地发布不能证明 OIDC 链路有效。

## 本地验包

维护者需要 Windows x64、Node.js 22+、Rust stable 和 MSVC 构建工具。从仓库根目录运行：

```powershell
npm ci --ignore-scripts
npm run check
npm test
npm run test:package
```

`test:package` 构建 Rust release，检查包内文件白名单，把生成的 `.tgz` 离线安装到独立临时目录，再验证命令、JSON 和 Skill。通过后保留 `dist/guanzhu.me-xbot-cli-<version>.tgz`。发布使用已验收的包，不重新打包；`.backups/`、`.local-archive/`、`target/` 和本地配置不属于发布内容。

每次 Release 包含 `guanzhu.me-xbot-cli-<version>.tgz`、`xbot-cli-<version>-windows-x64.zip` 和 `SHA256SUMS.txt`。Windows 压缩包中的程序来自同一份已验收的 npm 包。CI 通过不代表真实影刀应用运行已验证；后者需要已启动并登录影刀的本机环境。

## 失败恢复与重新运行

优先在 Actions 页面重跑失败 job，复用该次运行已经验收的制品。也可重新 dispatch 指定 tag；安装并登录 GitHub CLI 后运行：

```powershell
gh workflow run publish.yml --ref v0.6.1
npm view '@guanzhu.me/xbot-cli@0.6.1' version dist.integrity --registry=https://registry.npmjs.org
```

将示例版本替换为需要恢复的版本；`publish.yml` 必须已存在于默认分支及该 tag。tag 必须等于 `v<package.json version>`，分支不能直接发布。

重试时，已存在的 npm 版本只有在 `dist.integrity` 与本次制品一致时才跳过发布；同名 Release 附件只有校验值相同时才跳过上传。不同内容会失败，不覆盖已有版本或附件。若 npm 已成功而附件上传失败，恢复附件步骤即可；若源码或包内容需要修改，应通过新的 PR 发布新版本，不移动旧 tag。