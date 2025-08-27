// backend/src/__tests__/test-app.ts
import Fastify, { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { mockAuthMiddleware, mockTransactionRepositoryImpl } from './mocks/auth.mock';
import { TransactionFastifyController } from '../api/controllers/transaction.fastify.controller';
import { CreateTransactionUseCase } from '../core/application/use-cases/transaction/create-transaction.use-case';
import { ListTransactionsUseCase } from '../core/application/use-cases/transaction/list-transactions.use-case';
import { UpdateTransactionUseCase } from '../core/application/use-cases/transaction/update-transaction.use-case';

// Test-specific app builder
export function buildTestApp(opts: FastifyPluginOptions = {}) {
    const app = Fastify(opts);

    // Add auth middleware mock
    app.addHook('onRequest', mockAuthMiddleware);

    // Mock the transaction controller with mocked dependencies
    class MockTransactionController extends TransactionFastifyController {
        constructor() {
            super();
            
            // Override use cases with mocked repository
            const mockRepository = mockTransactionRepositoryImpl as any;
            (this as any).createTransactionUseCase = new CreateTransactionUseCase(mockRepository);
            (this as any).listTransactionsUseCase = new ListTransactionsUseCase(mockRepository);
            (this as any).updateTransactionUseCase = new UpdateTransactionUseCase(mockRepository);
            
            // Mock the private getTransactionCount method
            const listUseCase = (this as any).listTransactionsUseCase as any;
            listUseCase.getTransactionCount = () => Promise.resolve(2);
        }
    }

    const transactionController = new MockTransactionController();

    // Register transaction routes
    app.register(async function (fastify) {
        fastify.post('/api/transactions', transactionController.create.bind(transactionController));
        fastify.get('/api/transactions', transactionController.list.bind(transactionController));
        fastify.get('/api/transactions/:id', transactionController.getById.bind(transactionController));
        fastify.put('/api/transactions/:id', transactionController.update.bind(transactionController));
        fastify.delete('/api/transactions/:id', transactionController.delete.bind(transactionController));
        fastify.patch('/api/transactions/:id/pay', transactionController.markAsPaid.bind(transactionController));
        fastify.patch('/api/transactions/:id/cancel', transactionController.cancel.bind(transactionController));
        fastify.get('/api/transactions/summary', transactionController.getSummary.bind(transactionController));
    });

    // Error handler
    app.setErrorHandler(async (error, request, reply) => {
        const statusCode = error.statusCode || 500;
        
        reply.status(statusCode).send({
            success: false,
            message: error.message || 'Internal Server Error',
            error: error.name || 'INTERNAL_SERVER_ERROR'
        });
    });

    return app;
}