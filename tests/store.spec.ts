/**
 * TaskRelayStore 持久化层单元测试。
 * Tests for the file-based persistence layer.
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { TaskRelayStore } from '../src/store.ts'
import type { StoreData } from '../src/types.ts'

describe('TaskRelayStore', () => {
  let tmpDir: string
  let store: TaskRelayStore

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'dsh-task-relay-test-'))
    store = new TaskRelayStore(tmpDir)
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  describe('init', () => {
    it('创建空存储文件', async () => {
      await store.init()
      const filePath = join(tmpDir, 'queue.json')
      expect(existsSync(filePath)).toBe(true)
      const raw = readFileSync(filePath, 'utf-8')
      const data = JSON.parse(raw) as StoreData
      expect(data.tasks).toEqual({})
      expect(data.handoffs).toEqual({})
      expect(data.orderedIds).toEqual([])
      expect(data.counter).toBe(0)
    })

    it('幂等：多次调用不报错', async () => {
      await store.init()
      await store.init()
      await store.init()
    })

    it('加载已有数据', async () => {
      await store.init()
      await store.pushTask({
        title: '测试任务',
        description: '描述',
        priority: 'high',
        status: 'open',
        sourceSession: 'session-1',
        claimedBy: null,
        claimedAt: null,
        doneAt: null,
        result: null,
        tags: ['test'],
      })

      // 重新加载
      const store2 = new TaskRelayStore(tmpDir)
      await store2.init()
      const tasks = store2.listTasks()
      expect(tasks).toHaveLength(1)
      expect(tasks[0].title).toBe('测试任务')
    })
  })

  describe('pushTask / listTasks', () => {
    it('推送任务后可在列表中查到', async () => {
      await store.init()
      const task = await store.pushTask({
        title: 'Hello',
        description: 'World',
        priority: 'normal',
        status: 'open',
        sourceSession: 's1',
        claimedBy: null,
        claimedAt: null,
        doneAt: null,
        result: null,
        tags: ['a', 'b'],
      })
      expect(task.id).toBeTruthy()
      expect(task.title).toBe('Hello')
      expect(task.priority).toBe('normal')
      expect(task.status).toBe('open')
      expect(task.createdAt).toBeTruthy()

      const list = store.listTasks()
      expect(list).toHaveLength(1)
      expect(list[0].id).toBe(task.id)
    })

    it('按状态筛选', async () => {
      await store.init()
      const t1 = await store.pushTask({ title: 'A', priority: 'low', status: 'open', sourceSession: 's1', description: '', claimedBy: null, claimedAt: null, doneAt: null, result: null, tags: [] })
      await store.pushTask({ title: 'B', priority: 'high', status: 'open', sourceSession: 's1', description: '', claimedBy: null, claimedAt: null, doneAt: null, result: null, tags: [] })
      await store.claimTask(t1.id, 's2')
      await store.doneTask(t1.id, 'done', 's2')

      const open = store.listTasks({ status: 'open' })
      expect(open).toHaveLength(1)
      expect(open[0].title).toBe('B')

      const done = store.listTasks({ status: 'done' })
      expect(done).toHaveLength(1)
      expect(done[0].title).toBe('A')
    })

    it('按优先级筛选', async () => {
      await store.init()
      await store.pushTask({ title: 'Low', priority: 'low', status: 'open', sourceSession: 's1', description: '', claimedBy: null, claimedAt: null, doneAt: null, result: null, tags: [] })
      await store.pushTask({ title: 'Urgent', priority: 'urgent', status: 'open', sourceSession: 's1', description: '', claimedBy: null, claimedAt: null, doneAt: null, result: null, tags: [] })

      const urgent = store.listTasks({ priority: 'urgent' })
      expect(urgent).toHaveLength(1)
      expect(urgent[0].title).toBe('Urgent')
    })

    it('按标签筛选', async () => {
      await store.init()
      await store.pushTask({ title: 'A', priority: 'normal', status: 'open', sourceSession: 's1', description: '', claimedBy: null, claimedAt: null, doneAt: null, result: null, tags: ['bug', 'frontend'] })
      await store.pushTask({ title: 'B', priority: 'normal', status: 'open', sourceSession: 's1', description: '', claimedBy: null, claimedAt: null, doneAt: null, result: null, tags: ['feature'] })

      const bug = store.listTasks({ tags: ['bug'] })
      expect(bug).toHaveLength(1)
      expect(bug[0].title).toBe('A')

      const multi = store.listTasks({ tags: ['bug', 'feature'] })
      expect(multi).toHaveLength(2)
    })

    it('新任务在前（降序）', async () => {
      await store.init()
      await store.pushTask({ title: 'First', priority: 'low', status: 'open', sourceSession: 's1', description: '', claimedBy: null, claimedAt: null, doneAt: null, result: null, tags: [] })
      await store.pushTask({ title: 'Second', priority: 'low', status: 'open', sourceSession: 's1', description: '', claimedBy: null, claimedAt: null, doneAt: null, result: null, tags: [] })

      const list = store.listTasks()
      expect(list[0].title).toBe('Second')
      expect(list[1].title).toBe('First')
    })
  })

  describe('claimTask / doneTask', () => {
    it('认领和完成任务', async () => {
      await store.init()
      const task = await store.pushTask({
        title: 'Task', priority: 'high', status: 'open', sourceSession: 's1',
        description: '', claimedBy: null, claimedAt: null, doneAt: null, result: null, tags: [],
      })

      const claimed = await store.claimTask(task.id, 's2')
      expect(claimed.status).toBe('claimed')
      expect(claimed.claimedBy).toBe('s2')

      const done = await store.doneTask(task.id, 'all good', 's2')
      expect(done.status).toBe('done')
      expect(done.result).toBe('all good')
      expect(done.doneAt).toBeTruthy()
    })

    it('不可重复认领', async () => {
      await store.init()
      const task = await store.pushTask({
        title: 'T', priority: 'low', status: 'open', sourceSession: 's1',
        description: '', claimedBy: null, claimedAt: null, doneAt: null, result: null, tags: [],
      })
      await store.claimTask(task.id, 's2')
      await expect(store.claimTask(task.id, 's3')).rejects.toThrow(/already claimed/)
    })

    it('不可完成他人的任务', async () => {
      await store.init()
      const task = await store.pushTask({
        title: 'T', priority: 'low', status: 'open', sourceSession: 's1',
        description: '', claimedBy: null, claimedAt: null, doneAt: null, result: null, tags: [],
      })
      await store.claimTask(task.id, 's2')
      await expect(store.doneTask(task.id, 'done', 's3')).rejects.toThrow(/claimed by another/)
    })

    it('未认领任务可直接完成', async () => {
      await store.init()
      const task = await store.pushTask({
        title: 'T', priority: 'low', status: 'open', sourceSession: 's1',
        description: '', claimedBy: null, claimedAt: null, doneAt: null, result: null, tags: [],
      })
      const done = await store.doneTask(task.id, 'done', 's2')
      expect(done.status).toBe('done')
      expect(done.claimedBy).toBe('s2')
    })
  })

  describe('cancelTask', () => {
    it('open 任务被删除', async () => {
      await store.init()
      const task = await store.pushTask({
        title: 'T', priority: 'low', status: 'open', sourceSession: 's1',
        description: '', claimedBy: null, claimedAt: null, doneAt: null, result: null, tags: [],
      })
      await store.cancelTask(task.id, 's1')
      expect(store.getTask(task.id)).toBeUndefined()
      expect(store.listTasks()).toHaveLength(0)
    })

    it('claimed 任务退回 open', async () => {
      await store.init()
      const task = await store.pushTask({
        title: 'T', priority: 'low', status: 'open', sourceSession: 's1',
        description: '', claimedBy: null, claimedAt: null, doneAt: null, result: null, tags: [],
      })
      await store.claimTask(task.id, 's2')
      await store.cancelTask(task.id, 's2')
      const t = store.getTask(task.id)!
      expect(t.status).toBe('open')
      expect(t.claimedBy).toBeNull()
    })

    it('不可取消他人任务', async () => {
      await store.init()
      const task = await store.pushTask({
        title: 'T', priority: 'low', status: 'open', sourceSession: 's1',
        description: '', claimedBy: null, claimedAt: null, doneAt: null, result: null, tags: [],
      })
      await store.claimTask(task.id, 's2')
      await expect(store.cancelTask(task.id, 's3')).rejects.toThrow(/claimed by another/)
    })
  })

  describe('handoff', () => {
    it('写入和读取交接摘要', async () => {
      await store.init()
      // 先推送一条任务，确保 openTasks 计数正确
      await store.pushTask({
        title: 'Pending', priority: 'high', status: 'open', sourceSession: 's1',
        description: '', claimedBy: null, claimedAt: null, doneAt: null, result: null, tags: [],
      })
      const h = await store.writeHandoff('session-a', '完成了功能 A，待做 B')
      expect(h.sessionId).toBe('session-a')
      expect(h.summary).toBe('完成了功能 A，待做 B')
      expect(h.openTasks).toBe(1)

      const read = store.getHandoff('session-a')
      expect(read).toBeTruthy()
      expect(read!.summary).toBe('完成了功能 A，待做 B')
    })

    it('更新已有交接摘要', async () => {
      await store.init()
      await store.writeHandoff('s1', '第一版')
      await store.writeHandoff('s1', '第二版')
      expect(store.countHandoffs()).toBe(1)
      expect(store.getHandoff('s1')!.summary).toBe('第二版')
    })

    it('listHandoffs 按时间降序', async () => {
      await store.init()
      await store.writeHandoff('s1', '最早')
      // 加一点延迟确保时间戳不同
      await new Promise(r => setTimeout(r, 10))
      await store.writeHandoff('s2', '最新')
      const list = store.listHandoffs()
      expect(list[0].sessionId).toBe('s2')
      expect(list[1].sessionId).toBe('s1')
    })
  })
})