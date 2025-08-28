// Application service for budget CRUD operations with percentage validation
import { BudgetEntity, BudgetPeriod, BudgetCategory } from '../../domain/entities/budget.entity';
import { BudgetService } from '../../domain/services/budget.service';
import { UnitOfWork } from '../../domain/services/unit-of-work.service';
import { BudgetRepositoryPostgres } from '../../../infrastructure/database/postgres/repositories/budget.repository';
import { Money } from '../../domain/value-objects/money.vo';
import { DateRange } from '../../domain/value-objects/date-range.vo';
import { BusinessException } from '../../../shared/exceptions/business.exception';
import { ValidationException } from '../../../shared/exceptions/validation.exception';
import { NotFoundException } from '../../../shared/exceptions/not-found.exception';
import { logger } from '../../../infrastructure/monitoring/logger.service';
import {
    CreateBudgetCommand,
    UpdateBudgetCommand,
    BudgetQueryParams,
    CategoryAllocation,
    BudgetListResponse,
    BudgetDetailDto,
    PercentageValidationRequest,
    PercentageValidationResponse,
    BudgetCreationResult
} from '../dtos/budget.dto';

export interface BudgetValidationResult {
    canProceed: boolean;
    warnings: string[];
    errors: string[];
    budgetImpact?: {
        categoryId: string;
        currentSpent: number;
        newSpent: number;
        remainingBudget: number;
        percentageUsed: number;
    };
}

export class BudgetApplicationService {
    private budgetService: BudgetService;
    private budgetRepository: BudgetRepositoryPostgres;
    private unitOfWork: UnitOfWork | null = null;

    constructor(budgetRepository?: BudgetRepositoryPostgres, unitOfWork?: UnitOfWork) {
        this.budgetService = new BudgetService();
        this.budgetRepository = budgetRepository || new BudgetRepositoryPostgres();
        if (unitOfWork) {
            this.unitOfWork = unitOfWork;
            this.unitOfWork.registerRepository(this.budgetRepository);
        }
    }

    async createBudget(command: CreateBudgetCommand): Promise<BudgetEntity> {
        logger.info('Creating budget', { userId: command.userId, name: command.name });

        try {
            // Validate input
            this.validateCreateRequest(command);

            // Validate percentages sum to exactly 100%
            this.validateCategoryPercentages(command.categories);

            // Calculate amounts from percentages
            const totalAmount = new Money(command.totalAmount, command.currency);
            const budgetCategories = this.calculateCategoryAmounts(command.categories, totalAmount);

            // Create date range
            const dateRange = this.createDateRange(command.period, command.startDate, command.endDate);

            // Check for overlapping active budgets
            await this.validateNonOverlappingBudgets(command.userId, dateRange);

            const budget = new BudgetEntity({
                id: this.generateId(),
                userId: command.userId,
                name: command.name,
                description: command.description,
                totalAmount,
                period: command.period,
                dateRange,
                categories: budgetCategories,
                isActive: true,
                alertThreshold: command.alertThreshold,
                createdAt: new Date(),
                updatedAt: new Date()
            });

            // TODO: Save to repository
            // await this.budgetRepository.save(budget);

            logger.info('Budget created successfully', {
                budgetId: budget.id,
                totalCategories: budget.categories.length,
                totalAmount: budget.totalAmount.amount
            });

            return budget;

        } catch (error) {
            logger.error('Failed to create budget', error as Error, { userId: command.userId });
            throw error;
        }
    }

