// Transaction Processing Saga - Orchestrates complex transaction workflows
import { KafkaProducerService } from '../kafka/producer';
import { Logger } from '../../../shared/utils/logger.util';
import { InfrastructureException } from '../../../shared/exceptions/base.exception';
import { KAFKA_TOPICS } from '../kafka/topics';
import { OutboxService } from '../../patterns/outbox.service';
import { EventDrivenSyncService } from '../sync.service';

const logger = Logger.createChildLogger('TransactionSaga');

export interface SagaStep {
  name: string;
  execute: () => Promise<any>;
  compensate: () => Promise<void>;
  isCompleted: boolean;
  result?: any;
  error?: Error;
}

export interface TransactionSagaData {
  sagaId: string;
  transactionId: string;
  userId: string;
  transactionData: any;
  currentStep: number;
  status: 'started' | 'in_progress' | 'completed' | 'failed' | 'compensating' | 'compensated';
  steps: SagaStep[];
  startedAt: Date;
  completedAt?: Date;
  errors: string[];
}

export class TransactionProcessingSaga {
  private producer: KafkaProducerService;
  private syncService: EventDrivenSyncService;
  private outboxService: OutboxService;
  private activeSagas: Map<string, TransactionSagaData> = new Map();

  constructor() {
    this.producer = new KafkaProducerService();
    this.syncService = EventDrivenSyncService.getInstance();
    this.outboxService = OutboxService.getInstance();
  }

  async startTransactionSaga(transactionData: any): Promise<string> {
    const sagaId = this.generateSagaId();
    
    try {
      logger.info('Starting transaction processing saga', { 
        sagaId, 
        transactionId: transactionData.id,
        userId: transactionData.userId 
      });

      const sagaData: TransactionSagaData = {
        sagaId,
        transactionId: transactionData.id,
        userId: transactionData.userId,
        transactionData,
        currentStep: 0,
        status: 'started',
        steps: this.buildTransactionSteps(transactionData),
        startedAt: new Date(),
        errors: []
      };

      this.activeSagas.set(sagaId, sagaData);

      // Publish saga started event
      await this.publishSagaEvent(sagaData, 'validate', 'started');

      // Start executing steps
      await this.executeSaga(sagaId);

      return sagaId;

    } catch (error) {
      logger.error('Error starting transaction saga', error, { sagaId, transactionId: transactionData.id });
      throw new InfrastructureException('Failed to start transaction saga', 'SAGA_START_ERROR', 500, error);
    }
  }

  private buildTransactionSteps(transactionData: any): SagaStep[] {
    const steps: SagaStep[] = [
      // Step 1: Validate Transaction
      {
        name: 'validate',
        execute: async () => {
          return await this.validateTransaction(transactionData);
        },
        compensate: async () => {
          // No compensation needed for validation
        },
        isCompleted: false
      },

      // Step 2: Categorize Transaction (if needed)
      {
        name: 'categorize',
        execute: async () => {
          return await this.categorizeTransaction(transactionData);
        },
        compensate: async () => {
          // Revert categorization
          await this.revertCategorization(transactionData.id);
        },
        isCompleted: false
      },

      // Step 3: Update Budget Calculations
      {
        name: 'update_budget',
        execute: async () => {
          return await this.updateBudgetCalculations(transactionData);
        },
        compensate: async () => {
          // Revert budget calculations
          await this.revertBudgetCalculations(transactionData);
        },
        isCompleted: false
      },

      // Step 4: Sync to MongoDB
      {
        name: 'sync_to_mongo',
        execute: async () => {
          return await this.syncToMongoDB(transactionData);
        },
        compensate: async () => {
          // Remove from MongoDB
          await this.removeFromMongoDB(transactionData.id, transactionData.userId);
        },
        isCompleted: false
      },

      // Step 5: Generate Insights
      {
        name: 'generate_insights',
        execute: async () => {
          return await this.generateInsights(transactionData);
        },
        compensate: async () => {
          // Remove insights
          await this.removeInsights(transactionData.id);
        },
        isCompleted: false
      },

      // Step 6: Send Notifications
      {
        name: 'send_notifications',
        execute: async () => {
          return await this.sendNotifications(transactionData);
        },
        compensate: async () => {
          // Cancel notifications (if possible)
          await this.cancelNotifications(transactionData.id);
        },
        isCompleted: false
      }
    ];

    return steps;
  }

