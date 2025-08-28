// test/unit/domain/entities/ledger-entry.entity.test.ts
import { LedgerEntryEntity, AccountType, EntryType, ReferenceType } from '@/core/domain/entities/ledger-entry.entity';
import { Money } from '@/core/domain/value-objects/money.vo';

describe('LedgerEntryEntity', () => {
    const validLedgerEntryProps = {
        id: 'le-001',
        transactionId: 'tx-001',
        accountId: 'acc-001',
        accountName: 'Cash Account',
        accountType: AccountType.ASSET,
        entryType: EntryType.DEBIT,
        amount: new Money(100, 'BRL'),
        description: 'Test payment',
        journalEntryId: 'je-001',
        postedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
    };

    describe('constructor', () => {
        it('should create a valid ledger entry', () => {
            const entry = new LedgerEntryEntity(validLedgerEntryProps);

            expect(entry.id).toBe('le-001');
            expect(entry.accountId).toBe('acc-001');
            expect(entry.accountName).toBe('Cash Account');
            expect(entry.accountType).toBe(AccountType.ASSET);
            expect(entry.entryType).toBe(EntryType.DEBIT);
            expect(entry.amount.getAmount()).toBe(100);
            expect(entry.description).toBe('Test payment');
        });

        it('should throw error for missing ID', () => {
            expect(() => {
                new LedgerEntryEntity({
                    ...validLedgerEntryProps,
                    id: ''
                });
            }).toThrow('Ledger entry ID is required');
        });

        it('should throw error for missing transaction ID', () => {
            expect(() => {
                new LedgerEntryEntity({
                    ...validLedgerEntryProps,
                    transactionId: ''
                });
            }).toThrow('Transaction ID is required');
        });

        it('should throw error for missing account ID', () => {
            expect(() => {
                new LedgerEntryEntity({
                    ...validLedgerEntryProps,
                    accountId: ''
                });
            }).toThrow('Account ID is required');
        });

        it('should throw error for invalid account type', () => {
            expect(() => {
                new LedgerEntryEntity({
                    ...validLedgerEntryProps,
                    accountType: 'INVALID' as AccountType
                });
            }).toThrow('Valid account type is required');
        });

        it('should throw error for invalid entry type', () => {
            expect(() => {
                new LedgerEntryEntity({
                    ...validLedgerEntryProps,
                    entryType: 'INVALID' as EntryType
                });
            }).toThrow('Valid entry type is required');
        });

        it('should throw error for zero amount', () => {
            expect(() => {
                new LedgerEntryEntity({
                    ...validLedgerEntryProps,
                    amount: new Money(0, 'BRL')
                });
            }).toThrow('Amount must be positive');
        });

        it('should throw error for negative amount', () => {
            expect(() => {
                new LedgerEntryEntity({
                    ...validLedgerEntryProps,
                    amount: new Money(-100, 'BRL')
                });
            }).toThrow('Valor não pode ser negativo');
        });

        it('should validate reference consistency - missing reference ID', () => {
            expect(() => {
                new LedgerEntryEntity({
                    ...validLedgerEntryProps,
                    referenceType: ReferenceType.TRANSACTION
                    // referenceId is missing
                });
            }).toThrow('Reference ID is required when reference type is specified');
        });

        it('should validate reference consistency - missing reference type', () => {
            expect(() => {
                new LedgerEntryEntity({
                    ...validLedgerEntryProps,
                    referenceId: 'ref-001'
                    // referenceType is missing
                });
            }).toThrow('Reference type is required when reference ID is specified');
        });
    });

    describe('business logic methods', () => {
        it('should correctly identify debit entries', () => {
            const debitEntry = new LedgerEntryEntity({
                ...validLedgerEntryProps,
                entryType: EntryType.DEBIT
            });

            expect(debitEntry.isDebit()).toBe(true);
            expect(debitEntry.isCredit()).toBe(false);
        });

        it('should correctly identify credit entries', () => {
            const creditEntry = new LedgerEntryEntity({
                ...validLedgerEntryProps,
                entryType: EntryType.CREDIT
            });

            expect(creditEntry.isCredit()).toBe(true);
            expect(creditEntry.isDebit()).toBe(false);
        });

        describe('getSignedAmount', () => {
            it('should return positive amount for debit in asset account', () => {
                const entry = new LedgerEntryEntity({
                    ...validLedgerEntryProps,
                    accountType: AccountType.ASSET,
                    entryType: EntryType.DEBIT,
                    amount: new Money(100, 'BRL')
                });

                const signedAmount = entry.getSignedAmount();
                expect(signedAmount.getAmount()).toBe(100);
            });

            it('should return negative amount for credit in asset account', () => {
                const entry = new LedgerEntryEntity({
                    ...validLedgerEntryProps,
                    accountType: AccountType.ASSET,
                    entryType: EntryType.CREDIT,
                    amount: new Money(100, 'BRL')
                });

                const signedAmount = entry.getSignedAmount();
                expect(signedAmount.getAmount()).toBe(-100);
            });

            it('should return positive amount for debit in expense account', () => {
                const entry = new LedgerEntryEntity({
                    ...validLedgerEntryProps,
                    accountType: AccountType.EXPENSE,
                    entryType: EntryType.DEBIT,
                    amount: new Money(100, 'BRL')
                });

                const signedAmount = entry.getSignedAmount();
                expect(signedAmount.getAmount()).toBe(100);
            });

            it('should return positive amount for credit in revenue account', () => {
                const entry = new LedgerEntryEntity({
                    ...validLedgerEntryProps,
                    accountType: AccountType.REVENUE,
                    entryType: EntryType.CREDIT,
                    amount: new Money(100, 'BRL')
                });

                const signedAmount = entry.getSignedAmount();
                expect(signedAmount.getAmount()).toBe(100);
            });

            it('should return negative amount for debit in liability account', () => {
                const entry = new LedgerEntryEntity({
                    ...validLedgerEntryProps,
                    accountType: AccountType.LIABILITY,
                    entryType: EntryType.DEBIT,
                    amount: new Money(100, 'BRL')
                });

                const signedAmount = entry.getSignedAmount();
                expect(signedAmount.getAmount()).toBe(-100);
            });

            it('should return positive amount for credit in equity account', () => {
                const entry = new LedgerEntryEntity({
                    ...validLedgerEntryProps,
                    accountType: AccountType.EQUITY,
                    entryType: EntryType.CREDIT,
                    amount: new Money(100, 'BRL')
                });

                const signedAmount = entry.getSignedAmount();
                expect(signedAmount.getAmount()).toBe(100);
            });
        });

        describe('balancesWith', () => {
            it('should return true for entries with equal opposite signed amounts', () => {
                const debitEntry = new LedgerEntryEntity({
                    ...validLedgerEntryProps,
                    id: 'le-debit',
                    accountType: AccountType.ASSET,
                    entryType: EntryType.DEBIT,
                    amount: new Money(100, 'BRL')
                });

                const creditEntry = new LedgerEntryEntity({
                    ...validLedgerEntryProps,
                    id: 'le-credit',
                    accountType: AccountType.ASSET,
                    entryType: EntryType.CREDIT,
                    amount: new Money(100, 'BRL')
                });

                expect(debitEntry.balancesWith(creditEntry)).toBe(true);
            });

            it('should return false for entries with different amounts', () => {
                const debitEntry = new LedgerEntryEntity({
                    ...validLedgerEntryProps,
                    id: 'le-debit',
                    accountType: AccountType.ASSET,
                    entryType: EntryType.DEBIT,
                    amount: new Money(100, 'BRL')
                });

                const creditEntry = new LedgerEntryEntity({
                    ...validLedgerEntryProps,
                    id: 'le-credit',
                    accountType: AccountType.ASSET,
                    entryType: EntryType.CREDIT,
                    amount: new Money(150, 'BRL')
                });

                expect(debitEntry.balancesWith(creditEntry)).toBe(false);
            });

            it('should return false for entries with different currencies', () => {
                const debitEntry = new LedgerEntryEntity({
                    ...validLedgerEntryProps,
                    id: 'le-debit',
                    entryType: EntryType.DEBIT,
                    amount: new Money(100, 'BRL')
                });

                const creditEntry = new LedgerEntryEntity({
                    ...validLedgerEntryProps,
                    id: 'le-credit',
                    entryType: EntryType.CREDIT,
                    amount: new Money(100, 'USD')
                });

                expect(debitEntry.balancesWith(creditEntry)).toBe(false);
            });
        });

        describe('getOppositeEntryType', () => {
            it('should return CREDIT for DEBIT entry', () => {
                const debitEntry = new LedgerEntryEntity({
                    ...validLedgerEntryProps,
                    entryType: EntryType.DEBIT
                });

                expect(debitEntry.getOppositeEntryType()).toBe(EntryType.CREDIT);
            });

            it('should return DEBIT for CREDIT entry', () => {
                const creditEntry = new LedgerEntryEntity({
                    ...validLedgerEntryProps,
                    entryType: EntryType.CREDIT
                });

                expect(creditEntry.getOppositeEntryType()).toBe(EntryType.DEBIT);
            });
        });

        describe('createReversingEntry', () => {
            it('should create a reversing entry with opposite entry type', () => {
                const originalEntry = new LedgerEntryEntity({
                    ...validLedgerEntryProps,
                    entryType: EntryType.DEBIT,
                    description: 'Original entry'
                });

                const reversingEntry = originalEntry.createReversingEntry('je-rev-001', 'Reversal');

                expect(reversingEntry.entryType).toBe(EntryType.CREDIT);
                expect(reversingEntry.journalEntryId).toBe('je-rev-001');
                expect(reversingEntry.description).toBe('Reversal');
                expect(reversingEntry.amount.getAmount()).toBe(100);
                expect(reversingEntry.accountId).toBe('acc-001');
            });

            it('should use default reversal description if not provided', () => {
                const originalEntry = new LedgerEntryEntity({
                    ...validLedgerEntryProps,
                    description: 'Original entry'
                });

                const reversingEntry = originalEntry.createReversingEntry('je-rev-001');

                expect(reversingEntry.description).toBe('Reversal of: Original entry');
            });
        });

        describe('updateMetadata', () => {
            it('should update metadata and updatedAt timestamp', () => {
                const entry = new LedgerEntryEntity(validLedgerEntryProps);
                const originalUpdatedAt = entry.updatedAt;

                // Wait a bit to ensure timestamp difference
                setTimeout(() => {
                    entry.updateMetadata({ newField: 'value' });

                    expect(entry.metadata).toEqual({ newField: 'value' });
                    expect(entry.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
                }, 1);
            });

            it('should merge with existing metadata', () => {
                const entry = new LedgerEntryEntity({
                    ...validLedgerEntryProps,
                    metadata: { existingField: 'existing' }
                });

                entry.updateMetadata({ newField: 'value' });

                expect(entry.metadata).toEqual({
                    existingField: 'existing',
                    newField: 'value'
                });
            });
        });

        describe('matches', () => {
            const entry = new LedgerEntryEntity({
                ...validLedgerEntryProps,
                accountType: AccountType.ASSET,
                entryType: EntryType.DEBIT,
                amount: new Money(100, 'BRL'),
                referenceId: 'ref-001',
                referenceType: ReferenceType.TRANSACTION,
                postedAt: new Date('2023-01-15T10:00:00Z')
            });

            it('should match on account type', () => {
                expect(entry.matches({ accountType: AccountType.ASSET })).toBe(true);
                expect(entry.matches({ accountType: AccountType.LIABILITY })).toBe(false);
            });

            it('should match on entry type', () => {
                expect(entry.matches({ entryType: EntryType.DEBIT })).toBe(true);
                expect(entry.matches({ entryType: EntryType.CREDIT })).toBe(false);
            });

            it('should match on reference ID', () => {
                expect(entry.matches({ referenceId: 'ref-001' })).toBe(true);
                expect(entry.matches({ referenceId: 'ref-002' })).toBe(false);
            });

            it('should match on amount range', () => {
                expect(entry.matches({ amountRange: { min: 50, max: 150 } })).toBe(true);
                expect(entry.matches({ amountRange: { min: 150, max: 200 } })).toBe(false);
                expect(entry.matches({ amountRange: { min: 50 } })).toBe(true);
                expect(entry.matches({ amountRange: { max: 150 } })).toBe(true);
            });

            it('should match on date range', () => {
                const start = new Date('2023-01-01T00:00:00Z');
                const end = new Date('2023-01-31T23:59:59Z');

                expect(entry.matches({ dateRange: { start, end } })).toBe(true);
                expect(entry.matches({ dateRange: { start: new Date('2023-02-01T00:00:00Z') } })).toBe(false);
            });

            it('should match multiple criteria', () => {
                expect(entry.matches({
                    accountType: AccountType.ASSET,
                    entryType: EntryType.DEBIT,
                    amountRange: { min: 50, max: 150 }
                })).toBe(true);

                expect(entry.matches({
                    accountType: AccountType.ASSET,
                    entryType: EntryType.CREDIT, // This doesn't match
                    amountRange: { min: 50, max: 150 }
                })).toBe(false);
            });
        });
    });

    describe('toJSON', () => {
        it('should serialize to JSON correctly', () => {
            const entry = new LedgerEntryEntity({
                ...validLedgerEntryProps,
                referenceId: 'ref-001',
                referenceType: ReferenceType.TRANSACTION,
                metadata: { customField: 'value' }
            });

            const json = entry.toJSON();

            expect(json).toEqual({
                id: 'le-001',
                transactionId: 'tx-001',
                accountId: 'acc-001',
                accountName: 'Cash Account',
                accountType: AccountType.ASSET,
                entryType: EntryType.DEBIT,
                amount: entry.amount.toJSON(),
                description: 'Test payment',
                referenceId: 'ref-001',
                referenceType: ReferenceType.TRANSACTION,
                metadata: { customField: 'value' },
                journalEntryId: 'je-001',
                postedAt: entry.postedAt.toISOString(),
                createdAt: entry.createdAt.toISOString(),
                updatedAt: entry.updatedAt.toISOString()
            });
        });
    });
});