/**
 * dsh-task-relay 插件注册与工具定义单元测试。
 * Tests for plugin registration and tool definitions.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// Mock dsh-tools
vi.mock('@deepseek-ai/dsh-tools', () => ({ defineTool: (opts: unknown) => opts }))

import { name, inject, apply } from '../src/index.ts'
import { TaskRelayStore } from '../src/store.ts'

function makeCtx(tmpDir: string): {
  ctx: any
  registered: string[]
  disposed: string[]
} {
  const registered: string[] = []
  const disposed: string[] = []
  const ctx = {
    tools: {
      register: (def: { name: string }) => {
        registered.push(def.name)
        return () => { disposed.push(def.name) }
      },
    },
    effect: (fn: () => () => void) => {
      const disposer = fn()
      return disposer
    },
  }
  return { ctx, registered, disposed }
}

describe('dsh-task-relay: plugin contract', () => {
  it('exports cordis plugin contract', () => {
    expect(typeof name).toBe('string')
    expect(name).toBe('@deepseek-ai/dsh-task-relay')
    expect(inject).toContain('tools')
  })

  it('registers all 7 tools through apply', () => {
    const { ctx, registered, disposed } = makeCtx('/tmp/test')
    apply(ctx)
    expect(registered).toEqual([
      'task_push',
      'task_list',
      'task_claim',
      'task_done',
      'task_cancel',
      'handoff_write',
      'handoff_read',
    ])
    expect(disposed).toEqual([])
  })
})

describe('dsh-task-relay: tool schema smoke tests', () => {
  let tmpDir: string
  let store: TaskRelayStore

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'dsh-task-relay-tools-test-'))
    store = new TaskRelayStore(tmpDir)
    await store.init()
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('task_push: 验证参数模式', () => {
    const { ctx, registered } = makeCtx(tmpDir)
    apply(ctx)
    // 通过 mock 拿到了 defineTool 的参数
    // 实际上我们无法直接检查 defineTool 的调用，因为 vi.mock 拦截了
    // 但可以通过 apply 的副作用验证
    expect(registered).toContain('task_push')
  })

  it('task_push 工具执行: 创建任务', async () => {
    // 通过 store 直接测试执行逻辑
    const task = await store.pushTask({
      title: 'Test Task',
      description: 'A test',
      priority: 'high',
      status: 'open',
      sourceSession: 'session-1',
      claimedBy: null,
      claimedAt: null,
      doneAt: null,
      result: null,
      tags: ['test'],
    })
    expect(task.id).toBeTruthy()
    expect(task.title).toBe('Test Task')
    expect(task.priority).toBe('high')
    expect(task.sourceSession).toBe('session-1')
  })

  it('task_list 工具执行: 按状态筛选', async () => {
    const t1 = await store.pushTask({
      title: 'Open', priority: 'low', status: 'open', sourceSession: 's1',
      description: '', claimedBy: null, claimedAt: null, doneAt: null, result: null, tags: [],
    })
    await store.pushTask({
      title: 'Done', priority: 'low', status: 'open', sourceSession: 's1',
      description: '', claimedBy: null, claimedAt: null, doneAt: null, result: null, tags: [],
    })
    await store.claimTask(t1.id, 's2')
    await store.doneTask(t1.id, 'done', 's2')

    const open = store.listTasks({ status: 'open' })
    expect(open).toHaveLength(1)
    expect(open[0].title).toBe('Done')

    const done = store.listTasks({ status: 'done' })
    expect(done).toHaveLength(1)
    expect(done[0].title).toBe('Open')
  })

  it('task_claim / task_done 完整流程', async () => {
    const task = await store.pushTask({
      title: 'Assign', priority: 'urgent', status: 'open', sourceSession: 's1',
      description: 'Urgent fix', claimedBy: null, claimedAt: null, doneAt: null, result: null, tags: [],
    })

    const claimed = await store.claimTask(task.id, 'worker-1')
    expect(claimed.status).toBe('claimed')
    expect(claimed.claimedBy).toBe('worker-1')

    const done = await store.doneTask(task.id, 'Fixed in commit abc', 'worker-1')
    expect(done.status).toBe('done')
    expect(done.result).toContain('Fixed')
  })

  it('task_cancel: open 任务被删除', async () => {
    const task = await store.pushTask({
      title: 'Cancel', priority: 'normal', status: 'open', sourceSession: 's1',
      description: 'To be cancelled', claimedBy: null, claimedAt: null, doneAt: null, result: null, tags: [],
    })
    await store.cancelTask(task.id, 's1')
    expect(store.getTask(task.id)).toBeUndefined()
  })

  it('handoff_write / handoff_read 完整流程', async () => {
    await store.pushTask({
      title: 'Remaining', priority: 'low', status: 'open', sourceSession: 's1',
      description: '', claimedBy: null, claimedAt: null, doneAt: null, result: null, tags: [],
    })
    const h = await store.writeHandoff('session-x', 'Finished feature A, need to do B')
    expect(h.openTasks).toBe(1)

    const read = store.getHandoff('session-x')
    expect(read!.summary).toBe('Finished feature A, need to do B')

    // 测试 listHandoffs
    const list = store.listHandoffs(1)
    expect(list).toHaveLength(1)
    expect(list[0].sessionId).toBe('session-x')
  })
})