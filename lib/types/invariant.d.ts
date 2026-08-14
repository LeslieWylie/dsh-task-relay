/**
 * dsh-task-relay 输入验证实用函数。
 * Input validation helpers.
 */
import type { TaskPriority, TaskStatus } from './types.ts';
/** 允许的最大标题长度。 */
export declare const MAX_TITLE_LEN = 200;
/** 允许的最大描述长度。 */
export declare const MAX_DESC_LEN = 4000;
/** 允许的最大摘要长度。 */
export declare const MAX_SUMMARY_LEN = 2000;
/** 允许的最大标签数。 */
export declare const MAX_TAGS = 10;
/** 单个标签最大长度。 */
export declare const MAX_TAG_LEN = 40;
/**
 * 确保 value 是合法优先级。
 * @throws Error 当不合法时。
 */
export declare function assertPriority(value: string): asserts value is TaskPriority;
/**
 * 确保 value 是合法状态。
 * @throws Error 当不合法时。
 */
export declare function assertStatus(value: string): asserts value is TaskStatus;
/**
 * 确保字符串非空且在长度限制内。
 * @throws Error 当不合法时。
 */
export declare function assertStringLength(value: string, maxLen: number, label: string): void;
/**
 * 确保标签数组合法。
 * @throws Error 当不合法时。
 */
export declare function assertTags(tags: unknown): asserts tags is string[];
