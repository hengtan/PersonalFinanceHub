// backend/src/core/domain/services/ledger.service.ts

// Removed NestJS dependency
import { TransactionEntity } from '../entities/transaction.entity';
import { LedgerEntryEntity } from '../entities/ledger-entry.entity';
import { Money } from '../value-objects/money.vo';
import { logger } from '../../../infrastructure/monitoring/logger.service';

export interface DoubleEntryTransaction {
    transactionId: string;
    description: string;
    amount: Money;
    debitAccount: string;
    creditAccount: string;
    date: Date;
    reference?: string;
}

export interface LedgerBalance {
    accountId: string;
    accountName: string;
    accountType: 'asset' | 'liability' | 'equity' | 'income' | 'expense';
    balance: Money;
    lastUpdated: Date;
}

export class LedgerService {
    constructor() {}

    /**
     * Creates double-entry ledger entries for a transaction
     * Following accounting principles: Assets = Liabilities + Equity
     */
    async createDoubleEntryLedgerEntries(
        transaction: TransactionEntity
    ): Promise<LedgerEntryEntity[]> {
        try {
            logger.debug('Creating double-entry ledger entries', { 
                transactionId: transaction.getId() 
            });

            const entries: LedgerEntryEntity[] = [];
            const amount = transaction.getAmount();
            const date = transaction.getDate();
            const description = transaction.getDescription();

            // Determine debit and credit accounts based on transaction type
            const { debitAccount, creditAccount } = this.determineAccounts(transaction);

            // Create debit entry
            const debitEntry = LedgerEntryEntity.create({
                id: `ledger-${transaction.getId()}-debit`,
                transactionId: transaction.getId(),
                accountId: debitAccount,
                entryType: 'debit',
                amount: amount,
                description: `${description} (Debit)`,
                date: date,
                reference: transaction.getReference(),
                createdBy: transaction.getUserId()
            });

            // Create credit entry
            const creditEntry = LedgerEntryEntity.create({
                id: `ledger-${transaction.getId()}-credit`, 
                transactionId: transaction.getId(),
                accountId: creditAccount,
                entryType: 'credit',
                amount: amount,
                description: `${description} (Credit)`,
                date: date,
                reference: transaction.getReference(),
                createdBy: transaction.getUserId()
            });

            entries.push(debitEntry, creditEntry);

            logger.info('Double-entry ledger entries created', {
                transactionId: transaction.getId(),
                entriesCount: entries.length,
                debitAccount,
                creditAccount,
                amount: amount.getAmount()
            });

            return entries;

        } catch (error) {
            logger.error('Failed to create double-entry ledger entries', error as Error, {
                transactionId: transaction.getId()
            });
            throw error;
        }
    }

    /**
     * Validates that ledger entries balance (debits = credits)
     */
    validateLedgerBalance(entries: LedgerEntryEntity[]): {
        isBalanced: boolean;
        totalDebits: Money;
        totalCredits: Money;
        variance?: Money;
    } {
        let totalDebits = 0;
        let totalCredits = 0;
        let currency = 'BRL';

        entries.forEach(entry => {
            currency = entry.getAmount().getCurrency();
            if (entry.getEntryType() === 'debit') {
                totalDebits += entry.getAmount().getAmount();
            } else {
                totalCredits += entry.getAmount().getAmount();
            }
        });

        const debitsMoney = new Money(totalDebits, currency);
        const creditsMoney = new Money(totalCredits, currency);
        const isBalanced = Math.abs(totalDebits - totalCredits) < 0.01; // Allow for rounding

        return {
            isBalanced,
            totalDebits: debitsMoney,
            totalCredits: creditsMoney,
            variance: !isBalanced 
                ? new Money(Math.abs(totalDebits - totalCredits), currency)
                : undefined
        };
    }

    /**
     * Calculates account balances from ledger entries
     */
    async calculateAccountBalances(
        accountIds: string[],
        asOfDate?: Date
    ): Promise<LedgerBalance[]> {
        try {
            logger.debug('Calculating account balances', { 
                accountCount: accountIds.length,
                asOfDate 
            });

            // Mock calculation - replace with actual repository query
            const balances: LedgerBalance[] = accountIds.map(accountId => {
                // Mock balance calculation
                const mockBalance = this.generateMockBalance(accountId);
                
                return {
                    accountId,
                    accountName: this.getAccountName(accountId),
                    accountType: this.getAccountType(accountId),
                    balance: mockBalance,
                    lastUpdated: asOfDate || new Date()
                };
            });

            logger.info('Account balances calculated', {
                accountCount: balances.length,
                asOfDate
            });

            return balances;

        } catch (error) {
            logger.error('Failed to calculate account balances', error as Error, {
                accountIds,
                asOfDate
            });
            throw error;
        }
    }

