/**
 * dsh-task-relay 数据类型定义。
 * Data types for the cross-session task relay plugin.
 */
/** Store 的文件路径。 */
export const STORE_FILENAME = 'queue.json';
/** 默认存储目录（相对 $HOME/.dsh）。 */
export const STORE_DIR = 'task-relay';
/** 数据版本号，用于未来迁移。 */
export const STORE_VERSION = 1;
