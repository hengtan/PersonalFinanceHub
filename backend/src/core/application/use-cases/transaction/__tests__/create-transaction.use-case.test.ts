// backend/src/core/application/use-cases/transaction/__tests__/create-transaction.use-case.test.ts
import { CreateTransactionUseCase, CreateTransactionUseCaseRequest } from '../create-transaction.use-case';
import { TransactionRepository } from '../../../../domain/repositories/transaction.repository';
import { TransactionType, PaymentMethod } from '../../../../domain/entities/transaction.entity';
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

describe('CreateTransactionUseCase', () => {
    let useCase: CreateTransactionUseCase;

    beforeEach(() => {
        useCase = new CreateTransactionUseCase(mockTransactionRepository);
        jest.clearAllMocks();
    });

    describe('execute', () => {
        const validRequest: CreateTransactionUseCaseRequest = {
            userId: 'user-123',
            accountId: 'account-456',
            categoryId: 'category-789',
            description: 'Test transaction',
            amount: 100.50,
            currency: 'BRL',
            type: TransactionType.EXPENSE,
            paymentMethod: PaymentMethod.CREDIT_CARD,
            tags: ['test', 'expense'],
            notes: 'Test notes'
        };

        it('should create a transaction successfully', async () => {
            // Arrange
            const mockCreatedTransaction = {
                id: 'transaction-123',
                userId: 'user-123',
                accountId: 'account-456',
                categoryId: 'category-789',
                description: 'Test transaction',
                amount: 100.50,
                currency: 'BRL',
                type: TransactionType.EXPENSE,
                status: 'PENDING',
                paymentMethod: PaymentMethod.CREDIT_CARD,
                createdAt: new Date()
            };

            mockTransactionRepository.create.mockResolvedValue(mockCreatedTransaction);

            // Act
            const result = await useCase.execute(validRequest);

            // Assert
            expect(mockTransactionRepository.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    userId: 'user-123',
                    accountId: 'account-456',
                    description: 'Test transaction',
                    amount: expect.objectContaining({
                        amount: 100.50,
                        currency: 'BRL'
                    }),
                    type: TransactionType.EXPENSE,
                    paymentMethod: PaymentMethod.CREDIT_CARD
                })
            );

            expect(result).toEqual({
                transaction: expect.any(Object),
                message: 'Transaction created successfully'
            });
        });

        it('should throw ValidationException when userId is missing', async () => {
            // Arrange
            const invalidRequest = { ...validRequest, userId: '' };

            // Act & Assert
            await expect(useCase.execute(invalidRequest)).rejects.toThrow(ValidationException);
        });

        it('should throw ValidationException when accountId is missing', async () => {
            // Arrange
            const invalidRequest = { ...validRequest, accountId: '' };

            // Act & Assert
            await expect(useCase.execute(invalidRequest)).rejects.toThrow(ValidationException);
        });

        it('should throw ValidationException when description is missing', async () => {
            // Arrange
            const invalidRequest = { ...validRequest, description: '' };

            // Act & Assert
            await expect(useCase.execute(invalidRequest)).rejects.toThrow(ValidationException);
        });

        it('should throw ValidationException when amount is zero or negative', async () => {
            // Arrange
            const invalidRequest = { ...validRequest, amount: 0 };

            // Act & Assert
            await expect(useCase.execute(invalidRequest)).rejects.toThrow(ValidationException);
        });

        it('should throw ValidationException when transfer type missing destination account', async () => {
            // Arrange
            const invalidRequest = {
                ...validRequest,
                type: TransactionType.TRANSFER,
                destinationAccountId: undefined
            };

            // Act & Assert
            await expect(useCase.execute(invalidRequest)).rejects.toThrow(ValidationException);
        });

        it('should throw ValidationException when transfer has same source and destination', async () => {
            // Arrange
            const invalidRequest = {
                ...validRequest,
                type: TransactionType.TRANSFER,
                destinationAccountId: 'account-456' // Same as accountId
            };

            // Act & Assert
            await expect(useCase.execute(invalidRequest)).rejects.toThrow(ValidationException);
        });

        it('should throw ValidationException when due date is before transaction date', async () => {
            // Arrange
            const today = new Date();
            const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
            
            const invalidRequest = {
                ...validRequest,
                transactionDate: today,
                dueDate: yesterday
            };

            // Act & Assert
            await expect(useCase.execute(invalidRequest)).rejects.toThrow(ValidationException);
        });

        it('should throw ValidationException when too many tags', async () => {
            // Arrange
            const tooManyTags = Array.from({ length: 25 }, (_, i) => `tag-${i}`);
            const invalidRequest = { ...validRequest, tags: tooManyTags };

            // Act & Assert
            await expect(useCase.execute(invalidRequest)).rejects.toThrow(ValidationException);
        });

        it('should throw ValidationException when description is too long', async () => {
            // Arrange
            const longDescription = 'x'.repeat(501);
            const invalidRequest = { ...validRequest, description: longDescription };

            // Act & Assert
            await expect(useCase.execute(invalidRequest)).rejects.toThrow(ValidationException);
        });

        it('should throw ValidationException when notes are too long', async () => {
            // Arrange
            const longNotes = 'x'.repeat(1001);
            const invalidRequest = { ...validRequest, notes: longNotes };

            // Act & Assert
            await expect(useCase.execute(invalidRequest)).rejects.toThrow(ValidationException);
        });

        it('should throw BusinessException when repository fails', async () => {
            // Arrange
            mockTransactionRepository.create.mockRejectedValue(new Error('Database error'));

            // Act & Assert
            await expect(useCase.execute(validRequest)).rejects.toThrow(BusinessException);
        });

        it('should create income transaction with correct defaults', async () => {
            // Arrange
            const incomeRequest = {
                ...validRequest,
                type: TransactionType.INCOME,
                paymentMethod: PaymentMethod.PIX
            };

            mockTransactionRepository.create.mockResolvedValue({
                id: 'income-123',
                ...incomeRequest
            });

            // Act
            const result = await useCase.execute(incomeRequest);

            // Assert
            expect(mockTransactionRepository.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: TransactionType.INCOME,
                    paymentMethod: PaymentMethod.PIX
                })
            );
        });

        it('should create transfer transaction successfully', async () => {
            // Arrange
            const transferRequest = {
                ...validRequest,
                type: TransactionType.TRANSFER,
                destinationAccountId: 'destination-account-789'
            };

            mockTransactionRepository.create.mockResolvedValue({
                id: 'transfer-123',
                ...transferRequest
            });

            // Act
            const result = await useCase.execute(transferRequest);

            // Assert
            expect(mockTransactionRepository.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: TransactionType.TRANSFER,
                    destinationAccountId: 'destination-account-789'
                })
            );
        });

        it('should use default currency when not provided', async () => {
            // Arrange
            const requestWithoutCurrency = {
                ...validRequest,
                currency: undefined
            };

            mockTransactionRepository.create.mockResolvedValue({
                id: 'transaction-123',
                ...requestWithoutCurrency
            });

            // Act
            await useCase.execute(requestWithoutCurrency);

            // Assert
            expect(mockTransactionRepository.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    amount: expect.objectContaining({
                        currency: 'BRL' // Default currency
                    })
                })
            );
        });

        it('should use current date when transaction date not provided', async () => {
            // Arrange
            const requestWithoutDate = {
                ...validRequest,
                transactionDate: undefined
            };

            mockTransactionRepository.create.mockResolvedValue({
                id: 'transaction-123',
                ...requestWithoutDate
            });

            const beforeExecution = new Date();

            // Act
            await useCase.execute(requestWithoutDate);

            // Assert
            const createCall = mockTransactionRepository.create.mock.calls[0][0];
            const transactionDate = createCall.transactionDate;
            
            expect(transactionDate).toBeInstanceOf(Date);
            expect(transactionDate.getTime()).toBeGreaterThanOrEqual(beforeExecution.getTime());
        });
    });
});