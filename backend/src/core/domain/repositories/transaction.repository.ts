// backend/src/core/domain/repositories/transaction.repository.ts
export interface Transaction {
    id: string;
    userId: string;
    categoryId: string;
    type: 'INCOME' | 'EXPENSE';
    amount: {
        amount: number;
        currency: string;
    };
    description: string;
    date: Date;
    createdAt: Date;
    updatedAt: Date;
}

export interface TransactionFilter {
    userId?: string;
    categoryId?: string;
    type?: 'INCOME' | 'EXPENSE';
    dateFrom?: Date;
    dateTo?: Date;
}

export interface TransactionRepository {
    findById(id: string): Promise<Transaction | null>;
    findMany(filter: TransactionFilter, pagination?: { page: number; limit: number }): Promise<Transaction[]>;
    findByDateRange(userId: string, startDate: Date, endDate: Date): Promise<Transaction[]>;
    create(transactionData: Partial<Transaction>): Promise<Transaction>;
    update(id: string, transactionData: Partial<Transaction>): Promise<Transaction | null>;
    delete(id: string): Promise<boolean>;
}