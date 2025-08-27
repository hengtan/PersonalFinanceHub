// backend/src/api/controllers/budget.controller.ts
import { Request, Response, NextFunction } from 'express';
import { pgWritePool, pgReadPool, withPostgresTransaction, CacheService } from '@/infrastructure/database/connections';
import { AppError } from '../middlewares/error-handler.middleware';
import { ERROR_CODES } from '@/shared/types/error-codes';
import { Logger } from '@/infrastructure/monitoring/logger.service';
import { MetricsService } from '@/infrastructure/monitoring/metrics.service';
import { EventBus } from '@/infrastructure/events/event-bus';
import { ValidationUtil } from '@/shared/types/validation.util';
import { v4 as uuidv4 } from 'uuid';

interface BudgetCategory {
    categoryId: string;
    budgetedAmount: number;
    spentAmount: number;
    remainingAmount: number;
    percentageUsed: number;
    percentageOfIncome?: number;
    isEssential?: boolean;
    alertThreshold?: number;
}

interface SavingsGoal {
    goalId: string;
    targetAmount: number;
    currentAmount: number;
    monthlyContribution: number;
    priority: 'low' | 'medium' | 'high';
    targetDate?: string;
    progress: number;
}

interface Budget {
    id: string;
    userId: string;
    period: string;
    totalIncomeBudget: number;
    totalExpenseBudget: number;
    actualIncome: number;
    actualExpenses: number;
    categories: BudgetCategory[];
    savingsGoals: SavingsGoal[];
    notes?: string;
    currency: string;
    isActive: boolean;
    budgetType: 'zero_based' | 'percentage_based' | 'envelope';
    alertsEnabled: boolean;
    rolloverUnspent: boolean;
    createdAt: string;
    updatedAt: string;
}

export class BudgetController {
    /**
     * Lista orçamentos com filtros e paginação
     */
    async getBudgets(req: Request, res: Response, next: NextFunction) {
        try {
            const userId = req.user!.id;
            const {
                period,
                startPeriod,
                endPeriod,
                budgetType,
                isActive,
                includeArchived = false,
                categoryId,
            } = req.query as any;

            // Cache key
            const cacheKey = `budgets:${userId}:${JSON.stringify(req.query)}`;
            const cachedResult = await CacheService.get(cacheKey);

            if (cachedResult) {
                return res.json(cachedResult);
            }

            // Build query conditions
            const conditions: string[] = ['b.user_id = $1'];
            const values: any[] = [userId];
            let paramIndex = 2;

            if (period) {
                conditions.push(`b.period = $${paramIndex}`);
                values.push(period);
                paramIndex++;
            }

            if (startPeriod && endPeriod) {
                conditions.push(`b.period >= $${paramIndex} AND b.period <= $${paramIndex + 1}`);
                values.push(startPeriod, endPeriod);
                paramIndex += 2;
            }

            if (budgetType) {
                conditions.push(`b.budget_type = $${paramIndex}`);
                values.push(budgetType);
                paramIndex++;
            }

            if (isActive !== undefined) {
                conditions.push(`b.is_active = $${paramIndex}`);
                values.push(isActive);
                paramIndex++;
            }

            if (!includeArchived) {
                conditions.push(`b.archived_at IS NULL`);
            }

            if (categoryId) {
                conditions.push(`EXISTS (
          SELECT 1 FROM budget_categories bc 
          WHERE bc.budget_id = b.id AND bc.category_id = $${paramIndex}
        )`);
                values.push(categoryId);
                paramIndex++;
            }

            const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

            const budgetsQuery = `
        SELECT 
          b.*,
          COALESCE(SUM(CASE WHEN t.transaction_type = 'income' THEN t.amount ELSE 0 END), 0) as actual_income,
          COALESCE(SUM(CASE WHEN t.transaction_type = 'expense' THEN ABS(t.amount) ELSE 0 END), 0) as actual_expenses
        FROM budgets b
        LEFT JOIN transactions t ON t.user_id = b.user_id 
          AND DATE_TRUNC('month', t.transaction_date) = TO_DATE(b.period, 'YYYY-MM')
          AND t.status = 'completed'
        ${whereClause}
        GROUP BY b.id
        ORDER BY b.period DESC
      `;

            const result = await pgReadPool.query(budgetsQuery, values);

            const budgets = await Promise.all(result.rows.map(async (row) => {
                const budget: Budget = {
                    id: row.id,
                    userId: row.user_id,
                    period: row.period,
                    totalIncomeBudget: parseFloat(row.total_income_budget),
                    totalExpenseBudget: parseFloat(row.total_expense_budget),
                    actualIncome: parseFloat(row.actual_income),
                    actualExpenses: parseFloat(row.actual_expenses),
                    categories: await this.getBudgetCategoriesData(row.id),
                    savingsGoals: await this.getSavingsGoalsData(row.id),
                    notes: row.notes,
                    currency: row.currency,
                    isActive: row.is_active,
                    budgetType: row.budget_type,
                    alertsEnabled: row.alerts_enabled,
                    rolloverUnspent: row.rollover_unspent,
                    createdAt: row.created_at,
                    updatedAt: row.updated_at,
                };

                return budget;
            }));

            const response = {
                success: true,
                data: { budgets },
            };

            // Cache por 5 minutos
            await CacheService.set(cacheKey, response, 300);

            res.json(response);
        } catch (error) {
            next(error);
        }
    }

