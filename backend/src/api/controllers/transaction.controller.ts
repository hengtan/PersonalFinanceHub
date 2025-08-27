import { Request, Response, NextFunction } from 'express';
import { pgWritePool, pgReadPool, withPostgresTransaction, CacheService } from '@/infrastructure/database/connections';
import { AppError } from '../middlewares/error-handler.middleware';
import { EventBus } from '@/infrastructure/events/event-bus';
import { v4 as uuidv4 } from 'uuid';

interface LedgerEntry {
    accountCode: string;
    entryType: 'debit' | 'credit';
    amount: number;
    description: string;
}

export class TransactionController {
    /**
     * Busca transações com filtros avançados e paginação
     * Implementa cache inteligente e otimizações de query
     */
    async getTransactions(req: Request, res: Response, next: NextFunction) {
        try {
            const userId = req.user!.id;
            const {
                page = 1,
                limit = 20,
                sortBy = 'transactionDate',
                sortOrder = 'desc',
                transactionType,
                categoryId,
                accountId,
                startDate,
                endDate,
                minAmount,
                maxAmount,
                search,
            } = req.query as any;

            const offset = (page - 1) * limit;

            // Cache key para esta consulta específica
            const cacheKey = `transactions:${userId}:${JSON.stringify(req.query)}`;
            const cachedResult = await CacheService.get(cacheKey);

            if (cachedResult) {
                return res.json(cachedResult);
            }

            // Build query conditions - SQL injection safe
            const conditions: string[] = ['t.user_id = $1'];
            const values: any[] = [userId];
            let paramIndex = 2;

            if (transactionType) {
                conditions.push(`t.transaction_type = $${paramIndex}`);
                values.push(transactionType);
                paramIndex++;
            }

            if (categoryId) {
                conditions.push(`t.category_id = $${paramIndex}`);
                values.push(categoryId);
                paramIndex++;
            }

            if (accountId) {
                conditions.push(`t.account_id = $${paramIndex}`);
                values.push(accountId);
                paramIndex++;
            }

            if (startDate) {
                conditions.push(`t.transaction_date >= $${paramIndex}::date`);
                values.push(startDate);
                paramIndex++;
            }

            if (endDate) {
                conditions.push(`t.transaction_date <= $${paramIndex}::date`);
                values.push(endDate);
                paramIndex++;
            }

            if (minAmount !== undefined) {
                conditions.push(`ABS(t.amount) >= $${paramIndex}::decimal`);
                values.push(minAmount);
                paramIndex++;
            }

            if (maxAmount !== undefined) {
                conditions.push(`ABS(t.amount) <= $${paramIndex}::decimal`);
                values.push(maxAmount);
                paramIndex++;
            }

            if (search) {
                conditions.push(`(
          t.description ILIKE $${paramIndex} OR 
          m.name ILIKE $${paramIndex} OR
          t.notes ILIKE $${paramIndex}
        )`);
                values.push(`%${search}%`);
                paramIndex++;
            }

            const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

            // Validate sort column - prevent SQL injection
            const allowedSortColumns = ['transaction_date', 'amount', 'description', 'created_at'];
            const sortColumn = allowedSortColumns.includes(sortBy) ? sortBy : 'transaction_date';
            const order = sortOrder === 'asc' ? 'ASC' : 'DESC';

            // Otimized query com CTEs para melhor performance
            const transactionsQuery = `
                WITH filtered_transactions AS (
                    SELECT
                        t.id,
                        t.description,
                        t.amount,
                        t.transaction_type,
                        t.transaction_date,
                        t.status,
                        t.notes,
                        t.reference_number,
                        t.location,
                        t.created_at,
                        t.updated_at,
                        c.name as category_name,
                        c.color as category_color,
                        c.icon as category_icon,
                        a.name as account_name,
                        a.account_type,
                        m.name as merchant_name,
                        ta.name as transfer_account_name
                    FROM transactions t
                             LEFT JOIN categories c ON t.category_id = c.id
                             LEFT JOIN accounts a ON t.account_id = a.id
                             LEFT JOIN accounts ta ON t.transfer_account_id = ta.id
                             LEFT JOIN merchants m ON t.merchant_id = m.id
                    ${whereClause}
                    )
                SELECT
                    ft.*,
                    COALESCE(
                            json_agg(
                                DISTINCT jsonb_build_object(
                'id', tg.id,
                'name', tg.name,
                'color', tg.color
              )
            ) FILTER (WHERE tg.id IS NOT NULL),
                            '[]'::json
                    ) as tags
                FROM filtered_transactions ft
                         LEFT JOIN transaction_tags tt ON ft.id = tt.transaction_id
                         LEFT JOIN tags tg ON tt.tag_id = tg.id
                GROUP BY ft.id, ft.description, ft.amount, ft.transaction_type, ft.transaction_date,
                         ft.status, ft.notes, ft.reference_number, ft.location, ft.created_at, ft.updated_at,
                         ft.category_name, ft.category_color, ft.category_icon, ft.account_name,
                         ft.account_type, ft.merchant_name, ft.transfer_account_name
                ORDER BY ft.${sortColumn} ${order}
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
            `;

            values.push(limit, offset);

            // Count query otimizada
            const countQuery = `
        SELECT COUNT(DISTINCT t.id) as total
        FROM transactions t
        LEFT JOIN merchants m ON t.merchant_id = m.id
        ${whereClause}
      `;

            const [transactionsResult, countResult] = await Promise.all([
                pgReadPool.query(transactionsQuery, values),
                pgReadPool.query(countQuery, values.slice(0, -2)), // Remove limit e offset para count
            ]);

            const transactions = transactionsResult.rows.map(row => ({
                id: row.id,
                description: row.description,
                amount: parseFloat(row.amount),
                transactionType: row.transaction_type,
                transactionDate: row.transaction_date,
                status: row.status,
                notes: row.notes,
                referenceNumber: row.reference_number,
                location: row.location,
                category: row.category_name ? {
                    name: row.category_name,
                    color: row.category_color,
                    icon: row.category_icon,
                } : null,
                account: {
                    name: row.account_name,
                    type: row.account_type,
                },
                merchant: row.merchant_name ? { name: row.merchant_name } : null,
                transferAccount: row.transfer_account_name ? { name: row.transfer_account_name } : null,
                tags: row.tags || [],
                createdAt: row.created_at,
                updatedAt: row.updated_at,
            }));

            const total = parseInt(countResult.rows[0]?.total || '0', 10);
            const totalPages = Math.ceil(total / limit);

            const response = {
                success: true,
                data: {
                    transactions,
                    pagination: {
                        page,
                        limit,
                        total,
                        totalPages,
                        hasNextPage: page < totalPages,
                        hasPrevPage: page > 1,
                    },
                },
            };

            // Cache por 5 minutos
            await CacheService.set(cacheKey, response, 300);

            res.json(response);
        } catch (error) {
            next(error);
        }
    }

