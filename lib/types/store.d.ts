/**
 * dsh-task-relay 持久化存储层。
 * File-based persistence for the cross-session task queue.
 *
 * 使用 Node.js fs/promises 将数据存储为 JSON 文件，写入时使用原子替换
 * (temp file + rename) 防止数据损坏。
 *
 * 存储位置：`$HOME/.dsh/task-relay/queue.json`
 */
import type { Task, Handoff, TaskFilter } from './types.ts';
/**
 * 基于文件的持久化存储。
 * 同一时刻只有一个进程实例化本 store（最后写入者胜出）。
 */
export declare class TaskRelayStore {
    private data;
    private readonly filePath;
    private readonly dirPath;
    private initPromise;
    constructor(rootDir?: string);
    /** 确保 store 已初始化。幂等、可并发安全调用。 */
    init(): Promise<void>;
    private _doInit;
    /** 原子写入：写入 temp 文件后 rename 替换。 */
    private flush;
    /** 生成单调递增任务 ID。 */
    private nextId;
    /** 推送一条新任务。 */
    pushTask(task: Omit<Task, 'id' | 'createdAt'>): Promise<Task>;
    /** 按条件查询任务。返回按创建时间降序排列的副本。 */
    listTasks(filter?: TaskFilter): Task[];
    /** 按 ID 获取任务。 */
    getTask(id: string): Task | undefined;
    /** 认领一个 open 任务。 */
    claimTask(id: string, sessionId: string): Promise<Task>;
    /** 标记任务为已完成。 */
    doneTask(id: string, result: string, sessionId: string): Promise<Task>;
    /** 获取开放任务数量。 */
    countOpen(): number;
    /** 写入或更新当前会话的交接摘记。 */
    writeHandoff(sessionId: string, summary: string): Promise<Handoff>;
    /** 获取指定会话的交接摘记。 */
    getHandoff(sessionId: string): Handoff | undefined;
    /** 获取所有交接摘记，按更新时间降序。 */
    listHandoffs(limit?: number): Handoff[];
    /** 交接摘记总数。 */
    countHandoffs(): number;
    /** 取消任务：open 则删除，claimed 则退回 open。 */
    cancelTask(id: string, sessionId: string): Promise<Task>;
}
