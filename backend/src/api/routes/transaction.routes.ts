// backend/src/api/routes/transaction.routes.ts
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { TransactionController } from '../controllers/transaction.controller';
import { AuthMiddleware } from '../middlewares/auth.middleware';
import { validateSchema } from '../middlewares/error-handler.middleware';
import {
    createTransactionSchema,
    updateTransactionSchema,
    transactionQuerySchema,
    transactionParamsSchema,
    bulkTransactionSchema,
    importTransactionSchema,
    transactionReportSchema,
} from '../validators/transaction.validator';

const router = Router();
const transactionController = new TransactionController();

/**
 * Rate limiting específico para transações
 */
const transactionRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 200, // máximo 200 operações de transação por IP por janela
    message: {
        success: false,
        error: {
            code: 'TRANSACTION_RATE_LIMIT_EXCEEDED',
            message: 'Too many transaction operations, please try again later.',
        },
    },
    standardHeaders: true,
    legacyHeaders: false,
});

const createTransactionRateLimit = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minuto
    max: 30, // máximo 30 criações de transação por IP por minuto
    message: {
        success: false,
        error: {
            code: 'CREATE_TRANSACTION_RATE_LIMIT_EXCEEDED',
            message: 'Too many transaction creations, please slow down.',
        },
    },
});

/**
 * Middlewares aplicados a todas as rotas de transação
 */
router.use(AuthMiddleware.authenticate);
router.use(transactionRateLimit);
router.use(AuthMiddleware.userRateLimit(120)); // 120 req/min por usuário

/**
 * GET /api/transactions - Lista transações com filtros e paginação
 */
router.get('/',
    validateSchema(transactionQuerySchema, 'query'),
    AuthMiddleware.authorize(['transactions:read']),
    AuthMiddleware.logUserActivity('list_transactions'),
    transactionController.getTransactions.bind(transactionController)
);

/**
 * POST /api/transactions - Cria nova transação
 */
router.post('/',
    createTransactionRateLimit,
    validateSchema(createTransactionSchema, 'body'),
    AuthMiddleware.authorize(['transactions:write']),
    AuthMiddleware.logUserActivity('create_transaction'),
    transactionController.createTransaction.bind(transactionController)
);

/**
 * GET /api/transactions/:id - Busca transação específica
 */
router.get('/:id',
    validateSchema(transactionParamsSchema, 'params'),
    AuthMiddleware.authorize(['transactions:read']),
    AuthMiddleware.authorizeOwnerOrAdmin('userId'),
    transactionController.getTransaction.bind(transactionController)
);

/**
 * PUT /api/transactions/:id - Atualiza transação completa
 */
router.put('/:id',
    validateSchema(transactionParamsSchema, 'params'),
    validateSchema(createTransactionSchema, 'body'),
    AuthMiddleware.authorize(['transactions:write']),
    AuthMiddleware.authorizeOwnerOrAdmin('userId'),
    AuthMiddleware.logUserActivity('update_transaction_full'),
    transactionController.updateTransactionFull.bind(transactionController)
);

/**
 * PATCH /api/transactions/:id - Atualização parcial de transação
 */
router.patch('/:id',
    validateSchema(transactionParamsSchema, 'params'),
    validateSchema(updateTransactionSchema, 'body'),
    AuthMiddleware.authorize(['transactions:write']),
    AuthMiddleware.authorizeOwnerOrAdmin('userId'),
    AuthMiddleware.logUserActivity('update_transaction'),
    transactionController.updateTransaction.bind(transactionController)
);

/**
 * DELETE /api/transactions/:id - Remove transação
 */
router.delete('/:id',
    validateSchema(transactionParamsSchema, 'params'),
    AuthMiddleware.authorize(['transactions:delete']),
    AuthMiddleware.authorizeOwnerOrAdmin('userId'),
    AuthMiddleware.logUserActivity('delete_transaction'),
    transactionController.deleteTransaction.bind(transactionController)
);

