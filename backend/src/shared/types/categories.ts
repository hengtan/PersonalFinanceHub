
// backend/src/shared/constants/categories.ts
export const SYSTEM_CATEGORIES = [
    // Income
    { name: 'Salary', type: 'income', color: '#4CAF50', icon: 'briefcase' },
    { name: 'Freelance', type: 'income', color: '#4CAF50', icon: 'laptop' },
    { name: 'Investment Returns', type: 'income', color: '#4CAF50', icon: 'trending-up' },
    { name: 'Other Income', type: 'income', color: '#4CAF50', icon: 'plus-circle' },

    // Expenses
    { name: 'Food & Dining', type: 'expense', color: '#FF5722', icon: 'utensils' },
    { name: 'Transportation', type: 'expense', color: '#FF9800', icon: 'car' },
    { name: 'Shopping', type: 'expense', color: '#9C27B0', icon: 'shopping-bag' },
    { name: 'Entertainment', type: 'expense', color: '#E91E63', icon: 'film' },
    { name: 'Bills & Utilities', type: 'expense', color: '#607D8B', icon: 'file-text' },
    { name: 'Healthcare', type: 'expense', color: '#F44336', icon: 'heart' },
    { name: 'Education', type: 'expense', color: '#3F51B5', icon: 'book' },
    { name: 'Travel', type: 'expense', color: '#00BCD4', icon: 'map-pin' },
    { name: 'Housing', type: 'expense', color: '#795548', icon: 'home' },
    { name: 'Insurance', type: 'expense', color: '#9E9E9E', icon: 'shield' },
];

export const ERROR_CODES = {
    // Authentication
    MISSING_TOKEN: 'MISSING_TOKEN',
    INVALID_TOKEN: 'INVALID_TOKEN',
    TOKEN_EXPIRED: 'TOKEN_EXPIRED',
    TOKEN_REVOKED: 'TOKEN_REVOKED',

    // Authorization
    FORBIDDEN: 'FORBIDDEN',
    NOT_AUTHENTICATED: 'NOT_AUTHENTICATED',

    // Validation
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',
    INVALID_FORMAT: 'INVALID_FORMAT',

    // Business Logic
    USER_EXISTS: 'USER_EXISTS',
    USER_NOT_FOUND: 'USER_NOT_FOUND',
    ACCOUNT_NOT_FOUND: 'ACCOUNT_NOT_FOUND',
    TRANSACTION_NOT_FOUND: 'TRANSACTION_NOT_FOUND',
    BUDGET_NOT_FOUND: 'BUDGET_NOT_FOUND',
    INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
    ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
    ACCOUNT_INACTIVE: 'ACCOUNT_INACTIVE',

    // System
    DATABASE_ERROR: 'DATABASE_ERROR',
    CACHE_ERROR: 'CACHE_ERROR',
    SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
    INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',

    // Rate Limiting
    RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
} as const;