    /**
     * Busca orçamento específico
     */
    async getBudget(req: Request, res: Response, next: NextFunction) {
        try {
            const userId = req.user!.id;
            const { period } = req.params;

            const cacheKey = `budget:${userId}:${period}`;
            const cachedBudget = await CacheService.get(cacheKey);

            if (cachedBudget) {
                return res.json(cachedBudget);
            }

            const result = await pgReadPool.query(`
        SELECT 
          b.*,
          COALESCE(SUM(CASE WHEN t.transaction_type = 'income' THEN t.amount ELSE 0 END), 0) as actual_income,
          COALESCE(SUM(CASE WHEN t.transaction_type = 'expense' THEN ABS(t.amount) ELSE 0 END), 0) as actual_expenses
        FROM budgets b
        LEFT JOIN transactions t ON t.user_id = b.user_id 
          AND DATE_TRUNC('month', t.transaction_date) = TO_DATE(b.period, 'YYYY-MM')
          AND t.status = 'completed'
        WHERE b.user_id = $1 AND b.period = $2
        GROUP BY b.id
      `, [userId, period]);

            if (result.rows.length === 0) {
                throw new AppError('Budget not found', 404, ERROR_CODES.BUDGET_NOT_FOUND);
            }

            const row = result.rows[0];
            const budget: Budget = {
                id: row.id,
                userId: row.user_id,
                period: row.period,
                totalIncomeBudget: parseFloat(row.total_income_budget),
                totalExpenseBudget: parseFloat(row.total_expense_budget),
                actualIncome: parseFloat(row.actual_income),
                actualExpenses: parseFloat(row.actual_expenses),
                categories: await this.getBudgetCategoriesData(row.id),
                savingsGoals: await this.getSavingsGoalsData(row.id),
                notes: row.notes,
                currency: row.currency,
                isActive: row.is_active,
                budgetType: row.budget_type,
                alertsEnabled: row.alerts_enabled,
                rolloverUnspent: row.rollover_unspent,
                createdAt: row.created_at,
                updatedAt: row.updated_at,
            };

            const response = {
                success: true,
                data: { budget },
            };

            // Cache por 10 minutos
            await CacheService.set(cacheKey, response, 600);

            res.json(response);
        } catch (error) {
            next(error);
        }
    }

