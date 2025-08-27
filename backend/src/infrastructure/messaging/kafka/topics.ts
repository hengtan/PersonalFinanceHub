// Kafka Topics Configuration for Personal Finance Hub
export const KAFKA_TOPICS = {
  // Transaction events
  TRANSACTION_CREATED: 'transaction.created',
  TRANSACTION_UPDATED: 'transaction.updated',
  TRANSACTION_DELETED: 'transaction.deleted',
  
  // Budget events
  BUDGET_CREATED: 'budget.created',
  BUDGET_UPDATED: 'budget.updated',
  BUDGET_EXCEEDED: 'budget.exceeded',
  BUDGET_WARNING: 'budget.warning',
  
  // User events
  USER_REGISTERED: 'user.registered',
  USER_PROFILE_UPDATED: 'user.profile.updated',
  USER_PREFERENCES_UPDATED: 'user.preferences.updated',
  
  // Account events
  ACCOUNT_CREATED: 'account.created',
  ACCOUNT_BALANCE_UPDATED: 'account.balance.updated',
  
  // Category events
  CATEGORY_CREATED: 'category.created',
  CATEGORY_UPDATED: 'category.updated',
  
  // Financial insights and analytics
  MONTHLY_SUMMARY_GENERATED: 'analytics.monthly_summary.generated',
  SPENDING_PATTERN_DETECTED: 'analytics.spending_pattern.detected',
  ANOMALY_DETECTED: 'analytics.anomaly.detected',
  
  // Notification events
  NOTIFICATION_CREATED: 'notification.created',
  EMAIL_NOTIFICATION: 'notification.email',
  PUSH_NOTIFICATION: 'notification.push',
  
  // Synchronization events (PostgreSQL -> MongoDB)
  SYNC_TRANSACTION_TO_MONGO: 'sync.transaction.to_mongo',
  SYNC_BUDGET_TO_MONGO: 'sync.budget.to_mongo',
  SYNC_USER_TO_MONGO: 'sync.user.to_mongo',
  
  // Cache invalidation events
  CACHE_INVALIDATION: 'cache.invalidation',
  DASHBOARD_CACHE_REFRESH: 'cache.dashboard.refresh',
  
  // Saga orchestration events
  SAGA_TRANSACTION_PROCESS_STARTED: 'saga.transaction.process.started',
  SAGA_TRANSACTION_PROCESS_COMPLETED: 'saga.transaction.process.completed',
  SAGA_TRANSACTION_PROCESS_FAILED: 'saga.transaction.process.failed',
  
  SAGA_BUDGET_CALCULATION_STARTED: 'saga.budget.calculation.started',
  SAGA_BUDGET_CALCULATION_COMPLETED: 'saga.budget.calculation.completed',
  SAGA_BUDGET_CALCULATION_FAILED: 'saga.budget.calculation.failed',
  
  // External integrations
  BANK_TRANSACTION_IMPORTED: 'integration.bank.transaction.imported',
  EXTERNAL_ACCOUNT_SYNCED: 'integration.account.synced',
} as const;

// Topic configurations for Kafka
export const KAFKA_TOPIC_CONFIGS = {
  [KAFKA_TOPICS.TRANSACTION_CREATED]: {
    partitions: 3,
    replicationFactor: 1,
    configs: {
      'cleanup.policy': 'delete',
      'retention.ms': '604800000', // 7 days
      'max.message.bytes': '1048576', // 1MB
    }
  },
  
  [KAFKA_TOPICS.BUDGET_EXCEEDED]: {
    partitions: 2,
    replicationFactor: 1,
    configs: {
      'cleanup.policy': 'delete',
      'retention.ms': '2592000000', // 30 days
    }
  },
  
  [KAFKA_TOPICS.MONTHLY_SUMMARY_GENERATED]: {
    partitions: 2,
    replicationFactor: 1,
    configs: {
      'cleanup.policy': 'compact',
      'retention.ms': '31536000000', // 1 year
    }
  },
  
  [KAFKA_TOPICS.SYNC_TRANSACTION_TO_MONGO]: {
    partitions: 3,
    replicationFactor: 1,
    configs: {
      'cleanup.policy': 'delete',
      'retention.ms': '86400000', // 1 day (for sync reliability)
    }
  },
  
  [KAFKA_TOPICS.CACHE_INVALIDATION]: {
    partitions: 2,
    replicationFactor: 1,
    configs: {
      'cleanup.policy': 'delete',
      'retention.ms': '3600000', // 1 hour (cache events are short-lived)
    }
  },
} as const;

// Consumer group configurations
export const KAFKA_CONSUMER_GROUPS = {
  TRANSACTION_PROCESSOR: 'transaction-processor-group',
  BUDGET_CALCULATOR: 'budget-calculator-group',
  ANALYTICS_ENGINE: 'analytics-engine-group',
  NOTIFICATION_SERVICE: 'notification-service-group',
  SYNC_SERVICE: 'sync-service-group',
  CACHE_MANAGER: 'cache-manager-group',
  SAGA_ORCHESTRATOR: 'saga-orchestrator-group',
} as const;

// Event schemas for type safety
export interface TransactionCreatedEvent {
  transactionId: string;
  userId: string;
  amount: number;
  categoryId: string;
  description: string;
  date: string;
  type: 'income' | 'expense' | 'transfer';
  accountId: string;
  paymentMethod: string;
  tags?: string[];
  metadata?: Record<string, any>;
  timestamp: string;
}

export interface BudgetExceededEvent {
  budgetId: string;
  userId: string;
  categoryId: string;
  budgetAmount: number;
  spentAmount: number;
  excessAmount: number;
  month: number;
  year: number;
  percentage: number;
  timestamp: string;
}

export interface MonthlySummaryGeneratedEvent {
  userId: string;
  month: number;
  year: number;
  totalIncome: number;
  totalExpenses: number;
  netIncome: number;
  transactionCount: number;
  summaryId: string;
  timestamp: string;
}

export interface SyncToMongoEvent {
  entityType: 'transaction' | 'budget' | 'user' | 'account' | 'category';
  entityId: string;
  userId: string;
  operation: 'create' | 'update' | 'delete';
  data: Record<string, any>;
  timestamp: string;
  version: number;
}

export interface CacheInvalidationEvent {
  cacheType: 'dashboard' | 'monthly_summary' | 'analytics' | 'user_profile';
  userId: string;
  cacheKey?: string;
  reason: string;
  timestamp: string;
}

// Saga events
export interface SagaTransactionProcessEvent {
  sagaId: string;
  transactionId: string;
  userId: string;
  step: 'validate' | 'categorize' | 'update_budget' | 'generate_insights' | 'send_notifications';
  status: 'started' | 'completed' | 'failed';
  data?: Record<string, any>;
  error?: string;
  timestamp: string;
}

export type KafkaEvent = 
  | TransactionCreatedEvent 
  | BudgetExceededEvent 
  | MonthlySummaryGeneratedEvent 
  | SyncToMongoEvent 
  | CacheInvalidationEvent 
  | SagaTransactionProcessEvent;