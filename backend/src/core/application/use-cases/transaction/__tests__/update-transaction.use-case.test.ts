// backend/src/core/application/use-cases/transaction/__tests__/update-transaction.use-case.test.ts
import { UpdateTransactionUseCase, UpdateTransactionUseCaseRequest } from '../update-transaction.use-case';
import { TransactionRepository } from '../../../../domain/repositories/transaction.repository';
import { TransactionType, TransactionStatus, PaymentMethod } from '../../../../domain/entities/transaction.entity';
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

describe('UpdateTransactionUseCase', () => {
    let useCase: UpdateTransactionUseCase;

    beforeEach(() => {
        useCase = new UpdateTransactionUseCase(mockTransactionRepository);
        jest.clearAllMocks();
    });

    describe('execute', () => {
        const existingTransaction = {
            id: 'transaction-123',
            userId: 'user-123',
            accountId: 'account-456',
            categoryId: 'category-789',
            description: 'Original description',
            amount_value: 100.50,
            amount_currency: 'BRL',
            type: TransactionType.EXPENSE,
            status: TransactionStatus.PENDING,
            paymentMethod: PaymentMethod.CREDIT_CARD,
            transactionDate: new Date('2023-12-01'),
            isPaid: false,
            tags: ['original'],
            notes: 'Original notes',
            createdAt: new Date(),
            updatedAt: new Date()
        };

        const validRequest: UpdateTransactionUseCaseRequest = {
            transactionId: 'transaction-123',
            userId: 'user-123',
            description: 'Updated description',
            amount: 200.00,
            paymentMethod: PaymentMethod.PIX,
            tags: ['updated', 'test'],
            notes: 'Updated notes'
        };

        it('should update transaction successfully', async () => {
            // Arrange
            const updatedTransaction = {
                ...existingTransaction,
                description: 'Updated description',
                amount_value: 200.00,
                paymentMethod: PaymentMethod.PIX,
                tags: ['updated', 'test'],
                notes: 'Updated notes',
                updatedAt: new Date()
            };

            mockTransactionRepository.findById.mockResolvedValue(existingTransaction);
            mockTransactionRepository.update.mockResolvedValue(updatedTransaction);

            // Act
            const result = await useCase.execute(validRequest);

            // Assert
            expect(mockTransactionRepository.findById).toHaveBeenCalledWith('transaction-123');
            expect(mockTransactionRepository.update).toHaveBeenCalledWith(
                'transaction-123',
                expect.objectContaining({
                    description: 'Updated description',
                    amount: 200.00,
                    paymentMethod: PaymentMethod.PIX,
                    tags: ['updated', 'test'],
                    notes: 'Updated notes'
                })
            );

            expect(result.transaction).toBeDefined();
            expect(result.message).toBe('Transaction updated successfully');
        });

        it('should throw BusinessException when transaction not found', async () => {
            // Arrange
            mockTransactionRepository.findById.mockResolvedValue(null);

            // Act & Assert
            await expect(useCase.execute(validRequest)).rejects.toThrow(
                new BusinessException('Transaction not found', 'TRANSACTION_NOT_FOUND', 404)
            );
        });

        it('should throw BusinessException when transaction does not belong to user', async () => {
            // Arrange
            const otherUserTransaction = {
                ...existingTransaction,
                userId: 'other-user-456'
            };

            mockTransactionRepository.findById.mockResolvedValue(otherUserTransaction);

            // Act & Assert
            await expect(useCase.execute(validRequest)).rejects.toThrow(
                new BusinessException('Transaction does not belong to user', 'TRANSACTION_NOT_OWNED', 403)
            );
        });

        it('should throw BusinessException when trying to update cancelled transaction', async () => {
            // Arrange
            const cancelledTransaction = {
                ...existingTransaction,
                status: TransactionStatus.CANCELLED
            };

            mockTransactionRepository.findById.mockResolvedValue(cancelledTransaction);

            // Act & Assert
            await expect(useCase.execute(validRequest)).rejects.toThrow(
                new BusinessException('Cannot update cancelled transaction', 'TRANSACTION_CANCELLED', 400)
            );
        });

        it('should throw BusinessException when trying to update completed and paid transaction', async () => {
            // Arrange
            const completedTransaction = {
                ...existingTransaction,
                status: TransactionStatus.COMPLETED,
                isPaid: true
            };

            mockTransactionRepository.findById.mockResolvedValue(completedTransaction);

            // Act & Assert
            await expect(useCase.execute(validRequest)).rejects.toThrow(
                new BusinessException('Cannot update completed and paid transaction', 'TRANSACTION_COMPLETED', 400)
            );
        });

        it('should allow updating completed but unpaid transaction', async () => {
            // Arrange
            const completedUnpaidTransaction = {
                ...existingTransaction,
                status: TransactionStatus.COMPLETED,
                isPaid: false
            };

            const updatedTransaction = {
                ...completedUnpaidTransaction,
                description: 'Updated description'
            };

            mockTransactionRepository.findById.mockResolvedValue(completedUnpaidTransaction);
            mockTransactionRepository.update.mockResolvedValue(updatedTransaction);

            // Act
            const result = await useCase.execute(validRequest);

            // Assert
            expect(result.transaction).toBeDefined();
            expect(result.message).toBe('Transaction updated successfully');
        });

        it('should throw ValidationException when transactionId is missing', async () => {
            // Arrange
            const invalidRequest = { ...validRequest, transactionId: '' };

            // Act & Assert
            await expect(useCase.execute(invalidRequest)).rejects.toThrow(ValidationException);
        });

        it('should throw ValidationException when userId is missing', async () => {
            // Arrange
            const invalidRequest = { ...validRequest, userId: '' };

            // Act & Assert
            await expect(useCase.execute(invalidRequest)).rejects.toThrow(ValidationException);
        });

        it('should throw ValidationException when description is empty', async () => {
            // Arrange
            const invalidRequest = { ...validRequest, description: '  ' };

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

        it('should throw ValidationException when amount is zero or negative', async () => {
            // Arrange
            const invalidRequest = { ...validRequest, amount: 0 };

            // Act & Assert
            await expect(useCase.execute(invalidRequest)).rejects.toThrow(ValidationException);
        });

        it('should throw ValidationException when invalid payment method', async () => {
            // Arrange
            const invalidRequest = { 
                ...validRequest, 
                paymentMethod: 'INVALID_METHOD' as PaymentMethod 
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

        it('should throw ValidationException when notes are too long', async () => {
            // Arrange
            const longNotes = 'x'.repeat(1001);
            const invalidRequest = { ...validRequest, notes: longNotes };

            // Act & Assert
            await expect(useCase.execute(invalidRequest)).rejects.toThrow(ValidationException);
        });

        it('should throw BusinessException when repository update fails', async () => {
            // Arrange
            mockTransactionRepository.findById.mockResolvedValue(existingTransaction);
            mockTransactionRepository.update.mockResolvedValue(null);

            // Act & Assert
            await expect(useCase.execute(validRequest)).rejects.toThrow(
                new BusinessException('Failed to update transaction', 'TRANSACTION_UPDATE_FAILED', 500)
            );
        });

        it('should throw BusinessException when repository throws error', async () => {
            // Arrange
            mockTransactionRepository.findById.mockResolvedValue(existingTransaction);
            mockTransactionRepository.update.mockRejectedValue(new Error('Database error'));

            // Act & Assert
            await expect(useCase.execute(validRequest)).rejects.toThrow(BusinessException);
        });

        it('should update only provided fields', async () => {
            // Arrange
            const partialUpdateRequest: UpdateTransactionUseCaseRequest = {
                transactionId: 'transaction-123',
                userId: 'user-123',
                description: 'Only description updated'
            };

            const updatedTransaction = {
                ...existingTransaction,
                description: 'Only description updated'
            };

            mockTransactionRepository.findById.mockResolvedValue(existingTransaction);
            mockTransactionRepository.update.mockResolvedValue(updatedTransaction);

            // Act
            await useCase.execute(partialUpdateRequest);

            // Assert
            expect(mockTransactionRepository.update).toHaveBeenCalledWith(
                'transaction-123',
                expect.objectContaining({
                    description: 'Only description updated',
                    updatedAt: expect.any(Date)
                })
            );

            // Verify other fields are not included in update
            const updateCall = mockTransactionRepository.update.mock.calls[0][1];
            expect(updateCall).not.toHaveProperty('amount');
            expect(updateCall).not.toHaveProperty('paymentMethod');
            expect(updateCall).not.toHaveProperty('tags');
        });

        it('should handle currency update with amount', async () => {
            // Arrange
            const requestWithCurrency: UpdateTransactionUseCaseRequest = {
                ...validRequest,
                amount: 300.00,
                currency: 'USD'
            };

            const updatedTransaction = {
                ...existingTransaction,
                amount_value: 300.00,
                amount_currency: 'USD'
            };

            mockTransactionRepository.findById.mockResolvedValue(existingTransaction);
            mockTransactionRepository.update.mockResolvedValue(updatedTransaction);

            // Act
            await useCase.execute(requestWithCurrency);

            // Assert
            expect(mockTransactionRepository.update).toHaveBeenCalledWith(
                'transaction-123',
                expect.objectContaining({
                    amount: 300.00,
                    currency: 'USD'
                })
            );
        });

        it('should trim description whitespace', async () => {
            // Arrange
            const requestWithWhitespace: UpdateTransactionUseCaseRequest = {
                ...validRequest,
                description: '  Trimmed description  '
            };

            const updatedTransaction = {
                ...existingTransaction,
                description: 'Trimmed description'
            };

            mockTransactionRepository.findById.mockResolvedValue(existingTransaction);
            mockTransactionRepository.update.mockResolvedValue(updatedTransaction);

            // Act
            await useCase.execute(requestWithWhitespace);

            // Assert
            expect(mockTransactionRepository.update).toHaveBeenCalledWith(
                'transaction-123',
                expect.objectContaining({
                    description: 'Trimmed description'
                })
            );
        });

        it('should update transaction date and due date correctly', async () => {
            // Arrange
            const newTransactionDate = new Date('2023-12-15');
            const newDueDate = new Date('2023-12-20');

            const requestWithDates: UpdateTransactionUseCaseRequest = {
                ...validRequest,
                transactionDate: newTransactionDate,
                dueDate: newDueDate
            };

            const updatedTransaction = {
                ...existingTransaction,
                transactionDate: newTransactionDate,
                dueDate: newDueDate
            };

            mockTransactionRepository.findById.mockResolvedValue(existingTransaction);
            mockTransactionRepository.update.mockResolvedValue(updatedTransaction);

            // Act
            await useCase.execute(requestWithDates);

            // Assert
            expect(mockTransactionRepository.update).toHaveBeenCalledWith(
                'transaction-123',
                expect.objectContaining({
                    transactionDate: newTransactionDate,
                    dueDate: newDueDate
                })
            );
        });

        it('should update metadata correctly', async () => {
            // Arrange
            const metadata = { customField: 'value', number: 123 };
            const requestWithMetadata: UpdateTransactionUseCaseRequest = {
                ...validRequest,
                metadata
            };

            const updatedTransaction = {
                ...existingTransaction,
                metadata
            };

            mockTransactionRepository.findById.mockResolvedValue(existingTransaction);
            mockTransactionRepository.update.mockResolvedValue(updatedTransaction);

            // Act
            await useCase.execute(requestWithMetadata);

            // Assert
            expect(mockTransactionRepository.update).toHaveBeenCalledWith(
                'transaction-123',
                expect.objectContaining({
                    metadata
                })
            );
        });
    });
});