// DTOs for Budget application service - Sprint 2 implementation
import { BudgetPeriod } from '../../domain/entities/budget.entity';

export interface CategoryAllocation {
    categoryId: string;
    categoryName: string;
    percentage: number; // 0-100, must sum to exactly 100%
    allocatedAmount?: number; // Calculated from percentage if not provided
    description?: string;
    isEssential?: boolean;
}

export interface CreateBudgetCommand {
    userId: string;
    name: string;
    description?: string;
    totalAmount: number;
    currency: string;
    period: BudgetPeriod;
    startDate: Date;
    endDate?: Date;
    categories: CategoryAllocation[];
    alertThreshold: number; // 0-100 percentage
    budgetType?: 'zero_based' | 'percentage_based' | 'envelope';
    isActive?: boolean;
}

export interface UpdateBudgetCommand {
    id: string;
    userId: string;
    name?: string;
    description?: string;
    totalAmount?: number;
    categories?: CategoryAllocation[];
    alertThreshold?: number;
    isActive?: boolean;
}

export interface BudgetQueryParams {
    userId?: string;
    isActive?: boolean;
    period?: BudgetPeriod;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
    budgetType?: string;
    search?: string;
}

export interface BudgetListResponse {
    budgets: BudgetSummaryDto[];
    pagination: {
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    };
}

export interface BudgetSummaryDto {
    id: string;
    name: string;
    description?: string;
    totalAmount: {
        amount: number;
        currency: string;
    };
    period: BudgetPeriod;
    dateRange: {
        startDate: string;
        endDate: string;
    };
    isActive: boolean;
    alertThreshold: number;
    usagePercentage: number;
    totalSpent: {
        amount: number;
        currency: string;
    };
    totalRemaining: {
        amount: number;
        currency: string;
    };
    categoriesCount: number;
    categoriesOverBudget: number;
    createdAt: string;
    updatedAt: string;
}

export interface BudgetDetailDto extends BudgetSummaryDto {
    categories: BudgetCategoryDto[];
    isCurrentlyActive: boolean;
    shouldAlert: boolean;
    isOverBudget: boolean;
}

export interface BudgetCategoryDto {
    categoryId: string;
    categoryName: string;
    allocatedAmount: {
        amount: number;
        currency: string;
    };
    spentAmount: {
        amount: number;
        currency: string;
    };
    remainingAmount: {
        amount: number;
        currency: string;
    };
    percentageUsed: number;
    isOverBudget: boolean;
    isEssential?: boolean;
    description?: string;
}

export interface PercentageValidationRequest {
    categories: CategoryAllocation[];
    totalAmount?: number;
    currency?: string;
}

export interface PercentageValidationResponse {
    isValid: boolean;
    totalPercentage: number;
    expectedPercentage: number;
    variance: number;
    categories: {
        categoryId: string;
        categoryName: string;
        percentage: number;
        allocatedAmount: number;
    }[];
    warnings: string[];
    errors: string[];
}

export interface BudgetCreationResult {
    budget: BudgetDetailDto;
    warnings: string[];
    validationResults: {
        percentageValidation: boolean;
        overlappingBudgets: boolean;
        totalAmountCheck: boolean;
    };
}

export interface BudgetUpdateResult {
    budget: BudgetDetailDto;
    changes: {
        field: string;
        oldValue: any;
        newValue: any;
    }[];
    warnings: string[];
}

export interface BudgetUsageReport {
    budgetId: string;
    period: {
        startDate: string;
        endDate: string;
    };
    totalBudget: {
        amount: number;
        currency: string;
    };
    totalSpent: {
        amount: number;
        currency: string;
    };
    remainingBudget: {
        amount: number;
        currency: string;
    };
    usagePercentage: number;
    categoryBreakdown: {
        categoryId: string;
        categoryName: string;
        budgeted: number;
        spent: number;
        remaining: number;
        percentageUsed: number;
        variance: number; // positive = under budget, negative = over budget
    }[];
    alerts: {
        type: 'overspend' | 'warning' | 'goal_achieved';
        categoryId?: string;
        message: string;
        severity: 'low' | 'medium' | 'high';
    }[];
    recommendations: {
        type: 'rebalance' | 'increase' | 'decrease' | 'monitor';
        categoryId?: string;
        message: string;
        suggestedAmount?: number;
    }[];
}

// Utility types for API responses
export interface BudgetApiResponse<T = any> {
    success: boolean;
    data: T;
    message?: string;
    timestamp: string;
    requestId: string;
}

export interface BudgetApiError {
    success: false;
    error: string;
    message: string;
    details?: Array<{
        field: string;
        message: string;
        code?: string;
    }>;
    timestamp: string;
    requestId: string;
}