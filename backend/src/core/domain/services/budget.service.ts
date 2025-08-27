// backend/src/core/domain/services/budget.service.ts

// Removed NestJS dependency
import { BudgetEntity } from '../entities/budget.entity';
import { Money } from '../value-objects/money.vo';
import { logger } from '../../../infrastructure/monitoring/logger.service';

export interface BudgetAllocation {
    categoryId: string;
    allocatedAmount: Money;
    priority: 'high' | 'medium' | 'low';
}

export interface BudgetAnalysis {
    totalBudget: Money;
    totalAllocated: Money;
    totalSpent: Money;
    remainingBudget: Money;
    utilizationPercentage: number;
    categoryBreakdown: Array<{
        categoryId: string;
        allocated: Money;
        spent: Money;
        remaining: Money;
        percentage: number;
        status: 'under_budget' | 'on_budget' | 'over_budget';
    }>;
}

export class BudgetService {
    constructor() {}

    /**
     * Validates budget allocations
     */
    validateBudgetAllocations(
        totalBudget: Money, 
        allocations: BudgetAllocation[]
    ): { isValid: boolean; errors: string[] } {
        const errors: string[] = [];

        if (!totalBudget || totalBudget.getAmount() <= 0) {
            errors.push('Total budget must be greater than zero');
        }

        if (!allocations || allocations.length === 0) {
            errors.push('At least one budget allocation is required');
        }

        const totalAllocated = allocations.reduce(
            (sum, allocation) => sum + allocation.allocatedAmount.getAmount(), 
            0
        );

        if (totalAllocated > totalBudget.getAmount()) {
            errors.push(`Total allocations (${totalAllocated}) exceed total budget (${totalBudget.getAmount()})`);
        }

        // Check for duplicate categories
        const categoryIds = allocations.map(a => a.categoryId);
        const uniqueCategoryIds = [...new Set(categoryIds)];
        if (categoryIds.length !== uniqueCategoryIds.length) {
            errors.push('Duplicate category allocations are not allowed');
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * Analyzes budget performance
     */
    async analyzeBudgetPerformance(
        budget: BudgetEntity,
        actualSpending: Map<string, Money>
    ): Promise<BudgetAnalysis> {
        try {
            logger.debug('Analyzing budget performance', { budgetId: budget.getId() });

            const totalBudget = budget.getTotalAmount();
            const totalAllocated = new Money(
                budget.getAllocations().reduce((sum, alloc) => sum + alloc.amount.getAmount(), 0),
                totalBudget.getCurrency()
            );

            let totalSpentAmount = 0;
            const categoryBreakdown = budget.getAllocations().map(allocation => {
                const spent = actualSpending.get(allocation.categoryId) || new Money(0, totalBudget.getCurrency());
                totalSpentAmount += spent.getAmount();

                const remaining = new Money(
                    Math.max(0, allocation.amount.getAmount() - spent.getAmount()),
                    totalBudget.getCurrency()
                );

                const percentage = allocation.amount.getAmount() > 0 
                    ? (spent.getAmount() / allocation.amount.getAmount()) * 100 
                    : 0;

                let status: 'under_budget' | 'on_budget' | 'over_budget';
                if (percentage > 100) {
                    status = 'over_budget';
                } else if (percentage >= 95) {
                    status = 'on_budget';
                } else {
                    status = 'under_budget';
                }

                return {
                    categoryId: allocation.categoryId,
                    allocated: allocation.amount,
                    spent,
                    remaining,
                    percentage,
                    status
                };
            });

            const totalSpent = new Money(totalSpentAmount, totalBudget.getCurrency());
            const remainingBudget = new Money(
                Math.max(0, totalBudget.getAmount() - totalSpentAmount),
                totalBudget.getCurrency()
            );

            const utilizationPercentage = totalBudget.getAmount() > 0 
                ? (totalSpentAmount / totalBudget.getAmount()) * 100 
                : 0;

            const analysis: BudgetAnalysis = {
                totalBudget,
                totalAllocated,
                totalSpent,
                remainingBudget,
                utilizationPercentage,
                categoryBreakdown
            };

            logger.info('Budget performance analyzed', {
                budgetId: budget.getId(),
                utilizationPercentage,
                overBudgetCategories: categoryBreakdown.filter(c => c.status === 'over_budget').length
            });

            return analysis;

        } catch (error) {
            logger.error('Failed to analyze budget performance', error as Error, {
                budgetId: budget.getId()
            });
            throw error;
        }
    }

    /**
     * Suggests budget optimizations
     */
    suggestBudgetOptimizations(analysis: BudgetAnalysis): Array<{
        type: 'reallocation' | 'increase' | 'decrease';
        category: string;
        currentAmount: Money;
        suggestedAmount: Money;
        reason: string;
    }> {
        const suggestions: Array<{
            type: 'reallocation' | 'increase' | 'decrease';
            category: string;
            currentAmount: Money;
            suggestedAmount: Money;
            reason: string;
        }> = [];

        analysis.categoryBreakdown.forEach(category => {
            if (category.status === 'over_budget' && category.percentage > 120) {
                // Suggest increase for significantly over-budget categories
                const suggestedIncrease = category.allocated.getAmount() * 0.2; // 20% increase
                suggestions.push({
                    type: 'increase',
                    category: category.categoryId,
                    currentAmount: category.allocated,
                    suggestedAmount: new Money(
                        category.allocated.getAmount() + suggestedIncrease,
                        category.allocated.getCurrency()
                    ),
                    reason: `Category is ${category.percentage.toFixed(1)}% over budget`
                });
            } else if (category.status === 'under_budget' && category.percentage < 60) {
                // Suggest decrease for significantly under-budget categories
                const suggestedDecrease = category.allocated.getAmount() * 0.1; // 10% decrease
                suggestions.push({
                    type: 'decrease',
                    category: category.categoryId,
                    currentAmount: category.allocated,
                    suggestedAmount: new Money(
                        Math.max(category.spent.getAmount(), category.allocated.getAmount() - suggestedDecrease),
                        category.allocated.getCurrency()
                    ),
                    reason: `Category is only ${category.percentage.toFixed(1)}% utilized`
                });
            }
        });

        return suggestions;
    }

    /**
     * Calculates budget variance
     */
    calculateBudgetVariance(budgeted: Money, actual: Money): {
        variance: Money;
        variancePercentage: number;
        isOverBudget: boolean;
    } {
        const varianceAmount = actual.getAmount() - budgeted.getAmount();
        const variance = new Money(Math.abs(varianceAmount), budgeted.getCurrency());
        
        const variancePercentage = budgeted.getAmount() > 0 
            ? (varianceAmount / budgeted.getAmount()) * 100 
            : 0;

        return {
            variance,
            variancePercentage,
            isOverBudget: varianceAmount > 0
        };
    }
}