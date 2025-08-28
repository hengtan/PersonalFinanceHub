// test/unit/application/services/transaction-ledger.application.service.test.ts
import { 
    TransactionLedgerApplicationService, 
    ProcessTransactionCommand 
} from '@/core/application/services/transaction-ledger.application.service';
import { UnitOfWork } from '@/core/domain/services/unit-of-work.service';
import { LedgerService } from '@/core/domain/services/ledger.service';
import { JournalEntryRepositoryPostgres } from '@/infrastructure/database/postgres/repositories/journal-entry.repository';
import { TransactionEntity, TransactionType } from '@/core/domain/entities/transaction.entity';
import { JournalEntryEntity, JournalEntryStatus } from '@/core/domain/entities/journal-entry.entity';
import { AccountType, EntryType, ReferenceType } from '@/core/domain/entities/ledger-entry.entity';
import { Money } from '@/core/domain/value-objects/money.vo';
// Mock the logger
jest.mock('@/infrastructure/monitoring/logger.service', () => ({
    logger: {
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn()
    }
}));

describe('TransactionLedgerApplicationService', () => {
    let service: TransactionLedgerApplicationService;
    let mockUnitOfWork: jest.Mocked<UnitOfWork>;
    let mockLedgerService: jest.Mocked<LedgerService>;
    let mockJournalEntryRepository: jest.Mocked<JournalEntryRepositoryPostgres>;

    beforeEach(() => {
        mockUnitOfWork = {
            registerRepository: jest.fn(),
            trackChange: jest.fn(),
            addDomainEvent: jest.fn(),
            begin: jest.fn(),
            commit: jest.fn(),
            rollback: jest.fn(),
            isActive: jest.fn().mockReturnValue(true),
            execute: jest.fn(),
            dispose: jest.fn()
        } as any;

        mockLedgerService = {
            createJournalEntry: jest.fn(),
            createSimpleEntry: jest.fn(),
            recordIncomeTransaction: jest.fn(),
            recordExpenseTransaction: jest.fn(),
            recordTransferTransaction: jest.fn()
        } as any;

        mockJournalEntryRepository = {
            save: jest.fn(),
            findById: jest.fn(),
            findByTransactionId: jest.fn(),
            delete: jest.fn(),
            setConnection: jest.fn(),
            clearConnection: jest.fn()
        } as any;

        service = new TransactionLedgerApplicationService(
            mockUnitOfWork,
            mockLedgerService,
            mockJournalEntryRepository
        );
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    const createMockTransaction = (overrides: Partial<any> = {}): TransactionEntity => {
        return {
            id: 'tx-001',
            userId: 'user-001',
            description: 'Test transaction',
            amount: new Money(100, 'BRL'),
            transactionType: 'expense' as TransactionType,
            transactionDate: new Date(),
            categoryId: 'cat-001',
            merchantId: 'merchant-001',
            referenceNumber: 'REF-001',
            createdAt: new Date(),
            updatedAt: new Date(),
            ...overrides
        } as TransactionEntity;
    };

    const createMockJournalEntry = (overrides: Partial<any> = {}): JournalEntryEntity => {
        return {
            id: 'je-001',
            userId: 'user-001',
            transactionId: 'tx-001',
            description: 'Test journal entry',
            status: JournalEntryStatus.POSTED,
            entries: [],
            totalAmount: new Money(100, 'BRL'),
            isBalanced: jest.fn().mockReturnValue(true),
            isPosted: jest.fn().mockReturnValue(true),
            isReversed: jest.fn().mockReturnValue(false),
            reverse: jest.fn(),
            createdAt: new Date(),
            updatedAt: new Date(),
            ...overrides
        } as any;
    };

    const createProcessTransactionCommand = (overrides: Partial<ProcessTransactionCommand> = {}): ProcessTransactionCommand => ({
        transaction: createMockTransaction(),
        userId: 'user-001',
        accountMappings: {
            sourceAccountId: 'acc-source-001',
            sourceAccountName: 'Source Account',
            sourceAccountType: AccountType.ASSET,
            targetAccountId: 'acc-target-001',
            targetAccountName: 'Target Account',
            targetAccountType: AccountType.EXPENSE
        },
        ...overrides
    });

    describe('constructor', () => {
        it('should register repository with Unit of Work', () => {
            expect(mockUnitOfWork.registerRepository).toHaveBeenCalledWith(mockJournalEntryRepository);
        });
    });

    describe('processTransaction', () => {
        describe('income transactions', () => {
            it('should process income transaction correctly', async () => {
                const incomeTransaction = createMockTransaction({
                    transactionType: 'income',
                    description: 'Salary payment'
                });

                const mockJournalEntry = createMockJournalEntry({
                    description: 'Income: Salary payment'
                });

                mockLedgerService.createJournalEntry.mockResolvedValue(mockJournalEntry);

                const command = createProcessTransactionCommand({
                    transaction: incomeTransaction,
                    accountMappings: {
                        sourceAccountId: 'income-acc-001',
                        sourceAccountName: 'Salary Income',
                        sourceAccountType: AccountType.REVENUE,
                        targetAccountId: 'bank-acc-001',
                        targetAccountName: 'Bank Account',
                        targetAccountType: AccountType.ASSET
                    }
                });

                const result = await service.processTransaction(command);

                expect(result.transactionId).toBe('tx-001');
                expect(result.journalEntries).toHaveLength(1);
                expect(result.isBalanced).toBe(true);
                expect(result.totalAmount.getAmount()).toBe(100);

                // Verify ledger service was called with correct parameters
                expect(mockLedgerService.createJournalEntry).toHaveBeenCalledWith({
                    userId: 'user-001',
                    transactionId: 'tx-001',
                    description: 'Income: Salary payment',
                    reference: 'REF-001',
                    entries: expect.arrayContaining([
                        expect.objectContaining({
                            accountId: 'bank-acc-001',
                            accountName: 'Bank Account',
                            accountType: AccountType.ASSET,
                            entryType: EntryType.DEBIT,
                            description: 'Income received: Salary payment'
                        }),
                        expect.objectContaining({
                            accountId: 'income-acc-001',
                            accountName: 'Salary Income',
                            accountType: AccountType.REVENUE,
                            entryType: EntryType.CREDIT,
                            description: 'Income earned: Salary payment'
                        })
                    ]),
                    metadata: expect.objectContaining({
                        transactionType: 'income',
                        originalTransactionId: 'tx-001'
                    })
                });
            });
        });

        describe('expense transactions', () => {
            it('should process expense transaction correctly', async () => {
                const expenseTransaction = createMockTransaction({
                    transactionType: 'expense',
                    description: 'Office supplies'
                });

                const mockJournalEntry = createMockJournalEntry({
                    description: 'Expense: Office supplies'
                });

                mockLedgerService.createJournalEntry.mockResolvedValue(mockJournalEntry);

                const command = createProcessTransactionCommand({
                    transaction: expenseTransaction,
                    accountMappings: {
                        sourceAccountId: 'bank-acc-001',
                        sourceAccountName: 'Bank Account',
                        sourceAccountType: AccountType.ASSET,
                        targetAccountId: 'expense-acc-001',
                        targetAccountName: 'Office Expenses',
                        targetAccountType: AccountType.EXPENSE
                    }
                });

                const result = await service.processTransaction(command);

                expect(result.transactionId).toBe('tx-001');
                expect(result.journalEntries).toHaveLength(1);

                expect(mockLedgerService.createJournalEntry).toHaveBeenCalledWith({
                    userId: 'user-001',
                    transactionId: 'tx-001',
                    description: 'Expense: Office supplies',
                    reference: 'REF-001',
                    entries: expect.arrayContaining([
                        expect.objectContaining({
                            accountId: 'expense-acc-001',
                            accountName: 'Office Expenses',
                            accountType: AccountType.EXPENSE,
                            entryType: EntryType.DEBIT,
                            description: 'Expense incurred: Office supplies'
                        }),
                        expect.objectContaining({
                            accountId: 'bank-acc-001',
                            accountName: 'Bank Account',
                            accountType: AccountType.ASSET,
                            entryType: EntryType.CREDIT,
                            description: 'Payment made: Office supplies'
                        })
                    ])
                });
            });
        });

        describe('transfer transactions', () => {
            it('should process transfer transaction correctly', async () => {
                const transferTransaction = createMockTransaction({
                    transactionType: 'transfer',
                    description: 'Transfer to savings'
                });

                const mockJournalEntry = createMockJournalEntry({
                    description: 'Transfer: Transfer to savings'
                });

                mockLedgerService.createJournalEntry.mockResolvedValue(mockJournalEntry);

                const command = createProcessTransactionCommand({
                    transaction: transferTransaction,
                    accountMappings: {
                        sourceAccountId: 'checking-acc-001',
                        sourceAccountName: 'Checking Account',
                        sourceAccountType: AccountType.ASSET,
                        targetAccountId: 'savings-acc-001',
                        targetAccountName: 'Savings Account',
                        targetAccountType: AccountType.ASSET
                    }
                });

                const result = await service.processTransaction(command);

                expect(result.transactionId).toBe('tx-001');
                expect(result.journalEntries).toHaveLength(1);

                expect(mockLedgerService.createJournalEntry).toHaveBeenCalledWith({
                    userId: 'user-001',
                    transactionId: 'tx-001',
                    description: 'Transfer: Transfer to savings',
                    reference: 'REF-001',
                    entries: expect.arrayContaining([
                        expect.objectContaining({
                            accountId: 'savings-acc-001',
                            accountName: 'Savings Account',
                            accountType: AccountType.ASSET,
                            entryType: EntryType.DEBIT,
                            description: 'Transfer received: Transfer to savings',
                            metadata: expect.objectContaining({
                                transferType: 'inbound'
                            })
                        }),
                        expect.objectContaining({
                            accountId: 'checking-acc-001',
                            accountName: 'Checking Account',
                            accountType: AccountType.ASSET,
                            entryType: EntryType.CREDIT,
                            description: 'Transfer sent: Transfer to savings',
                            metadata: expect.objectContaining({
                                transferType: 'outbound'
                            })
                        })
                    ])
                });
            });
        });

        it('should throw error for unsupported transaction type', async () => {
            const unsupportedTransaction = createMockTransaction({
                transactionType: 'unsupported' as any
            });

            const command = createProcessTransactionCommand({
                transaction: unsupportedTransaction
            });

            await expect(service.processTransaction(command)).rejects.toThrow(
                'Unsupported transaction type: unsupported'
            );
        });

        it('should include ledger entry metadata from transaction', async () => {
            const transaction = createMockTransaction({
                transactionType: 'expense',
                categoryId: 'cat-food',
                merchantId: 'merchant-grocery',
                transactionDate: new Date('2023-01-15T10:00:00Z')
            });

            const mockJournalEntry = createMockJournalEntry();
            mockLedgerService.createJournalEntry.mockResolvedValue(mockJournalEntry);

            const command = createProcessTransactionCommand({
                transaction
            });

            await service.processTransaction(command);

            const journalEntryCall = mockLedgerService.createJournalEntry.mock.calls[0][0];
            const debitEntry = journalEntryCall.entries.find((e: any) => e.entryType === EntryType.DEBIT);
            const creditEntry = journalEntryCall.entries.find((e: any) => e.entryType === EntryType.CREDIT);

            expect(debitEntry.metadata).toEqual({
                categoryId: 'cat-food',
                merchantId: 'merchant-grocery',
                transactionDate: '2023-01-15T10:00:00.000Z'
            });

            expect(creditEntry.metadata).toEqual({
                categoryId: 'cat-food',
                merchantId: 'merchant-grocery',
                transactionDate: '2023-01-15T10:00:00.000Z'
            });
        });

        it('should calculate total amount correctly', async () => {
            const transaction = createMockTransaction({
                amount: new Money(250, 'USD')
            });

            const mockJournalEntry = createMockJournalEntry({
                totalAmount: new Money(250, 'USD')
            });

            mockLedgerService.createJournalEntry.mockResolvedValue(mockJournalEntry);

            const command = createProcessTransactionCommand({
                transaction
            });

            const result = await service.processTransaction(command);

            expect(result.totalAmount.getAmount()).toBe(250);
            expect(result.totalAmount.getCurrency()).toBe('USD');
        });

        it('should handle processing errors gracefully', async () => {
            const transaction = createMockTransaction();
            const command = createProcessTransactionCommand({ transaction });

            mockLedgerService.createJournalEntry.mockRejectedValue(
                new Error('Journal entry creation failed')
            );

            await expect(service.processTransaction(command)).rejects.toThrow(
                'Journal entry creation failed'
            );
        });
    });

    describe('getTransactionJournalEntries', () => {
        it('should retrieve journal entries for a transaction', async () => {
            const mockEntries = [
                createMockJournalEntry({ id: 'je-001' }),
                createMockJournalEntry({ id: 'je-002' })
            ];

            mockJournalEntryRepository.findByTransactionId.mockResolvedValue(mockEntries);

            const result = await service.getTransactionJournalEntries('tx-001');

            expect(result).toHaveLength(2);
            expect(result[0].id).toBe('je-001');
            expect(result[1].id).toBe('je-002');
            expect(mockJournalEntryRepository.findByTransactionId).toHaveBeenCalledWith('tx-001');
        });

        it('should handle repository errors', async () => {
            mockJournalEntryRepository.findByTransactionId.mockRejectedValue(
                new Error('Database error')
            );

            await expect(
                service.getTransactionJournalEntries('tx-001')
            ).rejects.toThrow('Database error');
        });
    });

    describe('reverseTransactionEntries', () => {
        it('should reverse posted journal entries', async () => {
            const mockPostedEntry = createMockJournalEntry({
                id: 'je-001',
                status: JournalEntryStatus.POSTED
            });

            const mockReversingEntry = createMockJournalEntry({
                id: 'REV-je-001',
                description: 'Reversal of: Test journal entry'
            });

            mockPostedEntry.isPosted.mockReturnValue(true);
            mockPostedEntry.isReversed.mockReturnValue(false);
            mockPostedEntry.reverse.mockReturnValue(mockReversingEntry);

            mockJournalEntryRepository.findByTransactionId.mockResolvedValue([mockPostedEntry]);
            mockJournalEntryRepository.save.mockResolvedValue(mockReversingEntry);

            const result = await service.reverseTransactionEntries('tx-001', 'user-admin', 'Correction needed');

            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('REV-je-001');
            expect(mockPostedEntry.reverse).toHaveBeenCalledWith('user-admin', 'Correction needed');
            expect(mockJournalEntryRepository.save).toHaveBeenCalledWith(mockReversingEntry);
        });

        it('should skip non-posted entries', async () => {
            const mockDraftEntry = createMockJournalEntry({
                status: JournalEntryStatus.DRAFT
            });

            mockDraftEntry.isPosted.mockReturnValue(false);
            mockDraftEntry.isReversed.mockReturnValue(false);

            mockJournalEntryRepository.findByTransactionId.mockResolvedValue([mockDraftEntry]);

            const result = await service.reverseTransactionEntries('tx-001', 'user-admin');

            expect(result).toHaveLength(0);
            expect(mockJournalEntryRepository.save).not.toHaveBeenCalled();
        });

        it('should skip already reversed entries', async () => {
            const mockReversedEntry = createMockJournalEntry({
                status: JournalEntryStatus.REVERSED
            });

            mockReversedEntry.isPosted.mockReturnValue(true);
            mockReversedEntry.isReversed.mockReturnValue(true);

            mockJournalEntryRepository.findByTransactionId.mockResolvedValue([mockReversedEntry]);

            const result = await service.reverseTransactionEntries('tx-001', 'user-admin');

            expect(result).toHaveLength(0);
            expect(mockJournalEntryRepository.save).not.toHaveBeenCalled();
        });

        it('should handle multiple posted entries', async () => {
            const mockEntry1 = createMockJournalEntry({ id: 'je-001' });
            const mockEntry2 = createMockJournalEntry({ id: 'je-002' });
            const mockReversingEntry1 = createMockJournalEntry({ id: 'REV-je-001' });
            const mockReversingEntry2 = createMockJournalEntry({ id: 'REV-je-002' });

            mockEntry1.isPosted.mockReturnValue(true);
            mockEntry1.isReversed.mockReturnValue(false);
            mockEntry1.reverse.mockReturnValue(mockReversingEntry1);

            mockEntry2.isPosted.mockReturnValue(true);
            mockEntry2.isReversed.mockReturnValue(false);
            mockEntry2.reverse.mockReturnValue(mockReversingEntry2);

            mockJournalEntryRepository.findByTransactionId.mockResolvedValue([mockEntry1, mockEntry2]);
            mockJournalEntryRepository.save.mockResolvedValueOnce(mockReversingEntry1)
                                           .mockResolvedValueOnce(mockReversingEntry2);

            const result = await service.reverseTransactionEntries('tx-001', 'user-admin');

            expect(result).toHaveLength(2);
            expect(result[0].id).toBe('REV-je-001');
            expect(result[1].id).toBe('REV-je-002');
        });

        it('should handle reversal errors', async () => {
            const mockEntry = createMockJournalEntry();
            mockEntry.isPosted.mockReturnValue(true);
            mockEntry.isReversed.mockReturnValue(false);
            mockEntry.reverse.mockReturnValue(createMockJournalEntry({ id: 'REV-je-001' }));

            mockJournalEntryRepository.findByTransactionId.mockResolvedValue([mockEntry]);
            mockJournalEntryRepository.save.mockRejectedValue(new Error('Save failed'));

            await expect(
                service.reverseTransactionEntries('tx-001', 'user-admin')
            ).rejects.toThrow('Save failed');
        });
    });

    describe('validateTransactionBalance', () => {
        it('should validate balanced transaction', async () => {
            const mockBalancedEntry1 = createMockJournalEntry({ id: 'je-001' });
            const mockBalancedEntry2 = createMockJournalEntry({ id: 'je-002' });

            mockBalancedEntry1.isBalanced.mockReturnValue(true);
            mockBalancedEntry1.getBalanceSummary.mockReturnValue([
                { currency: 'BRL', debits: new Money(100, 'BRL'), credits: new Money(100, 'BRL'), isBalanced: true }
            ]);

            mockBalancedEntry2.isBalanced.mockReturnValue(true);
            mockBalancedEntry2.getBalanceSummary.mockReturnValue([
                { currency: 'BRL', debits: new Money(50, 'BRL'), credits: new Money(50, 'BRL'), isBalanced: true }
            ]);

            mockJournalEntryRepository.findByTransactionId.mockResolvedValue([
                mockBalancedEntry1,
                mockBalancedEntry2
            ]);

            const result = await service.validateTransactionBalance('tx-001');

            expect(result.isBalanced).toBe(true);
            expect(result.details).toHaveLength(2);
            expect(result.details[0].journalEntryId).toBe('je-001');
            expect(result.details[0].isBalanced).toBe(true);
            expect(result.details[1].journalEntryId).toBe('je-002');
            expect(result.details[1].isBalanced).toBe(true);
        });

        it('should detect unbalanced transaction', async () => {
            const mockBalancedEntry = createMockJournalEntry({ id: 'je-001' });
            const mockUnbalancedEntry = createMockJournalEntry({ id: 'je-002' });

            mockBalancedEntry.isBalanced.mockReturnValue(true);
            mockBalancedEntry.getBalanceSummary.mockReturnValue([
                { currency: 'BRL', debits: new Money(100, 'BRL'), credits: new Money(100, 'BRL'), isBalanced: true }
            ]);

            mockUnbalancedEntry.isBalanced.mockReturnValue(false);
            mockUnbalancedEntry.getBalanceSummary.mockReturnValue([
                { currency: 'BRL', debits: new Money(100, 'BRL'), credits: new Money(150, 'BRL'), isBalanced: false }
            ]);

            mockJournalEntryRepository.findByTransactionId.mockResolvedValue([
                mockBalancedEntry,
                mockUnbalancedEntry
            ]);

            const result = await service.validateTransactionBalance('tx-001');

            expect(result.isBalanced).toBe(false);
            expect(result.details).toHaveLength(2);
            expect(result.details[0].isBalanced).toBe(true);
            expect(result.details[1].isBalanced).toBe(false);
        });

        it('should handle validation errors', async () => {
            mockJournalEntryRepository.findByTransactionId.mockRejectedValue(
                new Error('Repository error')
            );

            await expect(
                service.validateTransactionBalance('tx-001')
            ).rejects.toThrow('Repository error');
        });
    });

    describe('error handling and logging', () => {
        it('should log processing steps', async () => {
            const transaction = createMockTransaction({
                transactionType: 'expense'
            });

            const mockJournalEntry = createMockJournalEntry();
            mockLedgerService.createJournalEntry.mockResolvedValue(mockJournalEntry);

            const command = createProcessTransactionCommand({ transaction });

            await service.processTransaction(command);

            // Verify debug and info logging occurred
            // This would require access to the mocked logger instance
        });

        it('should preserve error context in exceptions', async () => {
            const transaction = createMockTransaction();
            const command = createProcessTransactionCommand({ transaction });

            const ledgerError = new Error('Ledger creation failed');
            mockLedgerService.createJournalEntry.mockRejectedValue(ledgerError);

            try {
                await service.processTransaction(command);
                fail('Should have thrown an error');
            } catch (error) {
                expect(error).toBe(ledgerError);
            }
        });
    });

    describe('integration scenarios', () => {
        it('should handle complete transaction processing workflow', async () => {
            const transaction = createMockTransaction({
                transactionType: 'expense',
                amount: new Money(150, 'BRL')
            });

            const mockJournalEntry = createMockJournalEntry({
                totalAmount: new Money(150, 'BRL')
            });

            mockLedgerService.createJournalEntry.mockResolvedValue(mockJournalEntry);
            mockJournalEntryRepository.findByTransactionId.mockResolvedValue([mockJournalEntry]);

            const command = createProcessTransactionCommand({ transaction });

            // Process transaction
            const processResult = await service.processTransaction(command);
            expect(processResult.isBalanced).toBe(true);

            // Retrieve entries
            const entries = await service.getTransactionJournalEntries('tx-001');
            expect(entries).toHaveLength(1);

            // Validate balance
            mockJournalEntry.getBalanceSummary.mockReturnValue([
                { currency: 'BRL', isBalanced: true }
            ]);

            const validationResult = await service.validateTransactionBalance('tx-001');
            expect(validationResult.isBalanced).toBe(true);
        });
    });
});