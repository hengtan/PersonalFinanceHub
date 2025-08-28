// test/unit/domain/entities/journal-entry.entity.test.ts
import { JournalEntryEntity, JournalEntryStatus } from '@/core/domain/entities/journal-entry.entity';
import { LedgerEntryEntity, AccountType, EntryType, ReferenceType } from '@/core/domain/entities/ledger-entry.entity';
import { Money } from '@/core/domain/value-objects/money.vo';

describe('JournalEntryEntity', () => {
    const createLedgerEntry = (overrides: Partial<any> = {}) => {
        return new LedgerEntryEntity({
            id: 'le-001',
            transactionId: 'tx-001',
            accountId: 'acc-001',
            accountName: 'Cash Account',
            accountType: AccountType.ASSET,
            entryType: EntryType.DEBIT,
            amount: new Money(100, 'BRL'),
            description: 'Test entry',
            journalEntryId: 'je-001',
            postedAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
            ...overrides
        });
    };

    const createBalancedLedgerEntries = () => {
        const debitEntry = createLedgerEntry({
            id: 'le-debit',
            entryType: EntryType.DEBIT,
            accountType: AccountType.ASSET,
            amount: new Money(100, 'BRL')
        });

        const creditEntry = createLedgerEntry({
            id: 'le-credit',
            entryType: EntryType.CREDIT,
            accountType: AccountType.REVENUE,
            amount: new Money(100, 'BRL')
        });

        return [debitEntry, creditEntry];
    };

    const createValidJournalEntryProps = () => ({
        id: 'je-001',
        userId: 'user-001',
        transactionId: 'tx-001',
        description: 'Test journal entry',
        status: JournalEntryStatus.DRAFT,
        entries: createBalancedLedgerEntries(),
        totalAmount: new Money(100, 'BRL'),
        createdAt: new Date(),
        updatedAt: new Date()
    });

    const validJournalEntryProps = createValidJournalEntryProps();

    describe('constructor', () => {
        it('should create a valid journal entry', () => {
            const entry = new JournalEntryEntity(validJournalEntryProps);

            expect(entry.id).toBe('je-001');
            expect(entry.userId).toBe('user-001');
            expect(entry.transactionId).toBe('tx-001');
            expect(entry.description).toBe('Test journal entry');
            expect(entry.status).toBe(JournalEntryStatus.DRAFT);
            expect(entry.entries).toHaveLength(2);
            expect(entry.totalAmount.getAmount()).toBe(100);
        });

        it('should throw error for missing ID', () => {
            expect(() => {
                new JournalEntryEntity({
                    ...validJournalEntryProps,
                    id: ''
                });
            }).toThrow('Journal entry ID is required');
        });

        it('should throw error for missing user ID', () => {
            expect(() => {
                new JournalEntryEntity({
                    ...validJournalEntryProps,
                    userId: ''
                });
            }).toThrow('User ID is required');
        });

        it('should throw error for missing transaction ID', () => {
            expect(() => {
                new JournalEntryEntity({
                    ...validJournalEntryProps,
                    transactionId: ''
                });
            }).toThrow('Transaction ID is required');
        });

        it('should throw error for empty description', () => {
            expect(() => {
                new JournalEntryEntity({
                    ...validJournalEntryProps,
                    description: ''
                });
            }).toThrow('Description is required');
        });

        it('should throw error for invalid status', () => {
            expect(() => {
                new JournalEntryEntity({
                    ...validJournalEntryProps,
                    status: 'INVALID' as JournalEntryStatus
                });
            }).toThrow('Valid status is required');
        });

        it('should throw error for negative total amount', () => {
            expect(() => {
                new JournalEntryEntity({
                    ...validJournalEntryProps,
                    totalAmount: new Money(-100, 'BRL')
                });
            }).toThrow('Valor não pode ser negativo');
        });

        it('should throw error for posted entry without posted date', () => {
            expect(() => {
                new JournalEntryEntity({
                    ...validJournalEntryProps,
                    status: JournalEntryStatus.POSTED
                    // postedAt is missing
                });
            }).toThrow('Posted journal entry must have posted date');
        });

        it('should throw error for reversed entry without reversed date', () => {
            expect(() => {
                new JournalEntryEntity({
                    ...validJournalEntryProps,
                    status: JournalEntryStatus.REVERSED
                    // reversedAt is missing
                });
            }).toThrow('Reversed journal entry must have reversed date');
        });
    });

    describe('entry management', () => {
        let journalEntry: JournalEntryEntity;

        beforeEach(() => {
            journalEntry = new JournalEntryEntity({
                ...validJournalEntryProps,
                entries: []
            });
        });

        describe('addEntry', () => {
            it('should add entry to draft journal entry', () => {
                const ledgerEntry = createLedgerEntry();
                
                journalEntry.addEntry(ledgerEntry);

                expect(journalEntry.entries).toHaveLength(1);
                expect(journalEntry.entries[0]).toBe(ledgerEntry);
            });

            it('should throw error when adding entry to posted journal entry', () => {
                const postedEntry = new JournalEntryEntity({
                    ...validJournalEntryProps,
                    status: JournalEntryStatus.POSTED,
                    postedAt: new Date()
                });

                const ledgerEntry = createLedgerEntry();

                expect(() => {
                    postedEntry.addEntry(ledgerEntry);
                }).toThrow('Cannot modify posted journal entry');
            });

            it('should throw error when adding entry to reversed journal entry', () => {
                const reversedEntry = new JournalEntryEntity({
                    ...validJournalEntryProps,
                    status: JournalEntryStatus.REVERSED,
                    reversedAt: new Date(),
                    reversedBy: 'user-001'
                });

                const ledgerEntry = createLedgerEntry();

                expect(() => {
                    reversedEntry.addEntry(ledgerEntry);
                }).toThrow('Cannot modify reversed journal entry');
            });
        });

        describe('removeEntry', () => {
            it('should remove entry from draft journal entry', () => {
                const ledgerEntry = createLedgerEntry();
                journalEntry.addEntry(ledgerEntry);

                journalEntry.removeEntry('le-001');

                expect(journalEntry.entries).toHaveLength(0);
            });

            it('should throw error when removing non-existent entry', () => {
                expect(() => {
                    journalEntry.removeEntry('non-existent');
                }).toThrow('Ledger entry non-existent not found');
            });

            it('should throw error when removing entry from posted journal entry', () => {
                const postedEntry = new JournalEntryEntity({
                    ...validJournalEntryProps,
                    status: JournalEntryStatus.POSTED,
                    postedAt: new Date()
                });

                expect(() => {
                    postedEntry.removeEntry('le-001');
                }).toThrow('Cannot modify posted journal entry');
            });
        });
    });

    describe('posting and status management', () => {
        describe('post', () => {
            it('should post a balanced draft journal entry', () => {
                const entry = new JournalEntryEntity(validJournalEntryProps);

                entry.post();

                expect(entry.status).toBe(JournalEntryStatus.POSTED);
                expect(entry.postedAt).toBeInstanceOf(Date);
            });

            it('should throw error when posting already posted entry', () => {
                const entry = new JournalEntryEntity({
                    ...validJournalEntryProps,
                    status: JournalEntryStatus.POSTED,
                    postedAt: new Date()
                });

                expect(() => {
                    entry.post();
                }).toThrow('Journal entry is already posted');
            });

            it('should throw error when posting reversed entry', () => {
                const entry = new JournalEntryEntity({
                    ...validJournalEntryProps,
                    status: JournalEntryStatus.REVERSED,
                    reversedAt: new Date(),
                    reversedBy: 'user-001'
                });

                expect(() => {
                    entry.post();
                }).toThrow('Cannot post reversed journal entry');
            });

            it('should throw error when posting unbalanced entry', () => {
                const unbalancedEntries = [
                    createLedgerEntry({
                        id: 'le-debit',
                        entryType: EntryType.DEBIT,
                        amount: new Money(100, 'BRL')
                    }),
                    createLedgerEntry({
                        id: 'le-credit',
                        entryType: EntryType.CREDIT,
                        amount: new Money(150, 'BRL') // Unbalanced!
                    })
                ];

                const entry = new JournalEntryEntity({
                    id: 'je-unbalanced',
                    userId: 'user-001',
                    transactionId: 'tx-unbalanced', 
                    description: 'Unbalanced journal entry',
                    status: JournalEntryStatus.DRAFT,
                    entries: unbalancedEntries,
                    totalAmount: new Money(100, 'BRL'),
                    reference: 'ref-001',
                    metadata: {},
                    createdAt: new Date(),
                    updatedAt: new Date()
                });

                expect(() => {
                    entry.post();
                }).toThrow('Journal entry must be balanced before posting');
            });

            it('should throw error when posting entry with less than 2 entries', () => {
                const entry = new JournalEntryEntity({
                    id: 'je-single',
                    userId: 'user-001',
                    transactionId: 'tx-single',
                    description: 'Single entry journal',
                    status: JournalEntryStatus.DRAFT,
                    entries: [createLedgerEntry()],
                    totalAmount: new Money(100, 'BRL'),
                    reference: 'ref-001',
                    metadata: {},
                    createdAt: new Date(),
                    updatedAt: new Date()
                });

                expect(() => {
                    entry.post();
                }).toThrow('Journal entry must have at least 2 entries');
            });
        });

        describe('reverse', () => {
            it('should reverse a posted journal entry', () => {
                const entry = new JournalEntryEntity({
                    ...validJournalEntryProps,
                    status: JournalEntryStatus.POSTED,
                    postedAt: new Date()
                });

                const reversingEntry = entry.reverse('user-002', 'Correction needed');

                expect(entry.status).toBe(JournalEntryStatus.REVERSED);
                expect(entry.reversedAt).toBeInstanceOf(Date);
                expect(entry.reversedBy).toBe('user-002');

                expect(reversingEntry).toBeInstanceOf(JournalEntryEntity);
                expect(reversingEntry.id).toBe('REV-je-001');
                expect(reversingEntry.status).toBe(JournalEntryStatus.POSTED);
                expect(reversingEntry.description).toBe('Reversal of: Test journal entry');
                expect(reversingEntry.reference).toBe('je-001');
                expect(reversingEntry.entries).toHaveLength(2);
            });

            it('should throw error when reversing non-posted entry', () => {
                const entry = new JournalEntryEntity({
                    id: 'je-draft',
                    userId: 'user-001',
                    transactionId: 'tx-draft',
                    description: 'Draft journal entry',
                    status: JournalEntryStatus.DRAFT,
                    entries: createBalancedLedgerEntries(),
                    totalAmount: new Money(100, 'BRL'),
                    reference: 'ref-001',
                    metadata: {},
                    createdAt: new Date(),
                    updatedAt: new Date()
                });

                expect(() => {
                    entry.reverse('user-002');
                }).toThrow('Only posted journal entries can be reversed');
            });

            it('should throw error when reversing already reversed entry', () => {
                const entry = new JournalEntryEntity({
                    id: 'je-reversed',
                    userId: 'user-001',
                    transactionId: 'tx-reversed',
                    description: 'Already reversed entry',
                    status: JournalEntryStatus.POSTED,
                    entries: createBalancedLedgerEntries(),
                    totalAmount: new Money(100, 'BRL'),
                    reference: 'ref-001',
                    metadata: {},
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    postedAt: new Date()
                });

                // First reverse it
                entry.reverse('user-001');

                const reversedEntry = new JournalEntryEntity({
                    id: 'je-reversed-2',
                    userId: 'user-001',
                    transactionId: 'tx-reversed-2',
                    description: 'Already reversed entry',
                    status: JournalEntryStatus.REVERSED,
                    entries: createBalancedLedgerEntries(),
                    totalAmount: new Money(100, 'BRL'),
                    reference: 'ref-001',
                    metadata: {},
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    reversedAt: new Date(),
                    reversedBy: 'user-002'
                });

                expect(() => {
                    entry.reverse('user-003');
                }).toThrow('Journal entry is already reversed');
            });
        });
    });

    describe('balance validation', () => {
        describe('isBalanced', () => {
            it('should return true for balanced entries with same currency', () => {
                const balancedEntries = createBalancedLedgerEntries();
                const entry = new JournalEntryEntity({
                    ...validJournalEntryProps,
                    entries: balancedEntries
                });

                expect(entry.isBalanced()).toBe(true);
            });

            it('should return false for unbalanced entries', () => {
                const unbalancedEntries = [
                    createLedgerEntry({
                        id: 'le-debit',
                        entryType: EntryType.DEBIT,
                        amount: new Money(100, 'BRL')
                    }),
                    createLedgerEntry({
                        id: 'le-credit',
                        entryType: EntryType.CREDIT,
                        amount: new Money(150, 'BRL')
                    })
                ];

                const entry = new JournalEntryEntity({
                    ...validJournalEntryProps,
                    entries: unbalancedEntries
                });

                expect(entry.isBalanced()).toBe(false);
            });

            it('should return true for multiple currencies when each is balanced', () => {
                const multiCurrencyEntries = [
                    createLedgerEntry({
                        id: 'le-debit-brl',
                        entryType: EntryType.DEBIT,
                        amount: new Money(100, 'BRL')
                    }),
                    createLedgerEntry({
                        id: 'le-credit-brl',
                        entryType: EntryType.CREDIT,
                        amount: new Money(100, 'BRL')
                    }),
                    createLedgerEntry({
                        id: 'le-debit-usd',
                        entryType: EntryType.DEBIT,
                        amount: new Money(50, 'USD')
                    }),
                    createLedgerEntry({
                        id: 'le-credit-usd',
                        entryType: EntryType.CREDIT,
                        amount: new Money(50, 'USD')
                    })
                ];

                const entry = new JournalEntryEntity({
                    ...validJournalEntryProps,
                    entries: multiCurrencyEntries
                });

                expect(entry.isBalanced()).toBe(true);
            });

            it('should return false for empty entries', () => {
                const entry = new JournalEntryEntity({
                    ...validJournalEntryProps,
                    entries: []
                });

                expect(entry.isBalanced()).toBe(false);
            });
        });

        describe('getTotalDebits and getTotalCredits', () => {
            it('should calculate total debits correctly', () => {
                const entries = [
                    createLedgerEntry({
                        id: 'le-debit-1',
                        entryType: EntryType.DEBIT,
                        amount: new Money(100, 'BRL')
                    }),
                    createLedgerEntry({
                        id: 'le-debit-2',
                        entryType: EntryType.DEBIT,
                        amount: new Money(50, 'BRL')
                    }),
                    createLedgerEntry({
                        id: 'le-credit',
                        entryType: EntryType.CREDIT,
                        amount: new Money(150, 'BRL')
                    })
                ];

                const entry = new JournalEntryEntity({
                    ...validJournalEntryProps,
                    entries
                });

                const totalDebits = entry.getTotalDebits('BRL');
                expect(totalDebits.getAmount()).toBe(150);
            });

            it('should calculate total credits correctly', () => {
                const entries = [
                    createLedgerEntry({
                        id: 'le-debit',
                        entryType: EntryType.DEBIT,
                        amount: new Money(100, 'BRL')
                    }),
                    createLedgerEntry({
                        id: 'le-credit-1',
                        entryType: EntryType.CREDIT,
                        amount: new Money(60, 'BRL')
                    }),
                    createLedgerEntry({
                        id: 'le-credit-2',
                        entryType: EntryType.CREDIT,
                        amount: new Money(40, 'BRL')
                    })
                ];

                const entry = new JournalEntryEntity({
                    ...validJournalEntryProps,
                    entries
                });

                const totalCredits = entry.getTotalCredits('BRL');
                expect(totalCredits.getAmount()).toBe(100);
            });
        });

        describe('getBalanceSummary', () => {
            it('should return balance summary for all currencies', () => {
                const multiCurrencyEntries = [
                    createLedgerEntry({
                        id: 'le-debit-brl',
                        entryType: EntryType.DEBIT,
                        amount: new Money(100, 'BRL')
                    }),
                    createLedgerEntry({
                        id: 'le-credit-brl',
                        entryType: EntryType.CREDIT,
                        amount: new Money(100, 'BRL')
                    }),
                    createLedgerEntry({
                        id: 'le-debit-usd',
                        entryType: EntryType.DEBIT,
                        amount: new Money(50, 'USD')
                    }),
                    createLedgerEntry({
                        id: 'le-credit-usd',
                        entryType: EntryType.CREDIT,
                        amount: new Money(50, 'USD')
                    })
                ];

                const entry = new JournalEntryEntity({
                    ...validJournalEntryProps,
                    entries: multiCurrencyEntries
                });

                const summary = entry.getBalanceSummary();

                expect(summary).toHaveLength(2);
                
                const brlSummary = summary.find(s => s.currency === 'BRL');
                expect(brlSummary).toBeDefined();
                expect(brlSummary!.debits.getAmount()).toBe(100);
                expect(brlSummary!.credits.getAmount()).toBe(100);
                expect(brlSummary!.isBalanced).toBe(true);

                const usdSummary = summary.find(s => s.currency === 'USD');
                expect(usdSummary).toBeDefined();
                expect(usdSummary!.debits.getAmount()).toBe(50);
                expect(usdSummary!.credits.getAmount()).toBe(50);
                expect(usdSummary!.isBalanced).toBe(true);
            });
        });
    });

    describe('filtering and querying', () => {
        const complexEntries = [
            createLedgerEntry({
                id: 'le-asset-debit',
                entryType: EntryType.DEBIT,
                accountType: AccountType.ASSET,
                amount: new Money(100, 'BRL')
            }),
            createLedgerEntry({
                id: 'le-revenue-credit',
                entryType: EntryType.CREDIT,
                accountType: AccountType.REVENUE,
                amount: new Money(100, 'BRL')
            }),
            createLedgerEntry({
                id: 'le-expense-debit',
                entryType: EntryType.DEBIT,
                accountType: AccountType.EXPENSE,
                amount: new Money(50, 'BRL')
            }),
            createLedgerEntry({
                id: 'le-asset-credit',
                entryType: EntryType.CREDIT,
                accountType: AccountType.ASSET,
                amount: new Money(50, 'BRL')
            })
        ];

        const entry = new JournalEntryEntity({
            ...validJournalEntryProps,
            entries: complexEntries
        });

        describe('getEntriesByAccountType', () => {
            it('should filter entries by account type', () => {
                const assetEntries = entry.getEntriesByAccountType(AccountType.ASSET);
                expect(assetEntries).toHaveLength(2);
                expect(assetEntries.every(e => e.accountType === AccountType.ASSET)).toBe(true);

                const revenueEntries = entry.getEntriesByAccountType(AccountType.REVENUE);
                expect(revenueEntries).toHaveLength(1);
                expect(revenueEntries[0].accountType).toBe(AccountType.REVENUE);
            });
        });

        describe('getEntriesByType', () => {
            it('should filter entries by entry type', () => {
                const debitEntries = entry.getEntriesByType(EntryType.DEBIT);
                expect(debitEntries).toHaveLength(2);
                expect(debitEntries.every(e => e.entryType === EntryType.DEBIT)).toBe(true);

                const creditEntries = entry.getEntriesByType(EntryType.CREDIT);
                expect(creditEntries).toHaveLength(2);
                expect(creditEntries.every(e => e.entryType === EntryType.CREDIT)).toBe(true);
            });
        });

        describe('getCurrencies', () => {
            it('should return all currencies used in entries', () => {
                const multiCurrencyEntries = [
                    createLedgerEntry({ amount: new Money(100, 'BRL') }),
                    createLedgerEntry({ amount: new Money(50, 'USD') }),
                    createLedgerEntry({ amount: new Money(75, 'EUR') })
                ];

                const multiCurrencyEntry = new JournalEntryEntity({
                    ...validJournalEntryProps,
                    entries: multiCurrencyEntries
                });

                const currencies = multiCurrencyEntry.getCurrencies();
                expect(currencies.sort()).toEqual(['BRL', 'EUR', 'USD']);
            });
        });
    });

    describe('utility methods', () => {
        let journalEntry: JournalEntryEntity;

        beforeEach(() => {
            journalEntry = new JournalEntryEntity(createValidJournalEntryProps());
        });

        describe('updateMetadata', () => {
            it('should update metadata for modifiable entries', () => {
                journalEntry.updateMetadata({ customField: 'value' });

                expect(journalEntry.metadata).toEqual({ customField: 'value' });
            });

            it('should throw error when updating metadata of posted entry', () => {
                const postedEntry = new JournalEntryEntity({
                    ...validJournalEntryProps,
                    status: JournalEntryStatus.POSTED,
                    postedAt: new Date()
                });

                expect(() => {
                    postedEntry.updateMetadata({ field: 'value' });
                }).toThrow('Cannot modify metadata of posted journal entry');
            });
        });

        describe('updateDescription', () => {
            it('should update description for modifiable entries', () => {
                journalEntry.updateDescription('Updated description');

                expect(journalEntry.description).toBe('Updated description');
            });

            it('should throw error when updating description of posted entry', () => {
                const postedEntry = new JournalEntryEntity({
                    ...validJournalEntryProps,
                    status: JournalEntryStatus.POSTED,
                    postedAt: new Date()
                });

                expect(() => {
                    postedEntry.updateDescription('New description');
                }).toThrow('Cannot modify description of posted journal entry');
            });

            it('should throw error for empty description', () => {
                expect(() => {
                    journalEntry.updateDescription('');
                }).toThrow('Description is required');
            });
        });

        describe('markAsError', () => {
            it('should mark entry as error with message', () => {
                journalEntry.markAsError('Validation failed');

                expect(journalEntry.status).toBe(JournalEntryStatus.ERROR);
                expect(journalEntry.metadata?.errorMessage).toBe('Validation failed');
                expect(journalEntry.metadata?.errorTimestamp).toBeDefined();
            });
        });

        describe('status checking methods', () => {
            it('should check if entry can be modified', () => {
                expect(journalEntry.canModify()).toBe(true);

                const postedEntry = new JournalEntryEntity({
                    ...validJournalEntryProps,
                    status: JournalEntryStatus.POSTED,
                    postedAt: new Date()
                });
                expect(postedEntry.canModify()).toBe(false);

                const errorEntry = new JournalEntryEntity({
                    ...validJournalEntryProps,
                    status: JournalEntryStatus.ERROR
                });
                expect(errorEntry.canModify()).toBe(true);
            });

            it('should check posting status', () => {
                expect(journalEntry.isPosted()).toBe(false);

                const postedEntry = new JournalEntryEntity({
                    ...validJournalEntryProps,
                    status: JournalEntryStatus.POSTED,
                    postedAt: new Date()
                });
                expect(postedEntry.isPosted()).toBe(true);
            });

            it('should check reversal status', () => {
                expect(journalEntry.isReversed()).toBe(false);

                const reversedEntry = new JournalEntryEntity({
                    ...validJournalEntryProps,
                    status: JournalEntryStatus.REVERSED,
                    reversedAt: new Date(),
                    reversedBy: 'user-001'
                });
                expect(reversedEntry.isReversed()).toBe(true);
            });

            it('should check error status', () => {
                const testEntry = new JournalEntryEntity(createValidJournalEntryProps());
                expect(testEntry.hasError()).toBe(false);

                testEntry.markAsError('Test error');
                expect(testEntry.hasError()).toBe(true);
            });
        });
    });

    describe('toJSON', () => {
        it('should serialize to JSON correctly', () => {
            const entry = new JournalEntryEntity({
                id: 'je-001',
                userId: 'user-001',
                transactionId: 'tx-001',
                description: 'Test journal entry',
                status: JournalEntryStatus.DRAFT,
                entries: createBalancedLedgerEntries(),
                totalAmount: new Money(100, 'BRL'),
                reference: 'ref-001',
                metadata: { customField: 'value' },
                createdAt: new Date(),
                updatedAt: new Date()
            });

            const json = entry.toJSON();

            expect(json).toMatchObject({
                id: 'je-001',
                userId: 'user-001',
                transactionId: 'tx-001',
                description: 'Test journal entry',
                reference: 'ref-001',
                status: JournalEntryStatus.DRAFT,
                totalAmount: entry.totalAmount.toJSON(),
                metadata: { customField: 'value' },
                isBalanced: true,
                canModify: true
            });

            expect(json.entries).toHaveLength(2);
            expect(json.balanceSummary).toBeDefined();
        });
    });
});