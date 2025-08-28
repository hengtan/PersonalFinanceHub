// src/infrastructure/database/postgres/query-optimizer.service.ts
import { DataSource, Repository, SelectQueryBuilder } from 'typeorm';
import { TransactionPostgresEntity } from './entities/transaction.entity';
import { UserPostgresEntity } from './entities/user.entity';
import { BudgetPostgresEntity } from './entities/budget.entity';
import { CacheService } from '../../cache/cache.service';
import { logger } from '../../monitoring/logger.service';

export interface QueryOptimizationConfig {
    enableQueryCache: boolean;
    cacheTtl: number;
    maxQueryResults: number;
    queryTimeout: number;
}

export interface OptimizedQuery<T = any> {
    sql: string;
    parameters: any[];
    cacheKey?: string;
    cacheTtl?: number;
    result?: T;
    executionTime?: number;
}

export class QueryOptimizerService {
    private cacheService: CacheService;
    private config: QueryOptimizationConfig;

    constructor(
        private dataSource: DataSource,
        config: Partial<QueryOptimizationConfig> = {}
    ) {
        this.cacheService = CacheService.getInstance();
        this.config = {
            enableQueryCache: true,
            cacheTtl: 300, // 5 minutes
            maxQueryResults: 1000,
            queryTimeout: 30000, // 30 seconds
            ...config
        };
    }

    /**
     * Optimized transaction queries using indexes
     */
    async getTransactionsByUserOptimized(
        userId: string, 
        filters: {
            startDate?: Date;
            endDate?: Date;
            type?: string;
            categoryId?: string;
            limit?: number;
            offset?: number;
        } = {}
    ): Promise<OptimizedQuery<TransactionPostgresEntity[]>> {
        const cacheKey = `transactions:${userId}:${JSON.stringify(filters)}`;
        
        // Try cache first
        if (this.config.enableQueryCache) {
            const cached = await this.cacheService.get<TransactionPostgresEntity[]>(cacheKey);
            if (cached) {
                return {
                    sql: 'FROM_CACHE',
                    parameters: [],
                    cacheKey,
                    result: cached
                };
            }
        }

        const transactionRepo = this.dataSource.getRepository(TransactionPostgresEntity);
        let queryBuilder = transactionRepo
            .createQueryBuilder('t')
            .where('t.userId = :userId AND t.deletedAt IS NULL', { userId })
            .orderBy('t.transactionDate', 'DESC');

        // Apply filters using indexed columns
        if (filters.startDate && filters.endDate) {
            queryBuilder = queryBuilder.andWhere(
                't.transactionDate BETWEEN :startDate AND :endDate',
                { startDate: filters.startDate, endDate: filters.endDate }
            );
        }

        if (filters.type) {
            queryBuilder = queryBuilder.andWhere('t.type = :type', { type: filters.type });
        }

        if (filters.categoryId) {
            queryBuilder = queryBuilder.andWhere('t.categoryId = :categoryId', { categoryId: filters.categoryId });
        }

        // Pagination
        const limit = Math.min(filters.limit || 50, this.config.maxQueryResults);
        const offset = filters.offset || 0;
        queryBuilder = queryBuilder.limit(limit).offset(offset);

        const startTime = Date.now();
        const result = await queryBuilder.getMany();
        const executionTime = Date.now() - startTime;

        logger.debug('Optimized transaction query executed', {
            userId,
            executionTime,
            resultCount: result.length,
            filters
        });

        // Cache the result
        if (this.config.enableQueryCache && result.length > 0) {
            await this.cacheService.set(cacheKey, result, this.config.cacheTtl);
        }

        return {
            sql: queryBuilder.getQuery(),
            parameters: queryBuilder.getParameters(),
            cacheKey,
            result,
            executionTime
        };
    }

