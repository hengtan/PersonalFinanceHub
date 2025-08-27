// backend/src/core/application/use-cases/budget/update-budget.use-case.ts

// Removed NestJS dependency
import { logger } from '../../../../infrastructure/monitoring/logger.service';

export interface UpdateBudgetRequest {
    userId: string;
    budgetId?: string;
    name: string;
    totalAmount: number;
    period: 'weekly' | 'monthly' | 'quarterly' | 'yearly';
    categories: Array<{
        categoryId: string;
        name: string;
        allocatedAmount: number;
        priority: 'high' | 'medium' | 'low';
    }>;
    startDate: Date;
    endDate?: Date;
}

export interface UpdateBudgetResponse {
    success: boolean;
    budgetId: string;
    message: string;
    budget: {
        id: string;
        name: string;
        totalAmount: number;
        period: string;
        remainingAmount: number;
        spentAmount: number;
        categories: Array<{
            categoryId: string;
            name: string;
            allocatedAmount: number;
            spentAmount: number;
            remainingAmount: number;
            percentage: number;
            priority: string;
        }>;
        status: 'active' | 'inactive' | 'exceeded';
        startDate: string;
        endDate?: string;
        createdAt: string;
        updatedAt: string;
    };
}

export class UpdateBudgetUseCase {
    constructor() {}

    async execute(request: UpdateBudgetRequest): Promise<UpdateBudgetResponse> {
        try {
            logger.info('Updating budget', { 
                userId: request.userId,
                budgetId: request.budgetId,
                totalAmount: request.totalAmount 
            });

            // Validate budget data
            this.validateBudgetRequest(request);

            // Mock update for now - replace with actual repository calls
            const budgetId = request.budgetId || `budget-${Date.now()}`;
            const currentSpent = 1250.75; // Mock current spent amount

            const updatedBudget = {
                id: budgetId,
                name: request.name,
                totalAmount: request.totalAmount,
                period: request.period,
                remainingAmount: request.totalAmount - currentSpent,
                spentAmount: currentSpent,
                categories: request.categories.map(cat => {
                    const mockSpent = Math.random() * cat.allocatedAmount * 0.8;
                    return {
                        categoryId: cat.categoryId,
                        name: cat.name,
                        allocatedAmount: cat.allocatedAmount,
                        spentAmount: mockSpent,
                        remainingAmount: cat.allocatedAmount - mockSpent,
                        percentage: (mockSpent / cat.allocatedAmount) * 100,
                        priority: cat.priority
                    };
                }),
                status: this.calculateBudgetStatus(request.totalAmount, currentSpent),
                startDate: request.startDate.toISOString(),
                endDate: request.endDate?.toISOString(),
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            logger.info('Budget updated successfully', { 
                userId: request.userId,
                budgetId,
                status: updatedBudget.status
            });

            return {
                success: true,
                budgetId,
                message: 'Budget updated successfully',
                budget: updatedBudget
            };

        } catch (error) {
            logger.error('Failed to update budget', error as Error, {
                userId: request.userId,
                budgetId: request.budgetId
            });
            throw error;
        }
    }

    private validateBudgetRequest(request: UpdateBudgetRequest): void {
        if (!request.userId) {
            throw new Error('User ID is required');
        }

        if (!request.name?.trim()) {
            throw new Error('Budget name is required');
        }

        if (request.totalAmount <= 0) {
            throw new Error('Total amount must be greater than 0');
        }

        if (!request.categories || request.categories.length === 0) {
            throw new Error('At least one category is required');
        }

        const totalCategoriesAmount = request.categories.reduce(
            (sum, cat) => sum + cat.allocatedAmount, 
            0
        );

        if (totalCategoriesAmount > request.totalAmount) {
            throw new Error('Sum of category allocations cannot exceed total budget amount');
        }
    }

    private calculateBudgetStatus(totalAmount: number, spentAmount: number): 'active' | 'inactive' | 'exceeded' {
        if (spentAmount > totalAmount) {
            return 'exceeded';
        }
        return 'active';
    }
}