    async updateBudget(command: UpdateBudgetCommand): Promise<BudgetEntity> {
        logger.info('Updating budget', { budgetId: command.id, userId: command.userId });

        try {
            // TODO: Load existing budget from repository
            const existingBudget = await this.findBudgetById(command.id, command.userId);

            // Validate categories if provided
            if (command.categories) {
                this.validateCategoryPercentages(command.categories);

                // Recalculate amounts
                const totalAmount = command.totalAmount ?
                    new Money(command.totalAmount, existingBudget.totalAmount.currency) :
                    existingBudget.totalAmount;

                const updatedCategories = this.calculateCategoryAmounts(command.categories, totalAmount);

                // Clear existing categories and add new ones
                existingBudget.categories.forEach(cat => {
                    existingBudget.removeCategory(cat.categoryId);
                });

                updatedCategories.forEach(cat => {
                    existingBudget.addCategory(cat);
                });
            }

            // Update other properties
            if (command.name) {
                (existingBudget as any).props.name = command.name;
            }
            
            if (command.description !== undefined) {
                (existingBudget as any).props.description = command.description;
            }
            
            if (command.totalAmount) {
                (existingBudget as any).props.totalAmount = new Money(command.totalAmount, existingBudget.totalAmount.currency);
            }
            
            if (command.alertThreshold !== undefined) {
                (existingBudget as any).props.alertThreshold = command.alertThreshold;
            }
            
            if (command.isActive !== undefined) {
                if (command.isActive) {
                    existingBudget.activate();
                } else {
                    existingBudget.deactivate();
                }
            }

            // TODO: Save to repository
            // await this.budgetRepository.save(existingBudget);

            logger.info('Budget updated successfully', { budgetId: command.id });
            return existingBudget;

        } catch (error) {
            logger.error('Failed to update budget', error as Error, { budgetId: command.id, userId: command.userId });
            throw error;
        }
    }

    async getBudgetById(budgetId: string, userId: string): Promise<BudgetEntity> {
        logger.debug('Getting budget by ID', { budgetId, userId });
        
        return this.findBudgetById(budgetId, userId);
    }

