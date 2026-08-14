/**
 * dsh-task-relay 工具定义。
 * Tool definitions for the cross-session task relay.
 *
 * 注册以下工具：
 * - task_push      推送任务到共享队列
 * - task_list      查询任务（按状态/优先级/标签）
 * - task_claim     认领一个开放任务
 * - task_done      完成任务并记录结果
 * - task_cancel    取消任务（退回 open 或删除）
 * - handoff_write  写入当前会话交接摘要
 * - handoff_read   读取交接摘要
 */
import { defineTool } from '@deepseek-ai/dsh-tools';
import type { TaskRelayStore } from './store.ts';
/**
 * 在 apply() 中调用，注册所有工具。
 * @param store - 已 init 的 store 实例
 */
export declare function registerTools(store: TaskRelayStore): ReturnType<typeof defineTool>[];
