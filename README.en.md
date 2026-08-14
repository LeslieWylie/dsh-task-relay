# 📋 dsh-task-relay

[English](README.en.md)

DSH cross-session task relay plugin — a **persistent shared task queue** with **handoff notes** for cross-session and subagent coordination.

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## Why

DSH sessions are independent: work done in session A is invisible to session B by default. `dsh-task-relay` fills this gap with a **cross-session task queue** that any session (including subagents) can:

- Push tasks for future sessions / other sessions / subagents
- Claim and complete open tasks
- Record session handoff summaries for later sessions

## Tools

| Tool | Action | Description |
|---|---|---|
| `task_push` | Push task | Submit a task to the shared queue with title/description/priority/tags |
| `task_list` | List tasks | Filter by status/priority/tags, returned in descending order |
| `task_claim` | Claim task | Claim an open task, marking it as claimed |
| `task_done` | Complete task | Mark a task as done with a result description |
| `task_cancel` | Cancel task | Delete open tasks, return claimed tasks to open |
| `handoff_write` | Write handoff | Record current session's progress and TODOs |
| `handoff_read` | Read handoff | Read by session ID or latest N handoffs |

## Install

```sh
dsh plugin --profile web add github:LeslieWylie/dsh-task-relay
dsh plugin --profile headless add github:LeslieWylie/dsh-task-relay
```

Or add to `cordis.yml`:

```yaml
- id: task-relay
  name: '@deepseek-ai/dsh-task-relay'
```

## Usage

### Cross-session task relay

**Session A**: Push a task
```
task_push title="Fix login page bug" priority="high" tags=["bug","frontend"]
→ { "id": "T1723647600000-1", "title": "Fix login page bug", "status": "open", ... }
```

**Session B**: List and claim
```
task_list status="open" priority="high"
→ Showing 1 of 1 tasks
task_claim id="T1723647600000-1"
→ { "id": "T1723647600000-1", "status": "claimed", "claimedBy": "session-b", ... }
```

**Session B**: Complete
```
task_done id="T1723647600000-1" result="Fixed in commit abc123"
→ { "id": "T1723647600000-1", "status": "done", "result": "Fixed in commit abc123", ... }
```

### Session handoff

**End of session**:
```
handoff_write summary="Completed feature A development. Features B and C remain. Feature B's frontend scaffold is ready, backend API docs needed from session-x's handoff."
→ { "sessionId": "session-a", "summary": "...", "openTasks": 2, ... }
```

**New session startup**:
```
handoff_read
→ Showing 3 handoffs, 3 most recent
```

## Data Storage

All data is stored in `$HOME/.dsh/task-relay/queue.json` with atomic writes (temp file + rename) to prevent corruption.

## Architecture

```
dsh-task-relay/
├── src/
│   ├── index.ts      # Plugin entry: registers 7 tools
│   ├── store.ts      # Persistence layer (JSON file + atomic writes)
│   ├── tools.ts      # Tool definitions (defineTool)
│   ├── types.ts      # Type definitions
│   └── invariant.ts  # Input validation
├── tests/
│   ├── store.spec.ts # Store unit tests (18)
│   └── tools.spec.ts # Tool registration & execution tests (8)
├── cordis.patch.yml  # DSH bundle patch
├── LICENSE           # MIT
├── README.md         # Chinese docs
├── README.en.md      # English docs
└── package.json
```

## Development

```sh
npm install
npm run typecheck   # tsc --noEmit
npm test            # vitest run (26 tests)
npm run build       # tsc
npm run check       # typecheck + test + build
```

## Security

- Pure tool plugin: no network access, no external commands
- Data stored in `~/.dsh/task-relay/` with directory mode 700
- Input validation: 200-char title, 4000-char description, 2000-char summary, 10 tags max
- Claim/complete operations validate session ownership

## License

MIT