    /**
     * Optimized dashboard summary query
     */
    async getDashboardSummaryOptimized(userId: string, month?: Date): Promise<OptimizedQuery<any>> {
        const monthKey = month ? month.toISOString().slice(0, 7) : new Date().toISOString().slice(0, 7);
        const cacheKey = `dashboard:summary:${userId}:${monthKey}`;

        // Try cache first
        if (this.config.enableQueryCache) {
            const cached = await this.cacheService.get(cacheKey);
            if (cached) {
                return {
                    sql: 'FROM_CACHE',
                    parameters: [],
                    cacheKey,
                    result: cached
                };
            }
        }

        const startTime = Date.now();
        
        // Optimized raw SQL query using our performance indexes
        const sql = `
            WITH monthly_summary AS (
                SELECT 
                    user_id,
                    type,
                    SUM(amount) as total_amount,
                    COUNT(*) as transaction_count,
                    AVG(amount) as avg_amount
                FROM transactions 
                WHERE user_id = $1 
                    AND date_trunc('month', transaction_date) = date_trunc('month', $2::date)
                    AND deleted_at IS NULL 
                    AND status = 'completed'
                GROUP BY user_id, type
            ),
            category_breakdown AS (
                SELECT 
                    category_id,
                    SUM(amount) as category_total,
                    COUNT(*) as category_count
                FROM transactions 
                WHERE user_id = $1 
                    AND date_trunc('month', transaction_date) = date_trunc('month', $2::date)
                    AND deleted_at IS NULL 
                    AND status = 'completed'
                    AND type = 'expense'
                GROUP BY category_id
                ORDER BY category_total DESC
                LIMIT 10
            )
            SELECT 
                json_build_object(
                    'summary', (SELECT json_agg(row_to_json(ms)) FROM monthly_summary ms),
                    'topCategories', (SELECT json_agg(row_to_json(cb)) FROM category_breakdown cb)
                ) as dashboard_data;
        `;

        const result = await this.dataSource.query(sql, [userId, monthKey + '-01']);
        const executionTime = Date.now() - startTime;

        logger.debug('Dashboard summary query executed', {
            userId,
            month: monthKey,
            executionTime
        });

        const dashboardData = result[0]?.dashboard_data || {};

        // Cache the result
        if (this.config.enableQueryCache) {
            await this.cacheService.set(cacheKey, dashboardData, this.config.cacheTtl);
        }

        return {
            sql,
            parameters: [userId, monthKey + '-01'],
            cacheKey,
            result: dashboardData,
            executionTime
        };
    }

    /**
     * Optimized budget analysis query
     */
    async getBudgetAnalysisOptimized(userId: string, budgetId?: string): Promise<OptimizedQuery<any>> {
        const cacheKey = budgetId ? 
            `budget:analysis:${userId}:${budgetId}` : 
            `budget:analysis:${userId}:all`;

        // Try cache first
        if (this.config.enableQueryCache) {
            const cached = await this.cacheService.get(cacheKey);
            if (cached) {
                return {
                    sql: 'FROM_CACHE',
                    parameters: [],
                    cacheKey,
                    result: cached
                };
            }
        }

        const startTime = Date.now();

        const sql = `
            WITH budget_spending AS (
                SELECT 
                    b.id as budget_id,
                    b.name as budget_name,
                    b.allocated_amount,
                    b.category_id,
                    COALESCE(SUM(t.amount), 0) as actual_spent,
                    b.allocated_amount - COALESCE(SUM(t.amount), 0) as remaining_amount,
                    CASE 
                        WHEN b.allocated_amount > 0 THEN 
                            (COALESCE(SUM(t.amount), 0) / b.allocated_amount * 100)
                        ELSE 0 
                    END as spent_percentage
                FROM budgets b
                LEFT JOIN transactions t ON (
                    t.category_id = b.category_id 
                    AND t.user_id = b.user_id
                    AND t.transaction_date BETWEEN b.start_date AND b.end_date
                    AND t.deleted_at IS NULL
                    AND t.status = 'completed'
                    AND t.type = 'expense'
                )
                WHERE b.user_id = $1 
                    AND b.deleted_at IS NULL
                    AND b.is_active = true
                    ${budgetId ? 'AND b.id = $2' : ''}
                GROUP BY b.id, b.name, b.allocated_amount, b.category_id
                ORDER BY spent_percentage DESC
            )
            SELECT json_agg(row_to_json(bs)) as budget_analysis
            FROM budget_spending bs;
        `;

        const parameters = budgetId ? [userId, budgetId] : [userId];
        const result = await this.dataSource.query(sql, parameters);
        const executionTime = Date.now() - startTime;

        logger.debug('Budget analysis query executed', {
            userId,
            budgetId,
            executionTime
        });

        const budgetAnalysis = result[0]?.budget_analysis || [];

        // Cache the result
        if (this.config.enableQueryCache) {
            await this.cacheService.set(cacheKey, budgetAnalysis, this.config.cacheTtl);
        }

        return {
            sql,
            parameters,
            cacheKey,
            result: budgetAnalysis,
            executionTime
        };
    }