  private async executeSaga(sagaId: string): Promise<void> {
    const saga = this.activeSagas.get(sagaId);
    if (!saga) {
      throw new Error(`Saga not found: ${sagaId}`);
    }

    try {
      saga.status = 'in_progress';

      for (let i = saga.currentStep; i < saga.steps.length; i++) {
        const step = saga.steps[i];
        saga.currentStep = i;

        try {
          logger.debug('Executing saga step', { 
            sagaId, 
            stepName: step.name, 
            stepIndex: i 
          });

          // Publish step started event
          await this.publishSagaEvent(saga, step.name, 'started');

          // Execute step
          const result = await step.execute();
          step.result = result;
          step.isCompleted = true;

          // Publish step completed event
          await this.publishSagaEvent(saga, step.name, 'completed', result);

          logger.debug('Saga step completed successfully', { 
            sagaId, 
            stepName: step.name, 
            stepIndex: i 
          });

        } catch (error) {
          step.error = error as Error;
          saga.errors.push(`Step ${step.name}: ${error.message}`);

          logger.error('Saga step failed', error, { 
            sagaId, 
            stepName: step.name, 
            stepIndex: i 
          });

          // Publish step failed event
          await this.publishSagaEvent(saga, step.name, 'failed', null, error.message);

          // Start compensation
          await this.compensateSaga(sagaId, i);
          return;
        }
      }

      // All steps completed successfully
      saga.status = 'completed';
      saga.completedAt = new Date();

      logger.info('Transaction saga completed successfully', { 
        sagaId, 
        transactionId: saga.transactionId,
        duration: saga.completedAt.getTime() - saga.startedAt.getTime()
      });

      // Publish saga completed event
      await this.publishSagaEvent(saga, 'complete', 'completed');

    } catch (error) {
      saga.status = 'failed';
      saga.errors.push(`Saga execution failed: ${error.message}`);

      logger.error('Saga execution failed', error, { sagaId });
      
      // Start compensation
      await this.compensateSaga(sagaId, saga.currentStep);
    } finally {
      // Clean up completed or failed saga after some time
      setTimeout(() => {
        this.activeSagas.delete(sagaId);
      }, 5 * 60 * 1000); // 5 minutes
    }
  }

  private async compensateSaga(sagaId: string, failedStepIndex: number): Promise<void> {
    const saga = this.activeSagas.get(sagaId);
    if (!saga) return;

    try {
      logger.info('Starting saga compensation', { 
        sagaId, 
        failedStepIndex,
        transactionId: saga.transactionId 
      });

      saga.status = 'compensating';

      // Compensate completed steps in reverse order
      for (let i = failedStepIndex - 1; i >= 0; i--) {
        const step = saga.steps[i];
        
        if (step.isCompleted) {
          try {
            logger.debug('Compensating saga step', { 
              sagaId, 
              stepName: step.name, 
              stepIndex: i 
            });

            await step.compensate();

            logger.debug('Saga step compensated', { 
              sagaId, 
              stepName: step.name, 
              stepIndex: i 
            });

          } catch (compensationError) {
            logger.error('Compensation failed for step', compensationError, { 
              sagaId, 
              stepName: step.name, 
              stepIndex: i 
            });

            saga.errors.push(`Compensation failed for ${step.name}: ${compensationError.message}`);
          }
        }
      }

      saga.status = 'compensated';
      saga.completedAt = new Date();

      logger.info('Saga compensation completed', { 
        sagaId, 
        transactionId: saga.transactionId 
      });

    } catch (error) {
      saga.status = 'failed';
      saga.errors.push(`Compensation process failed: ${error.message}`);

      logger.error('Saga compensation process failed', error, { sagaId });
    }
  }

  // Step implementations
  private async validateTransaction(transactionData: any): Promise<any> {
    // Validate transaction data
    if (!transactionData.amount || transactionData.amount <= 0) {
      throw new Error('Invalid transaction amount');
    }

    if (!transactionData.userId) {
      throw new Error('User ID is required');
    }

    if (!transactionData.categoryId) {
      throw new Error('Category ID is required');
    }

    return { validated: true, timestamp: new Date() };
  }

  private async categorizeTransaction(transactionData: any): Promise<any> {
    // Auto-categorization logic (could use ML)
    // For now, just validate existing category
    return { 
      categoryId: transactionData.categoryId, 
      confidence: 1.0,
      method: 'manual' 
    };
  }

