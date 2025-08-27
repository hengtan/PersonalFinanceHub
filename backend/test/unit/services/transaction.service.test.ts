// Unit tests for TransactionService
import { TransactionService } from '../../../src/core/application/services/transaction.service';
import { BusinessException } from '../../../src/shared/exceptions/business.exception';
import { TestUtils } from '../../helpers/test-utils';

// Mock dependencies
jest.mock('../../../src/infrastructure/messaging/sync.service');
jest.mock('../../../src/infrastructure/messaging/saga/transaction-saga');
jest.mock('../../../src/infrastructure/database/mongodb/repositories/dashboard.repository');

describe('TransactionService', () => {
  let transactionService: TransactionService;
  let mockSyncService: any;
  let mockTransactionSaga: any;
  let mockDashboardRepo: any;
  let mockLogger: any;

  beforeEach(() => {
    // Create mocks
    mockSyncService = TestUtils.createMockSyncService();
    mockTransactionSaga = TestUtils.createMockSagaService();
    mockDashboardRepo = {
      getDashboardData: jest.fn(),
      setDashboardCache: jest.fn(),
      getMonthlySummary: jest.fn(),
      setMonthlySummary: jest.fn(),
      invalidateDashboardCache: jest.fn()
    };
    mockLogger = TestUtils.createMockLogger();

    // Mock the getInstance methods
    const { EventDrivenSyncService } = require('../../../src/infrastructure/messaging/sync.service');
    EventDrivenSyncService.getInstance = jest.fn(() => mockSyncService);

    transactionService = new TransactionService();
    (transactionService as any).syncService = mockSyncService;
    (transactionService as any).transactionSaga = mockTransactionSaga;
    (transactionService as any).dashboardRepo = mockDashboardRepo;

    jest.clearAllMocks();
  });

  describe('createTransaction', () => {
    const validTransactionData = TestUtils.generateTransaction();

    beforeEach(() => {
      // Mock successful PostgreSQL save
      jest.spyOn(transactionService as any, 'saveToPostgreSQL')
        .mockResolvedValue({ ...validTransactionData, id: 'generated-id' });
    });

    it('should create transaction and start saga successfully', async () => {
      const result = await transactionService.createTransaction(validTransactionData);

      expect(result).toHaveProperty('transactionId');
      expect(result).toHaveProperty('sagaId');
      expect(result.transactionId).toBe('generated-id');
      expect(result.sagaId).toBe('test-saga-id');
    });

    it('should save transaction to PostgreSQL', async () => {
      const saveToPostgreSQLSpy = jest.spyOn(transactionService as any, 'saveToPostgreSQL');

      await transactionService.createTransaction(validTransactionData);

      expect(saveToPostgreSQLSpy).toHaveBeenCalledWith(validTransactionData);
    });

    it('should start transaction processing saga', async () => {
      await transactionService.createTransaction(validTransactionData);

      expect(mockTransactionSaga.startTransactionSaga).toHaveBeenCalledWith(
        expect.objectContaining({
          ...validTransactionData,
          id: 'generated-id'
        })
      );
    });

    it('should handle PostgreSQL save errors', async () => {
      const error = new Error('Database connection failed');
      jest.spyOn(transactionService as any, 'saveToPostgreSQL')
        .mockRejectedValue(error);

      await expect(transactionService.createTransaction(validTransactionData))
        .rejects
        .toThrow(BusinessException);

      await expect(transactionService.createTransaction(validTransactionData))
        .rejects
        .toThrow('Failed to create transaction');
    });

    it('should handle saga start errors', async () => {
      const error = new Error('Saga initialization failed');
      mockTransactionSaga.startTransactionSaga.mockRejectedValue(error);

      await expect(transactionService.createTransaction(validTransactionData))
        .rejects
        .toThrow(BusinessException);
    });

    it('should validate required transaction fields', async () => {
      const invalidData = { ...validTransactionData, userId: null };

      // Mock validation error in saveToPostgreSQL
      jest.spyOn(transactionService as any, 'saveToPostgreSQL')
        .mockRejectedValue(new Error('User ID is required'));

      await expect(transactionService.createTransaction(invalidData))
        .rejects
        .toThrow(BusinessException);
    });
  });

  describe('updateTransaction', () => {
    const transactionId = 'test-transaction-id';
    const updateData = { description: 'Updated description', amount: 200 };
    const updatedTransaction = { ...TestUtils.generateTransaction(), ...updateData };

    beforeEach(() => {
      jest.spyOn(transactionService as any, 'updateInPostgreSQL')
        .mockResolvedValue(updatedTransaction);
    });

    it('should update transaction successfully', async () => {
      await expect(transactionService.updateTransaction(transactionId, updateData))
        .resolves
        .not.toThrow();
    });

    it('should update transaction in PostgreSQL', async () => {
      const updateSpy = jest.spyOn(transactionService as any, 'updateInPostgreSQL');

      await transactionService.updateTransaction(transactionId, updateData);

      expect(updateSpy).toHaveBeenCalledWith(transactionId, updateData);
    });

    it('should trigger sync workflow after update', async () => {
      await transactionService.updateTransaction(transactionId, updateData);

      expect(mockSyncService.onTransactionUpdated).toHaveBeenCalledWith(updatedTransaction);
    });

    it('should handle update errors', async () => {
      const error = new Error('Transaction not found');
      jest.spyOn(transactionService as any, 'updateInPostgreSQL')
        .mockRejectedValue(error);

      await expect(transactionService.updateTransaction(transactionId, updateData))
        .rejects
        .toThrow(BusinessException);
    });

    it('should handle sync service errors', async () => {
      const error = new Error('Sync failed');
      mockSyncService.onTransactionUpdated.mockRejectedValue(error);

      await expect(transactionService.updateTransaction(transactionId, updateData))
        .rejects
        .toThrow(BusinessException);
    });
  });

  describe('deleteTransaction', () => {
    const transactionId = 'test-transaction-id';
    const userId = 'test-user-id';

    beforeEach(() => {
      jest.spyOn(transactionService as any, 'deleteFromPostgreSQL')
        .mockResolvedValue(undefined);
    });

    it('should delete transaction successfully', async () => {
      await expect(transactionService.deleteTransaction(transactionId, userId))
        .resolves
        .not.toThrow();
    });

    it('should delete transaction from PostgreSQL', async () => {
      const deleteSpy = jest.spyOn(transactionService as any, 'deleteFromPostgreSQL');

      await transactionService.deleteTransaction(transactionId, userId);

      expect(deleteSpy).toHaveBeenCalledWith(transactionId);
    });

    it('should trigger sync workflow for deletion', async () => {
      await transactionService.deleteTransaction(transactionId, userId);

      expect(mockSyncService.onTransactionDeleted).toHaveBeenCalledWith(transactionId, userId);
    });

    it('should handle deletion errors', async () => {
      const error = new Error('Transaction not found');
      jest.spyOn(transactionService as any, 'deleteFromPostgreSQL')
        .mockRejectedValue(error);

      await expect(transactionService.deleteTransaction(transactionId, userId))
        .rejects
        .toThrow(BusinessException);
    });
  });

  describe('getUserTransactions', () => {
    const userId = 'test-user-id';
    const filters = { categoryId: 'food' };
    const pagination = { page: 1, limit: 10 };

    describe('when cache hit', () => {
      beforeEach(() => {
        mockDashboardRepo.getDashboardData.mockResolvedValue({
          recentTransactions: [TestUtils.generateTransaction()]
        });
      });

      it('should return transactions from cache', async () => {
        const result = await transactionService.getUserTransactions(userId, filters, pagination);

        expect(result.fromCache).toBe(true);
        expect(result.transactions).toHaveLength(1);
        expect(mockDashboardRepo.getDashboardData).toHaveBeenCalled();
      });

      it('should not query PostgreSQL when cache hit', async () => {
        const postgresSpy = jest.spyOn(transactionService as any, 'getUserTransactionsFromPostgreSQL');

        await transactionService.getUserTransactions(userId, filters, pagination);

        expect(postgresSpy).not.toHaveBeenCalled();
      });
    });

    describe('when cache miss', () => {
      const mockTransactions = [TestUtils.generateTransaction(), TestUtils.generateTransaction()];

      beforeEach(() => {
        mockDashboardRepo.getDashboardData.mockResolvedValue(null);
        jest.spyOn(transactionService as any, 'getUserTransactionsFromPostgreSQL')
          .mockResolvedValue(mockTransactions);
      });

      it('should query PostgreSQL and update cache', async () => {
        const result = await transactionService.getUserTransactions(userId, filters, pagination);

        expect(result.fromCache).toBe(false);
        expect(result.transactions).toEqual(mockTransactions);
      });

      it('should update dashboard cache with results', async () => {
        await transactionService.getUserTransactions(userId, filters, pagination);

        expect(mockDashboardRepo.setDashboardCache).toHaveBeenCalledWith(
          userId,
          expect.objectContaining({
            recentTransactions: mockTransactions.slice(0, 10)
          }),
          expect.any(String),
          10
        );
      });

      it('should not update cache when no transactions found', async () => {
        jest.spyOn(transactionService as any, 'getUserTransactionsFromPostgreSQL')
          .mockResolvedValue([]);

        await transactionService.getUserTransactions(userId, filters, pagination);

        expect(mockDashboardRepo.setDashboardCache).not.toHaveBeenCalled();
      });
    });

    it('should handle query errors', async () => {
      mockDashboardRepo.getDashboardData.mockRejectedValue(new Error('Cache error'));

      await expect(transactionService.getUserTransactions(userId, filters, pagination))
        .rejects
        .toThrow(BusinessException);
    });
  });

  describe('getMonthlyTransactionSummary', () => {
    const userId = 'test-user-id';
    const year = 2024;
    const month = 3;

    describe('when summary exists in MongoDB', () => {
      const existingSummary = TestUtils.generateMonthlySummary();

      beforeEach(() => {
        mockDashboardRepo.getMonthlySummary.mockResolvedValue(existingSummary);
      });

      it('should return existing summary from MongoDB/Redis', async () => {
        const result = await transactionService.getMonthlyTransactionSummary(userId, year, month);

        expect(result).toEqual(existingSummary);
        expect(mockDashboardRepo.getMonthlySummary).toHaveBeenCalledWith(userId, year, month);
      });

      it('should not generate new summary when exists', async () => {
        const generateSpy = jest.spyOn(transactionService as any, 'generateMonthlySummary');

        await transactionService.getMonthlyTransactionSummary(userId, year, month);

        expect(generateSpy).not.toHaveBeenCalled();
      });
    });

    describe('when summary does not exist', () => {
      const generatedSummary = TestUtils.generateMonthlySummary();

      beforeEach(() => {
        mockDashboardRepo.getMonthlySummary.mockResolvedValue(null);
        jest.spyOn(transactionService as any, 'generateMonthlySummary')
          .mockResolvedValue(generatedSummary);
      });

      it('should generate summary from PostgreSQL data', async () => {
        const result = await transactionService.getMonthlyTransactionSummary(userId, year, month);

        expect(result).toEqual(generatedSummary);
      });

      it('should save generated summary to MongoDB', async () => {
        await transactionService.getMonthlyTransactionSummary(userId, year, month);

        expect(mockDashboardRepo.setMonthlySummary).toHaveBeenCalledWith(generatedSummary);
      });

      it('should call generateMonthlySummary with correct parameters', async () => {
        const generateSpy = jest.spyOn(transactionService as any, 'generateMonthlySummary');

        await transactionService.getMonthlyTransactionSummary(userId, year, month);

        expect(generateSpy).toHaveBeenCalledWith(userId, year, month);
      });
    });

    it('should handle generation errors', async () => {
      mockDashboardRepo.getMonthlySummary.mockResolvedValue(null);
      jest.spyOn(transactionService as any, 'generateMonthlySummary')
        .mockRejectedValue(new Error('Generation failed'));

      await expect(transactionService.getMonthlyTransactionSummary(userId, year, month))
        .rejects
        .toThrow(BusinessException);
    });
  });

  describe('saga management methods', () => {
    describe('getSagaStatus', () => {
      it('should return saga status from saga service', async () => {
        const sagaId = 'test-saga-id';
        const mockStatus = { sagaId, status: 'completed' };
        mockTransactionSaga.getSagaStatus.mockReturnValue(mockStatus);

        const result = await transactionService.getSagaStatus(sagaId);

        expect(result).toEqual(mockStatus);
        expect(mockTransactionSaga.getSagaStatus).toHaveBeenCalledWith(sagaId);
      });
    });

    describe('getActiveSagas', () => {
      it('should return active sagas from saga service', async () => {
        const mockSagas = [{ sagaId: 'saga1' }, { sagaId: 'saga2' }];
        mockTransactionSaga.getActiveSagas.mockReturnValue(mockSagas);

        const result = await transactionService.getActiveSagas();

        expect(result).toEqual(mockSagas);
        expect(mockTransactionSaga.getActiveSagas).toHaveBeenCalled();
      });
    });

    describe('cancelSaga', () => {
      it('should cancel saga through saga service', async () => {
        const sagaId = 'test-saga-id';

        await transactionService.cancelSaga(sagaId);

        expect(mockTransactionSaga.cancelSaga).toHaveBeenCalledWith(sagaId);
      });
    });
  });

  describe('isHealthy', () => {
    it('should return health status from sync service', () => {
      mockSyncService.isHealthy.mockReturnValue(true);

      const result = transactionService.isHealthy();

      expect(result).toBe(true);
      expect(mockSyncService.isHealthy).toHaveBeenCalled();
    });

    it('should return false when sync service is unhealthy', () => {
      mockSyncService.isHealthy.mockReturnValue(false);

      const result = transactionService.isHealthy();

      expect(result).toBe(false);
    });
  });

  describe('private methods', () => {
    describe('saveToPostgreSQL', () => {
      it('should generate transaction with ID and timestamps', async () => {
        const transactionData = TestUtils.generateTransaction();
        delete (transactionData as any).id;

        const result = await (transactionService as any).saveToPostgreSQL(transactionData);

        expect(result).toHaveProperty('id');
        expect(result).toHaveProperty('createdAt');
        expect(result).toHaveProperty('updatedAt');
        expect(result.id).toMatch(/^txn_/);
      });
    });

    describe('generateMonthlySummary', () => {
      it('should generate summary with correct structure', async () => {
        const userId = 'test-user';
        const year = 2024;
        const month = 3;

        const result = await (transactionService as any).generateMonthlySummary(userId, year, month);

        expect(result).toHaveProperty('userId', userId);
        expect(result).toHaveProperty('year', year);
        expect(result).toHaveProperty('month', month);
        expect(result).toHaveProperty('totalIncome');
        expect(result).toHaveProperty('totalExpenses');
        expect(result).toHaveProperty('netIncome');
        expect(result).toHaveProperty('transactionCount');
        expect(result).toHaveProperty('categoryBreakdown');
        expect(result).toHaveProperty('lastUpdated');
        expect(result).toHaveProperty('version');
      });
    });
  });
});