// backend/src/shared/constants/status-codes.ts
export const HTTP_STATUS = {
    // Success
    SUCCESS: 200,
    CREATED: 201,
    ACCEPTED: 202,
    NO_CONTENT: 204,

    // Client Errors
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    METHOD_NOT_ALLOWED: 405,
    CONFLICT: 409,
    UNPROCESSABLE_ENTITY: 422,
    TOO_MANY_REQUESTS: 429,

    // Server Errors
    INTERNAL_ERROR: 500,
    NOT_IMPLEMENTED: 501,
    SERVICE_UNAVAILABLE: 503,
    GATEWAY_TIMEOUT: 504
} as const;

// backend/src/shared/constants/error-codes.ts
export const ERROR_CODES = {
    // Authentication & Authorization
    INVALID_CREDENTIALS: 'AUTH001',
    TOKEN_EXPIRED: 'AUTH002',
    TOKEN_INVALID: 'AUTH003',
    INSUFFICIENT_PERMISSIONS: 'AUTH004',
    ACCOUNT_LOCKED: 'AUTH005',
    ACCOUNT_INACTIVE: 'AUTH006',

    // Validation
    INVALID_INPUT: 'VAL001',
    REQUIRED_FIELD: 'VAL002',
    INVALID_FORMAT: 'VAL003',
    INVALID_RANGE: 'VAL004',

    // Business Logic
    BUDGET_EXCEEDED: 'BIZ001',
    INSUFFICIENT_BALANCE: 'BIZ002',
    TRANSACTION_LIMIT_EXCEEDED: 'BIZ003',
    INVALID_OPERATION: 'BIZ004',
    RESOURCE_NOT_FOUND: 'BIZ005',
    DUPLICATE_RESOURCE: 'BIZ006',

    // Infrastructure
    DATABASE_ERROR: 'INF001',
    CACHE_ERROR: 'INF002',
    EXTERNAL_SERVICE_ERROR: 'INF003',
    FILE_STORAGE_ERROR: 'INF004',
    MESSAGING_ERROR: 'INF005',

    // System
    SERVICE_UNAVAILABLE: 'SYS001',
    MAINTENANCE_MODE: 'SYS002',
    RATE_LIMIT_EXCEEDED: 'SYS003'
} as const;

// backend/src/shared/constants/business-rules.ts
export const BUSINESS_RULES = {
    PASSWORD: {
        MIN_LENGTH: 8,
        REQUIRE_UPPERCASE: true,
        REQUIRE_LOWERCASE: true,
        REQUIRE_NUMBERS: true,
        REQUIRE_SPECIAL_CHARS: true
    },
    TRANSACTION: {
        MAX_AMOUNT: 1000000, // R$ 1 milhão
        MIN_AMOUNT: 0.01,
        DAILY_LIMIT: 50000, // R$ 50 mil
        MAX_DESCRIPTION_LENGTH: 500
    },
    BUDGET: {
        MAX_CATEGORIES: 50,
        MIN_AMOUNT: 0.01,
        MAX_AMOUNT: 10000000, // R$ 10 milhões
        ALERT_THRESHOLD_PERCENTAGE: 80
    },
    USER: {
        MAX_ACCOUNTS: 10,
        MAX_CATEGORIES: 100,
        SESSION_DURATION: 3600, // 1 hour in seconds
        REFRESH_TOKEN_DURATION: 604800 // 7 days in seconds
    },
    RATE_LIMITING: {
        LOGIN_ATTEMPTS: {
            MAX_REQUESTS: 5,
            WINDOW_MS: 900000 // 15 minutes
        },
        API_REQUESTS: {
            MAX_REQUESTS: 100,
            WINDOW_MS: 60000 // 1 minute
        },
        REPORT_GENERATION: {
            MAX_REQUESTS: 10,
            WINDOW_MS: 300000 // 5 minutes
        }
    }
} as const;

// backend/src/shared/types/api.types.ts
export interface ApiResponse<T = any> {
    success: boolean;
    message: string;
    data?: T;
    errors?: any[];
    meta?: {
        total?: number;
        page?: number;
        limit?: number;
        totalPages?: number;
    };
}

export interface PaginationParams {
    page: number;
    limit: number;
    sortBy?: string;
    sortOrder?: 'ASC' | 'DESC';
}

export interface DateRange {
    startDate: Date;
    endDate: Date;
}

export interface FilterParams {
    search?: string;
    category?: string;
    status?: string;
    dateRange?: DateRange;
    tags?: string[];
}

// backend/src/shared/types/report.types.ts
export enum ReportType {
    FINANCIAL_SUMMARY = 'financial_summary',
    EXPENSE_ANALYSIS = 'expense_analysis',
    INCOME_ANALYSIS = 'income_analysis',
    BUDGET_COMPARISON = 'budget_comparison',
    CASH_FLOW = 'cash_flow',
    CATEGORY_BREAKDOWN = 'category_breakdown',
    MONTHLY_TRENDS = 'monthly_trends',
    ANNUAL_SUMMARY = 'annual_summary'
}

export enum ReportFormat {
    PDF = 'PDF',
    EXCEL = 'EXCEL',
    CSV = 'CSV',
    JSON = 'JSON'
}

export interface ReportGenerationRequest {
    userId: string;
    reportType: ReportType;
    dateRange: DateRange;
    filters?: {
        categories?: string[];
        accounts?: string[];
        groupBy?: 'day' | 'week' | 'month' | 'year';
        includeProjections?: boolean;
    };
}

export interface ReportData {
    id: string;
    type: ReportType;
    title: string;
    generatedAt: Date;
    dateRange: DateRange;
    data: any[];
    summary: {
        totalIncome: number;
        totalExpenses: number;
        netIncome: number;
        totalTransactions: number;
    };
    charts?: {
        type: 'line' | 'bar' | 'pie' | 'donut';
        data: any[];
        config: any;
    }[];
    insights?: string[];
}

// backend/src/shared/types/database.types.ts
export interface BaseEntity {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    deletedAt?: Date;
}

export interface AuditableEntity extends BaseEntity {
    createdBy?: string;
    updatedBy?: string;
}

export interface QueryOptions {
    select?: string[];
    where?: Record<string, any>;
    orderBy?: Record<string, 'ASC' | 'DESC'>;
    limit?: number;
    offset?: number;
    relations?: string[];
}

export interface DatabaseConnection {
    query(sql: string, parameters?: any[]): Promise<any[]>;
    transaction<T>(callback: (trx: any) => Promise<T>): Promise<T>;
    close(): Promise<void>;
}

// backend/src/shared/types/common.types.ts
export type Currency = 'BRL' | 'USD' | 'EUR';

export interface Money {
    amount: number;
    currency: Currency;
}

export interface Address {
    street: string;
    number: string;
    complement?: string;
    neighborhood: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
}

export interface ContactInfo {
    email: string;
    phone?: string;
    mobile?: string;
}

export type TransactionType = 'INCOME' | 'EXPENSE' | 'TRANSFER';
export type TransactionStatus = 'PENDING' | 'COMPLETED' | 'CANCELLED' | 'FAILED';
export type PaymentMethod = 'CASH' | 'DEBIT_CARD' | 'CREDIT_CARD' | 'PIX' | 'BANK_TRANSFER' | 'CRYPTOCURRENCY';

export interface UserPreferences {
    language: 'pt-BR' | 'en-US';
    currency: Currency;
    timezone: string;
    dateFormat: 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';
    theme: 'light' | 'dark' | 'auto';
    notifications: {
        email: boolean;
        push: boolean;
        sms: boolean;
        budgetAlerts: boolean;
        transactionAlerts: boolean;
    };
}