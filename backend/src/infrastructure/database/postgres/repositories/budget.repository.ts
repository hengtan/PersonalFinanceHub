// backend/src/infrastructure/database/postgres/repositories/budget.repository.ts
import { PoolClient } from 'pg';
import { BudgetEntity } from '../../../../core/domain/entities/budget.entity';
import { IRepository } from '../../../../core/domain/services/unit-of-work.service';
import { logger } from '../../../monitoring/logger.service';

export class BudgetRepositoryPostgres implements IRepository {
    private connection: PoolClient | null = null;

    setConnection(connection: PoolClient): void {
        this.connection = connection;
        logger.debug('Budget repository connection set');
    }

    clearConnection(): void {
        this.connection = null;
        logger.debug('Budget repository connection cleared');
    }

    private getConnection(): PoolClient {
        if (!this.connection) {
            throw new Error('No database connection available. Repository must be used within a Unit of Work.');
        }
        return this.connection;
    }

    async save(budget: BudgetEntity): Promise<BudgetEntity> {
        // TODO: Implement save to PostgreSQL
        logger.debug('Saving budget to PostgreSQL', { budgetId: budget.id });
        return budget;
    }

    async findById(id: string): Promise<BudgetEntity | null> {
        // TODO: Implement findById from PostgreSQL
        logger.debug('Finding budget by ID', { budgetId: id });
        return null;
    }

    async findByUserId(userId: string): Promise<BudgetEntity[]> {
        // TODO: Implement findByUserId from PostgreSQL
        logger.debug('Finding budgets by user ID', { userId });
        return [];
    }

    async update(budget: BudgetEntity): Promise<BudgetEntity> {
        // TODO: Implement update in PostgreSQL
        logger.debug('Updating budget in PostgreSQL', { budgetId: budget.id });
        return budget;
    }

    async delete(id: string): Promise<void> {
        // TODO: Implement delete from PostgreSQL
        logger.debug('Deleting budget from PostgreSQL', { budgetId: id });
    }
}