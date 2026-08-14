/**
 * dsh-task-relay — 跨会话任务接力板插件。
 *
 * 基于持久队列的跨会话/子agent 任务接力 + 交接摘要。
 * 注册 7 个模型工具：task_push / task_list / task_claim / task_done / task_cancel
 * / handoff_write / handoff_read。
 *
 * 接入方式：在 cordis.yml 追加：
 *   - id: task-relay
 *     name: '@deepseek-ai/dsh-task-relay'
 *
 * @module @deepseek-ai/dsh-task-relay
 */

import type { Context } from '@deepseek-ai/cordis'
import { TaskRelayStore } from './store.ts'
import { registerTools } from './tools.ts'

export const name = '@deepseek-ai/dsh-task-relay'

/** 需要 tools registry 服务。 */
export const inject = ['tools']

/**
 * 插件激活：注册所有工具。
 * store 的初始化在首次工具调用时自动完成（lazy init）。
 */
export function apply(ctx: Context): void {
  const store = new TaskRelayStore()

  // 注册所有工具
  const tools = registerTools(store)
  const disposers: (() => void)[] = []

  for (const tool of tools) {
    const disp = ctx.tools.register(tool)
    disposers.push(disp)
  }

  // 注册生命周期清理
  ctx.effect(() => {
    return () => {
      for (const disp of disposers) disp()
    }
  })
}