    /**
     * Cria novo orçamento
     */
    async createBudget(req: Request, res: Response, next: NextFunction) {
        try {
            const userId = req.user!.id;
            const {
                period,
                totalIncomeBudget = 0,
                totalExpenseBudget = 0,
                categories = [],
                savingsGoals = [],
                notes,
                currency = 'BRL',
                budgetType = 'percentage_based',
                alertsEnabled = true,
                rolloverUnspent = false,
            } = req.body;

            // Verifica se orçamento já existe para o período
            const existingBudget = await pgWritePool.query(
                'SELECT id FROM budgets WHERE user_id = $1 AND period = $2',
                [userId, period]
            );

            if (existingBudget.rows.length > 0) {
                throw new AppError('Budget already exists for this period', 409, ERROR_CODES.BUDGET_ALREADY_EXISTS);
            }

            const result = await withPostgresTransaction(async (client) => {
                // Cria orçamento principal
                const budgetResult = await client.query(`
          INSERT INTO budgets (
            id, user_id, period, total_income_budget, total_expense_budget,
            notes, currency, budget_type, alerts_enabled, rollover_unspent,
            is_active, created_at, updated_at, created_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true, NOW(), NOW(), $2)
          RETURNING *
        `, [
                    uuidv4(),
                    userId,
                    period,
                    totalIncomeBudget,
                    totalExpenseBudget,
                    notes,
                    currency,
                    budgetType,
                    alertsEnabled,
                    rolloverUnspent,
                ]);

                const budget = budgetResult.rows[0];

                // Adiciona categorias do orçamento
                for (const category of categories) {
                    await client.query(`
            INSERT INTO budget_categories (
              id, budget_id, category_id, budgeted_amount, percentage_of_income,
              is_essential, alert_threshold, created_at, created_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8)
          `, [
                        uuidv4(),
                        budget.id,
                        category.categoryId,
                        category.budgetedAmount,
                        category.percentageOfIncome,
                        category.isEssential || false,
                        category.alertThreshold || 80,
                        userId,
                    ]);
                }

                // Adiciona metas de poupança
                for (const goal of savingsGoals) {
                    await client.query(`
            INSERT INTO budget_savings_goals (
              id, budget_id, goal_id, target_amount, monthly_contribution,
              priority, created_at, created_by
            ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7)
          `, [
                        uuidv4(),
                        budget.id,
                        goal.goalId,
                        goal.targetAmount,
                        goal.monthlyContribution,
                        goal.priority || 'medium',
                        userId,
                    ]);
                }

                return budget;
            });

            // Invalida cache
            await this.invalidateBudgetCache(userId, period);

            // Emite evento
            await EventBus.emit('budget.created', {
                budgetId: result.id,
                userId,
                period,
                totalIncomeBudget,
                totalExpenseBudget,
                categoriesCount: categories.length,
                savingsGoalsCount: savingsGoals.length,
            });

            // Métricas
            MetricsService.recordBudget('created', totalIncomeBudget + totalExpenseBudget, {
                budget_type: budgetType,
                currency,
            });

            Logger.info('Budget created', {
                budgetId: result.id,
                userId,
                period,
                totalBudget: totalIncomeBudget + totalExpenseBudget,
                correlationId: req.correlationId,
            });

            res.status(201).json({
                success: true,
                data: {
                    budget: {
                        id: result.id,
                        period: result.period,
                        totalIncomeBudget,
                        totalExpenseBudget,
                        currency,
                        budgetType,
                        createdAt: result.created_at,
                    },
                },
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Atualiza orçamento
     */
    async updateBudget(req: Request, res: Response, next: NextFunction) {
        try {
            const userId = req.user!.id;
            const { period } = req.params;
            const updateData = req.body;

            // Verifica se orçamento existe
            const existingBudget = await pgWritePool.query(
                'SELECT * FROM budgets WHERE user_id = $1 AND period = $2',
                [userId, period]
            );

            if (existingBudget.rows.length === 0) {
                throw new AppError('Budget not found', 404, ERROR_CODES.BUDGET_NOT_FOUND);
            }

            const budget = existingBudget.rows[0];

            // Verifica se orçamento está bloqueado
            if (budget.locked_at) {
                throw new AppError('Budget is locked and cannot be modified', 400, ERROR_CODES.BUDGET_LOCKED);
            }

            // Build update query dinamicamente
            const updateFields: string[] = [];
            const updateValues: any[] = [budget.id, userId];
            let paramIndex = 3;

            const allowedFields = [
                'total_income_budget', 'total_expense_budget', 'notes', 'currency',
                'budget_type', 'alerts_enabled', 'rollover_unspent', 'is_active'
            ];

            for (const field of allowedFields) {
                const camelField = this.snakeToCamel(field);
                if (updateData[camelField] !== undefined) {
                    updateFields.push(`${field} = $${paramIndex}`);
                    updateValues.push(updateData[camelField]);
                    paramIndex++;
                }
            }

            if (updateFields.length === 0) {
                throw new AppError('No valid fields to update', 400, ERROR_CODES.NO_UPDATE_FIELDS);
            }

            updateFields.push(`updated_at = NOW()`);

            const updateQuery = `
        UPDATE budgets 
        SET ${updateFields.join(', ')}
        WHERE id = $1 AND user_id = $2
        RETURNING *
      `;

            const result = await pgWritePool.query(updateQuery, updateValues);
            const updatedBudget = result.rows[0];

            // Invalida cache
            await this.invalidateBudgetCache(userId, period);

            // Emite evento
            await EventBus.emit('budget.updated', {
                budgetId: updatedBudget.id,
                userId,
                period,
                changes: Object.keys(updateData),
            });

            // Métricas
            MetricsService.recordBudget('updated', undefined, {
                budget_type: updatedBudget.budget_type,
                currency: updatedBudget.currency,
            });

            Logger.info('Budget updated', {
                budgetId: updatedBudget.id,
                userId,
                period,
                fields: updateFields.length,
                correlationId: req.correlationId,
            });

            res.json({
                success: true,
                data: {
                    budget: {
                        id: updatedBudget.id,
                        period: updatedBudget.period,
                        updatedAt: updatedBudget.updated_at,
                    },
                },
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Remove orçamento
     */
    async deleteBudget(req: Request, res: Response, next: NextFunction) {
        try {
            const userId = req.user!.id;
            const { period } = req.params;

            const existingBudget = await pgWritePool.query(
                'SELECT * FROM budgets WHERE user_id = $1 AND period = $2',
                [userId, period]
            );

            if (existingBudget.rows.length === 0) {
                throw new AppError('Budget not found', 404, ERROR_CODES.BUDGET_NOT_FOUND);
            }

            const budget = existingBudget.rows[0];

            await withPostgresTransaction(async (client) => {
                // Remove dependências
                await client.query('DELETE FROM budget_categories WHERE budget_id = $1', [budget.id]);
                await client.query('DELETE FROM budget_savings_goals WHERE budget_id = $1', [budget.id]);
                await client.query('DELETE FROM budget_alerts WHERE budget_id = $1', [budget.id]);

                // Remove orçamento
                await client.query('DELETE FROM budgets WHERE id = $1', [budget.id]);
            });

            // Invalida cache
            await this.invalidateBudgetCache(userId, period);

            // Emite evento
            await EventBus.emit('budget.deleted', {
                budgetId: budget.id,
                userId,
                period,
            });

            // Métricas
            MetricsService.recordBudget('deleted', undefined, {
                budget_type: budget.budget_type,
                currency: budget.currency,
            });

            Logger.info('Budget deleted', {
                budgetId: budget.id,
                userId,
                period,
                correlationId: req.correlationId,
            });

            res.json({
                success: true,
                message: 'Budget deleted successfully',
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Obtém orçamento do período atual
     */
    async getCurrentBudget(req: Request, res: Response, next: NextFunction) {
        try {
            const userId = req.user!.id;
            const currentPeriod = ValidationUtil.getCurrentPeriod();

            // Redireciona para getBudget com período atual
            req.params.period = currentPeriod;
            return this.getBudget(req, res, next);
        } catch (error) {
            next(error);
        }
    }

    /**
     * Copia orçamento para outro período
     */
    async copyBudget(req: Request, res: Response, next: NextFunction) {
        try {
            const userId = req.user!.id;
            const { period: sourcePeriod } = req.params;
            const {
                targetPeriod,
                copyCategories = true,
                copySavingsGoals = true,
                adjustForInflation = false,
                inflationRate = 0,
            } = req.body;

            // Busca orçamento origem
            const sourceBudget = await pgReadPool.query(
                'SELECT * FROM budgets WHERE user_id = $1 AND period = $2',
                [userId, sourcePeriod]
            );

            if (sourceBudget.rows.length === 0) {
                throw new AppError('Source budget not found', 404, ERROR_CODES.BUDGET_NOT_FOUND);
            }

            const source = sourceBudget.rows[0];

            // Verifica se período de destino já tem orçamento
            const existingTarget = await pgWritePool.query(
                'SELECT id FROM budgets WHERE user_id = $1 AND period = $2',
                [userId, targetPeriod]
            );

            if (existingTarget.rows.length > 0) {
                throw new AppError('Target budget already exists', 409, ERROR_CODES.BUDGET_ALREADY_EXISTS);
            }

            const result = await withPostgresTransaction(async (client) => {
                // Calcula ajuste de inflação
                const adjustmentFactor = adjustForInflation ? (1 + inflationRate / 100) : 1;

                // Cria novo orçamento
                const budgetResult = await client.query(`
          INSERT INTO budgets (
            id, user_id, period, total_income_budget, total_expense_budget,
            notes, currency, budget_type, alerts_enabled, rollover_unspent,
            is_active, created_at, updated_at, created_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true, NOW(), NOW(), $2)
          RETURNING *
        `, [
                    uuidv4(),
                    userId,
                    targetPeriod,
                    source.total_income_budget * adjustmentFactor,
                    source.total_expense_budget * adjustmentFactor,
                    `Copied from ${sourcePeriod}${adjustForInflation ? ` (adjusted ${inflationRate}%)` : ''}`,
                    source.currency,
                    source.budget_type,
                    source.alerts_enabled,
                    source.rollover_unspent,
                ]);

                const newBudget = budgetResult.rows[0];

                // Copia categorias se solicitado
                if (copyCategories) {
                    const categories = await client.query(
                        'SELECT * FROM budget_categories WHERE budget_id = $1',
                        [source.id]
                    );

                    for (const category of categories.rows) {
                        await client.query(`
              INSERT INTO budget_categories (
                id, budget_id, category_id, budgeted_amount, percentage_of_income,
                is_essential, alert_threshold, created_at, created_by
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8)
            `, [
                            uuidv4(),
                            newBudget.id,
                            category.category_id,
                            category.budgeted_amount * adjustmentFactor,
                            category.percentage_of_income,
                            category.is_essential,
                            category.alert_threshold,
                            userId,
                        ]);
                    }
                }

                // Copia metas de poupança se solicitado
                if (copySavingsGoals) {
                    const goals = await client.query(
                        'SELECT * FROM budget_savings_goals WHERE budget_id = $1',
                        [source.id]
                    );

                    for (const goal of goals.rows) {
                        await client.query(`
              INSERT INTO budget_savings_goals (
                id, budget_id, goal_id, target_amount, monthly_contribution,
                priority, created_at, created_by
              ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7)
            `, [
                            uuidv4(),
                            newBudget.id,
                            goal.goal_id,
                            goal.target_amount * adjustmentFactor,
                            goal.monthly_contribution * adjustmentFactor,
                            goal.priority,
                            userId,
                        ]);
                    }
                }

                return newBudget;
            });

            // Invalida cache
            await this.invalidateBudgetCache(userId, targetPeriod);

            // Emite evento
            await EventBus.emit('budget.copied', {
                sourceBudgetId: source.id,
                targetBudgetId: result.id,
                userId,
                sourcePeriod,
                targetPeriod,
                adjustForInflation,
                inflationRate,
            });

            Logger.info('Budget copied', {
                sourcePeriod,
                targetPeriod,
                userId,
                adjustForInflation,
                inflationRate,
                correlationId: req.correlationId,
            });

            res.status(201).json({
                success: true,
                data: {
                    budget: {
                        id: result.id,
                        period: result.period,
                        sourcePeriod,
                        createdAt: result.created_at,
                    },
                },
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Obtém performance do orçamento
     */
    async getBudgetPerformance(req: Request, res: Response, next: NextFunction) {
        try {
            const userId = req.user!.id;
            const { period } = req.params;
            const { compareWithPrevious = false } = req.query as any;

            const cacheKey = `budget:performance:${userId}:${period}:${compareWithPrevious}`;
            const cachedResult = await CacheService.get(cacheKey);

            if (cachedResult) {
                return res.json(cachedResult);
            }

            // Busca orçamento e transações reais
            const performanceQuery = `
        SELECT 
          b.*,
          COALESCE(income.total, 0) as actual_income,
          COALESCE(expenses.total, 0) as actual_expenses,
          COALESCE(json_agg(
            DISTINCT jsonb_build_object(
              'categoryId', bc.category_id,
              'categoryName', c.name,
              'budgetedAmount', bc.budgeted_amount,
              'spentAmount', COALESCE(cat_expenses.total, 0),
              'variance', bc.budgeted_amount - COALESCE(cat_expenses.total, 0),
              'percentageUsed', CASE 
                WHEN bc.budgeted_amount > 0 
                THEN (COALESCE(cat_expenses.total, 0) / bc.budgeted_amount * 100)
                ELSE 0 
              END
            )
          ) FILTER (WHERE bc.id IS NOT NULL), '[]') as category_performance
        FROM budgets b
        LEFT JOIN budget_categories bc ON bc.budget_id = b.id
        LEFT JOIN categories c ON c.id = bc.category_id
        LEFT JOIN LATERAL (
          SELECT SUM(t.amount) as total
          FROM transactions t
          WHERE t.user_id = b.user_id 
            AND t.transaction_type = 'income'
            AND t.status = 'completed'
            AND DATE_TRUNC('month', t.transaction_date) = TO_DATE(b.period, 'YYYY-MM')
        ) income ON true
        LEFT JOIN LATERAL (
          SELECT SUM(ABS(t.amount)) as total
          FROM transactions t
          WHERE t.user_id = b.user_id 
            AND t.transaction_type = 'expense'
            AND t.status = 'completed'
            AND DATE_TRUNC('month', t.transaction_date) = TO_DATE(b.period, 'YYYY-MM')
        ) expenses ON true
        LEFT JOIN LATERAL (
          SELECT SUM(ABS(t.amount)) as total
          FROM transactions t
          WHERE t.user_id = b.user_id 
            AND t.transaction_type = 'expense'
            AND t.category_id = bc.category_id
            AND t.status = 'completed'
            AND DATE_TRUNC('month', t.transaction_date) = TO_DATE(b.period, 'YYYY-MM')
        ) cat_expenses ON true
        WHERE b.user_id = $1 AND b.period = $2
        GROUP BY b.id, income.total, expenses.total
      `;

            const result = await pgReadPool.query(performanceQuery, [userId, period]);

            if (result.rows.length === 0) {
                throw new AppError('Budget not found', 404, ERROR_CODES.BUDGET_NOT_FOUND);
            }

            const row = result.rows[0];
            const actualIncome = parseFloat(row.actual_income);
            const actualExpenses = parseFloat(row.actual_expenses);
            const budgetedIncome = parseFloat(row.total_income_budget);
            const budgetedExpenses = parseFloat(row.total_expense_budget);

            const performance = {
                period: row.period,
                income: {
                    budgeted: budgetedIncome,
                    actual: actualIncome,
                    variance: actualIncome - budgetedIncome,
                    percentageOfBudget: budgetedIncome > 0 ? (actualIncome / budgetedIncome * 100) : 0,
                },
                expenses: {
                    budgeted: budgetedExpenses,
                    actual: actualExpenses,
                    variance: budgetedExpenses - actualExpenses, // Positive = under budget
                    percentageOfBudget: budgetedExpenses > 0 ? (actualExpenses / budgetedExpenses * 100) : 0,
                },
                netIncome: {
                    budgeted: budgetedIncome - budgetedExpenses,
                    actual: actualIncome - actualExpenses,
                },
                categories: row.category_performance || [],
                summary: {
                    totalCategories: (row.category_performance || []).length,
                    categoriesOverBudget: (row.category_performance || []).filter((c: any) => c.percentageUsed > 100).length,
                    categoriesUnderBudget: (row.category_performance || []).filter((c: any) => c.percentageUsed < 90).length,
                    averageCategoryUsage: (row.category_performance || []).reduce((sum: number, c: any) => sum + c.percentageUsed, 0) / Math.max((row.category_performance || []).length, 1),
                },
            };

            // Comparação com período anterior se solicitado
            let comparison = null;
            if (compareWithPrevious) {
                const previousPeriod = ValidationUtil.getPreviousPeriod(period);
                try {
                    const prevResult = await pgReadPool.query(performanceQuery, [userId, previousPeriod]);
                    if (prevResult.rows.length > 0) {
                        const prevRow = prevResult.rows[0];
                        comparison = {
                            period: previousPeriod,
                            incomeChange: actualIncome - parseFloat(prevRow.actual_income),
                            expenseChange: actualExpenses - parseFloat(prevRow.actual_expenses),
                            netIncomeChange: (actualIncome - actualExpenses) - (parseFloat(prevRow.actual_income) - parseFloat(prevRow.actual_expenses)),
                        };
                    }
                } catch (error) {
                    // Ignora erro se período anterior não existir
                }
            }

            const responseData = {
                success: true,
                data: {
                    performance,
                    ...(comparison && { comparison }),
                },
            };

            // Cache por 30 minutos
            await CacheService.set(cacheKey, responseData, 1800);

            res.json(responseData);
        } catch (error) {
            next(error);
        }
    }

    /**
     * Health check para budgets
     */
    async healthCheck(req: Request, res: Response, next: NextFunction) {
        try {
            const result = await pgReadPool.query('SELECT COUNT(*) as total FROM budgets');

            res.json({
                success: true,
                service: 'budget',
                status: 'healthy',
                data: {
                    totalBudgets: parseInt(result.rows[0].total),
                    timestamp: new Date().toISOString(),
                },
            });
        } catch (error) {
            next(error);
        }
    }

    // Métodos auxiliares privados

    /**
     * Obtém dados das categorias do orçamento
     */
    private async getBudgetCategoriesData(budgetId: string): Promise<BudgetCategory[]> {
        const result = await pgReadPool.query(`
      SELECT 
        bc.*,
        c.name as category_name,
        COALESCE(expenses.spent, 0) as spent_amount
      FROM budget_categories bc
      JOIN categories c ON c.id = bc.category_id
      LEFT JOIN (
        SELECT 
          t.category_id,
          SUM(ABS(t.amount)) as spent
        FROM transactions t
        JOIN budgets b ON DATE_TRUNC('month', t.transaction_date) = TO_DATE(b.period, 'YYYY-MM')
        WHERE b.id = $1 AND t.transaction_type = 'expense' AND t.status = 'completed'
        GROUP BY t.category_id
      ) expenses ON expenses.category_id = bc.category_id
      WHERE bc.budget_id = $1
      ORDER BY bc.budgeted_amount DESC
    `, [budgetId]);

        return result.rows.map(row => ({
            categoryId: row.category_id,
            budgetedAmount: parseFloat(row.budgeted_amount),
            spentAmount: parseFloat(row.spent_amount),
            remainingAmount: parseFloat(row.budgeted_amount) - parseFloat(row.spent_amount),
            percentageUsed: parseFloat(row.budgeted_amount) > 0
                ? (parseFloat(row.spent_amount) / parseFloat(row.budgeted_amount) * 100)
                : 0,
            percentageOfIncome: row.percentage_of_income,
            isEssential: row.is_essential,
            alertThreshold: row.alert_threshold,
        }));
    }

    /**
     * Obtém dados das metas de poupança
     */
    private async getSavingsGoalsData(budgetId: string): Promise<SavingsGoal[]> {
        const result = await pgReadPool.query(`
      SELECT 
        bsg.*,
        sg.name as goal_name,
        sg.target_date,
        COALESCE(contributions.current_amount, 0) as current_amount
      FROM budget_savings_goals bsg
      JOIN savings_goals sg ON sg.id = bsg.goal_id
      LEFT JOIN (
        SELECT 
          goal_id,
          SUM(amount) as current_amount
        FROM savings_goal_contributions
        GROUP BY goal_id
      ) contributions ON contributions.goal_id = bsg.goal_id
      WHERE bsg.budget_id = $1
      ORDER BY bsg.priority DESC, bsg.target_amount DESC
    `, [budgetId]);

        return result.rows.map(row => ({
            goalId: row.goal_id,
            targetAmount: parseFloat(row.target_amount),
            currentAmount: parseFloat(row.current_amount),
            monthlyContribution: parseFloat(row.monthly_contribution),
            priority: row.priority,
            targetDate: row.target_date,
            progress: parseFloat(row.target_amount) > 0
                ? (parseFloat(row.current_amount) / parseFloat(row.target_amount) * 100)
                : 0,
        }));
    }

    /**
     * Converte snake_case para camelCase
     */
    private snakeToCamel(str: string): string {
        return str.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
    }

    /**
     * Invalida cache relacionado ao orçamento
     */
    private async invalidateBudgetCache(userId: string, period?: string): Promise<void> {
        const patterns = [
            `budgets:${userId}:*`,
            `budget:${userId}:*`,
            `budget:performance:${userId}:*`,
        ];

        if (period) {
            patterns.push(`budget:${userId}:${period}`);
        }

        await Promise.all(patterns.map(pattern => CacheService.delPattern(pattern)));
    }

    // Placeholder methods for routes that were referenced but not implemented
    async updateBudgetFull(req: Request, res: Response, next: NextFunction) { /* Implementation needed */ }
    async duplicateBudget(req: Request, res: Response, next: NextFunction) { /* Implementation needed */ }
    async lockBudget(req: Request, res: Response, next: NextFunction) { /* Implementation needed */ }
    async unlockBudget(req: Request, res: Response, next: NextFunction) { /* Implementation needed */ }
    async getBudgetCategories(req: Request, res: Response, next: NextFunction) { /* Implementation needed */ }
    async addBudgetCategory(req: Request, res: Response, next: NextFunction) { /* Implementation needed */ }
    async updateBudgetCategory(req: Request, res: Response, next: NextFunction) { /* Implementation needed */ }
    async removeBudgetCategory(req: Request, res: Response, next: NextFunction) { /* Implementation needed */ }
    async getCategoryPerformance(req: Request, res: Response, next: NextFunction) { /* Implementation needed */ }
    async getSavingsGoals(req: Request, res: Response, next: NextFunction) { /* Implementation needed */ }
    async addSavingsGoal(req: Request, res: Response, next: NextFunction) { /* Implementation needed */ }
    async updateSavingsGoal(req: Request, res: Response, next: NextFunction) { /* Implementation needed */ }
    async removeSavingsGoal(req: Request, res: Response, next: NextFunction) { /* Implementation needed */ }
    async contributeToGoal(req: Request, res: Response, next: NextFunction) { /* Implementation needed */ }
    async getBudgetVariance(req: Request, res: Response, next: NextFunction) { /* Implementation needed */ }
    async getBudgetForecast(req: Request, res: Response, next: NextFunction) { /* Implementation needed */ }
    async getPredictedCashFlow(req: Request, res: Response, next: NextFunction) { /* Implementation needed */ }
    async getBudgetComparison(req: Request, res: Response, next: NextFunction) { /* Implementation needed */ }
    async getBudgetTrends(req: Request, res: Response, next: NextFunction) { /* Implementation needed */ }
    async getBudgetEfficiency(req: Request, res: Response, next: NextFunction) { /* Implementation needed */ }
    async getBudgetAlerts(req: Request, res: Response, next: NextFunction) { /* Implementation needed */ }
    async createBudgetAlert(req: Request, res: Response, next: NextFunction) { /* Implementation needed */ }
    async updateBudgetAlert(req: Request, res: Response, next: NextFunction) { /* Implementation needed */ }
    async deleteBudgetAlert(req: Request, res: Response, next: NextFunction) { /* Implementation needed */ }
    async testBudgetAlert(req: Request, res: Response, next: NextFunction) { /* Implementation needed */ }
    async getBudgetTemplates(req: Request, res: Response, next: NextFunction) { /* Implementation needed */ }
    async createBudgetTemplate(req: Request, res: Response, next: NextFunction) { /* Implementation needed */ }
    async createBudgetFromTemplate(req: Request, res: Response, next: NextFunction) { /* Implementation needed */ }
    async autoCreateBudget(req: Request, res: Response, next: NextFunction) { /* Implementation needed */ }
    async autoAdjustBudget(req: Request, res: Response, next: NextFunction) { /* Implementation needed */ }
    async importBudget(req: Request, res: Response, next: NextFunction) { /* Implementation needed */ }
    async exportBudget(req: Request, res: Response, next: NextFunction) { /* Implementation needed */ }
    async validateBudget(req: Request, res: Response, next: NextFunction) { /* Implementation needed */ }
    async getBudgetSuggestions(req: Request, res: Response, next: NextFunction) { /* Implementation needed */ }
    async getBudgetRecommendations(req: Request, res: Response, next: NextFunction) { /* Implementation needed */ }
    async getBudgetHistory(req: Request, res: Response, next: NextFunction) { /* Implementation needed */ }
    async getBudgetAuditTrail(req: Request, res: Response, next: NextFunction) { /* Implementation needed */ }
    async restoreBudgetVersion(req: Request, res: Response, next: NextFunction) { /* Implementation needed */ }
    async getAdminBudgetOverview(req: Request, res: Response, next: NextFunction) { /* Implementation needed */ }
    async recalculateAllBudgets(req: Request, res: Response, next: NextFunction) { /* Implementation needed */ }
    async cleanupOrphanedBudgetData(req: Request, res: Response, next: NextFunction) { /* Implementation needed */ }
}