# AGENTS.md

本文件是仓库开发知识的导航入口。项目现状、任务细节和长期决策分别由下述文档维护，不依赖历史聊天上下文。

## 会话启动流程

新会话或上下文压缩后，在修改代码前必须依次读取：

1. `docs/development/state.md`
2. `docs/development/roadmap.md`
3. `docs/tasks/active.md`
4. active task 引用的架构文档与 ADR

随后执行：

```bash
git status
git branch --show-current
git log -5 --oneline
```

修改代码前，用不超过十行总结当前阶段、已完成内容、当前任务、核心约束、明确不做范围及预计修改文件。不得依赖之前聊天中的隐含信息。

## 任务事实源

- `docs/tasks/active.md` 是当前任务的唯一事实源，一次只能有一个 active task。
- 不得自行跳到路线图中的后续任务，也不得扩大 active task 范围。
- active task 缺失、状态不是 `ready`、分支不匹配或前置提交不存在时，停止修改并报告。
- `docs/development/roadmap.md` 只说明顺序和总体目标，不能覆盖 active task。
- 聊天中的明确临时指令优先于仓库文档；发生冲突时必须指出。

## 长期不变量

- Renderer 不得直接访问 Node.js、Electron 或通用 IPC；Preload 只暴露窄接口。
- Renderer 不得提交任意绝对路径请求文件访问；Main 持有并解析受控目录注册表。
- 桌面文件引用使用 `directoryId + relativePath`，相对路径统一使用 `/`。
- 扫描候选、确认后的 binding、source reference 与 playable URL 是不同概念。
- 一个 track 最多只有一个当前 binding；不得通过 IPC 传输整首音频。
- Web 版本必须继续可以独立开发、测试和构建。
- 不修改其他 worktree；任务完成后不 push，除非用户明确要求。
- 不提交未经授权的音频、歌词、封面、Cookie、临时播放地址或用户本机路径。
- 使用 TypeScript，避免 `any`；核心规则优先写成纯函数并补充聚焦测试。
- 不引入无关依赖或大范围重构，不覆盖或删除用户已有修改。
- 曲目等元数据使用稳定 ID；本地 binding 不写入开发者维护的目录元数据。

架构细节见 `docs/architecture/`，技术决策见 `docs/decisions/`，Electron 操作说明见 `docs/desktop-development.md`。

## 默认验证

```bash
npm run test:run
npm run lint
npm run build
npm run desktop:build
git diff --check
```

active task 可以增加检查，但不能无理由跳过上述默认验证。

## 会话结束流程

任务完成后必须：

1. 运行验证。
2. 重写 `docs/development/state.md` 的当前快照。
3. 将完成的 active task 归档到 `docs/tasks/completed/`。
4. 创建且只创建一个新的 `docs/tasks/active.md`；下一任务仅规划，不继续实现。
5. 将代码与相关状态文档放入同一提交。
6. 最终报告列出关键修改、验证结果、残余风险、下一 active task 和 commit hash。

任务完成并满足以下全部条件时允许自动 push：

- 当前分支为 desktop/electron
- 所有要求的测试、lint、build 通过
- git diff 已检查
- 没有敏感信息、用户数据或构建产物
- 提交已经创建
- 工作区干净

只允许普通 push 到 origin/desktop/electron。

禁止：

- force push
- push 到 main
- push 到 desktop/tauri
- push 未验证提交
- push 含敏感信息的提交
  维护规则见 `docs/development/workflow.md`。