    /**
     * Busca uma transação específica com todos os detalhes
     */
    async getTransaction(req: Request, res: Response, next: NextFunction) {
        try {
            const userId = req.user!.id;
            const transactionId = req.params.id;

            const cacheKey = `transaction:${transactionId}:${userId}`;
            const cachedTransaction = await CacheService.get(cacheKey);

            if (cachedTransaction) {
                return res.json(cachedTransaction);
            }

            const result = await pgReadPool.query(`
        SELECT 
          t.*,
          c.name as category_name,
          c.color as category_color,
          c.icon as category_icon,
          a.name as account_name,
          a.account_type,
          ta.name as transfer_account_name,
          m.name as merchant_name,
          COALESCE(
            json_agg(
              DISTINCT jsonb_build_object(
                'id', tg.id, 
                'name', tg.name, 
                'color', tg.color
              )
            ) FILTER (WHERE tg.id IS NOT NULL),
            '[]'::json
          ) as tags
        FROM transactions t
        LEFT JOIN categories c ON t.category_id = c.id
        LEFT JOIN accounts a ON t.account_id = a.id
        LEFT JOIN accounts ta ON t.transfer_account_id = ta.id
        LEFT JOIN merchants m ON t.merchant_id = m.id
        LEFT JOIN transaction_tags tt ON t.id = tt.transaction_id
        LEFT JOIN tags tg ON tt.tag_id = tg.id
        WHERE t.id = $1 AND t.user_id = $2
        GROUP BY t.id, c.name, c.color, c.icon, a.name, a.account_type, ta.name, m.name
      `, [transactionId, userId]);

            if (result.rows.length === 0) {
                throw new AppError('Transaction not found', 404, 'TRANSACTION_NOT_FOUND');
            }

            const row = result.rows[0];
            const transaction = {
                id: row.id,
                description: row.description,
                amount: parseFloat(row.amount),
                transactionType: row.transaction_type,
                transactionDate: row.transaction_date,
                status: row.status,
                notes: row.notes,
                referenceNumber: row.reference_number,
                location: row.location,
                category: row.category_name ? {
                    name: row.category_name,
                    color: row.category_color,
                    icon: row.category_icon,
                } : null,
                account: {
                    name: row.account_name,
                    type: row.account_type,
                },
                transferAccount: row.transfer_account_name ? { name: row.transfer_account_name } : null,
                merchant: row.merchant_name ? { name: row.merchant_name } : null,
                tags: row.tags || [],
                createdAt: row.created_at,
                updatedAt: row.updated_at,
            };

            const response = {
                success: true,
                data: { transaction },
            };

            // Cache por 10 minutos
            await CacheService.set(cacheKey, response, 600);

            res.json(response);
        } catch (error) {
            next(error);
        }
    }

