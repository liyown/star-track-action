# Star Track Agent 接入指南

本文面向在用户授权下操作 GitHub 仓库的编程 Agent。任务是把 Star
Track 卡片接入用户的个人主页，并验证实际工作流。使用者无需部署服务或安装字体。

## 1. 确认账号、仓库和现状

1. 读取本项目同一 commit 的 `README.md`、`action.yml` 和
   `star-track.yml`。本指南中的配置必须以这些文件为准。
2. 使用已有 GitHub 登录读取当前用户，例如
   `gh api user --jq .login`；检查工作区的 `git remote -v`。个人主页仓库为
   `LOGIN/LOGIN`，不一定是当前工作区。
3. 确认目标仓库存在、默认分支和可写权限。账号或目标不明确时询问用户。仓库不存在时说明需要创建公开的同名仓库，获得授权后创建。
4. 检查目标仓库的说明文件、Git 状态、README 和
   `.github/workflows`。保护未提交的用户修改；必要时使用独立临时克隆。
5. 搜索现有 `star-track-action`
   工作流和统计区域。如果已接入，直接更新现有配置和工作流，不要创建第二套写入相同 README 区域的工作流。

不要在日志、对话或仓库中输出 Token。不需要新的 PAT，也不需要把用户的本地凭据上传为 Secret。标准场景使用工作流内置的
`secrets.GITHUB_TOKEN`。

## 2. 选择并固定 Action 版本

解析上游当前实现的完整 commit SHA：

```sh
gh api repos/liyown/star-track-action/commits/main --jq .sha
```

检查该 SHA 下有 `action.yml`、`dist/index.js` 和
`assets/fonts`。将下方工作流中的 `ACTION_COMMIT_SHA`
替换为实际返回的 40 位 SHA，不能把占位符直接提交，也不要猜测 `v2` 标签存在。

如用户要求某个版本，优先使用并核实该版本。后续升级是修改固定 SHA 后重新运行工作流。

## 3. 创建或合并卡片配置

在目标仓库根目录创建 `star-track.yml`，或合并到已有配置。替换 `YOUR_LOGIN`
为已确认的账号：

```yaml
username: YOUR_LOGIN
scope: all

profile:
  headline: 把想法，做成开源作品。

featured: []

repositories:
  include_forks: false
  include_archived: true
  exclude: []

appearance:
  theme: auto
  locale: zh-CN
  title: OPEN SOURCE PROFILE

rating:
  enabled: true

output:
  directory: assets/star-track
  readme: README.md
```

默认从 GitHub 读取展示名，缩写来自登录名；不要把作者的 `Liuyaowen`、`LY`
或示例组织填给其他用户。用户可以在 `profile` 中设置 `name`、`initials` 和
`headline`。

- `scope: all`
  汇总个人及组织整个公开仓库集合。个人近一年贡献是独立口径，不把组织总量冒充个人贡献。
- 省略 `organizations` 时发现公开组织成员关系；`organizations: []`
  不加入组织。私有成员关系由用户明确给出组织登录名，不能猜测。
- `featured: []` 自动取 Star 最多的三个合规公开仓库。手选时使用 `owner/repo`，或
  `{ repo: owner/repo, description: 自定义介绍 }`；最多六个，并且必须在配置的统计范围内。
- 所有路径都是相对仓库根目录的路径。README 不在根目录时按实际位置修改
  `output.readme`。

## 4. 创建或迁移工作流

建议文件名
`.github/workflows/star-track.yml`。如果已有旧版工作流，保留其路径并替换相关步骤；不要留下旧工作流继续覆盖新卡片。

```yaml
name: Update Star Track profile

on:
  schedule:
    - cron: '0 0 * * *'
  workflow_dispatch:

permissions:
  contents: write

concurrency:
  group: star-track-profile
  cancel-in-progress: false

jobs:
  profile:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - name: Generate profile
        uses: liyown/star-track-action@ACTION_COMMIT_SHA
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          config_path: star-track.yml
```

Action 运行时自带打包产物及字体。使用者工作流不需要
`npm install`、安装 Node 或运行浏览器。定时使用 UTC；默认计划为每天 00:00
UTC，GitHub 的调度可能延迟。

旧版 `card_title`、`scope`、`username`、`readme_path`
输入会覆盖 YAML 对应值。迁移时将需要保留的值合并到 YAML，并移除多余旧输入。

默认 `auto_commit: true`
只提交生成文件和 README。工作流不应提前暂存其他变更。遇到分支保护导致推送失败时，不扩大权限或绕过保护；按目标仓库现有机制改为
`auto_commit: false` 并通过 PR 提交生成文件。

## 5. 保留 README 并完成首次运行

- README 已有 `<!-- BEGIN_GITHUB_STATS -->` 和 `<!-- END_GITHUB_STATS -->`
  时，只更新这一对标记内的内容。
- 没有标记时，可在适当位置添加空标记对，或由 Action 追加到末尾。不要手工拼接旧版徽章或删掉 README 其余内容。
- 标记重复、缺一半、顺序错误时先修复结构，避免误覆盖。
- 对照 diff 检查配置、工作流权限、完整 SHA 和 README。确认没有 Token、示例占位符或无关变更。
- 用户已授权提交发布时，提交并推送本次接入文件。目标分支被保护时创建 PR，明确告知合并后还需首次运行；未合并前不能声称上线完成。
- 工作流须进入默认分支，才能手动或定时触发。使用真实文件名触发，例如：

```sh
gh workflow run star-track.yml --repo LOGIN/LOGIN --ref DEFAULT_BRANCH
gh run list --repo LOGIN/LOGIN --workflow star-track.yml --event workflow_dispatch --limit 5
gh run watch RUN_ID --repo LOGIN/LOGIN --exit-status
```

将示例的 `LOGIN`、`DEFAULT_BRANCH`、`RUN_ID`
替换为实际值。用最新提交、触发时间和分支识别本次运行，不能把旧的成功运行当成本次验收。

## 6. 验收和交付

只有以下条件全部满足，才报告接入完成：

1. 本次工作流成功；失败时阅读错误日志并处理具体原因，不能隐藏错误或捏造数据。
2. 默认分支中存在四张非空 SVG：`profile-light.svg`、`profile-dark.svg`、`profile-light-compact.svg`、`profile-dark-compact.svg`，以及
   `stats.json`、`history.json`、`summary.md`，都在配置的输出目录内。
3. README 的统计区域包含引用这些文件的
   `<picture>`、项目链接和文字摘要；统计区域之外的用户内容保持不变（另行授权的编辑除外）。
4. 浏览器中打开 GitHub 个人主页或仓库 README，确认图片实际加载；深浅色和紧凑版资源均可读取。
5. 定时工作流处于启用状态，旧统计工作流没有继续写入同一块内容。

交付时给出个人主页链接、配置文件链接、本次工作流运行链接，并简要说明怎样修改展示名、介绍、组织和精选项目。如果因权限、分支保护或用户确认而未完成某一步，明确区分已完成内容和阻塞项。