    /**
     * Generates trial balance report
     */
    async generateTrialBalance(asOfDate?: Date): Promise<{
        asOfDate: Date;
        accounts: Array<{
            accountId: string;
            accountName: string;
            accountType: 'asset' | 'liability' | 'equity' | 'income' | 'expense';
            debitBalance?: Money;
            creditBalance?: Money;
        }>;
        totals: {
            totalDebits: Money;
            totalCredits: Money;
            isBalanced: boolean;
        };
    }> {
        try {
            const reportDate = asOfDate || new Date();
            logger.debug('Generating trial balance', { asOfDate: reportDate });

            // Mock trial balance generation
            const accounts = [
                {
                    accountId: 'acc-cash',
                    accountName: 'Cash',
                    accountType: 'asset' as const,
                    debitBalance: new Money(5000.00, 'BRL')
                },
                {
                    accountId: 'acc-checking',
                    accountName: 'Checking Account',
                    accountType: 'asset' as const,
                    debitBalance: new Money(12500.50, 'BRL')
                },
                {
                    accountId: 'acc-savings',
                    accountName: 'Savings Account',
                    accountType: 'asset' as const,
                    debitBalance: new Money(8750.75, 'BRL')
                },
                {
                    accountId: 'acc-credit-card',
                    accountName: 'Credit Card',
                    accountType: 'liability' as const,
                    creditBalance: new Money(2300.25, 'BRL')
                },
                {
                    accountId: 'acc-salary',
                    accountName: 'Salary Income',
                    accountType: 'income' as const,
                    creditBalance: new Money(15000.00, 'BRL')
                },
                {
                    accountId: 'acc-food',
                    accountName: 'Food Expenses',
                    accountType: 'expense' as const,
                    debitBalance: new Money(1950.00, 'BRL')
                }
            ];

            const totalDebits = accounts
                .filter(acc => acc.debitBalance)
                .reduce((sum, acc) => sum + (acc.debitBalance?.getAmount() || 0), 0);

            const totalCredits = accounts
                .filter(acc => acc.creditBalance) 
                .reduce((sum, acc) => sum + (acc.creditBalance?.getAmount() || 0), 0);

            const trialBalance = {
                asOfDate: reportDate,
                accounts,
                totals: {
                    totalDebits: new Money(totalDebits, 'BRL'),
                    totalCredits: new Money(totalCredits, 'BRL'),
                    isBalanced: Math.abs(totalDebits - totalCredits) < 0.01
                }
            };

            logger.info('Trial balance generated', {
                asOfDate: reportDate,
                accountCount: accounts.length,
                totalDebits,
                totalCredits,
                isBalanced: trialBalance.totals.isBalanced
            });

            return trialBalance;

        } catch (error) {
            logger.error('Failed to generate trial balance', error as Error, { asOfDate });
            throw error;
        }
    }

    private determineAccounts(transaction: TransactionEntity): {
        debitAccount: string;
        creditAccount: string;
    } {
        // Simplified account determination logic
        const transactionType = transaction.getType();
        const amount = transaction.getAmount().getAmount();

        if (transactionType === 'income') {
            return {
                debitAccount: 'acc-checking', // Asset account increases
                creditAccount: 'acc-income'    // Income account increases
            };
        } else if (transactionType === 'expense') {
            return {
                debitAccount: 'acc-expense',   // Expense account increases
                creditAccount: 'acc-checking'  // Asset account decreases
            };
        } else { // transfer
            return {
                debitAccount: transaction.getToAccountId() || 'acc-checking',
                creditAccount: transaction.getFromAccountId() || 'acc-checking'
            };
        }
    }

    private generateMockBalance(accountId: string): Money {
        const mockBalances = {
            'acc-cash': 5000.00,
            'acc-checking': 12500.50,
            'acc-savings': 8750.75,
            'acc-credit-card': -2300.25,
            'acc-salary': -15000.00,
            'acc-food': 1950.00
        };

        const balance = mockBalances[accountId as keyof typeof mockBalances] || Math.random() * 10000;
        return new Money(balance, 'BRL');
    }

    private getAccountName(accountId: string): string {
        const accountNames = {
            'acc-cash': 'Cash',
            'acc-checking': 'Checking Account', 
            'acc-savings': 'Savings Account',
            'acc-credit-card': 'Credit Card',
            'acc-salary': 'Salary Income',
            'acc-food': 'Food Expenses'
        };

        return accountNames[accountId as keyof typeof accountNames] || `Account ${accountId}`;
    }

    private getAccountType(accountId: string): 'asset' | 'liability' | 'equity' | 'income' | 'expense' {
        const accountTypes = {
            'acc-cash': 'asset',
            'acc-checking': 'asset',
            'acc-savings': 'asset', 
            'acc-credit-card': 'liability',
            'acc-salary': 'income',
            'acc-food': 'expense'
        };

        return accountTypes[accountId as keyof typeof accountTypes] as any || 'asset';
    }
}