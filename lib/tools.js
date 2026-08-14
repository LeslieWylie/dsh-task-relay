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
import { assertStringLength, assertPriority, assertTags } from './invariant.js';
/**
 * 在 apply() 中调用，注册所有工具。
 * @param store - 已 init 的 store 实例
 */
export function registerTools(store) {
    return [
        // ── task_push ──
        defineTool({
            name: 'task_push',
            description: '推送一条新任务到跨会话共享队列。同一 workspace 的所有会话（含子 agent）均可查看和认领。' +
                '返回新任务的完整信息。',
            parameters: {
                title: { type: 'string', required: true, description: '任务标题（最多 200 字符）' },
                description: { type: 'string', description: '任务描述（最多 4000 字符）' },
                priority: {
                    type: 'string', required: true, enum: ['low', 'normal', 'high', 'urgent'],
                    description: '任务优先级',
                },
                tags: {
                    type: 'array', items: { type: 'string' },
                    description: '标签列表（最多 10 个，每个最多 40 字符）',
                },
            },
            output: {
                schema: { type: 'string' },
                render: (_args, value) => [{ type: 'text', text: value }],
            },
            execute: async (args, _exec) => {
                await store.init();
                const { title, description = '', priority, tags = [] } = args;
                assertStringLength(title, 200, 'title');
                if (description)
                    assertStringLength(description, 4000, 'description');
                assertPriority(priority);
                assertTags(tags ?? []);
                const sessionId = _exec.agent?.id ?? 'unknown';
                const task = await store.pushTask({
                    title,
                    description: description ?? '',
                    priority: priority,
                    status: 'open',
                    sourceSession: sessionId,
                    claimedBy: null,
                    claimedAt: null,
                    doneAt: null,
                    result: null,
                    tags: tags ?? [],
                });
                return JSON.stringify(task, null, 2);
            },
            timeoutMs: 5000,
        }),
        // ── task_list ──
        defineTool({
            name: 'task_list',
            description: '查询跨会话任务队列。支持按状态、优先级、标签、会话筛选。' +
                '返回按创建时间降序排列的任务列表。',
            parameters: {
                status: {
                    type: 'string', enum: ['open', 'claimed', 'done'],
                    description: '按状态筛选',
                },
                priority: {
                    type: 'string', enum: ['low', 'normal', 'high', 'urgent'],
                    description: '按优先级筛选',
                },
                tags: {
                    type: 'array', items: { type: 'string' },
                    description: '按标签筛选（匹配任一标签即命中）',
                },
                limit: {
                    type: 'integer', description: '最大返回条数（默认 20，最大 100）',
                },
            },
            output: {
                schema: { type: 'string' },
                render: (_args, value) => [{ type: 'text', text: value }],
            },
            execute: async (args) => {
                await store.init();
                const { status, priority, tags, limit } = args;
                const tasks = store.listTasks({
                    status: status,
                    priority: priority,
                    tags: tags,
                });
                const maxLimit = Math.min(limit ?? 20, 100);
                const sliced = tasks.slice(0, maxLimit);
                const summary = `共 ${tasks.length} 条任务，显示 ${sliced.length} 条`;
                return summary + '\n' + JSON.stringify(sliced, null, 2);
            },
            timeoutMs: 5000,
        }),
        // ── task_claim ──
        defineTool({
            name: 'task_claim',
            description: '认领一个开放任务。认领后该任务标记为 claimed，其他会话不可重复认领。' +
                '返回认领后的任务信息。',
            parameters: {
                id: { type: 'string', required: true, description: '任务 ID' },
            },
            output: {
                schema: { type: 'string' },
                render: (_args, value) => [{ type: 'text', text: value }],
            },
            execute: async (args, _exec) => {
                await store.init();
                const { id } = args;
                const sessionId = _exec.agent?.id ?? 'unknown';
                const task = await store.claimTask(id, sessionId);
                return JSON.stringify(task, null, 2);
            },
            timeoutMs: 5000,
        }),
        // ── task_done ──
        defineTool({
            name: 'task_done',
            description: '标记任务为已完成。需提供完成结果。认领者与当前会话不一致时禁止操作。' +
                '返回完成后的任务信息。',
            parameters: {
                id: { type: 'string', required: true, description: '任务 ID' },
                result: { type: 'string', required: true, description: '完成结果描述（最多 4000 字符）' },
            },
            output: {
                schema: { type: 'string' },
                render: (_args, value) => [{ type: 'text', text: value }],
            },
            execute: async (args, _exec) => {
                await store.init();
                const { id, result } = args;
                assertStringLength(result, 4000, 'result');
                const sessionId = _exec.agent?.id ?? 'unknown';
                const task = await store.doneTask(id, result, sessionId);
                return JSON.stringify(task, null, 2);
            },
            timeoutMs: 5000,
        }),
        // ── task_cancel ──
        defineTool({
            name: 'task_cancel',
            description: '取消任务。如果任务是 open 状态则删除；如果已被认领则退回 open 状态。' +
                '不可取消已完成的或不属于自己的任务（除非是 open 状态）。返回操作后的任务信息。',
            parameters: {
                id: { type: 'string', required: true, description: '任务 ID' },
            },
            output: {
                schema: { type: 'string' },
                render: (_args, value) => [{ type: 'text', text: value }],
            },
            execute: async (args, _exec) => {
                await store.init();
                const { id } = args;
                const sessionId = _exec.agent?.id ?? 'unknown';
                const task = await store.cancelTask(id, sessionId);
                return JSON.stringify(task, null, 2);
            },
            timeoutMs: 5000,
        }),
        // ── handoff_write ──
        defineTool({
            name: 'handoff_write',
            description: '写入当前会话的交接摘要。用于会话结束时记录工作状态和待办事项，' +
                '供后续会话（或自己恢复时）查看。返回写入的交接记录。',
            parameters: {
                summary: {
                    type: 'string', required: true,
                    description: '工作摘要（最多 2000 字符），描述当前进展、待办事项、关键决策等',
                },
            },
            output: {
                schema: { type: 'string' },
                render: (_args, value) => [{ type: 'text', text: value }],
            },
            execute: async (args, _exec) => {
                await store.init();
                const { summary } = args;
                assertStringLength(summary, 2000, 'summary');
                const sessionId = _exec.agent?.id ?? 'unknown';
                const handoff = await store.writeHandoff(sessionId, summary);
                return JSON.stringify(handoff, null, 2);
            },
            timeoutMs: 5000,
        }),
        // ── handoff_read ──
        defineTool({
            name: 'handoff_read',
            description: '读取会话交接摘要。不指定 sessionId 时返回最近 N 条交接摘要（按时间降序）。' +
                '指定 sessionId 时返回该会话的最后一条摘要。',
            parameters: {
                sessionId: {
                    type: 'string', description: '可选：会话 ID，指定时返回该会话的摘要',
                },
                limit: {
                    type: 'integer', description: '不指定 sessionId 时，最多返回的条数（默认 5，最大 20）',
                },
            },
            output: {
                schema: { type: 'string' },
                render: (_args, value) => [{ type: 'text', text: value }],
            },
            execute: async (args) => {
                await store.init();
                const { sessionId, limit } = args;
                if (sessionId) {
                    const h = store.getHandoff(sessionId);
                    if (!h)
                        return `未找到会话 ${sessionId} 的交接摘要`;
                    return JSON.stringify(h, null, 2);
                }
                const maxLimit = Math.min(limit ?? 5, 20);
                const handoffs = store.listHandoffs(maxLimit);
                const total = store.countHandoffs();
                const summary = `共 ${total} 条交接摘要，显示最近 ${handoffs.length} 条`;
                return summary + '\n' + JSON.stringify(handoffs, null, 2);
            },
            timeoutMs: 5000,
        }),
    ];
}