/**
 * POST /api/transactions/bulk - Operações em lote
 */
router.post('/bulk',
    validateSchema(bulkTransactionSchema, 'body'),
    AuthMiddleware.authorize(['transactions:bulk_operations']),
    AuthMiddleware.logUserActivity('bulk_transaction_operation'),
    transactionController.bulkOperation.bind(transactionController)
);

/**
 * GET /api/transactions/:id/history - Histórico de alterações da transação
 */
router.get('/:id/history',
    validateSchema(transactionParamsSchema, 'params'),
    AuthMiddleware.authorize(['transactions:read']),
    AuthMiddleware.authorizeOwnerOrAdmin('userId'),
    transactionController.getTransactionHistory.bind(transactionController)
);

/**
 * POST /api/transactions/:id/duplicate - Duplica transação
 */
router.post('/:id/duplicate',
    validateSchema(transactionParamsSchema, 'params'),
    AuthMiddleware.authorize(['transactions:write']),
    AuthMiddleware.authorizeOwnerOrAdmin('userId'),
    AuthMiddleware.logUserActivity('duplicate_transaction'),
    transactionController.duplicateTransaction.bind(transactionController)
);

/**
 * PATCH /api/transactions/:id/categorize - Categoriza transação
 */
router.patch('/:id/categorize',
    validateSchema(transactionParamsSchema, 'params'),
    validateSchema({ categoryId: 'string' }, 'body'),
    AuthMiddleware.authorize(['transactions:write']),
    AuthMiddleware.authorizeOwnerOrAdmin('userId'),
    AuthMiddleware.logUserActivity('categorize_transaction'),
    transactionController.categorizeTransaction.bind(transactionController)
);

/**
 * POST /api/transactions/:id/split - Divide transação
 */
router.post('/:id/split',
    validateSchema(transactionParamsSchema, 'params'),
    AuthMiddleware.authorize(['transactions:write']),
    AuthMiddleware.authorizeOwnerOrAdmin('userId'),
    AuthMiddleware.logUserActivity('split_transaction'),
    transactionController.splitTransaction.bind(transactionController)
);

/**
 * POST /api/transactions/:id/merge - Mescla transações
 */
router.post('/:id/merge',
    validateSchema(transactionParamsSchema, 'params'),
    AuthMiddleware.authorize(['transactions:write']),
    AuthMiddleware.authorizeOwnerOrAdmin('userId'),
    AuthMiddleware.logUserActivity('merge_transactions'),
    transactionController.mergeTransactions.bind(transactionController)
);

/**
 * Rotas de importação/exportação
 */

/**
 * POST /api/transactions/import - Importa transações de arquivo
 */
router.post('/import',
    validateSchema(importTransactionSchema, 'body'),
    AuthMiddleware.authorize(['transactions:import']),
    AuthMiddleware.logUserActivity('import_transactions'),
    transactionController.importTransactions.bind(transactionController)
);

/**
 * GET /api/transactions/export - Exporta transações
 */
router.get('/export',
    validateSchema(transactionQuerySchema, 'query'),
    AuthMiddleware.authorize(['transactions:export']),
    AuthMiddleware.logUserActivity('export_transactions'),
    transactionController.exportTransactions.bind(transactionController)
);

/**
 * POST /api/transactions/import/preview - Preview de importação
 */
router.post('/import/preview',
    validateSchema(importTransactionSchema, 'body'),
    AuthMiddleware.authorize(['transactions:import']),
    transactionController.previewImport.bind(transactionController)
);

/**
 * GET /api/transactions/import/templates - Templates de importação
 */
router.get('/import/templates',
    AuthMiddleware.authorize(['transactions:import']),
    transactionController.getImportTemplates.bind(transactionController)
);

/**
 * Rotas de anexos
 */

/**
 * POST /api/transactions/:id/attachments - Adiciona anexo à transação
 */
