# Development Workflow

## 日常循环

```text
选择下一小任务
→ 写入 active.md
→ 新会话读取 AGENTS.md 与状态文档
→ 检查 Git 和前置条件
→ 只执行 active task
→ 测试
→ 更新 state.md
→ 归档已完成任务
→ 创建下一 active task
→ 提交
```

`docs/tasks/active.md` 永远只描述一个状态为 `ready` 的下一任务。任务实现期间不得顺手执行路线图后续事项；结束时只规划下一任务，不实现它。

## 文档职责

- `state.md`：短小的当前快照，完成任务时重写，不追加完整历史。
- `roadmap.md`：阶段顺序、总体目标和基于 Git 事实的完成勾选。
- `active.md`：唯一当前任务的前置条件、范围、非目标与验收标准。
- `completed/`：每个已交付任务的简短摘要、提交和验证证据。
- `architecture/`：当前结构以及明确标记为 planned 的目标边界。
- `decisions/`：只记录需要长期遵守的技术决策及其后果。
- Git log：完整变更历史；现有 `docs/handoff/` 仅作为旧交接记录保留。

不保存完整聊天文本或大型构建日志，也不让单个状态文件无限增长。文档陈旧时必须与相关代码任务在同一提交中修正；已实现状态必须有 commit 或测试依据，未实现内容必须标记为 planned。

## 完成检查

1. 运行 `AGENTS.md` 中的默认验证及 active task 附加检查。
2. 确认 state、roadmap、active task 和 ADR 没有互相矛盾。
3. 归档旧 active task，并创建唯一的新 active task。
4. 检查没有构建产物、用户路径、音频或凭据进入提交。
5. 提交代码与相关文档，确认工作区干净；默认不 push。