    /**
     * Cria uma nova transação com suporte a idempotência e eventos
     */
    async createTransaction(req: Request, res: Response, next: NextFunction) {
        try {
            const userId = req.user!.id;
            const {
                description,
                amount,
                transactionType,
                transactionDate,
                categoryId,
                accountId,
                transferAccountId,
                merchantId,
                notes,
                tags = [],
                referenceNumber,
                location,
            } = req.body;

            // Check for idempotency key
            const idempotencyKey = req.headers['idempotency-key'] as string;
            if (idempotencyKey) {
                const existingResult = await CacheService.get(`idempotency:${idempotencyKey}`);
                if (existingResult) {
                    return res.status(200).json(existingResult);
                }
            }

            // Validate account ownership
            const accountCheck = await pgWritePool.query(
                'SELECT id, balance, account_type FROM accounts WHERE id = $1 AND user_id = $2',
                [accountId, userId]
            );

            if (accountCheck.rows.length === 0) {
                throw new AppError('Account not found or access denied', 404, 'ACCOUNT_NOT_FOUND');
            }

            // Validate transfer account if provided
            if (transferAccountId) {
                const transferAccountCheck = await pgWritePool.query(
                    'SELECT id FROM accounts WHERE id = $1 AND user_id = $2',
                    [transferAccountId, userId]
                );

                if (transferAccountCheck.rows.length === 0) {
                    throw new AppError('Transfer account not found or access denied', 404, 'TRANSFER_ACCOUNT_NOT_FOUND');
                }
            }

            // Check sufficient balance for expenses
            if (transactionType === 'expense') {
                const currentBalance = parseFloat(accountCheck.rows[0].balance);
                if (currentBalance < amount) {
                    throw new AppError('Insufficient account balance', 400, 'INSUFFICIENT_BALANCE');
                }
            }

            // Create transaction with ledger entries in a atomic transaction
            const result = await withPostgresTransaction(async (client) => {
                // Calculate final amount based on transaction type
                const finalAmount = transactionType === 'expense' ? -Math.abs(amount) : Math.abs(amount);

                // Insert transaction
                const transactionResult = await client.query(`
          INSERT INTO transactions (
            id, user_id, description, amount, transaction_type, transaction_date,
            category_id, account_id, transfer_account_id, merchant_id, notes,
            reference_number, location, status, created_at, updated_at, created_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW(), $2)
          RETURNING *
        `, [
                    uuidv4(),
                    userId,
                    description,
                    finalAmount,
                    transactionType,
                    transactionDate,
                    categoryId || null,
                    accountId,
                    transferAccountId || null,
                    merchantId || null,
                    notes || null,
                    referenceNumber || null,
                    location || null,
                    'completed',
                ]);

                const transaction = transactionResult.rows[0];

                // Create ledger entries (double-entry bookkeeping)
                const ledgerEntries = this.generateLedgerEntries(transaction);

                for (const entry of ledgerEntries) {
                    await client.query(`
            INSERT INTO ledger_entries (
              id, transaction_id, user_id, account_code, entry_type, amount,
              description, created_at, created_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $3)
          `, [
                        uuidv4(),
                        transaction.id,
                        userId,
                        entry.accountCode,
                        entry.entryType,
                        entry.amount,
                        entry.description,
                    ]);
                }

                // Update account balances
                await client.query(`
          UPDATE accounts 
          SET balance = balance + $1, updated_at = NOW()
          WHERE id = $2
        `, [finalAmount, accountId]);

                // Update transfer account balance if applicable
                if (transferAccountId && transactionType === 'transfer') {
                    await client.query(`
            UPDATE accounts 
            SET balance = balance + $1, updated_at = NOW()
            WHERE id = $2
          `, [Math.abs(amount), transferAccountId]);
                }

                // Add tags if provided
                if (tags.length > 0) {
                    for (const tagId of tags) {
                        await client.query(`
              INSERT INTO transaction_tags (transaction_id, tag_id, created_at)
              VALUES ($1, $2, NOW())
              ON CONFLICT (transaction_id, tag_id) DO NOTHING
            `, [transaction.id, tagId]);
                    }
                }

                return transaction;
            });

            // Invalidate related caches
            await this.invalidateUserCache(userId);

            // Emit event for analytics and notifications
            await EventBus.emit('transaction.created', {
                transactionId: result.id,
                userId,
                amount: parseFloat(result.amount),
                type: result.transaction_type,
                accountId: result.account_id,
                timestamp: new Date().toISOString(),
            });

            const response = {
                success: true,
                data: {
                    transaction: {
                        id: result.id,
                        description: result.description,
                        amount: parseFloat(result.amount),
                        transactionType: result.transaction_type,
                        transactionDate: result.transaction_date,
                        status: result.status,
                        referenceNumber: result.reference_number,
                        location: result.location,
                        createdAt: result.created_at,
                    },
                },
            };

            // Store idempotency result
            if (idempotencyKey) {
                await CacheService.set(`idempotency:${idempotencyKey}`, response, 24 * 60 * 60); // 24 hours
            }

            res.status(201).json(response);
        } catch (error) {
            next(error);
        }
    }