router.post('/:id/attachments',
    validateSchema(transactionParamsSchema, 'params'),
    AuthMiddleware.authorize(['transactions:write']),
    AuthMiddleware.authorizeOwnerOrAdmin('userId'),
    AuthMiddleware.logUserActivity('add_transaction_attachment'),
    transactionController.addAttachment.bind(transactionController)
);

/**
 * GET /api/transactions/:id/attachments - Lista anexos da transação
 */
router.get('/:id/attachments',
    validateSchema(transactionParamsSchema, 'params'),
    AuthMiddleware.authorize(['transactions:read']),
    AuthMiddleware.authorizeOwnerOrAdmin('userId'),
    transactionController.getAttachments.bind(transactionController)
);

/**
 * DELETE /api/transactions/:id/attachments/:attachmentId - Remove anexo
 */
router.delete('/:id/attachments/:attachmentId',
    AuthMiddleware.authorize(['transactions:write']),
    AuthMiddleware.authorizeOwnerOrAdmin('userId'),
    AuthMiddleware.logUserActivity('remove_transaction_attachment'),
    transactionController.removeAttachment.bind(transactionController)
);

/**
 * Rotas de relatórios e estatísticas
 */

/**
 * GET /api/transactions/reports/summary - Relatório resumo
 */
router.get('/reports/summary',
    validateSchema(transactionReportSchema, 'query'),
    AuthMiddleware.authorize(['reports:read']),
    transactionController.getSummaryReport.bind(transactionController)
);

/**
 * GET /api/transactions/reports/trends - Relatório de tendências
 */
router.get('/reports/trends',
    validateSchema(transactionReportSchema, 'query'),
    AuthMiddleware.authorize(['reports:read']),
    transactionController.getTrendsReport.bind(transactionController)
);

/**
 * GET /api/transactions/reports/category-breakdown - Breakdown por categoria
 */
router.get('/reports/category-breakdown',
    validateSchema(transactionReportSchema, 'query'),
    AuthMiddleware.authorize(['reports:read']),
    transactionController.getCategoryBreakdownReport.bind(transactionController)
);

/**
 * GET /api/transactions/reports/cash-flow - Relatório de fluxo de caixa
 */
router.get('/reports/cash-flow',
    validateSchema(transactionReportSchema, 'query'),
    AuthMiddleware.authorize(['reports:read']),
    transactionController.getCashFlowReport.bind(transactionController)
);

/**
 * GET /api/transactions/stats - Estatísticas gerais
 */
router.get('/stats',
    AuthMiddleware.authorize(['transactions:read']),
    transactionController.getStatistics.bind(transactionController)
);

/**
 * GET /api/transactions/stats/monthly - Estatísticas mensais
 */
router.get('/stats/monthly',
    AuthMiddleware.authorize(['transactions:read']),
    transactionController.getMonthlyStatistics.bind(transactionController)
);

/**
 * GET /api/transactions/stats/categories - Estatísticas por categoria
 */
router.get('/stats/categories',
    AuthMiddleware.authorize(['transactions:read']),
    transactionController.getCategoryStatistics.bind(transactionController)
);

/**
 * Rotas de transações recorrentes
 */

/**
 * GET /api/transactions/recurring - Lista transações recorrentes
 */
router.get('/recurring',
    AuthMiddleware.authorize(['transactions:read']),
    transactionController.getRecurringTransactions.bind(transactionController)
);

/**
 * POST /api/transactions/:id/recurring - Cria regra recorrente
 */
router.post('/:id/recurring',
    validateSchema(transactionParamsSchema, 'params'),
    AuthMiddleware.authorize(['transactions:write']),
    AuthMiddleware.authorizeOwnerOrAdmin('userId'),
    AuthMiddleware.logUserActivity('create_recurring_rule'),
    transactionController.createRecurringRule.bind(transactionController)
);

/**
 * PATCH /api/transactions/recurring/:ruleId - Atualiza regra recorrente
 */
