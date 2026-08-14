/**
 * dsh-task-relay — 跨会话任务接力板插件。
 *
 * 基于持久队列的跨会话/子agent 任务接力 + 交接摘要。
 * 注册 7 个模型工具：task_push / task_list / task_claim / task_done / task_cancel
 * / handoff_write / handoff_read。
 *
 * 接入方式：在 cordis.yml 追加：
 *   - id: task-relay
 *     name: 'dsh-task-relay'
 *
 * @module dsh-task-relay
 */
import type { Context } from '@deepseek-ai/cordis';
export declare const name = "dsh-task-relay";
/** 需要 tools registry 服务。 */
export declare const inject: string[];
/** 插件配置。 */
export interface TaskRelayConfig {
    /**
     * 队列文件所在目录。默认 `$HOME/.dsh/task-relay`。
     *
     * The directory holding `queue.json`. Defaults to `$HOME/.dsh/task-relay`.
     * Point separate profiles at separate roots to keep their queues apart —
     * and note that a test suite which cannot redirect this has no choice but
     * to write into the developer's own live queue.
     */
    root?: string;
}
/**
 * 插件激活：注册所有工具。
 * store 的初始化在首次工具调用时自动完成（lazy init）。
 */
export declare function apply(ctx: Context, config?: TaskRelayConfig): void;
