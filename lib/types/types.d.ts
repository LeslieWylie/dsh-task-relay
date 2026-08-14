/**
 * dsh-task-relay 数据类型定义。
 * Data types for the cross-session task relay plugin.
 */
/** 任务优先级。 */
export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent';
/** 任务状态。 */
export type TaskStatus = 'open' | 'claimed' | 'done';
/** 一条任务记录。 */
export interface Task {
    /** 唯一标识 (timestamp + counter)。 */
    id: string;
    /** 任务标题。 */
    title: string;
    /** 任务描述。 */
    description: string;
    /** 当前状态。 */
    status: TaskStatus;
    /** 优先级。 */
    priority: TaskPriority;
    /** 来源会话 ID。 */
    sourceSession: string;
    /** 认领会话 ID（claimed 时）。 */
    claimedBy: string | null;
    /** 认领时间（ISO 8601）。 */
    claimedAt: string | null;
    /** 创建时间。 */
    createdAt: string;
    /** 完成时间。 */
    doneAt: string | null;
    /** 完成结果。 */
    result: string | null;
    /** 标签列表。 */
    tags: string[];
}
/** 会话交接摘记。 */
export interface Handoff {
    /** 会话 ID。 */
    sessionId: string;
    /** 工作摘要。 */
    summary: string;
    /** 该会话留下的未完成任务数。 */
    openTasks: number;
    /** 更新时间。 */
    updatedAt: string;
}
/** 持久化文件顶层结构。 */
export interface StoreData {
    /** 任务队列（按 id 索引）。 */
    tasks: Record<string, Task>;
    /** 按创建时间降序的任务 ID 列表（最新在前）。 */
    orderedIds: string[];
    /** 会话交接摘记（按 sessionId 索引）。 */
    handoffs: Record<string, Handoff>;
    /** 单调递增计数器，用于生成任务 ID。 */
    counter: number;
}
/** 任务筛选条件。 */
export interface TaskFilter {
    status?: TaskStatus;
    priority?: TaskPriority;
    tags?: string[];
    session?: string;
}
/** Store 的文件路径。 */
export declare const STORE_FILENAME = "queue.json";
/** 默认存储目录（相对 $HOME/.dsh）。 */
export declare const STORE_DIR = "task-relay";
/** 数据版本号，用于未来迁移。 */
export declare const STORE_VERSION = 1;