  private async updateBudgetCalculations(transactionData: any): Promise<any> {
    // Update budget calculations and check for budget exceeded
    // This would integrate with budget service
    
    const budgetImpact = {
      categoryId: transactionData.categoryId,
      amount: transactionData.amount,
      previousSpent: 1000, // Mock value
      newSpent: 1000 + transactionData.amount,
      budgetLimit: 1500,
      percentageUsed: ((1000 + transactionData.amount) / 1500) * 100
    };

    if (budgetImpact.percentageUsed > 100) {
      // Trigger budget exceeded event
      await this.syncService.onBudgetExceeded({
        id: 'budget-123',
        userId: transactionData.userId,
        categoryId: transactionData.categoryId,
        amount: budgetImpact.budgetLimit,
        spentAmount: budgetImpact.newSpent,
        month: new Date().getMonth() + 1,
        year: new Date().getFullYear()
      });
    }

    return budgetImpact;
  }

  private async syncToMongoDB(transactionData: any): Promise<any> {
    // Sync transaction to MongoDB via event-driven service
    await this.syncService.syncTransactionToMongo(
      transactionData.id,
      transactionData.userId,
      'create',
      transactionData
    );

    return { synced: true, timestamp: new Date() };
  }

  private async generateInsights(transactionData: any): Promise<any> {
    // Generate insights based on transaction
    const insights = {
      spendingPattern: 'normal',
      categoryTrend: 'increasing',
      unusualActivity: false,
      recommendations: [
        'Consider setting up a budget alert for this category'
      ]
    };

    return insights;
  }

  private async sendNotifications(transactionData: any): Promise<any> {
    // Send notifications if needed
    const notifications = [];

    // Example: Large transaction notification
    if (transactionData.amount > 1000) {
      notifications.push({
        type: 'large_transaction',
        message: `Large transaction of ${transactionData.amount} detected`,
        priority: 'medium'
      });
    }

    return { notifications, sent: notifications.length };
  }

  // Compensation methods
  private async revertCategorization(transactionId: string): Promise<void> {
    logger.debug('Reverting categorization', { transactionId });
    // Implementation would revert categorization changes
  }

  private async revertBudgetCalculations(transactionData: any): Promise<void> {
    logger.debug('Reverting budget calculations', { transactionId: transactionData.id });
    // Implementation would revert budget calculations
  }

  private async removeFromMongoDB(transactionId: string, userId: string): Promise<void> {
    await this.syncService.syncTransactionToMongo(transactionId, userId, 'delete', { id: transactionId });
  }

  private async removeInsights(transactionId: string): Promise<void> {
    logger.debug('Removing insights', { transactionId });
    // Implementation would remove generated insights
  }

  private async cancelNotifications(transactionId: string): Promise<void> {
    logger.debug('Cancelling notifications', { transactionId });
    // Implementation would cancel pending notifications
  }

  private async publishSagaEvent(saga: TransactionSagaData, step: string, status: string, data?: any, error?: string): Promise<void> {
    const event = {
      sagaId: saga.sagaId,
      transactionId: saga.transactionId,
      userId: saga.userId,
      step,
      status,
      data,
      error,
      timestamp: new Date().toISOString()
    };

    const topic = status === 'started' ? KAFKA_TOPICS.SAGA_TRANSACTION_PROCESS_STARTED :
                  status === 'completed' ? KAFKA_TOPICS.SAGA_TRANSACTION_PROCESS_COMPLETED :
                  KAFKA_TOPICS.SAGA_TRANSACTION_PROCESS_FAILED;

    await this.producer.publishKafkaEvent(topic, event);
  }

  private generateSagaId(): string {
    return `saga_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  // Public methods for saga management
  getSagaStatus(sagaId: string): TransactionSagaData | null {
    return this.activeSagas.get(sagaId) || null;
  }

  getActiveSagas(): TransactionSagaData[] {
    return Array.from(this.activeSagas.values());
  }

  async cancelSaga(sagaId: string): Promise<void> {
    const saga = this.activeSagas.get(sagaId);
    if (!saga || saga.status === 'completed' || saga.status === 'compensated') {
      return;
    }

    logger.info('Cancelling saga', { sagaId, currentStatus: saga.status });
    await this.compensateSaga(sagaId, saga.currentStep);
  }
}