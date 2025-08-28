// backend/src/infrastructure/database/postgres/repositories/ledger-entry.repository.ts
import { PoolClient } from 'pg';
import { LedgerEntryEntity, AccountType, EntryType, ReferenceType } from '../../../../core/domain/entities/ledger-entry.entity';
import { Money } from '../../../../core/domain/value-objects/money.vo';
import { IRepository } from '../../../../core/domain/services/unit-of-work.service';
import { logger } from '../../../monitoring/logger.service';

export interface LedgerEntryFilters {
    accountId?: string;
    accountType?: AccountType;
    entryType?: EntryType;
    transactionId?: string;
    journalEntryId?: string;
    referenceId?: string;
    referenceType?: ReferenceType;
    amountRange?: { min: number; max: number };
    dateRange?: { start: Date; end: Date };
    currency?: string;
    limit?: number;
    offset?: number;
}

export interface AccountBalance {
    accountId: string;
    accountName: string;
    accountType: AccountType;
    currency: string;
    debitTotal: number;
    creditTotal: number;
    balance: number;
    entryCount: number;
}

export class LedgerEntryRepositoryPostgres implements IRepository {
    private connection: PoolClient | null = null;

    setConnection(connection: PoolClient): void {
        this.connection = connection;
        logger.debug('Ledger entry repository connection set');
    }

    clearConnection(): void {
        this.connection = null;
        logger.debug('Ledger entry repository connection cleared');
    }

    private getConnection(): PoolClient {
        if (!this.connection) {
            throw new Error('No database connection available. Repository must be used within a Unit of Work.');
        }
        return this.connection;
    }

    /**
     * Finds ledger entries by filters
     */
    async findByFilters(filters: LedgerEntryFilters): Promise<LedgerEntryEntity[]> {
        const client = this.getConnection();

        try {
            logger.debug('Finding ledger entries with filters', filters);

            let query = `SELECT * FROM ledger_entries WHERE 1=1`;
            const params: any[] = [];
            let paramCount = 0;

            if (filters.accountId) {
                paramCount++;
                query += ` AND account_id = $${paramCount}`;
                params.push(filters.accountId);
            }

            if (filters.accountType) {
                paramCount++;
                query += ` AND account_type = $${paramCount}`;
                params.push(filters.accountType);
            }

            if (filters.entryType) {
                paramCount++;
                query += ` AND entry_type = $${paramCount}`;
                params.push(filters.entryType);
            }

            if (filters.transactionId) {
                paramCount++;
                query += ` AND transaction_id = $${paramCount}`;
                params.push(filters.transactionId);
            }

            if (filters.journalEntryId) {
                paramCount++;
                query += ` AND journal_entry_id = $${paramCount}`;
                params.push(filters.journalEntryId);
            }

            if (filters.referenceId) {
                paramCount++;
                query += ` AND reference_id = $${paramCount}`;
                params.push(filters.referenceId);
            }

            if (filters.referenceType) {
                paramCount++;
                query += ` AND reference_type = $${paramCount}`;
                params.push(filters.referenceType);
            }

            if (filters.currency) {
                paramCount++;
                query += ` AND currency = $${paramCount}`;
                params.push(filters.currency);
            }

            if (filters.amountRange) {
                if (filters.amountRange.min) {
                    paramCount++;
                    query += ` AND amount >= $${paramCount}`;
                    params.push(filters.amountRange.min);
                }
                if (filters.amountRange.max) {
                    paramCount++;
                    query += ` AND amount <= $${paramCount}`;
                    params.push(filters.amountRange.max);
                }
            }

            if (filters.dateRange) {
                if (filters.dateRange.start) {
                    paramCount++;
                    query += ` AND posted_at >= $${paramCount}`;
                    params.push(filters.dateRange.start);
                }
                if (filters.dateRange.end) {
                    paramCount++;
                    query += ` AND posted_at <= $${paramCount}`;
                    params.push(filters.dateRange.end);
                }
            }

            query += ` ORDER BY posted_at DESC, created_at DESC`;

            if (filters.limit) {
                paramCount++;
                query += ` LIMIT $${paramCount}`;
                params.push(filters.limit);
            }

            if (filters.offset) {
                paramCount++;
                query += ` OFFSET $${paramCount}`;
                params.push(filters.offset);
            }

            const result = await client.query(query, params);

            const ledgerEntries = result.rows.map(row => new LedgerEntryEntity({
                id: row.id,
                transactionId: row.transaction_id,
                accountId: row.account_id,
                accountName: row.account_name,
                accountType: row.account_type as AccountType,
                entryType: row.entry_type as EntryType,
                amount: new Money(parseFloat(row.amount), row.currency),
                description: row.description,
                referenceId: row.reference_id,
                referenceType: row.reference_type as ReferenceType,
                metadata: row.metadata,
                journalEntryId: row.journal_entry_id,
                postedAt: row.posted_at,
                createdAt: row.created_at,
                updatedAt: row.updated_at
            }));

            return ledgerEntries;

        } catch (error) {
            logger.error('Failed to find ledger entries with filters', error as Error, filters);
            throw error;
        }
    }

