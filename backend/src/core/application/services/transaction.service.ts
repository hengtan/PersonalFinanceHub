// Transaction Service - Example of complete architecture integration
// PostgreSQL (write) -> Kafka Events -> MongoDB (read) -> Redis (cache)
import { Logger } from '../../../shared/utils/logger.util';
import { EventDrivenSyncService } from '../../../infrastructure/messaging/sync.service';
import { TransactionProcessingSaga } from '../../../infrastructure/messaging/saga/transaction-saga';
import { DashboardMongoRepository } from '../../../infrastructure/database/mongodb/repositories/dashboard.repository';
import { BusinessException } from '../../../shared/exceptions/base.exception';

const logger = Logger.createChildLogger('TransactionService');

export class TransactionService {
  private syncService: EventDrivenSyncService;
  private transactionSaga: TransactionProcessingSaga;
  private dashboardRepo: DashboardMongoRepository;

  constructor() {
    this.syncService = EventDrivenSyncService.getInstance();
    this.transactionSaga = new TransactionProcessingSaga();
    this.dashboardRepo = new DashboardMongoRepository();
  }

  async createTransaction(transactionData: any): Promise<{ transactionId: string; sagaId: string }> {
    try {
      logger.info('Creating new transaction', { 
        userId: transactionData.userId,
        amount: transactionData.amount,
        category: transactionData.categoryId
      });

      // Step 1: Validate and save to PostgreSQL (write database)
      const transaction = await this.saveToPostgreSQL(transactionData);

      // Step 2: Start Transaction Processing Saga
      // This will orchestrate: validation -> categorization -> budget updates -> 
      // MongoDB sync -> insights generation -> notifications
      const sagaId = await this.transactionSaga.startTransactionSaga(transaction);

      logger.info('Transaction created and saga started', { 
        transactionId: transaction.id,
        sagaId,
        userId: transaction.userId
      });

      return { 
        transactionId: transaction.id, 
        sagaId 
      };

    } catch (error) {
      logger.error('Error creating transaction', error, transactionData);
      throw new BusinessException('Failed to create transaction', 400, error);
    }
  }

  async updateTransaction(transactionId: string, updateData: any): Promise<void> {
    try {
      logger.info('Updating transaction', { transactionId, updateData });

      // Step 1: Update in PostgreSQL
      const updatedTransaction = await this.updateInPostgreSQL(transactionId, updateData);

      // Step 2: Trigger sync workflow
      await this.syncService.onTransactionUpdated(updatedTransaction);

      logger.info('Transaction updated successfully', { 
        transactionId,
        userId: updatedTransaction.userId
      });

    } catch (error) {
      logger.error('Error updating transaction', error, { transactionId, updateData });
      throw new BusinessException('Failed to update transaction', 400, error);
    }
  }

  async deleteTransaction(transactionId: string, userId: string): Promise<void> {
    try {
      logger.info('Deleting transaction', { transactionId, userId });

      // Step 1: Delete from PostgreSQL
      await this.deleteFromPostgreSQL(transactionId);

      // Step 2: Trigger sync workflow for deletion
      await this.syncService.onTransactionDeleted(transactionId, userId);

      logger.info('Transaction deleted successfully', { transactionId, userId });

    } catch (error) {
      logger.error('Error deleting transaction', error, { transactionId, userId });
      throw new BusinessException('Failed to delete transaction', 400, error);
    }
  }

  // Read operations use cache-aside pattern: Redis -> MongoDB -> PostgreSQL
  async getTransactionById(transactionId: string): Promise<any> {
    try {
      // This would implement cache-aside pattern
      // 1. Check Redis cache
      // 2. Check MongoDB read model
      // 3. Fall back to PostgreSQL
      
      // For now, simplified implementation
      return await this.getFromPostgreSQL(transactionId);

    } catch (error) {
      logger.error('Error getting transaction', error, { transactionId });
      throw new BusinessException('Failed to get transaction', 404, error);
    }
  }

  async getUserTransactions(
    userId: string, 
    filters?: any, 
    pagination?: { page: number; limit: number }
  ): Promise<any> {
    try {
      // Use MongoDB read model for complex queries
      // This would be much faster than querying PostgreSQL directly
      
      // For demonstration, using dashboard cache data
      const cacheKey = `transactions_${JSON.stringify(filters)}_${JSON.stringify(pagination)}`;
      
      // Try cache first (Redis -> MongoDB)
      let dashboardData = await this.dashboardRepo.getDashboardData(userId, cacheKey);
      
      if (dashboardData?.recentTransactions) {
        logger.debug('Transactions served from cache', { userId, cacheKey });
        return {
          transactions: dashboardData.recentTransactions,
          fromCache: true
        };
      }

      // Fall back to direct query (would query PostgreSQL)
      const transactions = await this.getUserTransactionsFromPostgreSQL(userId, filters, pagination);
      
      // Update cache for next time
      if (transactions.length > 0) {
        await this.dashboardRepo.setDashboardCache(userId, {
          currentMonth: {} as any,
          recentTransactions: transactions.slice(0, 10), // Last 10 transactions
          budgetStatus: [] as any,
          monthlyTrends: [] as any,
          categorySpending: [] as any,
          accountBalances: [] as any,
          alerts: [] as any,
          goals: [] as any
        }, cacheKey, 10); // 10 minutes TTL
      }

      return {
        transactions,
        fromCache: false
      };

    } catch (error) {
      logger.error('Error getting user transactions', error, { userId, filters });
      throw new BusinessException('Failed to get user transactions', 400, error);
    }
  }

