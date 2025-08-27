// backend/src/core/application/use-cases/transaction/__tests__/list-transactions.use-case.test.ts
import { ListTransactionsUseCase, ListTransactionsUseCaseRequest } from '../list-transactions.use-case';
import { TransactionRepository, TransactionFilter } from '../../../../domain/repositories/transaction.repository';
import { TransactionType, TransactionStatus } from '../../../../domain/entities/transaction.entity';
import { ValidationException } from '../../../../../shared/exceptions/validation.exception';
import { BusinessException } from '../../../../../shared/exceptions/business.exception';

// Mock repository
const mockTransactionRepository: jest.Mocked<TransactionRepository> = {
    findById: jest.fn(),
    findMany: jest.fn(),
    findByDateRange: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn()
};

describe('ListTransactionsUseCase', () => {
    let useCase: ListTransactionsUseCase;

    beforeEach(() => {
        useCase = new ListTransactionsUseCase(mockTransactionRepository);
        jest.clearAllMocks();
    });

    describe('execute', () => {
        const validRequest: ListTransactionsUseCaseRequest = {
            userId: 'user-123',
            pagination: {
                page: 1,
                limit: 20,
                sortBy: 'transactionDate',
                sortOrder: 'desc'
            }
        };

        const mockTransactions = [
            {
                id: 'tx-1',
                userId: 'user-123',
                accountId: 'account-1',
                categoryId: 'category-1',
                description: 'Income transaction',
                amount_value: 1000,
                amount_currency: 'BRL',
                type: TransactionType.INCOME,
                status: TransactionStatus.COMPLETED,
                paymentMethod: 'PIX',
                transactionDate: new Date('2023-12-01'),
                createdAt: new Date()
            },
            {
                id: 'tx-2', 
                userId: 'user-123',
                accountId: 'account-1',
                categoryId: 'category-2',
                description: 'Expense transaction',
                amount_value: 500,
                amount_currency: 'BRL',
                type: TransactionType.EXPENSE,
                status: TransactionStatus.COMPLETED,
                paymentMethod: 'CREDIT_CARD',
                transactionDate: new Date('2023-12-02'),
                createdAt: new Date()
            }
        ];

        it('should list transactions successfully with default pagination', async () => {
            // Arrange
            mockTransactionRepository.findMany.mockResolvedValue(mockTransactions);
            
            // Mock getTransactionCount method (since it's private, we need to simulate the behavior)
            const useCaseWithCount = useCase as any;
            useCaseWithCount.getTransactionCount = jest.fn().mockResolvedValue(2);

            // Act
            const result = await useCase.execute(validRequest);

            // Assert
            expect(mockTransactionRepository.findMany).toHaveBeenCalledWith(
                {
                    userId: 'user-123',
                    categoryId: undefined,
                    type: undefined,
                    dateFrom: undefined,
                    dateTo: undefined
                },
                {
                    page: 1,
                    limit: 20,
                    sortBy: 'transactionDate',
                    sortOrder: 'desc'
                }
            );

            expect(result.transactions).toHaveLength(2);
            expect(result.pagination.total).toBe(2);
            expect(result.pagination.page).toBe(1);
            expect(result.pagination.limit).toBe(20);
            expect(result.summary.totalIncome).toBe(1000);
            expect(result.summary.totalExpenses).toBe(500);
            expect(result.summary.netAmount).toBe(500);
            expect(result.summary.transactionCount).toBe(2);
        });

        it('should apply filters correctly', async () => {
            // Arrange
            const requestWithFilters: ListTransactionsUseCaseRequest = {
                ...validRequest,
                accountId: 'account-456',
                categoryId: 'category-789',
                type: TransactionType.EXPENSE,
                startDate: new Date('2023-12-01'),
                endDate: new Date('2023-12-31')
            };

            mockTransactionRepository.findMany.mockResolvedValue([]);
            const useCaseWithCount = useCase as any;
            useCaseWithCount.getTransactionCount = jest.fn().mockResolvedValue(0);

            // Act
            await useCase.execute(requestWithFilters);

            // Assert
            expect(mockTransactionRepository.findMany).toHaveBeenCalledWith(
                {
                    userId: 'user-123',
                    categoryId: 'category-789',
                    type: TransactionType.EXPENSE,
                    dateFrom: new Date('2023-12-01'),
                    dateTo: new Date('2023-12-31')
                },
                expect.any(Object)
            );
        });

        it('should limit pagination to maximum 100 items per page', async () => {
            // Arrange
            const requestWithLargeLimit: ListTransactionsUseCaseRequest = {
                userId: 'user-123',
                pagination: {
                    page: 1,
                    limit: 200, // Above maximum
                    sortBy: 'transactionDate',
                    sortOrder: 'desc'
                }
            };

            mockTransactionRepository.findMany.mockResolvedValue([]);
            const useCaseWithCount = useCase as any;
            useCaseWithCount.getTransactionCount = jest.fn().mockResolvedValue(0);

            // Act
            await useCase.execute(requestWithLargeLimit);

            // Assert
            expect(mockTransactionRepository.findMany).toHaveBeenCalledWith(
                expect.any(Object),
                expect.objectContaining({
                    limit: 100 // Should be capped at 100
                })
            );
        });

        it('should calculate pagination correctly', async () => {
            // Arrange
            mockTransactionRepository.findMany.mockResolvedValue(mockTransactions);
            const useCaseWithCount = useCase as any;
            useCaseWithCount.getTransactionCount = jest.fn().mockResolvedValue(100); // Total 100 items

            const requestPage2: ListTransactionsUseCaseRequest = {
                ...validRequest,
                pagination: {
                    page: 2,
                    limit: 20,
                    sortBy: 'transactionDate',
                    sortOrder: 'desc'
                }
            };

            // Act
            const result = await useCase.execute(requestPage2);

            // Assert
            expect(result.pagination.total).toBe(100);
            expect(result.pagination.totalPages).toBe(5);
            expect(result.pagination.hasNext).toBe(true);
            expect(result.pagination.hasPrev).toBe(true);
        });

        it('should throw ValidationException when userId is missing', async () => {
            // Arrange
            const invalidRequest = { ...validRequest, userId: '' };

            // Act & Assert
            await expect(useCase.execute(invalidRequest)).rejects.toThrow(ValidationException);
        });

        it('should throw ValidationException when invalid transaction type', async () => {
            // Arrange
            const invalidRequest = { 
                ...validRequest, 
                type: 'INVALID_TYPE' as TransactionType 
            };

            // Act & Assert
            await expect(useCase.execute(invalidRequest)).rejects.toThrow(ValidationException);
        });

        it('should throw ValidationException when start date is after end date', async () => {
            // Arrange
            const invalidRequest: ListTransactionsUseCaseRequest = {
                ...validRequest,
                startDate: new Date('2023-12-31'),
                endDate: new Date('2023-12-01') // Before start date
            };

            // Act & Assert
            await expect(useCase.execute(invalidRequest)).rejects.toThrow(ValidationException);
        });

        it('should correct page when less than 1', async () => {
            // Arrange
            const requestWithInvalidPage: ListTransactionsUseCaseRequest = {
                userId: 'user-123',
                pagination: {
                    page: 0,
                    limit: 20,
                    sortBy: 'transactionDate',
                    sortOrder: 'desc'
                }
            };

            mockTransactionRepository.findMany.mockResolvedValue([]);
            const useCaseWithCount = useCase as any;
            useCaseWithCount.getTransactionCount = jest.fn().mockResolvedValue(0);

            // Act
            const result = await useCase.execute(requestWithInvalidPage);

            // Assert
            expect(result.pagination.page).toBe(1); // Should be corrected to 1
            expect(mockTransactionRepository.findMany).toHaveBeenCalledWith(
                expect.any(Object),
                expect.objectContaining({
                    page: 1
                })
            );
        });

        it('should correct limit when out of bounds', async () => {
            // Arrange
            const requestWithInvalidLimit: ListTransactionsUseCaseRequest = {
                userId: 'user-123',
                pagination: {
                    page: 1,
                    limit: 0, // Below minimum
                    sortBy: 'transactionDate',
                    sortOrder: 'desc'
                }
            };

            mockTransactionRepository.findMany.mockResolvedValue([]);
            const useCaseWithCount = useCase as any;
            useCaseWithCount.getTransactionCount = jest.fn().mockResolvedValue(0);

            // Act
            await useCase.execute(requestWithInvalidLimit);

            // Assert - the limit should be corrected to minimum of 1 in the repository call
            expect(mockTransactionRepository.findMany).toHaveBeenCalledWith(
                expect.any(Object),
                expect.objectContaining({
                    limit: 1
                })
            );
        });

        it('should throw ValidationException when too many tags in filter', async () => {
            // Arrange
            const tooManyTags = Array.from({ length: 15 }, (_, i) => `tag-${i}`);
            const invalidRequest: ListTransactionsUseCaseRequest = {
                ...validRequest,
                tags: tooManyTags
            };

            // Act & Assert
            await expect(useCase.execute(invalidRequest)).rejects.toThrow(ValidationException);
        });

        it('should throw BusinessException when repository fails', async () => {
            // Arrange
            mockTransactionRepository.findMany.mockRejectedValue(new Error('Database error'));

            // Act & Assert
            await expect(useCase.execute(validRequest)).rejects.toThrow(BusinessException);
        });

        it('should calculate summary with only income transactions', async () => {
            // Arrange
            const incomeOnlyTransactions = [
                {
                    ...mockTransactions[0],
                    type: TransactionType.INCOME,
                    amount_value: 1000
                },
                {
                    ...mockTransactions[1],
                    type: TransactionType.INCOME,
                    amount_value: 2000
                }
            ];

            mockTransactionRepository.findMany.mockResolvedValue(incomeOnlyTransactions);
            const useCaseWithCount = useCase as any;
            useCaseWithCount.getTransactionCount = jest.fn().mockResolvedValue(2);

            // Act
            const result = await useCase.execute(validRequest);

            // Assert
            expect(result.summary.totalIncome).toBe(3000);
            expect(result.summary.totalExpenses).toBe(0);
            expect(result.summary.netAmount).toBe(3000);
        });

        it('should calculate summary with transfer transactions (neutral)', async () => {
            // Arrange
            const transferTransactions = [
                {
                    ...mockTransactions[0],
                    type: TransactionType.TRANSFER,
                    amount_value: 500,
                    destination_account_id: 'destination-account-123'
                }
            ];

            mockTransactionRepository.findMany.mockResolvedValue(transferTransactions);
            const useCaseWithCount = useCase as any;
            useCaseWithCount.getTransactionCount = jest.fn().mockResolvedValue(1);

            // Act
            const result = await useCase.execute(validRequest);

            // Assert
            expect(result.summary.totalIncome).toBe(0);
            expect(result.summary.totalExpenses).toBe(0);
            expect(result.summary.netAmount).toBe(0); // Transfers are neutral
            expect(result.summary.transactionCount).toBe(1);
        });

        it('should handle empty results', async () => {
            // Arrange
            mockTransactionRepository.findMany.mockResolvedValue([]);
            const useCaseWithCount = useCase as any;
            useCaseWithCount.getTransactionCount = jest.fn().mockResolvedValue(0);

            // Act
            const result = await useCase.execute(validRequest);

            // Assert
            expect(result.transactions).toHaveLength(0);
            expect(result.pagination.total).toBe(0);
            expect(result.pagination.totalPages).toBe(0);
            expect(result.pagination.hasNext).toBe(false);
            expect(result.pagination.hasPrev).toBe(false);
            expect(result.summary.totalIncome).toBe(0);
            expect(result.summary.totalExpenses).toBe(0);
            expect(result.summary.netAmount).toBe(0);
            expect(result.summary.transactionCount).toBe(0);
        });

        it('should use default pagination when not provided', async () => {
            // Arrange
            const requestWithoutPagination: ListTransactionsUseCaseRequest = {
                userId: 'user-123'
            };

            mockTransactionRepository.findMany.mockResolvedValue([]);
            const useCaseWithCount = useCase as any;
            useCaseWithCount.getTransactionCount = jest.fn().mockResolvedValue(0);

            // Act
            await useCase.execute(requestWithoutPagination);

            // Assert
            expect(mockTransactionRepository.findMany).toHaveBeenCalledWith(
                expect.any(Object),
                {
                    page: 1,
                    limit: 20,
                    sortBy: 'transactionDate',
                    sortOrder: 'desc'
                }
            );
        });
    });
});