router.patch('/recurring/:ruleId',
    AuthMiddleware.authorize(['transactions:write']),
    AuthMiddleware.authorizeOwnerOrAdmin('userId'),
    AuthMiddleware.logUserActivity('update_recurring_rule'),
    transactionController.updateRecurringRule.bind(transactionController)
);

/**
 * DELETE /api/transactions/recurring/:ruleId - Remove regra recorrente
 */
router.delete('/recurring/:ruleId',
    AuthMiddleware.authorize(['transactions:write']),
    AuthMiddleware.authorizeOwnerOrAdmin('userId'),
    AuthMiddleware.logUserActivity('delete_recurring_rule'),
    transactionController.deleteRecurringRule.bind(transactionController)
);

/**
 * POST /api/transactions/recurring/:ruleId/execute - Executa regra manualmente
 */
router.post('/recurring/:ruleId/execute',
    AuthMiddleware.authorize(['transactions:write']),
    AuthMiddleware.authorizeOwnerOrAdmin('userId'),
    AuthMiddleware.logUserActivity('execute_recurring_rule'),
    transactionController.executeRecurringRule.bind(transactionController)
);

/**
 * Rotas de busca e sugestões
 */

/**
 * GET /api/transactions/search - Busca avançada de transações
 */
router.get('/search',
    AuthMiddleware.authorize(['transactions:read']),
    transactionController.searchTransactions.bind(transactionController)
);

/**
 * GET /api/transactions/suggestions/merchants - Sugestões de comerciantes
 */
router.get('/suggestions/merchants',
    AuthMiddleware.authorize(['transactions:read']),
    transactionController.getMerchantSuggestions.bind(transactionController)
);

/**
 * GET /api/transactions/suggestions/categories - Sugestões de categorias
 */
router.get('/suggestions/categories',
    AuthMiddleware.authorize(['transactions:read']),
    transactionController.getCategorySuggestions.bind(transactionController)
);

/**
 * POST /api/transactions/auto-categorize - Auto-categorização inteligente
 */
router.post('/auto-categorize',
    AuthMiddleware.authorize(['transactions:write']),
    AuthMiddleware.logUserActivity('auto_categorize_transactions'),
    transactionController.autoCategorize.bind(transactionController)
);

/**
 * Rotas de validação
 */

/**
 * POST /api/transactions/validate - Valida dados de transação sem criar
 */
router.post('/validate',
    validateSchema(createTransactionSchema, 'body'),
    AuthMiddleware.authorize(['transactions:read']),
    transactionController.validateTransaction.bind(transactionController)
);

/**
 * POST /api/transactions/check-duplicates - Verifica duplicatas
 */
router.post('/check-duplicates',
    AuthMiddleware.authorize(['transactions:read']),
    transactionController.checkDuplicates.bind(transactionController)
);

/**
 * Rotas administrativas (requerem permissões especiais)
 */

/**
 * GET /api/transactions/admin/overview - Visão geral administrativa
 */
router.get('/admin/overview',
    AuthMiddleware.authorize(['admin:transactions:read']),
    transactionController.getAdminOverview.bind(transactionController)
);

/**
 * POST /api/transactions/admin/reprocess - Reprocessa transações
 */
router.post('/admin/reprocess',
    AuthMiddleware.authorize(['admin:transactions:write']),
    AuthMiddleware.logUserActivity('admin_reprocess_transactions'),
    transactionController.reprocessTransactions.bind(transactionController)
);

/**
 * POST /api/transactions/admin/cleanup - Limpeza de dados órfãos
 */
router.post('/admin/cleanup',
    AuthMiddleware.authorize(['admin:transactions:write']),
    AuthMiddleware.logUserActivity('admin_cleanup_transactions'),
    transactionController.cleanupOrphanedData.bind(transactionController)
);

/**
 * GET /api/transactions/health - Health check das transações
 */
router.get('/health',
    AuthMiddleware.optionalAuthenticate,
    transactionController.healthCheck.bind(transactionController)
);

export default router;