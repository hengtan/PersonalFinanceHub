// backend/src/__tests__/mocks/auth.mock.ts
import { FastifyRequest, FastifyReply } from 'fastify';

// Mock user data
export const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
    name: 'Test User',
    isActive: true
};

// Mock authentication middleware for tests
export function mockAuthMiddleware(request: FastifyRequest, reply: FastifyReply, done: Function) {
    const authHeader = request.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        // No authorization header or wrong format - don't set user
        return done();
    }
    
    // Mock successful authentication
    (request as any).user = mockUser;
    done();
}

// Mock repository implementations for tests
export const mockTransactionRepositoryImpl = {
    async findById(id: string) {
        return {
            id,
            userId: 'user-123',
            accountId: 'account-456',
            categoryId: 'category-789',
            description: 'Mock transaction',
            amount_value: 100.00,
            amount_currency: 'BRL',
            type: 'EXPENSE',
            status: 'PENDING',
            paymentMethod: 'CREDIT_CARD',
            transactionDate: new Date(),
            createdAt: new Date(),
            updatedAt: new Date()
        };
    },

    async findMany(filter: any, pagination?: any) {
        return [
            {
                id: 'tx-1',
                userId: filter.userId || 'user-123',
                accountId: 'account-456',
                categoryId: 'category-789',
                description: 'Mock expense transaction',
                amount_value: 150.75,
                amount_currency: 'BRL',
                type: 'EXPENSE',
                status: 'COMPLETED',
                paymentMethod: 'CREDIT_CARD',
                transactionDate: new Date(),
                tags: ['test', 'integration'],
                notes: 'Mock transaction for testing',
                createdAt: new Date(),
                updatedAt: new Date()
            },
            {
                id: 'tx-2',
                userId: filter.userId || 'user-123',
                accountId: 'account-456',
                categoryId: 'category-income',
                description: 'Mock income transaction',
                amount_value: 5000.00,
                amount_currency: 'BRL',
                type: 'INCOME',
                status: 'COMPLETED',
                paymentMethod: 'PIX',
                transactionDate: new Date(),
                tags: ['salary', 'monthly'],
                createdAt: new Date(),
                updatedAt: new Date()
            }
        ];
    },

    async create(transactionData: any) {
        return {
            id: 'new-transaction-id',
            userId: transactionData.userId,
            accountId: transactionData.accountId,
            categoryId: transactionData.categoryId,
            description: transactionData.description,
            amount_value: transactionData.amount?.amount || transactionData.amount,
            amount_currency: transactionData.amount?.currency || transactionData.currency || 'BRL',
            type: transactionData.type,
            status: 'PENDING',
            paymentMethod: transactionData.paymentMethod,
            transactionDate: transactionData.transactionDate || new Date(),
            destinationAccountId: transactionData.destinationAccountId,
            tags: transactionData.tags || [],
            notes: transactionData.notes,
            createdAt: new Date(),
            updatedAt: new Date()
        };
    },

    async update(id: string, updateData: any) {
        return {
            id,
            userId: 'user-123',
            accountId: 'account-456',
            categoryId: 'category-789',
            description: updateData.description || 'Updated transaction',
            amount_value: updateData.amount || 100.00,
            amount_currency: updateData.currency || 'BRL',
            type: 'EXPENSE',
            status: 'PENDING',
            paymentMethod: updateData.paymentMethod || 'CREDIT_CARD',
            transactionDate: updateData.transactionDate || new Date(),
            notes: updateData.notes,
            tags: updateData.tags || [],
            createdAt: new Date(),
            updatedAt: new Date()
        };
    },

    async delete(id: string) {
        return true;
    }
};

// Mock getTransactionCount method for ListTransactionsUseCase
export const mockGetTransactionCount = () => 2;