    /**
     * Atualiza uma transação existente
     */
    async updateTransaction(req: Request, res: Response, next: NextFunction) {
        try {
            const userId = req.user!.id;
            const transactionId = req.params.id;
            const updateData = req.body;

            // Check if transaction exists and belongs to user
            const existingTransaction = await pgWritePool.query(
                'SELECT * FROM transactions WHERE id = $1 AND user_id = $2',
                [transactionId, userId]
            );

            if (existingTransaction.rows.length === 0) {
                throw new AppError('Transaction not found', 404, 'TRANSACTION_NOT_FOUND');
            }

            const oldTransaction = existingTransaction.rows[0];

            // Build update query dynamically
            const updateFields: string[] = [];
            const updateValues: any[] = [transactionId, userId];
            let paramIndex = 3;

            const allowedFields = [
                'description', 'amount', 'transaction_type', 'transaction_date',
                'category_id', 'merchant_id', 'notes', 'status', 'reference_number', 'location'
            ];

            for (const field of allowedFields) {
                if (updateData[field] !== undefined) {
                    updateFields.push(`${field} = $${paramIndex}`);
                    updateValues.push(updateData[field]);
                    paramIndex++;
                }
            }

            if (updateFields.length === 0) {
                throw new AppError('No valid fields to update', 400, 'NO_UPDATE_FIELDS');
            }

            updateFields.push(`updated_at = NOW()`);

            const updateQuery = `
                UPDATE transactions
                SET ${updateFields.join(', ')}
                WHERE id = $1 AND user_id = $2
                    RETURNING *
            `;

            const result = await pgWritePool.query(updateQuery, updateValues);
            const updatedTransaction = result.rows[0];

            // Update account balances if amount changed
            if (updateData.amount && parseFloat(oldTransaction.amount) !== updateData.amount) {
                const balanceDifference = updateData.amount - parseFloat(oldTransaction.amount);
                await pgWritePool.query(`
          UPDATE accounts 
          SET balance = balance + $1, updated_at = NOW()
          WHERE id = $2
        `, [balanceDifference, updatedTransaction.account_id]);
            }

            // Invalidate caches
            await this.invalidateUserCache(userId);
            await CacheService.del(`transaction:${transactionId}:${userId}`);

            // Emit update event
            await EventBus.emit('transaction.updated', {
                transactionId,
                userId,
                oldAmount: parseFloat(oldTransaction.amount),
                newAmount: parseFloat(updatedTransaction.amount),
                timestamp: new Date().toISOString(),
            });

            res.json({
                success: true,
                data: {
                    transaction: {
                        id: updatedTransaction.id,
                        description: updatedTransaction.description,
                        amount: parseFloat(updatedTransaction.amount),
                        transactionType: updatedTransaction.transaction_type,
                        transactionDate: updatedTransaction.transaction_date,
                        status: updatedTransaction.status,
                        updatedAt: updatedTransaction.updated_at,
                    },
                },
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Deleta uma transação
     */
    async deleteTransaction(req: Request, res: Response, next: NextFunction) {
        try {
            const userId = req.user!.id;
            const transactionId = req.params.id;

            // Check if transaction exists and belongs to user
            const existingTransaction = await pgWritePool.query(
                'SELECT * FROM transactions WHERE id = $1 AND user_id = $2',
                [transactionId, userId]
            );

            if (existingTransaction.rows.length === 0) {
                throw new AppError('Transaction not found', 404, 'TRANSACTION_NOT_FOUND');
            }

            const transaction = existingTransaction.rows[0];

            await withPostgresTransaction(async (client) => {
                // Reverse account balance changes
                await client.query(`
          UPDATE accounts 
          SET balance = balance - $1, updated_at = NOW()
          WHERE id = $2
        `, [parseFloat(transaction.amount), transaction.account_id]);

                // Delete related records
                await client.query('DELETE FROM transaction_tags WHERE transaction_id = $1', [transactionId]);
                await client.query('DELETE FROM ledger_entries WHERE transaction_id = $1', [transactionId]);

                // Delete transaction
                await client.query('DELETE FROM transactions WHERE id = $1', [transactionId]);
            });

            // Invalidate caches
            await this.invalidateUserCache(userId);
            await CacheService.del(`transaction:${transactionId}:${userId}`);

            // Emit delete event
            await EventBus.emit('transaction.deleted', {
                transactionId,
                userId,
                amount: parseFloat(transaction.amount),
                timestamp: new Date().toISOString(),
            });

            res.json({
                success: true,
                message: 'Transaction deleted successfully',
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Gera entradas de livro razão seguindo o sistema de partidas dobradas
     */
    private generateLedgerEntries(transaction: any): LedgerEntry[] {
        const entries: LedgerEntry[] = [];
        const amount = Math.abs(parseFloat(transaction.amount));

        switch (transaction.transaction_type) {
            case 'income':
                entries.push({
                    accountCode: 'CASH_ASSETS',
                    entryType: 'debit',
                    amount,
                    description: `Income: ${transaction.description}`,
                });
                entries.push({
                    accountCode: 'INCOME',
                    entryType: 'credit',
                    amount,
                    description: `Income: ${transaction.description}`,
                });
                break;

            case 'expense':
                entries.push({
                    accountCode: 'EXPENSES',
                    entryType: 'debit',
                    amount,
                    description: `Expense: ${transaction.description}`,
                });
                entries.push({
                    accountCode: 'CASH_ASSETS',
                    entryType: 'credit',
                    amount,
                    description: `Expense: ${transaction.description}`,
                });
                break;

            case 'transfer':
                entries.push({
                    accountCode: 'TRANSFER_FROM',
                    entryType: 'credit',
                    amount,
                    description: `Transfer: ${transaction.description}`,
                });
                entries.push({
                    accountCode: 'TRANSFER_TO',
                    entryType: 'debit',
                    amount,
                    description: `Transfer: ${transaction.description}`,
                });
                break;
        }

        return entries;
    }

    /**
     * Invalida cache relacionado ao usuário
     */
    private async invalidateUserCache(userId: string): Promise<void> {
        const patterns = [
            `transactions:${userId}:*`,
            `accounts:${userId}:*`,
            `budgets:${userId}:*`,
        ];

        await Promise.all(patterns.map(pattern => CacheService.delPattern(pattern)));
    }
}