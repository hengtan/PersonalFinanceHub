// backend/src/shared/types/database.types.ts

export interface BaseEntity {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    deletedAt?: Date;
}

export interface User {
    id: string;
    email: string;
    password_hash: string;
    first_name: string;
    last_name: string;
    phone?: string;
    timezone: string;
    currency: string;
    status: 'active' | 'inactive' | 'suspended';
    email_verified: boolean;
    created_at: Date;
    updated_at: Date;
}

export interface Account {
    id: string;
    user_id: string;
    name: string;
    account_type: 'checking' | 'savings' | 'credit_card' | 'investment' | 'cash' | 'loan';
    current_balance: number;
    currency: string;
    is_primary: boolean;
    created_at: Date;
    updated_at: Date;
}

export interface Transaction {
    id: string;
    user_id: string;
    description: string;
    amount: number;
    transaction_type: 'income' | 'expense' | 'transfer';
    transaction_date: Date;
    category_id?: string;
    account_id: string;
    transfer_account_id?: string;
    merchant_id?: string;
    status: 'pending' | 'cleared' | 'reconciled' | 'cancelled';
    notes?: string;
    created_at: Date;
    updated_at: Date;
}

export interface Category {
    id: string;
    user_id?: string;
    name: string;
    category_type: 'income' | 'expense' | 'transfer';
    color?: string;
    icon?: string;
    is_system: boolean;
    is_active: boolean;
}

export interface Budget {
    id: string;
    user_id: string;
    period: string; // YYYY-MM format
    total_income_budget: number;
    total_expense_budget: number;
    is_active: boolean;
    notes?: string;
    created_at: Date;
    updated_at: Date;
}