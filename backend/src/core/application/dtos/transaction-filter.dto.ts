// backend/src/core/application/dtos/transaction-filter.dto.ts

export interface TransactionFilterParams {
    // Pagination
    page?: number;
    limit?: number;
    
    // Date filters
    startDate?: string;
    endDate?: string;
    dateRange?: 'today' | 'yesterday' | 'last_7_days' | 'last_30_days' | 'this_month' | 'last_month' | 'this_year' | 'last_year' | 'custom';
    
    // Amount filters
    minAmount?: number;
    maxAmount?: number;
    amountOperator?: 'equals' | 'greater_than' | 'less_than' | 'between';
    
    // Category filters
    categoryIds?: string[];
    categoryNames?: string[];
    excludeCategoryIds?: string[];
    
    // Account filters
    accountIds?: string[];
    accountNames?: string[];
    accountTypes?: string[];
    
    // Transaction type filters
    transactionTypes?: ('income' | 'expense' | 'transfer')[];
    
    // Status filters
    statuses?: ('pending' | 'completed' | 'cancelled' | 'failed')[];
    
    // Text search
    searchText?: string;
    searchFields?: ('description' | 'notes' | 'reference' | 'tags')[];
    
    // Tags
    tags?: string[];
    excludeTags?: string[];
    
    // Currency
    currencies?: string[];
    
    // Merchant/Payee
    merchants?: string[];
    payees?: string[];
    
    // Recurring transactions
    isRecurring?: boolean;
    recurringPatterns?: string[];
    
    // Location (if available)
    locations?: string[];
    
    // Custom metadata filters
    metadata?: Record<string, any>;
    
    // Sorting
    sortBy?: 'date' | 'amount' | 'description' | 'category' | 'account' | 'created_at' | 'updated_at';
    sortOrder?: 'asc' | 'desc';
    
    // Advanced filters
    hasAttachments?: boolean;
    hasNotes?: boolean;
    isReviewed?: boolean;
    isFlagged?: boolean;
    
    // User-defined custom filters
    savedFilterId?: string;
    customFilters?: CustomFilter[];
}

export interface CustomFilter {
    field: string;
    operator: 'equals' | 'not_equals' | 'contains' | 'not_contains' | 'starts_with' | 'ends_with' | 'greater_than' | 'less_than' | 'in' | 'not_in' | 'is_null' | 'is_not_null';
    value: any;
    logicalOperator?: 'AND' | 'OR';
}

export interface TransactionFilterResult {
    transactions: any[];
    totalCount: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    appliedFilters: AppliedFilter[];
    aggregations?: TransactionAggregations;
}

export interface AppliedFilter {
    field: string;
    operator: string;
    value: any;
    label: string;
}

export interface TransactionAggregations {
    totalAmount: number;
    averageAmount: number;
    transactionCount: number;
    categoryBreakdown: CategoryBreakdown[];
    monthlyBreakdown: MonthlyBreakdown[];
    accountBreakdown: AccountBreakdown[];
}

export interface CategoryBreakdown {
    categoryId: string;
    categoryName: string;
    amount: number;
    count: number;
    percentage: number;
}

export interface MonthlyBreakdown {
    month: string;
    year: number;
    amount: number;
    count: number;
    incomeAmount: number;
    expenseAmount: number;
}

export interface AccountBreakdown {
    accountId: string;
    accountName: string;
    amount: number;
    count: number;
    percentage: number;
}

export interface SavedFilter {
    id: string;
    userId: string;
    name: string;
    description?: string;
    filters: TransactionFilterParams;
    isDefault?: boolean;
    isPublic?: boolean;
    tags?: string[];
    createdAt: Date;
    updatedAt: Date;
    usageCount?: number;
}

export interface CreateSavedFilterCommand {
    userId: string;
    name: string;
    description?: string;
    filters: TransactionFilterParams;
    isDefault?: boolean;
    isPublic?: boolean;
    tags?: string[];
}

export interface UpdateSavedFilterCommand {
    id: string;
    userId: string;
    name?: string;
    description?: string;
    filters?: TransactionFilterParams;
    isDefault?: boolean;
    isPublic?: boolean;
    tags?: string[];
}

export interface TransactionExportParams extends TransactionFilterParams {
    format: 'csv' | 'xlsx' | 'pdf' | 'json';
    includeHeaders?: boolean;
    selectedFields?: string[];
    groupBy?: string;
    includeAggregations?: boolean;
}

// Common predefined filters
export const PREDEFINED_FILTERS = {
    TODAY: {
        dateRange: 'today' as const
    },
    THIS_WEEK: {
        dateRange: 'last_7_days' as const
    },
    THIS_MONTH: {
        dateRange: 'this_month' as const
    },
    LARGE_EXPENSES: {
        transactionTypes: ['expense' as const],
        minAmount: 500,
        sortBy: 'amount' as const,
        sortOrder: 'desc' as const
    },
    RECENT_INCOME: {
        transactionTypes: ['income' as const],
        dateRange: 'last_30_days' as const,
        sortBy: 'date' as const,
        sortOrder: 'desc' as const
    },
    PENDING_TRANSACTIONS: {
        statuses: ['pending' as const],
        sortBy: 'date' as const,
        sortOrder: 'asc' as const
    },
    FLAGGED_TRANSACTIONS: {
        isFlagged: true,
        sortBy: 'date' as const,
        sortOrder: 'desc' as const
    }
} as const;