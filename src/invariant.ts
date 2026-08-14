/**
 * dsh-task-relay 输入验证实用函数。
 * Input validation helpers.
 */

import type { TaskPriority, TaskStatus } from './types.ts'

/** 允许的最大标题长度。 */
export const MAX_TITLE_LEN = 200
/** 允许的最大描述长度。 */
export const MAX_DESC_LEN = 4000
/** 允许的最大摘要长度。 */
export const MAX_SUMMARY_LEN = 2000
/** 允许的最大标签数。 */
export const MAX_TAGS = 10
/** 单个标签最大长度。 */
export const MAX_TAG_LEN = 40

/** 合法优先级列表。 */
const VALID_PRIORITIES: TaskPriority[] = ['low', 'normal', 'high', 'urgent']
/** 合法状态列表。 */
const VALID_STATUSES: TaskStatus[] = ['open', 'claimed', 'done']

/**
 * 确保 value 是合法优先级。
 * @throws Error 当不合法时。
 */
export function assertPriority(value: string): asserts value is TaskPriority {
  if (!VALID_PRIORITIES.includes(value as TaskPriority)) {
    throw new Error(`task-relay: invalid priority "${value}", expected one of ${VALID_PRIORITIES.join(', ')}`)
  }
}

/**
 * 确保 value 是合法状态。
 * @throws Error 当不合法时。
 */
export function assertStatus(value: string): asserts value is TaskStatus {
  if (!VALID_STATUSES.includes(value as TaskStatus)) {
    throw new Error(`task-relay: invalid status "${value}", expected one of ${VALID_STATUSES.join(', ')}`)
  }
}

/**
 * 确保字符串非空且在长度限制内。
 * @throws Error 当不合法时。
 */
export function assertStringLength(value: string, maxLen: number, label: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`task-relay: ${label} must be a non-empty string`)
  }
  if (value.length > maxLen) {
    throw new Error(`task-relay: ${label} exceeds ${maxLen} characters (got ${value.length})`)
  }
}

/**
 * 确保标签数组合法。
 * @throws Error 当不合法时。
 */
export function assertTags(tags: unknown): asserts tags is string[] {
  if (!Array.isArray(tags)) {
    throw new Error('task-relay: tags must be an array of strings')
  }
  if (tags.length > MAX_TAGS) {
    throw new Error(`task-relay: too many tags (max ${MAX_TAGS}, got ${tags.length})`)
  }
  for (const t of tags) {
    if (typeof t !== 'string' || t.trim().length === 0) {
      throw new Error('task-relay: each tag must be a non-empty string')
    }
    if (t.length > MAX_TAG_LEN) {
      throw new Error(`task-relay: tag "${t}" exceeds ${MAX_TAG_LEN} characters`)
    }
  }
}