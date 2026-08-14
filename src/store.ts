/**
 * dsh-task-relay 持久化存储层。
 * File-based persistence for the cross-session task queue.
 *
 * 使用 Node.js fs/promises 将数据存储为 JSON 文件，写入时使用原子替换
 * (temp file + rename) 防止数据损坏。
 *
 * 存储位置：`$HOME/.dsh/task-relay/queue.json`
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { existsSync } from 'node:fs'
import type { Task, Handoff, StoreData, TaskFilter, TaskPriority, TaskStatus } from './types.ts'
import { STORE_DIR, STORE_FILENAME, STORE_VERSION } from './types.ts'

/** 默认 store 数据。 */
function emptyStore(): StoreData {
  return {
    tasks: {},
    orderedIds: [],
    handoffs: {},
    counter: 0,
  }
}

/**
 * 基于文件的持久化存储。
 * 同一时刻只有一个进程实例化本 store（最后写入者胜出）。
 */
export class TaskRelayStore {
  private data: StoreData
  private readonly filePath: string
  private readonly dirPath: string
  private initPromise: Promise<void> | null = null

  constructor(rootDir?: string) {
    const dir = rootDir ?? join(homedir(), '.dsh', STORE_DIR)
    this.dirPath = dir
    this.filePath = join(dir, STORE_FILENAME)
    this.data = emptyStore()
  }

  /** 确保 store 已初始化。幂等、可并发安全调用。 */
  async init(): Promise<void> {
    if (this.initPromise) return this.initPromise
    this.initPromise = this._doInit()
    return this.initPromise
  }

  private async _doInit(): Promise<void> {
    await mkdir(this.dirPath, { recursive: true, mode: 0o700 })
    if (existsSync(this.filePath)) {
      const raw = await readFile(this.filePath, 'utf-8')
      const parsed = JSON.parse(raw) as StoreData
      // 基础校验：缺字段时兜底
      this.data = {
        tasks: parsed.tasks ?? {},
        orderedIds: Array.isArray(parsed.orderedIds) ? parsed.orderedIds : [],
        handoffs: parsed.handoffs ?? {},
        counter: typeof parsed.counter === 'number' ? parsed.counter : 0,
      }
    } else {
      this.data = emptyStore()
      await this.flush()
    }
  }

  /** 原子写入：写入 temp 文件后 rename 替换。 */
  private async flush(): Promise<void> {
    const tmp = this.filePath + '.tmp'
    await writeFile(tmp, JSON.stringify(this.data, null, 2), 'utf-8')
    await rename(tmp, this.filePath)
  }

  // ── 任务操作 ──

  /** 生成单调递增任务 ID。 */
  private nextId(): string {
    this.data.counter++
    return `T${Date.now()}-${this.data.counter}`
  }

  /** 推送一条新任务。 */
  async pushTask(task: Omit<Task, 'id' | 'createdAt'>): Promise<Task> {
    const now = new Date().toISOString()
    const newTask: Task = {
      ...task,
      id: this.nextId(),
      createdAt: now,
    }
    this.data.tasks[newTask.id] = newTask
    this.data.orderedIds.unshift(newTask.id)
    await this.flush()
    return newTask
  }

  /** 按条件查询任务。返回按创建时间降序排列的副本。 */
  listTasks(filter?: TaskFilter): Task[] {
    const result: Task[] = []
    for (const id of this.data.orderedIds) {
      const t = this.data.tasks[id]
      if (!t) continue
      if (filter?.status !== undefined && t.status !== filter.status) continue
      if (filter?.priority !== undefined && t.priority !== filter.priority) continue
      if (filter?.session !== undefined && t.sourceSession !== filter.session && t.claimedBy !== filter.session) continue
      if (filter?.tags !== undefined && filter.tags.length > 0) {
        const hasTag = filter.tags.some(tag => t.tags.includes(tag))
        if (!hasTag) continue
      }
      result.push(t)
    }
    return result
  }

  /** 按 ID 获取任务。 */
  getTask(id: string): Task | undefined {
    return this.data.tasks[id]
  }

  /** 认领一个 open 任务。 */
  async claimTask(id: string, sessionId: string): Promise<Task> {
    const t = this.data.tasks[id]
    if (!t) throw new Error(`task-relay: task "${id}" not found`)
    if (t.status !== 'open') throw new Error(`task-relay: task "${id}" is already ${t.status}`)
    const now = new Date().toISOString()
    t.status = 'claimed'
    t.claimedBy = sessionId
    t.claimedAt = now
    await this.flush()
    return { ...t }
  }

  /** 标记任务为已完成。 */
  async doneTask(id: string, result: string, sessionId: string): Promise<Task> {
    const t = this.data.tasks[id]
    if (!t) throw new Error(`task-relay: task "${id}" not found`)
    if (t.status === 'done') throw new Error(`task-relay: task "${id}" is already done`)
    if (t.status === 'claimed' && t.claimedBy !== sessionId) {
      throw new Error(`task-relay: task "${id}" is claimed by another session`)
    }
    const now = new Date().toISOString()
    t.status = 'done'
    t.result = result
    t.doneAt = now
    // 如果未认领的直接完成，也记录认领者
    if (t.claimedBy === null) {
      t.claimedBy = sessionId
      t.claimedAt = now
    }
    await this.flush()
    return { ...t }
  }

  /** 获取开放任务数量。 */
  countOpen(): number {
    let count = 0
    for (const id of this.data.orderedIds) {
      const t = this.data.tasks[id]
      if (t && t.status === 'open') count++
    }
    return count
  }

  // ── 交接摘记操作 ──

  /** 写入或更新当前会话的交接摘记。 */
  async writeHandoff(sessionId: string, summary: string): Promise<Handoff> {
    const now = new Date().toISOString()
    const openTasks = this.countOpen()
    const handoff: Handoff = {
      sessionId,
      summary,
      openTasks,
      updatedAt: now,
    }
    this.data.handoffs[sessionId] = handoff
    await this.flush()
    return handoff
  }

  /** 获取指定会话的交接摘记。 */
  getHandoff(sessionId: string): Handoff | undefined {
    return this.data.handoffs[sessionId]
  }

  /** 获取所有交接摘记，按更新时间降序。 */
  listHandoffs(limit?: number): Handoff[] {
    const result = Object.values(this.data.handoffs)
    result.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    return limit ? result.slice(0, limit) : result
  }

  /** 交接摘记总数。 */
  countHandoffs(): number {
    return Object.keys(this.data.handoffs).length
  }

  /** 取消任务：open 则删除，claimed 则退回 open。 */
  async cancelTask(id: string, sessionId: string): Promise<Task> {
    const t = this.data.tasks[id]
    if (!t) throw new Error(`task-relay: task "${id}" not found`)
    if (t.status === 'done') throw new Error(`task-relay: task "${id}" is already done`)
    if (t.status !== 'open' && t.claimedBy !== sessionId) {
      throw new Error(`task-relay: task "${id}" is claimed by another session`)
    }
    if (t.status === 'open') {
      // 删除任务
      delete this.data.tasks[id]
      this.data.orderedIds = this.data.orderedIds.filter(i => i !== id)
    } else {
      // 退回 open
      t.status = 'open'
      t.claimedBy = null
      t.claimedAt = null
    }
    await this.flush()
    return { ...t }
  }
}