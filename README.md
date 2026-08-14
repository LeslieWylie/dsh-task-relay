# 📋 dsh-task-relay

[English](README.en.md)

DSH 跨会话任务接力板插件 —— 基于持久队列的**跨会话/子agent 任务接力** + **交接摘要**。

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## 为什么

DSH 的会话生命周期是独立的：会话 A 做完的工作，会话 B 默认不知道。`dsh-task-relay` 填补了这个空白——它提供一个**跨会话共享任务队列**，任何会话（包括子 agent）都可以：

- 投递任务给未来的自己 / 其他会话 / 子 agent
- 认领和完成开放任务
- 记录会话交接摘要，供后续会话查看

## 工具一览

| 工具 | 能力 | 描述 |
|---|---|---|
| `task_push` | 推送任务 | 投递新任务到共享队列，指定标题/描述/优先级/标签 |
| `task_list` | 查询任务 | 按状态/优先级/标签筛选，返回降序列表 |
| `task_claim` | 认领任务 | 认领一个开放任务，标记为 claimed |
| `task_done` | 完成任务 | 标记任务为已完成，记录结果 |
| `task_cancel` | 取消任务 | open 则删除，claimed 则退回 open |
| `handoff_write` | 写交接摘要 | 记录当前会话的工作进展和待办事项 |
| `handoff_read` | 读交接摘要 | 按会话 ID 或最近 N 条读取 |

## 安装

```sh
# 安装到 web profile
dsh plugin --profile web add github:LeslieWylie/dsh-task-relay

# 安装到 headless profile
dsh plugin --profile headless add github:LeslieWylie/dsh-task-relay
```

或者在 `cordis.yml` 中追加：

```yaml
- id: task-relay
  name: '@deepseek-ai/dsh-task-relay'
```

## 使用示例

### 跨会话任务接力

**会话 A**：推送一条任务
```
task_push title="修复登录页 Bug" priority="high" tags=["bug","frontend"]
→ { "id": "T1723647600000-1", "title": "修复登录页 Bug", "status": "open", ... }
```

**会话 B**：查看并认领
```
task_list status="open" priority="high"
→ 共 1 条任务，显示 1 条
task_claim id="T1723647600000-1"
→ { "id": "T1723647600000-1", "status": "claimed", "claimedBy": "session-b", ... }
```

**会话 B**：完成后通知
```
task_done id="T1723647600000-1" result="已修复，commit abc123"
→ { "id": "T1723647600000-1", "status": "done", "result": "已修复，commit abc123", ... }
```

### 会话交接

**会话结束时**：
```
handoff_write summary="完成了功能 A 的开发，剩余功能 B 和 C 待做。功能 B 的前端组件已搭好框架，后端 API 需要从 session-x 的交接中获取接口文档。"
→ { "sessionId": "session-a", "summary": "...", "openTasks": 2, ... }
```

**新会话启动时**：
```
handoff_read
→ 共 3 条交接摘要，显示最近 5 条
```

## 数据存储

所有数据存储在 `$HOME/.dsh/task-relay/queue.json`，使用原子写入（temp file + rename）防止数据损坏。

## 架构

```
dsh-task-relay/
├── src/
│   ├── index.ts      # 插件入口：注册 7 个工具
│   ├── store.ts      # 持久化存储层（JSON 文件 + 原子写入）
│   ├── tools.ts      # 工具定义（defineTool）
│   ├── types.ts      # 类型定义
│   └── invariant.ts  # 输入验证
├── tests/
│   ├── store.spec.ts # 存储层单元测试（18 个）
│   └── tools.spec.ts # 工具注册与执行测试（8 个）
├── cordis.patch.yml  # DSH bundle patch
├── LICENSE           # MIT
├── README.md         # 中文文档
├── README.en.md      # English docs
└── package.json
```

## 开发

```sh
npm install
npm run typecheck   # tsc --noEmit
npm test            # vitest run (26 tests)
npm run build       # tsc
npm run check       # typecheck + test + build
```

## 安全边界

- 纯工具插件，不联网、不执行外部命令
- 数据存储在用户主目录下的 `~/.dsh/task-relay/`，目录权限 700
- 输入验证：标题 200 字符、描述 4000 字符、摘要 2000 字符、标签 10 个
- 认领/完成操作有会话归属校验

## 许可

MIT