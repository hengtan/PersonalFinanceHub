// backend/src/infrastructure/database/postgres/repositories/transaction.repository.impl.ts
import { Pool, PoolClient } from 'pg';
import { TransactionRepository, TransactionFilter } from '../../../../core/domain/repositories/transaction.repository';
import { pgWritePool, pgReadPool } from '../../connections';
import { logger } from '../../../monitoring/logger.service';
import { PaginationOptions } from '../../../../shared/types/common.types';

export class TransactionRepositoryImpl implements TransactionRepository {
    
    async findById(id: string): Promise<any | null> {
        try {
            const query = `
                SELECT 
                    t.*,
                    COALESCE(t.amount_value, 0) as amount,
                    COALESCE(t.amount_currency, 'BRL') as currency
                FROM transactions t 
                WHERE t.id = $1 AND t.deleted_at IS NULL
            `;
            
            const result = await pgReadPool.query(query, [id]);
            
            if (result.rows.length === 0) {
                return null;
            }

            return this.mapRowToTransaction(result.rows[0]);

        } catch (error) {
            logger.error('Failed to find transaction by id', error as Error, { id });
            throw error;
        }
    }

    async findMany(filter: TransactionFilter, pagination?: { page: number; limit: number }): Promise<any[]> {
        try {
            const { whereClause, values } = this.buildWhereClause(filter);
            
            let query = `
                SELECT 
                    t.*,
                    COALESCE(t.amount_value, 0) as amount,
                    COALESCE(t.amount_currency, 'BRL') as currency,
                    c.name as category_name,
                    a.name as account_name
                FROM transactions t
                LEFT JOIN categories c ON t.category_id = c.id
                LEFT JOIN accounts a ON t.account_id = a.id
                WHERE t.deleted_at IS NULL
            `;

            if (whereClause) {
                query += ` AND ${whereClause}`;
            }

            query += ` ORDER BY t.transaction_date DESC, t.created_at DESC`;

            if (pagination) {
                const offset = (pagination.page - 1) * pagination.limit;
                query += ` LIMIT $${values.length + 1} OFFSET $${values.length + 2}`;
                values.push(pagination.limit, offset);
            }

            const result = await pgReadPool.query(query, values);
            
            return result.rows.map(row => this.mapRowToTransaction(row));

        } catch (error) {
            logger.error('Failed to find transactions', error as Error, { filter });
            throw error;
        }
    }

    async findByDateRange(userId: string, startDate: Date, endDate: Date): Promise<any[]> {
        try {
            const query = `
                SELECT 
                    t.*,
                    COALESCE(t.amount_value, 0) as amount,
                    COALESCE(t.amount_currency, 'BRL') as currency
                FROM transactions t 
                WHERE t.user_id = $1 
                    AND t.transaction_date >= $2 
                    AND t.transaction_date <= $3
                    AND t.deleted_at IS NULL
                ORDER BY t.transaction_date DESC
            `;
            
            const result = await pgReadPool.query(query, [userId, startDate, endDate]);
            
            return result.rows.map(row => this.mapRowToTransaction(row));

        } catch (error) {
            logger.error('Failed to find transactions by date range', error as Error, {
                userId,
                startDate: startDate.toISOString(),
                endDate: endDate.toISOString()
            });
            throw error;
        }
    }

    async create(transactionData: Partial<any>): Promise<any> {
        const client = await pgWritePool.connect();
        
        try {
            await client.query('BEGIN');

            const query = `
                INSERT INTO transactions (
                    id, user_id, account_id, destination_account_id,
                    category_id, description, amount_value, amount_currency,
                    type, status, payment_method, transaction_date,
                    due_date, is_paid, is_recurring, recurring_config,
                    tags, notes, attachments, metadata,
                    created_at, updated_at
                )
                VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                    $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
                    $21, $22
                )
                RETURNING *
            `;

            const values = [
                transactionData.id,
                transactionData.userId,
                transactionData.accountId,
                transactionData.destinationAccountId,
                transactionData.categoryId,
                transactionData.description,
                transactionData.amount?.amount || transactionData.amount,
                transactionData.amount?.currency || transactionData.currency || 'BRL',
                transactionData.type,
                transactionData.status,
                transactionData.paymentMethod,
                transactionData.transactionDate,
                transactionData.dueDate,
                transactionData.isPaid,
                transactionData.isRecurring,
                transactionData.recurringConfig ? JSON.stringify(transactionData.recurringConfig) : null,
                transactionData.tags ? JSON.stringify(transactionData.tags) : '[]',
                transactionData.notes,
                transactionData.attachments ? JSON.stringify(transactionData.attachments) : '[]',
                transactionData.metadata ? JSON.stringify(transactionData.metadata) : '{}',
                transactionData.createdAt || new Date(),
                transactionData.updatedAt || new Date()
            ];

            const result = await client.query(query, values);
            
            // TODO: Create ledger entries for double-entry bookkeeping
            await this.createLedgerEntries(client, result.rows[0]);
            
            await client.query('COMMIT');
            
            logger.info('Transaction created', {
                transactionId: result.rows[0].id,
                userId: transactionData.userId
            });

            return this.mapRowToTransaction(result.rows[0]);

        } catch (error) {
            await client.query('ROLLBACK');
            logger.error('Failed to create transaction', error as Error, {
                userId: transactionData.userId
            });
            throw error;
        } finally {
            client.release();
        }
    }