    /**
     * Optimized spending trends query
     */
    async getSpendingTrendsOptimized(
        userId: string, 
        period: 'daily' | 'weekly' | 'monthly' = 'monthly',
        limit: number = 12
    ): Promise<OptimizedQuery<any>> {
        const cacheKey = `trends:${userId}:${period}:${limit}`;

        if (this.config.enableQueryCache) {
            const cached = await this.cacheService.get(cacheKey);
            if (cached) {
                return {
                    sql: 'FROM_CACHE',
                    parameters: [],
                    cacheKey,
                    result: cached
                };
            }
        }

        const startTime = Date.now();
        
        let dateFunction: string;
        let dateFormat: string;
        
        switch (period) {
            case 'daily':
                dateFunction = 'date_trunc(\'day\', transaction_date)';
                dateFormat = 'YYYY-MM-DD';
                break;
            case 'weekly':
                dateFunction = 'date_trunc(\'week\', transaction_date)';
                dateFormat = 'YYYY-"W"WW';
                break;
            default:
                dateFunction = 'date_trunc(\'month\', transaction_date)';
                dateFormat = 'YYYY-MM';
        }

        const sql = `
            SELECT 
                ${dateFunction} as period,
                to_char(${dateFunction}, '${dateFormat}') as period_label,
                SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as income,
                SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as expenses,
                SUM(CASE WHEN type = 'income' THEN amount ELSE -amount END) as net_flow,
                COUNT(*) as transaction_count
            FROM transactions
            WHERE user_id = $1 
                AND deleted_at IS NULL 
                AND status = 'completed'
            GROUP BY ${dateFunction}
            ORDER BY ${dateFunction} DESC
            LIMIT $2;
        `;

        const result = await this.dataSource.query(sql, [userId, limit]);
        const executionTime = Date.now() - startTime;

        logger.debug('Spending trends query executed', {
            userId,
            period,
            limit,
            executionTime
        });

        if (this.config.enableQueryCache) {
            await this.cacheService.set(cacheKey, result, this.config.cacheTtl);
        }

        return {
            sql,
            parameters: [userId, limit],
            cacheKey,
            result,
            executionTime
        };
    }

    /**
     * Invalidate query cache for a user
     */
    async invalidateUserQueryCache(userId: string): Promise<void> {
        await this.cacheService.invalidateUserCache(userId);
        logger.info('User query cache invalidated', { userId });
    }

    /**
     * Get query performance statistics
     */
    getPerformanceStats() {
        return this.cacheService.getStats();
    }

    /**
     * Enable/disable query optimization features
     */
    updateConfig(config: Partial<QueryOptimizationConfig>): void {
        this.config = { ...this.config, ...config };
        logger.info('Query optimizer configuration updated', this.config);
    }
}