    /**
     * Gets account balances
     */
    async getAccountBalances(filters?: {
        accountIds?: string[];
        accountTypes?: AccountType[];
        currency?: string;
        asOfDate?: Date;
    }): Promise<AccountBalance[]> {
        const client = this.getConnection();

        try {
            logger.debug('Getting account balances', filters);

            let query = `
                SELECT 
                    account_id,
                    account_name,
                    account_type,
                    currency,
                    SUM(CASE WHEN entry_type = 'DEBIT' THEN amount ELSE 0 END) as debit_total,
                    SUM(CASE WHEN entry_type = 'CREDIT' THEN amount ELSE 0 END) as credit_total,
                    COUNT(*) as entry_count
                FROM ledger_entries 
                WHERE 1=1
            `;
            
            const params: any[] = [];
            let paramCount = 0;

            if (filters?.accountIds && filters.accountIds.length > 0) {
                paramCount++;
                query += ` AND account_id = ANY($${paramCount})`;
                params.push(filters.accountIds);
            }

            if (filters?.accountTypes && filters.accountTypes.length > 0) {
                paramCount++;
                query += ` AND account_type = ANY($${paramCount})`;
                params.push(filters.accountTypes);
            }

            if (filters?.currency) {
                paramCount++;
                query += ` AND currency = $${paramCount}`;
                params.push(filters.currency);
            }

            if (filters?.asOfDate) {
                paramCount++;
                query += ` AND posted_at <= $${paramCount}`;
                params.push(filters.asOfDate);
            }

            query += `
                GROUP BY account_id, account_name, account_type, currency
                ORDER BY account_name
            `;

            const result = await client.query(query, params);

            const balances = result.rows.map(row => {
                const debitTotal = parseFloat(row.debit_total);
                const creditTotal = parseFloat(row.credit_total);
                
                // Calculate balance based on account type
                // Assets and Expenses: Debit increases balance (positive)
                // Liabilities, Equity, Revenue: Credit increases balance (positive)
                let balance: number;
                const accountType = row.account_type as AccountType;
                
                if (accountType === AccountType.ASSET || accountType === AccountType.EXPENSE) {
                    balance = debitTotal - creditTotal;
                } else {
                    balance = creditTotal - debitTotal;
                }

                return {
                    accountId: row.account_id,
                    accountName: row.account_name,
                    accountType: accountType,
                    currency: row.currency,
                    debitTotal,
                    creditTotal,
                    balance,
                    entryCount: parseInt(row.entry_count)
                };
            });

            return balances;

        } catch (error) {
            logger.error('Failed to get account balances', error as Error, filters);
            throw error;
        }
    }