    async update(id: string, transactionData: Partial<any>): Promise<any | null> {
        const client = await pgWritePool.connect();
        
        try {
            await client.query('BEGIN');

            // Build dynamic update query
            const updateFields: string[] = [];
            const values: any[] = [];
            let paramIndex = 1;

            if (transactionData.categoryId !== undefined) {
                updateFields.push(`category_id = $${paramIndex++}`);
                values.push(transactionData.categoryId);
            }

            if (transactionData.description !== undefined) {
                updateFields.push(`description = $${paramIndex++}`);
                values.push(transactionData.description);
            }

            if (transactionData.amount !== undefined) {
                updateFields.push(`amount_value = $${paramIndex++}`);
                values.push(transactionData.amount);
            }

            if (transactionData.currency !== undefined) {
                updateFields.push(`amount_currency = $${paramIndex++}`);
                values.push(transactionData.currency);
            }

            if (transactionData.paymentMethod !== undefined) {
                updateFields.push(`payment_method = $${paramIndex++}`);
                values.push(transactionData.paymentMethod);
            }

            if (transactionData.transactionDate !== undefined) {
                updateFields.push(`transaction_date = $${paramIndex++}`);
                values.push(transactionData.transactionDate);
            }

            if (transactionData.dueDate !== undefined) {
                updateFields.push(`due_date = $${paramIndex++}`);
                values.push(transactionData.dueDate);
            }

            if (transactionData.tags !== undefined) {
                updateFields.push(`tags = $${paramIndex++}`);
                values.push(JSON.stringify(transactionData.tags));
            }

            if (transactionData.notes !== undefined) {
                updateFields.push(`notes = $${paramIndex++}`);
                values.push(transactionData.notes);
            }

            if (transactionData.metadata !== undefined) {
                updateFields.push(`metadata = $${paramIndex++}`);
                values.push(JSON.stringify(transactionData.metadata));
            }

            // Always update updated_at
            updateFields.push(`updated_at = $${paramIndex++}`);
            values.push(new Date());

            if (updateFields.length === 1) { // Only updated_at
                return null; // Nothing to update
            }

            values.push(id); // WHERE condition
            const whereIndex = paramIndex;

            const query = `
                UPDATE transactions 
                SET ${updateFields.join(', ')}
                WHERE id = $${whereIndex} AND deleted_at IS NULL
                RETURNING *
            `;

            const result = await client.query(query, values);
            
            if (result.rows.length === 0) {
                await client.query('ROLLBACK');
                return null;
            }

            await client.query('COMMIT');
            
            logger.info('Transaction updated', {
                transactionId: id
            });

            return this.mapRowToTransaction(result.rows[0]);

        } catch (error) {
            await client.query('ROLLBACK');
            logger.error('Failed to update transaction', error as Error, { id });
            throw error;
        } finally {
            client.release();
        }
    }

    async delete(id: string): Promise<boolean> {
        try {
            const query = `
                UPDATE transactions 
                SET deleted_at = NOW(), updated_at = NOW()
                WHERE id = $1 AND deleted_at IS NULL
            `;
            
            const result = await pgWritePool.query(query, [id]);
            
            const deleted = result.rowCount > 0;
            
            if (deleted) {
                logger.info('Transaction soft deleted', { transactionId: id });
            }

            return deleted;

        } catch (error) {
            logger.error('Failed to delete transaction', error as Error, { id });
            throw error;
        }
    }