  async getMonthlyTransactionSummary(userId: string, year: number, month: number): Promise<any> {
    try {
      // This uses MongoDB read model optimized for analytics
      const summary = await this.dashboardRepo.getMonthlySummary(userId, year, month);
      
      if (summary) {
        logger.debug('Monthly summary served from MongoDB/Redis', { userId, year, month });
        return summary;
      }

      // If not available, trigger generation from PostgreSQL data
      const generatedSummary = await this.generateMonthlySummary(userId, year, month);
      
      // Save to MongoDB for future queries
      await this.dashboardRepo.setMonthlySummary(generatedSummary);

      return generatedSummary;

    } catch (error) {
      logger.error('Error getting monthly summary', error, { userId, year, month });
      throw new BusinessException('Failed to get monthly summary', 400, error);
    }
  }

  // PostgreSQL operations (write database)
  private async saveToPostgreSQL(transactionData: any): Promise<any> {
    // Mock implementation - would use actual PostgreSQL repository
    const transaction = {
      id: `txn_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      ...transactionData,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    logger.debug('Transaction saved to PostgreSQL', { transactionId: transaction.id });
    return transaction;
  }

  private async updateInPostgreSQL(transactionId: string, updateData: any): Promise<any> {
    // Mock implementation
    const transaction = {
      id: transactionId,
      ...updateData,
      updatedAt: new Date()
    };

    logger.debug('Transaction updated in PostgreSQL', { transactionId });
    return transaction;
  }

  private async deleteFromPostgreSQL(transactionId: string): Promise<void> {
    // Mock implementation
    logger.debug('Transaction deleted from PostgreSQL', { transactionId });
  }

  private async getFromPostgreSQL(transactionId: string): Promise<any> {
    // Mock implementation
    return {
      id: transactionId,
      userId: 'user123',
      amount: 100,
      description: 'Test transaction',
      categoryId: 'cat123',
      createdAt: new Date()
    };
  }

  private async getUserTransactionsFromPostgreSQL(
    userId: string, 
    filters?: any, 
    pagination?: { page: number; limit: number }
  ): Promise<any[]> {
    // Mock implementation
    return [
      {
        id: 'txn1',
        userId,
        amount: 50,
        description: 'Grocery shopping',
        category: 'Food',
        date: new Date(),
        type: 'expense'
      },
      {
        id: 'txn2', 
        userId,
        amount: 100,
        description: 'Gas station',
        category: 'Transportation',
        date: new Date(),
        type: 'expense'
      }
    ];
  }

  private async generateMonthlySummary(userId: string, year: number, month: number): Promise<any> {
    // Mock implementation - would aggregate from PostgreSQL
    return {
      userId,
      month,
      year,
      totalIncome: 3000,
      totalExpenses: 2200,
      netIncome: 800,
      transactionCount: 45,
      categoryBreakdown: [
        { categoryId: 'food', categoryName: 'Food', amount: 800, percentage: 36.4, transactionCount: 12 },
        { categoryId: 'transport', categoryName: 'Transportation', amount: 400, percentage: 18.2, transactionCount: 8 }
      ],
      budgetComparison: [],
      averageTransactionValue: 48.89,
      highestExpense: { amount: 200, description: 'Weekly groceries', date: new Date() },
      topCategories: [],
      comparedToPreviousMonth: { incomeChange: 5.5, expenseChange: -2.3, netIncomeChange: 15.2, changePercentage: 15.2 },
      trends: { dailyAverages: [], weeklyTotals: [], peakSpendingDay: 'Saturday' },
      lastUpdated: new Date(),
      version: 1
    };
  }

  // Saga management
  async getSagaStatus(sagaId: string): Promise<any> {
    return this.transactionSaga.getSagaStatus(sagaId);
  }

  async getActiveSagas(): Promise<any[]> {
    return this.transactionSaga.getActiveSagas();
  }

  async cancelSaga(sagaId: string): Promise<void> {
    await this.transactionSaga.cancelSaga(sagaId);
  }

  // Health check
  isHealthy(): boolean {
    return this.syncService.isHealthy();
  }
}