    async listBudgets(userId: string, query: BudgetQueryParams): Promise<{
        budgets: BudgetEntity[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    }> {
        logger.debug('Listing budgets', { userId });

        try {
            // TODO: Implement repository query
            // const result = await this.budgetRepository.findByQuery(query);
            
            // Mock response for now
            const mockBudgets = this.getMockBudgets(userId);
            const filteredBudgets = this.filterMockBudgets(mockBudgets, { ...query, userId });

            const page = query.page || 1;
            const limit = query.limit || 10;
            const total = filteredBudgets.length;
            const totalPages = Math.ceil(total / limit);

            const startIndex = (page - 1) * limit;
            const budgets = filteredBudgets.slice(startIndex, startIndex + limit);

            return {
                budgets,
                total,
                page,
                limit,
                totalPages
            };

        } catch (error) {
            logger.error('Failed to list budgets', error as Error, { userId });
            throw error;
        }
    }

    async deleteBudget(budgetId: string, userId: string): Promise<void> {
        logger.info('Deleting budget', { budgetId, userId });

        try {
            const budget = await this.findBudgetById(budgetId, userId);
            
            // Check if budget has transactions
            // TODO: Check for existing transactions
            // const hasTransactions = await this.transactionService.hasBudgetTransactions(budgetId);
            // if (hasTransactions) {
            //     throw new BusinessException('Cannot delete budget with existing transactions', 'BUDGET_HAS_TRANSACTIONS', 409);
            // }

            // Soft delete
            (budget as any).props.deletedAt = new Date();
            budget.deactivate();

            // TODO: Save to repository
            // await this.budgetRepository.save(budget);

            logger.info('Budget deleted successfully', { budgetId });

        } catch (error) {
            logger.error('Failed to delete budget', error as Error, { budgetId, userId });
            throw error;
        }
    }

    async validateTransactionAgainstBudget(
        userId: string,
        categoryId: string,
        transactionAmount: number,
        transactionDate: Date = new Date()
    ): Promise<BudgetValidationResult> {
        logger.debug('Validating transaction against budget', { userId, categoryId, transactionAmount });

        try {
            // TODO: Find active budget for the period
            // const activeBudget = await this.budgetRepository.findActiveByUserAndDate(userId, transactionDate);
            
            const warnings: string[] = [];
            const errors: string[] = [];

            // Mock validation for now
            if (transactionAmount > 1000) {
                warnings.push('Large transaction detected - consider budget impact');
            }

            return {
                canProceed: true,
                warnings,
                errors
            };

        } catch (error) {
            logger.error('Failed to validate transaction against budget', error as Error, { userId, categoryId });
            throw error;
        }
    }

    async recalculateBudgetSpending(budgetId: string): Promise<BudgetEntity> {
        logger.info('Recalculating budget spending', { budgetId });

        try {
            // TODO: Load budget and transactions
            // const budget = await this.budgetRepository.findById(budgetId);
            // const transactions = await this.transactionService.getBudgetTransactions(budgetId);

            // Mock implementation
            const budget = this.getMockBudgets('user-123')[0];

            // TODO: Update spent amounts for each category
            // budget.categories.forEach(category => {
            //     const categoryTransactions = transactions.filter(t => t.categoryId === category.categoryId);
            //     const totalSpent = categoryTransactions.reduce((sum, t) => sum + t.amount, 0);
            //     budget.updateSpentAmount(category.categoryId, new Money(totalSpent, budget.totalAmount.currency));
            // });

            // TODO: Save updated budget
            // await this.budgetRepository.save(budget);

            logger.info('Budget spending recalculated', { budgetId });
            return budget;

        } catch (error) {
            logger.error('Failed to recalculate budget spending', error as Error, { budgetId });
            throw error;
        }
    }

    // Private helper methods

    private validateCreateRequest(command: CreateBudgetCommand): void {
        const errors: Array<{ field: string; message: string }> = [];

        if (!command.name || command.name.trim().length === 0) {
            errors.push({ field: 'name', message: 'Budget name is required' });
        }

        if (!command.userId) {
            errors.push({ field: 'userId', message: 'User ID is required' });
        }

        if (!command.totalAmount || command.totalAmount <= 0) {
            errors.push({ field: 'totalAmount', message: 'Total amount must be greater than zero' });
        }

        if (!command.currency) {
            errors.push({ field: 'currency', message: 'Currency is required' });
        }

        if (!command.startDate) {
            errors.push({ field: 'startDate', message: 'Start date is required' });
        }

        if (command.alertThreshold < 0 || command.alertThreshold > 100) {
            errors.push({ field: 'alertThreshold', message: 'Alert threshold must be between 0 and 100' });
        }

        if (errors.length > 0) {
            throw new ValidationException('Invalid budget creation request', errors);
        }
    }

    private validateCategoryPercentages(categories: CategoryAllocation[]): void {
        if (!categories || categories.length === 0) {
            throw new ValidationException('Budget must have at least one category', [
                { field: 'categories', message: 'At least one category is required' }
            ]);
        }

        // Check each percentage is valid
        categories.forEach((category, index) => {
            if (category.percentage < 0 || category.percentage > 100) {
                throw new ValidationException('Invalid category percentage', [
                    { field: `categories[${index}].percentage`, message: 'Percentage must be between 0 and 100' }
                ]);
            }
        });

        // Check total percentages sum to exactly 100%
        const totalPercentage = categories.reduce((sum, category) => sum + category.percentage, 0);
        
        // Use strict equality for percentages
        if (Math.abs(totalPercentage - 100) > 0.001) {
            throw new ValidationException('Category percentages must sum to exactly 100%', [
                { 
                    field: 'categories', 
                    message: `Total percentage is ${totalPercentage.toFixed(3)}%, must equal 100.000%` 
                }
            ]);
        }

        // Check for duplicate categories
        const categoryIds = categories.map(c => c.categoryId);
        const uniqueCategoryIds = new Set(categoryIds);
        if (categoryIds.length !== uniqueCategoryIds.size) {
            throw new ValidationException('Duplicate categories not allowed', [
                { field: 'categories', message: 'Each category can only be used once per budget' }
            ]);
        }

        logger.debug('Category percentage validation passed', { 
            totalPercentage, 
            categoryCount: categories.length 
        });
    }

    private calculateCategoryAmounts(categories: CategoryAllocation[], totalAmount: Money): BudgetCategory[] {
        return categories.map(category => {
            // Use provided amount or calculate from percentage
            const allocatedAmount = category.amount ? 
                new Money(category.amount, totalAmount.currency) :
                new Money(Math.round((totalAmount.amount * category.percentage) / 100 * 100) / 100, totalAmount.currency);

            return {
                categoryId: category.categoryId,
                categoryName: category.categoryName,
                allocatedAmount,
                spentAmount: new Money(0, totalAmount.currency),
                remainingAmount: allocatedAmount,
                percentageUsed: 0
            };
        });
    }

    private createDateRange(period: BudgetPeriod, startDate: Date, endDate?: Date): DateRange {
        let calculatedEndDate = endDate;

        if (!calculatedEndDate) {
            switch (period) {
                case BudgetPeriod.WEEKLY:
                    calculatedEndDate = new Date(startDate.getTime() + 7 * 24 * 60 * 60 * 1000);
                    break;
                case BudgetPeriod.MONTHLY:
                    calculatedEndDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, startDate.getDate());
                    break;
                case BudgetPeriod.QUARTERLY:
                    calculatedEndDate = new Date(startDate.getFullYear(), startDate.getMonth() + 3, startDate.getDate());
                    break;
                case BudgetPeriod.YEARLY:
                    calculatedEndDate = new Date(startDate.getFullYear() + 1, startDate.getMonth(), startDate.getDate());
                    break;
                case BudgetPeriod.CUSTOM:
                    if (!endDate) {
                        throw new ValidationException('End date is required for custom period', [
                            { field: 'endDate', message: 'End date is required when using custom period' }
                        ]);
                    }
                    calculatedEndDate = endDate;
                    break;
            }
        }

        return new DateRange(startDate, calculatedEndDate!);
    }