    private buildWhereClause(filter: TransactionFilter): { whereClause: string; values: any[] } {
        const conditions: string[] = [];
        const values: any[] = [];
        let paramIndex = 1;

        if (filter.userId) {
            conditions.push(`t.user_id = $${paramIndex++}`);
            values.push(filter.userId);
        }

        if (filter.categoryId) {
            conditions.push(`t.category_id = $${paramIndex++}`);
            values.push(filter.categoryId);
        }

        if (filter.type) {
            conditions.push(`t.type = $${paramIndex++}`);
            values.push(filter.type);
        }

        if (filter.dateFrom) {
            conditions.push(`t.transaction_date >= $${paramIndex++}`);
            values.push(filter.dateFrom);
        }

        if (filter.dateTo) {
            conditions.push(`t.transaction_date <= $${paramIndex++}`);
            values.push(filter.dateTo);
        }

        return {
            whereClause: conditions.join(' AND '),
            values
        };
    }

    private mapRowToTransaction(row: any): any {
        return {
            id: row.id,
            userId: row.user_id,
            accountId: row.account_id,
            destinationAccountId: row.destination_account_id,
            categoryId: row.category_id,
            description: row.description,
            amount: parseFloat(row.amount_value || row.amount || '0'),
            currency: row.amount_currency || row.currency || 'BRL',
            type: row.type,
            status: row.status,
            paymentMethod: row.payment_method,
            transactionDate: row.transaction_date,
            dueDate: row.due_date,
            isPaid: row.is_paid,
            isRecurring: row.is_recurring,
            recurringConfig: row.recurring_config ? JSON.parse(row.recurring_config) : null,
            tags: row.tags ? JSON.parse(row.tags) : [],
            notes: row.notes,
            attachments: row.attachments ? JSON.parse(row.attachments) : [],
            metadata: row.metadata ? JSON.parse(row.metadata) : {},
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            deletedAt: row.deleted_at,
            // Additional fields from joins
            categoryName: row.category_name,
            accountName: row.account_name
        };
    }

    private async createLedgerEntries(client: PoolClient, transaction: any): Promise<void> {
        try {
            // Double-entry bookkeeping: every transaction creates two ledger entries
            const amount = parseFloat(transaction.amount_value);
            
            // For income: Credit the account, Debit income category
            // For expense: Debit the account, Credit expense category  
            // For transfer: Debit source account, Credit destination account

            if (transaction.type === 'INCOME') {
                await this.createLedgerEntry(client, {
                    transactionId: transaction.id,
                    accountId: transaction.account_id,
                    amount: amount,
                    type: 'CREDIT',
                    description: `Income: ${transaction.description}`
                });
                
                await this.createLedgerEntry(client, {
                    transactionId: transaction.id,
                    accountId: 'INCOME_ACCOUNT', // Virtual income account
                    amount: amount,
                    type: 'DEBIT',
                    description: `Income source: ${transaction.description}`
                });

            } else if (transaction.type === 'EXPENSE') {
                await this.createLedgerEntry(client, {
                    transactionId: transaction.id,
                    accountId: transaction.account_id,
                    amount: amount,
                    type: 'DEBIT',
                    description: `Expense: ${transaction.description}`
                });
                
                await this.createLedgerEntry(client, {
                    transactionId: transaction.id,
                    accountId: transaction.category_id, // Use category as expense account
                    amount: amount,
                    type: 'CREDIT',
                    description: `Expense category: ${transaction.description}`
                });

            } else if (transaction.type === 'TRANSFER') {
                // Debit source account
                await this.createLedgerEntry(client, {
                    transactionId: transaction.id,
                    accountId: transaction.account_id,
                    amount: amount,
                    type: 'DEBIT',
                    description: `Transfer out: ${transaction.description}`
                });
                
                // Credit destination account
                await this.createLedgerEntry(client, {
                    transactionId: transaction.id,
                    accountId: transaction.destination_account_id,
                    amount: amount,
                    type: 'CREDIT',
                    description: `Transfer in: ${transaction.description}`
                });
            }

        } catch (error) {
            logger.error('Failed to create ledger entries', error as Error, {
                transactionId: transaction.id
            });
            throw error;
        }
    }

    private async createLedgerEntry(client: PoolClient, entry: {
        transactionId: string;
        accountId: string;
        amount: number;
        type: 'DEBIT' | 'CREDIT';
        description: string;
    }): Promise<void> {
        const query = `
            INSERT INTO ledger_entries (
                id, transaction_id, account_id, amount, type, 
                description, created_at
            )
            VALUES (
                gen_random_uuid(), $1, $2, $3, $4, $5, NOW()
            )
        `;

        await client.query(query, [
            entry.transactionId,
            entry.accountId,
            entry.amount,
            entry.type,
            entry.description
        ]);
    }
}