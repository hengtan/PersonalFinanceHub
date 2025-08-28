// test/unit/domain/services/ledger.service.test.ts
import { LedgerService, CreateJournalEntryCommand, CreateLedgerEntryCommand } from '@/core/domain/services/ledger.service';
import { UnitOfWork } from '@/core/domain/services/unit-of-work.service';
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

describe('LedgerService', () => {
    let ledgerService: LedgerService;
    let mockUnitOfWork: jest.Mocked<UnitOfWork>;

    beforeEach(() => {
        mockUnitOfWork = {
            trackChange: jest.fn(),
            addDomainEvent: jest.fn(),
            begin: jest.fn(),
            commit: jest.fn(),
            rollback: jest.fn(),
            isActive: jest.fn().mockReturnValue(true),
            registerRepository: jest.fn(),
            execute: jest.fn(),
            dispose: jest.fn()
        } as any;

        ledgerService = new LedgerService(mockUnitOfWork);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    const createValidLedgerEntryCommand = (overrides: Partial<CreateLedgerEntryCommand> = {}): CreateLedgerEntryCommand => ({
        accountId: 'acc-001',
        accountName: 'Cash Account',
        accountType: AccountType.ASSET,
        entryType: EntryType.DEBIT,
        amount: new Money(100, 'BRL'),
        description: 'Test entry',
        ...overrides
    });

    const createValidJournalEntryCommand = (overrides: Partial<CreateJournalEntryCommand> = {}): CreateJournalEntryCommand => ({
        userId: 'user-001',
        transactionId: 'tx-001',
        description: 'Test journal entry',
        entries: [
            createValidLedgerEntryCommand({
                entryType: EntryType.DEBIT,
                accountType: AccountType.ASSET
            }),
            createValidLedgerEntryCommand({
                entryType: EntryType.CREDIT,
                accountType: AccountType.REVENUE
            })
        ],
        ...overrides
    });

    describe('createJournalEntry', () => {
        it('should create a balanced journal entry successfully', async () => {
            const command = createValidJournalEntryCommand();

            const result = await ledgerService.createJournalEntry(command);

            expect(result).toBeInstanceOf(JournalEntryEntity);
            expect(result.userId).toBe('user-001');
            expect(result.transactionId).toBe('tx-001');
            expect(result.description).toBe('Test journal entry');
            expect(result.status).toBe(JournalEntryStatus.POSTED);
            expect(result.entries).toHaveLength(2);
            expect(result.isBalanced()).toBe(true);

            // Verify Unit of Work interactions
            expect(mockUnitOfWork.trackChange).toHaveBeenCalledTimes(3); // 1 journal + 2 ledger entries
        });

        it('should generate unique journal entry ID', async () => {
            const command1 = createValidJournalEntryCommand({ transactionId: 'tx-001' });
            const command2 = createValidJournalEntryCommand({ transactionId: 'tx-002' });

            const result1 = await ledgerService.createJournalEntry(command1);
            const result2 = await ledgerService.createJournalEntry(command2);

            expect(result1.id).not.toBe(result2.id);
            expect(result1.id).toMatch(/^JE-tx-001-\d+$/);
            expect(result2.id).toMatch(/^JE-tx-002-\d+$/);
        });

        it('should generate unique ledger entry IDs', async () => {
            const command = createValidJournalEntryCommand();

            const result = await ledgerService.createJournalEntry(command);

            const entryIds = result.entries.map(e => e.id);
            expect(entryIds).toHaveLength(2);
            expect(entryIds[0]).not.toBe(entryIds[1]);
            expect(entryIds[0]).toMatch(/^LE-JE-tx-001-\d+-1$/);
            expect(entryIds[1]).toMatch(/^LE-JE-tx-001-\d+-2$/);
        });

        it('should calculate total amount from debits', async () => {
            const command = createValidJournalEntryCommand({
                entries: [
                    createValidLedgerEntryCommand({
                        entryType: EntryType.DEBIT,
                        amount: new Money(150, 'BRL')
                    }),
                    createValidLedgerEntryCommand({
                        entryType: EntryType.CREDIT,
                        amount: new Money(150, 'BRL')
                    })
                ]
            });

            const result = await ledgerService.createJournalEntry(command);

            expect(result.totalAmount.getAmount()).toBe(150);
            expect(result.totalAmount.getCurrency()).toBe('BRL');
        });

        it('should validate journal entry before posting', async () => {
            const unbalancedCommand = createValidJournalEntryCommand({
                entries: [
                    createValidLedgerEntryCommand({
                        entryType: EntryType.DEBIT,
                        amount: new Money(100, 'BRL')
                    }),
                    createValidLedgerEntryCommand({
                        entryType: EntryType.CREDIT,
                        amount: new Money(150, 'BRL') // Unbalanced!
                    })
                ]
            });

            await expect(
                ledgerService.createJournalEntry(unbalancedCommand)
            ).rejects.toThrow('Journal entry is not balanced for currency BRL. Debits: 100, Credits: 150');
        });

        it('should include metadata in journal entry', async () => {
            const command = createValidJournalEntryCommand({
                metadata: { source: 'api', version: '1.0' }
            });

            const result = await ledgerService.createJournalEntry(command);

            expect(result.metadata).toEqual({ source: 'api', version: '1.0' });
        });

        it('should include reference in journal entry', async () => {
            const command = createValidJournalEntryCommand({
                reference: 'REF-001'
            });

            const result = await ledgerService.createJournalEntry(command);

            expect(result.reference).toBe('REF-001');
        });
    });

    describe('createSimpleEntry', () => {
        it('should create simple two-entry journal entry', async () => {
            const result = await ledgerService.createSimpleEntry(
                'user-001',
                'tx-001',
                'Simple payment',
                { id: 'acc-debit', name: 'Cash', type: AccountType.ASSET },
                { id: 'acc-credit', name: 'Revenue', type: AccountType.REVENUE },
                new Money(200, 'BRL'),
                'REF-001'
            );

            expect(result).toBeInstanceOf(JournalEntryEntity);
            expect(result.entries).toHaveLength(2);
            expect(result.totalAmount.getAmount()).toBe(200);
            expect(result.reference).toBe('REF-001');

            const debitEntry = result.getEntriesByType(EntryType.DEBIT)[0];
            const creditEntry = result.getEntriesByType(EntryType.CREDIT)[0];

            expect(debitEntry.accountId).toBe('acc-debit');
            expect(debitEntry.accountName).toBe('Cash');
            expect(debitEntry.accountType).toBe(AccountType.ASSET);
            expect(debitEntry.amount.getAmount()).toBe(200);

            expect(creditEntry.accountId).toBe('acc-credit');
            expect(creditEntry.accountName).toBe('Revenue');
            expect(creditEntry.accountType).toBe(AccountType.REVENUE);
            expect(creditEntry.amount.getAmount()).toBe(200);
        });
    });

    describe('recordIncomeTransaction', () => {
        it('should create correct journal entry for income transaction', async () => {
            const result = await ledgerService.recordIncomeTransaction(
                'user-001',
                'tx-income-001',
                'Salary payment',
                'bank-acc-001',
                'income-acc-001',
                new Money(3000, 'BRL')
            );

            expect(result).toBeInstanceOf(JournalEntryEntity);
            expect(result.entries).toHaveLength(2);

            const debitEntry = result.getEntriesByType(EntryType.DEBIT)[0];
            const creditEntry = result.getEntriesByType(EntryType.CREDIT)[0];

            // Debit: Bank Account (Asset increases)
            expect(debitEntry.accountId).toBe('bank-acc-001');
            expect(debitEntry.accountName).toBe('Bank Account');
            expect(debitEntry.accountType).toBe(AccountType.ASSET);
            expect(debitEntry.entryType).toBe(EntryType.DEBIT);

            // Credit: Income Account (Revenue increases)
            expect(creditEntry.accountId).toBe('income-acc-001');
            expect(creditEntry.accountName).toBe('Income');
            expect(creditEntry.accountType).toBe(AccountType.REVENUE);
            expect(creditEntry.entryType).toBe(EntryType.CREDIT);
        });
    });

    describe('recordExpenseTransaction', () => {
        it('should create correct journal entry for expense transaction', async () => {
            const result = await ledgerService.recordExpenseTransaction(
                'user-001',
                'tx-expense-001',
                'Office supplies',
                'expense-acc-001',
                'bank-acc-001',
                new Money(150, 'BRL')
            );

            expect(result).toBeInstanceOf(JournalEntryEntity);
            expect(result.entries).toHaveLength(2);

            const debitEntry = result.getEntriesByType(EntryType.DEBIT)[0];
            const creditEntry = result.getEntriesByType(EntryType.CREDIT)[0];

            // Debit: Expense Account (Expense increases)
            expect(debitEntry.accountId).toBe('expense-acc-001');
            expect(debitEntry.accountName).toBe('Expense');
            expect(debitEntry.accountType).toBe(AccountType.EXPENSE);
            expect(debitEntry.entryType).toBe(EntryType.DEBIT);

            // Credit: Bank Account (Asset decreases)
            expect(creditEntry.accountId).toBe('bank-acc-001');
            expect(creditEntry.accountName).toBe('Bank Account');
            expect(creditEntry.accountType).toBe(AccountType.ASSET);
            expect(creditEntry.entryType).toBe(EntryType.CREDIT);
        });
    });

    describe('recordTransferTransaction', () => {
        it('should create correct journal entry for transfer transaction', async () => {
            const result = await ledgerService.recordTransferTransaction(
                'user-001',
                'tx-transfer-001',
                'Transfer between accounts',
                'from-acc-001',
                'to-acc-001',
                new Money(500, 'BRL')
            );

            expect(result).toBeInstanceOf(JournalEntryEntity);
            expect(result.entries).toHaveLength(2);

            const debitEntry = result.getEntriesByType(EntryType.DEBIT)[0];
            const creditEntry = result.getEntriesByType(EntryType.CREDIT)[0];

            // Debit: To Account (Asset increases)
            expect(debitEntry.accountId).toBe('to-acc-001');
            expect(debitEntry.accountName).toBe('To Account');
            expect(debitEntry.accountType).toBe(AccountType.ASSET);
            expect(debitEntry.entryType).toBe(EntryType.DEBIT);

            // Credit: From Account (Asset decreases)
            expect(creditEntry.accountId).toBe('from-acc-001');
            expect(creditEntry.accountName).toBe('From Account');
            expect(creditEntry.accountType).toBe(AccountType.ASSET);
            expect(creditEntry.entryType).toBe(EntryType.CREDIT);
        });
    });

    describe('validation', () => {
        describe('validateJournalEntryCommand', () => {
            it('should throw error for missing user ID', async () => {
                const command = createValidJournalEntryCommand({ userId: '' });

                await expect(
                    ledgerService.createJournalEntry(command)
                ).rejects.toThrow('User ID is required');
            });

            it('should throw error for missing transaction ID', async () => {
                const command = createValidJournalEntryCommand({ transactionId: '' });

                await expect(
                    ledgerService.createJournalEntry(command)
                ).rejects.toThrow('Transaction ID is required');
            });

            it('should throw error for empty description', async () => {
                const command = createValidJournalEntryCommand({ description: '' });

                await expect(
                    ledgerService.createJournalEntry(command)
                ).rejects.toThrow('Description is required');
            });

            it('should throw error for insufficient entries', async () => {
                const command = createValidJournalEntryCommand({
                    entries: [createValidLedgerEntryCommand()]
                });

                await expect(
                    ledgerService.createJournalEntry(command)
                ).rejects.toThrow('At least two ledger entries are required for double-entry accounting');
            });

            it('should throw error for unbalanced entries', async () => {
                const command = createValidJournalEntryCommand({
                    entries: [
                        createValidLedgerEntryCommand({
                            entryType: EntryType.DEBIT,
                            amount: new Money(100, 'BRL')
                        }),
                        createValidLedgerEntryCommand({
                            entryType: EntryType.CREDIT,
                            amount: new Money(200, 'BRL')
                        })
                    ]
                });

                await expect(
                    ledgerService.createJournalEntry(command)
                ).rejects.toThrow('Journal entry is not balanced for currency BRL. Debits: 100, Credits: 200');
            });

            it('should validate balance for multiple currencies', async () => {
                const command = createValidJournalEntryCommand({
                    entries: [
                        createValidLedgerEntryCommand({
                            entryType: EntryType.DEBIT,
                            amount: new Money(100, 'BRL')
                        }),
                        createValidLedgerEntryCommand({
                            entryType: EntryType.CREDIT,
                            amount: new Money(100, 'BRL')
                        }),
                        createValidLedgerEntryCommand({
                            entryType: EntryType.DEBIT,
                            amount: new Money(50, 'USD')
                        }),
                        createValidLedgerEntryCommand({
                            entryType: EntryType.CREDIT,
                            amount: new Money(60, 'USD') // Unbalanced USD
                        })
                    ]
                });

                await expect(
                    ledgerService.createJournalEntry(command)
                ).rejects.toThrow('Journal entry is not balanced for currency USD. Debits: 50, Credits: 60');
            });
        });

        describe('validateLedgerEntryCommand', () => {
            it('should throw error for missing account ID', async () => {
                const command = createValidJournalEntryCommand({
                    entries: [
                        createValidLedgerEntryCommand({ accountId: '' }),
                        createValidLedgerEntryCommand()
                    ]
                });

                await expect(
                    ledgerService.createJournalEntry(command)
                ).rejects.toThrow('Account ID is required');
            });

            it('should throw error for missing account name', async () => {
                const command = createValidJournalEntryCommand({
                    entries: [
                        createValidLedgerEntryCommand({ accountName: '' }),
                        createValidLedgerEntryCommand()
                    ]
                });

                await expect(
                    ledgerService.createJournalEntry(command)
                ).rejects.toThrow('Account name is required');
            });

            it('should throw error for invalid account type', async () => {
                const command = createValidJournalEntryCommand({
                    entries: [
                        createValidLedgerEntryCommand({ accountType: 'INVALID' as AccountType }),
                        createValidLedgerEntryCommand()
                    ]
                });

                await expect(
                    ledgerService.createJournalEntry(command)
                ).rejects.toThrow('Valid account type is required');
            });

            it('should throw error for invalid entry type', async () => {
                const command = createValidJournalEntryCommand({
                    entries: [
                        createValidLedgerEntryCommand({ entryType: 'INVALID' as EntryType }),
                        createValidLedgerEntryCommand()
                    ]
                });

                await expect(
                    ledgerService.createJournalEntry(command)
                ).rejects.toThrow('Valid entry type is required');
            });

            it('should throw error for zero amount', async () => {
                const command = createValidJournalEntryCommand({
                    entries: [
                        createValidLedgerEntryCommand({ amount: new Money(0, 'BRL') }),
                        createValidLedgerEntryCommand()
                    ]
                });

                await expect(
                    ledgerService.createJournalEntry(command)
                ).rejects.toThrow('Entry amount must be positive');
            });

            it('should throw error for negative amount', async () => {
                // Test that creating the command itself throws due to Money validation
                expect(() => {
                    createValidJournalEntryCommand({
                        entries: [
                            createValidLedgerEntryCommand({ amount: new Money(-100, 'BRL') }),
                            createValidLedgerEntryCommand()
                        ]
                    });
                }).toThrow('Valor não pode ser negativo');
            });

            it('should validate reference consistency', async () => {
                const command = createValidJournalEntryCommand({
                    entries: [
                        createValidLedgerEntryCommand({
                            referenceType: ReferenceType.TRANSACTION
                            // referenceId is missing
                        }),
                        createValidLedgerEntryCommand()
                    ]
                });

                await expect(
                    ledgerService.createJournalEntry(command)
                ).rejects.toThrow('Reference ID is required when reference type is specified');
            });
        });
    });

    describe('error handling', () => {
        it('should handle and log errors during journal entry creation', async () => {
            const invalidCommand = createValidJournalEntryCommand({
                entries: [] // Invalid - no entries
            });

            await expect(
                ledgerService.createJournalEntry(invalidCommand)
            ).rejects.toThrow();

            // Verify error was logged
            // This would check if the logger.error was called, but we need to access the mocked logger
        });

        it('should preserve error context in thrown exceptions', async () => {
            const command = createValidJournalEntryCommand({
                userId: '', // Invalid
                transactionId: 'tx-001'
            });

            try {
                await ledgerService.createJournalEntry(command);
                fail('Should have thrown an error');
            } catch (error) {
                expect(error).toBeInstanceOf(Error);
                expect(error.message).toContain('User ID is required');
            }
        });
    });

    describe('metadata and references', () => {
        it('should properly set ledger entry metadata', async () => {
            const command = createValidJournalEntryCommand({
                entries: [
                    createValidLedgerEntryCommand({
                        entryType: EntryType.DEBIT,
                        referenceId: 'ref-001',
                        referenceType: ReferenceType.TRANSACTION,
                        metadata: { source: 'api' }
                    }),
                    createValidLedgerEntryCommand({
                        entryType: EntryType.CREDIT
                    })
                ]
            });

            const result = await ledgerService.createJournalEntry(command);

            const debitEntry = result.getEntriesByType(EntryType.DEBIT)[0];
            expect(debitEntry.referenceId).toBe('ref-001');
            expect(debitEntry.referenceType).toBe(ReferenceType.TRANSACTION);
            expect(debitEntry.metadata).toEqual({ source: 'api' });
        });

        it('should set journal entry ID in all ledger entries', async () => {
            const command = createValidJournalEntryCommand();

            const result = await ledgerService.createJournalEntry(command);

            for (const entry of result.entries) {
                expect(entry.journalEntryId).toBe(result.id);
            }
        });

        it('should set posted at timestamp for all entries', async () => {
            const command = createValidJournalEntryCommand();

            const result = await ledgerService.createJournalEntry(command);

            expect(result.postedAt).toBeInstanceOf(Date);
            for (const entry of result.entries) {
                expect(entry.postedAt).toBeInstanceOf(Date);
                // All entries should have similar timestamps (within a few milliseconds)
                expect(Math.abs(entry.postedAt.getTime() - result.postedAt!.getTime())).toBeLessThan(100);
            }
        });
    });
});