    private async validateNonOverlappingBudgets(userId: string, dateRange: DateRange): Promise<void> {
        // TODO: Check database for overlapping active budgets
        // const overlappingBudgets = await this.budgetRepository.findOverlapping(userId, dateRange);
        // if (overlappingBudgets.length > 0) {
        //     throw new BusinessException(
        //         'Cannot create overlapping budget periods', 
        //         'OVERLAPPING_BUDGET', 
        //         409
        //     );
        // }

        logger.debug('Validated non-overlapping budgets', { userId });
    }

    private async findBudgetById(budgetId: string, userId: string): Promise<BudgetEntity> {
        // TODO: Load from repository
        // const budget = await this.budgetRepository.findById(budgetId);
        // if (!budget || budget.userId !== userId || budget.deletedAt) {
        //     throw new BusinessException('Budget not found', 'BUDGET_NOT_FOUND', 404);
        // }
        // return budget;

        // Mock for now
        const mockBudgets = this.getMockBudgets(userId);
        const budget = mockBudgets.find(b => b.id === budgetId);
        
        if (!budget) {
            throw new BusinessException('Budget not found', 'BUDGET_NOT_FOUND', 404);
        }

        return budget;
    }

    private generateId(): string {
        return 'budget_' + Math.random().toString(36).substr(2, 9);
    }

    // Mock methods for development
    private getMockBudgets(userId: string): BudgetEntity[] {
        const mockCategories: BudgetCategory[] = [
            {
                categoryId: 'food',
                categoryName: 'Alimentação',
                allocatedAmount: new Money(1500, 'BRL'),
                spentAmount: new Money(800, 'BRL'),
                remainingAmount: new Money(700, 'BRL'),
                percentageUsed: 53.3
            },
            {
                categoryId: 'transport',
                categoryName: 'Transporte',
                allocatedAmount: new Money(800, 'BRL'),
                spentAmount: new Money(650, 'BRL'),
                remainingAmount: new Money(150, 'BRL'),
                percentageUsed: 81.25
            },
            {
                categoryId: 'entertainment',
                categoryName: 'Entretenimento',
                allocatedAmount: new Money(500, 'BRL'),
                spentAmount: new Money(200, 'BRL'),
                remainingAmount: new Money(300, 'BRL'),
                percentageUsed: 40
            }
        ];

        return [
            new BudgetEntity({
                id: 'budget_123',
                userId,
                name: 'Orçamento Mensal - Agosto 2024',
                description: 'Orçamento para controle de gastos mensais',
                totalAmount: new Money(2800, 'BRL'),
                period: BudgetPeriod.MONTHLY,
                dateRange: new DateRange(new Date('2024-08-01'), new Date('2024-08-31')),
                categories: mockCategories,
                isActive: true,
                alertThreshold: 80,
                createdAt: new Date('2024-08-01'),
                updatedAt: new Date()
            })
        ];
    }

    private filterMockBudgets(budgets: BudgetEntity[], query: BudgetQueryParams & { userId: string }): BudgetEntity[] {
        return budgets.filter(budget => {
            if (query.isActive !== undefined && budget.isActive !== query.isActive) {
                return false;
            }
            
            if (query.period && budget.period !== query.period) {
                return false;
            }

            return true;
        });
    }
}