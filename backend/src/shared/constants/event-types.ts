// Event types for the Personal Finance Hub system
export const EVENT_TYPES = {
  // User events
  USER_REGISTERED: 'user.registered',
  USER_LOGGED_IN: 'user.logged_in',
  USER_LOGGED_OUT: 'user.logged_out',
  USER_PROFILE_UPDATED: 'user.profile_updated',
  USER_PASSWORD_CHANGED: 'user.password_changed',
  USER_EMAIL_VERIFIED: 'user.email_verified',

  // Transaction events
  TRANSACTION_CREATED: 'transaction.created',
  TRANSACTION_UPDATED: 'transaction.updated',
  TRANSACTION_DELETED: 'transaction.deleted',
  TRANSACTION_RECONCILED: 'transaction.reconciled',
  TRANSACTION_CATEGORIZED: 'transaction.categorized',
  
  // Budget events
  BUDGET_CREATED: 'budget.created',
  BUDGET_UPDATED: 'budget.updated',
  BUDGET_DELETED: 'budget.deleted',
  BUDGET_EXCEEDED: 'budget.exceeded',
  BUDGET_WARNING: 'budget.warning',
  BUDGET_RESET: 'budget.reset',

  // Account events
  ACCOUNT_CREATED: 'account.created',
  ACCOUNT_UPDATED: 'account.updated',
  ACCOUNT_DELETED: 'account.deleted',
  ACCOUNT_BALANCE_UPDATED: 'account.balance_updated',
  ACCOUNT_RECONCILED: 'account.reconciled',

  // Category events
  CATEGORY_CREATED: 'category.created',
  CATEGORY_UPDATED: 'category.updated',
  CATEGORY_DELETED: 'category.deleted',

  // Goal events
  GOAL_CREATED: 'goal.created',
  GOAL_UPDATED: 'goal.updated',
  GOAL_ACHIEVED: 'goal.achieved',
  GOAL_PROGRESS_UPDATED: 'goal.progress_updated',

  // Notification events
  NOTIFICATION_SENT: 'notification.sent',
  NOTIFICATION_READ: 'notification.read',

  // System events
  SYSTEM_BACKUP_COMPLETED: 'system.backup_completed',
  SYSTEM_MAINTENANCE_STARTED: 'system.maintenance_started',
  SYSTEM_MAINTENANCE_ENDED: 'system.maintenance_ended',

  // Dashboard events
  DASHBOARD_REFRESHED: 'dashboard.refreshed',
  DASHBOARD_CACHE_INVALIDATED: 'dashboard.cache_invalidated',

  // Report events
  REPORT_GENERATED: 'report.generated',
  REPORT_EXPORTED: 'report.exported',

  // Import/Export events
  DATA_IMPORTED: 'data.imported',
  DATA_EXPORTED: 'data.exported',
  BULK_OPERATION_COMPLETED: 'bulk_operation.completed',
} as const;

export type EventType = typeof EVENT_TYPES[keyof typeof EVENT_TYPES];

// Event categories for filtering and routing
export const EVENT_CATEGORIES = {
  USER: 'user',
  TRANSACTION: 'transaction',
  BUDGET: 'budget',
  ACCOUNT: 'account',
  CATEGORY: 'category',
  GOAL: 'goal',
  NOTIFICATION: 'notification',
  SYSTEM: 'system',
  DASHBOARD: 'dashboard',
  REPORT: 'report',
  DATA: 'data',
} as const;

export type EventCategory = typeof EVENT_CATEGORIES[keyof typeof EVENT_CATEGORIES];

// Priority levels for events
export const EVENT_PRIORITIES = {
  LOW: 'low',
  NORMAL: 'normal',
  HIGH: 'high',
  CRITICAL: 'critical',
} as const;

export type EventPriority = typeof EVENT_PRIORITIES[keyof typeof EVENT_PRIORITIES];

// Event processing statuses
export const EVENT_STATUSES = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  RETRYING: 'retrying',
  DISCARDED: 'discarded',
} as const;

export type EventStatus = typeof EVENT_STATUSES[keyof typeof EVENT_STATUSES];