    /**
     * Gets trial balance (all account balances grouped by currency)
     */
    async getTrialBalance(currency?: string, asOfDate?: Date): Promise<{
        currency: string;
        totalDebits: number;
        totalCredits: number;
        accounts: AccountBalance[];
        isBalanced: boolean;
    }[]> {
        const client = this.getConnection();

        try {
            logger.debug('Getting trial balance', { currency, asOfDate });

            const balances = await this.getAccountBalances({
                currency,
                asOfDate
            });

            // Group by currency
            const currencyGroups = new Map<string, AccountBalance[]>();
            
            for (const balance of balances) {
                if (!currencyGroups.has(balance.currency)) {
                    currencyGroups.set(balance.currency, []);
                }
                currencyGroups.get(balance.currency)!.push(balance);
            }

            const trialBalances = Array.from(currencyGroups.entries()).map(([curr, accounts]) => {
                const totalDebits = accounts.reduce((sum, account) => sum + account.debitTotal, 0);
                const totalCredits = accounts.reduce((sum, account) => sum + account.creditTotal, 0);
                const isBalanced = Math.abs(totalDebits - totalCredits) < 0.01;

                return {
                    currency: curr,
                    totalDebits,
                    totalCredits,
                    accounts,
                    isBalanced
                };
            });

            return trialBalances;

        } catch (error) {
            logger.error('Failed to get trial balance', error as Error, { currency, asOfDate });
            throw error;
        }
    }

    /**
     * Gets ledger entries for a specific account with running balance
     */
    async getAccountLedger(accountId: string, filters?: {
        dateRange?: { start: Date; end: Date };
        limit?: number;
        offset?: number;
    }): Promise<Array<LedgerEntryEntity & { runningBalance: number }>> {
        const client = this.getConnection();

        try {
            logger.debug('Getting account ledger', { accountId, filters });

            let query = `
                SELECT *,
                    SUM(CASE WHEN entry_type = 'DEBIT' THEN amount ELSE -amount END) 
                        OVER (ORDER BY posted_at, created_at ROWS UNBOUNDED PRECEDING) as running_balance
                FROM ledger_entries 
                WHERE account_id = $1
            `;
            
            const params: any[] = [accountId];
            let paramCount = 1;

            if (filters?.dateRange?.start) {
                paramCount++;
                query += ` AND posted_at >= $${paramCount}`;
                params.push(filters.dateRange.start);
            }

            if (filters?.dateRange?.end) {
                paramCount++;
                query += ` AND posted_at <= $${paramCount}`;
                params.push(filters.dateRange.end);
            }

            query += ` ORDER BY posted_at, created_at`;

            if (filters?.limit) {
                paramCount++;
                query += ` LIMIT $${paramCount}`;
                params.push(filters.limit);
            }

            if (filters?.offset) {
                paramCount++;
                query += ` OFFSET $${paramCount}`;
                params.push(filters.offset);
            }

            const result = await client.query(query, params);

            const ledgerEntries = result.rows.map(row => {
                const entry = new LedgerEntryEntity({
                    id: row.id,
                    transactionId: row.transaction_id,
                    accountId: row.account_id,
                    accountName: row.account_name,
                    accountType: row.account_type as AccountType,
                    entryType: row.entry_type as EntryType,
                    amount: new Money(parseFloat(row.amount), row.currency),
                    description: row.description,
                    referenceId: row.reference_id,
                    referenceType: row.reference_type as ReferenceType,
                    metadata: row.metadata,
                    journalEntryId: row.journal_entry_id,
                    postedAt: row.posted_at,
                    createdAt: row.created_at,
                    updatedAt: row.updated_at
                });

                return Object.assign(entry, {
                    runningBalance: parseFloat(row.running_balance)
                });
            });

            return ledgerEntries;

        } catch (error) {
            logger.error('Failed to get account ledger', error as Error, { accountId, filters });
            throw error;
        }
    }
}