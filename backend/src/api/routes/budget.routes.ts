// backend/src/api/routes/budget.routes.ts
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { BudgetController } from '@/api/controllers/budget.controller';
import { AuthMiddleware } from '../middlewares/auth.middleware';
import { validateSchema } from '../middlewares/error-handler.middleware';
import {
    createBudgetSchema,
    updateBudgetSchema,
    budgetParamsSchema,
    budgetQuerySchema,
    budgetReportSchema,
    copyBudgetSchema,
    budgetAlertSchema,
} from '../validators/budget.validator';

const router = Router();
const budgetController = new BudgetController();

/**
 * Rate limiting específico para orçamentos
 */
const budgetRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 100, // máximo 100 operações de orçamento por IP por janela
    message: {
        success: false,
        error: {
            code: 'BUDGET_RATE_LIMIT_EXCEEDED',
            message: 'Too many budget operations, please try again later.',
        },
    },
    standardHeaders: true,
    legacyHeaders: false,
});

const createBudgetRateLimit = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutos
    max: 10, // máximo 10 criações de orçamento por IP por 5 minutos
    message: {
        success: false,
        error: {
            code: 'CREATE_BUDGET_RATE_LIMIT_EXCEEDED',
            message: 'Too many budget creations, please slow down.',
        },
    },
});

/**
 * Middlewares aplicados a todas as rotas de orçamento
 */
router.use(AuthMiddleware.authenticate);
router.use(budgetRateLimit);
router.use(AuthMiddleware.userRateLimit(60)); // 60 req/min por usuário

/**
 * GET /api/budgets - Lista orçamentos com filtros
 */
router.get('/',
    validateSchema(budgetQuerySchema, 'query'),
    AuthMiddleware.authorize(['budgets:read']),
    AuthMiddleware.logUserActivity('list_budgets'),
    budgetController.getBudgets.bind(budgetController)
);

/**
 * POST /api/budgets - Cria novo orçamento
 */
router.post('/',
    createBudgetRateLimit,
    validateSchema(createBudgetSchema, 'body'),
    AuthMiddleware.authorize(['budgets:write']),
    AuthMiddleware.logUserActivity('create_budget'),
    budgetController.createBudget.bind(budgetController)
);

/**
 * GET /api/budgets/current - Orçamento do período atual
 */
router.get('/current',
    AuthMiddleware.authorize(['budgets:read']),
    budgetController.getCurrentBudget.bind(budgetController)
);

/**
 * GET /api/budgets/:period - Busca orçamento de período específico
 */
router.get('/:period',
    validateSchema(budgetParamsSchema, 'params'),
    AuthMiddleware.authorize(['budgets:read']),
    AuthMiddleware.authorizeOwnerOrAdmin('userId'),
    budgetController.getBudget.bind(budgetController)
);

/**
 * PUT /api/budgets/:period - Atualiza orçamento completo
 */
router.put('/:period',
    validateSchema(budgetParamsSchema, 'params'),
    validateSchema(createBudgetSchema, 'body'),
    AuthMiddleware.authorize(['budgets:write']),
    AuthMiddleware.authorizeOwnerOrAdmin('userId'),
    AuthMiddleware.logUserActivity('update_budget_full'),
    budgetController.updateBudgetFull.bind(budgetController)
);

/**
 * PATCH /api/budgets/:period - Atualização parcial de orçamento
 */
router.patch('/:period',
    validateSchema(budgetParamsSchema, 'params'),
    validateSchema(updateBudgetSchema, 'body'),
    AuthMiddleware.authorize(['budgets:write']),
    AuthMiddleware.authorizeOwnerOrAdmin('userId'),
    AuthMiddleware.logUserActivity('update_budget'),
    budgetController.updateBudget.bind(budgetController)
);

/**
 * DELETE /api/budgets/:period - Remove orçamento
 */
router.delete('/:period',
    validateSchema(budgetParamsSchema, 'params'),
    AuthMiddleware.authorize(['budgets:delete']),
    AuthMiddleware.authorizeOwnerOrAdmin('userId'),
    AuthMiddleware.logUserActivity('delete_budget'),
    budgetController.deleteBudget.bind(budgetController)
);

/**
 * POST /api/budgets/:period/copy - Copia orçamento para outro período
 */
router.post('/:period/copy',
    validateSchema(budgetParamsSchema, 'params'),
    validateSchema(copyBudgetSchema, 'body'),
    AuthMiddleware.authorize(['budgets:write']),
    AuthMiddleware.authorizeOwnerOrAdmin('userId'),
    AuthMiddleware.logUserActivity('copy_budget'),
    budgetController.copyBudget.bind(budgetController)
);

/**
 * POST /api/budgets/:period/duplicate - Duplica orçamento
 */
router.post('/:period/duplicate',
    validateSchema(budgetParamsSchema, 'params'),
    AuthMiddleware.authorize(['budgets:write']),
    AuthMiddleware.authorizeOwnerOrAdmin('userId'),
    AuthMiddleware.logUserActivity('duplicate_budget'),
    budgetController.duplicateBudget.bind(budgetController)
);

/**
 * POST /api/budgets/:period/lock - Bloqueia orçamento para alterações
 */
router.post('/:period/lock',
    validateSchema(budgetParamsSchema, 'params'),
    AuthMiddleware.authorize(['budgets:write']),
    AuthMiddleware.authorizeOwnerOrAdmin('userId'),
    AuthMiddleware.logUserActivity('lock_budget'),
    budgetController.lockBudget.bind(budgetController)
);

/**
 * POST /api/budgets/:period/unlock - Desbloqueia orçamento
 */
router.post('/:period/unlock',
    validateSchema(budgetParamsSchema, 'params'),
    AuthMiddleware.authorize(['budgets:write']),
    AuthMiddleware.authorizeOwnerOrAdmin('userId'),
    AuthMiddleware.logUserActivity('unlock_budget'),
    budgetController.unlockBudget.bind(budgetController)
);

/**
 * Rotas de categorias do orçamento
 */

/**
 * GET /api/budgets/:period/categories - Lista categorias do orçamento
 */
router.get('/:period/categories',
    validateSchema(budgetParamsSchema, 'params'),
    AuthMiddleware.authorize(['budgets:read']),
    AuthMiddleware.authorizeOwnerOrAdmin('userId'),
    budgetController.getBudgetCategories.bind(budgetController)
);

/**
 * POST /api/budgets/:period/categories - Adiciona categoria ao orçamento
 */
router.post('/:period/categories',
    validateSchema(budgetParamsSchema, 'params'),
    AuthMiddleware.authorize(['budgets:write']),
    AuthMiddleware.authorizeOwnerOrAdmin('userId'),
    AuthMiddleware.logUserActivity('add_budget_category'),
    budgetController.addBudgetCategory.bind(budgetController)
);

/**
 * PUT /api/budgets/:period/categories/:categoryId - Atualiza categoria do orçamento
 */
router.put('/:period/categories/:categoryId',
    validateSchema(budgetParamsSchema, 'params'),
    AuthMiddleware.authorize(['budgets:write']),
    AuthMiddleware.authorizeOwnerOrAdmin('userId'),
    AuthMiddleware.logUserActivity('update_budget_category'),
    budgetController.updateBudgetCategory.bind(budgetController)
);

/**
 * DELETE /api/budgets/:period/categories/:categoryId - Remove categoria do orçamento
 */
router.delete('/:period/categories/:categoryId',
    validateSchema(budgetParamsSchema, 'params'),
    AuthMiddleware.authorize(['budgets:write']),
    AuthMiddleware.authorizeOwnerOrAdmin('userId'),
    AuthMiddleware.logUserActivity('remove_budget_category'),
    budgetController.removeBudgetCategory.bind(budgetController)
);

/**
 * GET /api/budgets/:period/categories/:categoryId/performance - Performance da categoria
 */
router.get('/:period/categories/:categoryId/performance',
    validateSchema(budgetParamsSchema, 'params'),
    AuthMiddleware.authorize(['budgets:read']),
    AuthMiddleware.authorizeOwnerOrAdmin('userId'),
    budgetController.getCategoryPerformance.bind(budgetController)
);

/**
 * Rotas de metas de poupança
 */

/**
 * GET /api/budgets/:period/savings-goals - Lista metas de poupança
 */
router.get('/:period/savings-goals',
    validateSchema(budgetParamsSchema, 'params'),
    AuthMiddleware.authorize(['budgets:read']),
    AuthMiddleware.authorizeOwnerOrAdmin('userId'),
    budgetController.getSavingsGoals.bind(budgetController)
);

/**
 * POST /api/budgets/:period/savings-goals - Adiciona meta de poupança
 */
router.post('/:period/savings-goals',
    validateSchema(budgetParamsSchema, 'params'),
    AuthMiddleware.authorize(['budgets:write']),
    AuthMiddleware.authorizeOwnerOrAdmin('userId'),
    AuthMiddleware.logUserActivity('add_savings_goal'),
    budgetController.addSavingsGoal.bind(budgetController)
);

/**
 * PUT /api/budgets/:period/savings-goals/:goalId - Atualiza meta de poupança
 */
router.put('/:period/savings-goals/:goalId',
    validateSchema(budgetParamsSchema, 'params'),
    AuthMiddleware.authorize(['budgets:write']),
    AuthMiddleware.authorizeOwnerOrAdmin('userId'),
    AuthMiddleware.logUserActivity('update_savings_goal'),
    budgetController.updateSavingsGoal.bind(budgetController)
);

/**
 * DELETE /api/budgets/:period/savings-goals/:goalId - Remove meta de poupança
 */
router.delete('/:period/savings-goals/:goalId',
    validateSchema(budgetParamsSchema, 'params'),
    AuthMiddleware.authorize(['budgets:write']),
    AuthMiddleware.authorizeOwnerOrAdmin('userId'),
    AuthMiddleware.logUserActivity('remove_savings_goal'),
    budgetController.removeSavingsGoal.bind(budgetController)
);

/**
 * POST /api/budgets/:period/savings-goals/:goalId/contribute - Contribui para meta
 */
router.post('/:period/savings-goals/:goalId/contribute',
    validateSchema(budgetParamsSchema, 'params'),
    AuthMiddleware.authorize(['budgets:write']),
    AuthMiddleware.authorizeOwnerOrAdmin('userId'),
    AuthMiddleware.logUserActivity('contribute_to_goal'),
    budgetController.contributeToGoal.bind(budgetController)
);

/**
 * Rotas de relatórios e análises
 */

/**
 * GET /api/budgets/:period/performance - Relatório de performance do orçamento
 */
router.get('/:period/performance',
    validateSchema(budgetParamsSchema, 'params'),
    validateSchema(budgetReportSchema, 'query'),
    AuthMiddleware.authorize(['budgets:read', 'reports:read']),
    AuthMiddleware.authorizeOwnerOrAdmin('userId'),
    budgetController.getBudgetPerformance.bind(budgetController)
);

/**
 * GET /api/budgets/:period/variance - Análise de variação orçamentária
 */
router.get('/:period/variance',
    validateSchema(budgetParamsSchema, 'params'),
    AuthMiddleware.authorize(['budgets:read', 'reports:read']),
    AuthMiddleware.authorizeOwnerOrAdmin('userId'),
    budgetController.getBudgetVariance.bind(budgetController)
);

/**
 * GET /api/budgets/:period/forecast - Projeção do orçamento
 */
router.get('/:period/forecast',
    validateSchema(budgetParamsSchema, 'params'),
    AuthMiddleware.authorize(['budgets:read', 'reports:read']),
    AuthMiddleware.authorizeOwnerOrAdmin('userId'),
    budgetController.getBudgetForecast.bind(budgetController)
);

/**
 * GET /api/budgets/:period/cash-flow - Fluxo de caixa previsto
 */
router.get('/:period/cash-flow',
    validateSchema(budgetParamsSchema, 'params'),
    AuthMiddleware.authorize(['budgets:read', 'reports:read']),
    AuthMiddleware.authorizeOwnerOrAdmin('userId'),
    budgetController.getPredictedCashFlow.bind(budgetController)
);

/**
 * GET /api/budgets/reports/comparison - Comparação entre períodos
 */
router.get('/reports/comparison',
    validateSchema(budgetReportSchema, 'query'),
    AuthMiddleware.authorize(['budgets:read', 'reports:read']),
    budgetController.getBudgetComparison.bind(budgetController)
);

/**
 * GET /api/budgets/reports/trends - Tendências orçamentárias
 */
router.get('/reports/trends',
    validateSchema(budgetReportSchema, 'query'),
    AuthMiddleware.authorize(['budgets:read', 'reports:read']),
    budgetController.getBudgetTrends.bind(budgetController)
);

/**
 * GET /api/budgets/reports/efficiency - Eficiência orçamentária
 */
router.get('/reports/efficiency',
    validateSchema(budgetReportSchema, 'query'),
    AuthMiddleware.authorize(['budgets:read', 'reports:read']),
    budgetController.getBudgetEfficiency.bind(budgetController)
);

/**
 * Rotas de alertas e notificações
 */

/**
 * GET /api/budgets/:period/alerts - Lista alertas do orçamento
 */
router.get('/:period/alerts',
    validateSchema(budgetParamsSchema, 'params'),
    AuthMiddleware.authorize(['budgets:read']),
    AuthMiddleware.authorizeOwnerOrAdmin('userId'),
    budgetController.getBudgetAlerts.bind(budgetController)
);

/**
 * POST /api/budgets/:period/alerts - Cria alerta para orçamento
 */
router.post('/:period/alerts',
    validateSchema(budgetParamsSchema, 'params'),
    validateSchema(budgetAlertSchema, 'body'),
    AuthMiddleware.authorize(['budgets:write']),
    AuthMiddleware.authorizeOwnerOrAdmin('userId'),
    AuthMiddleware.logUserActivity('create_budget_alert'),
    budgetController.createBudgetAlert.bind(budgetController)
);

/**
 * PUT /api/budgets/:period/alerts/:alertId - Atualiza alerta
 */
router.put('/:period/alerts/:alertId',
    validateSchema(budgetParamsSchema, 'params'),
    validateSchema(budgetAlertSchema, 'body'),
    AuthMiddleware.authorize(['budgets:write']),
    AuthMiddleware.authorizeOwnerOrAdmin('userId'),
    AuthMiddleware.logUserActivity('update_budget_alert'),
    budgetController.updateBudgetAlert.bind(budgetController)
);

/**
 * DELETE /api/budgets/:period/alerts/:alertId - Remove alerta
 */
router.delete('/:period/alerts/:alertId',
    validateSchema(budgetParamsSchema, 'params'),
    AuthMiddleware.authorize(['budgets:write']),
    AuthMiddleware.authorizeOwnerOrAdmin('userId'),
    AuthMiddleware.logUserActivity('delete_budget_alert'),
    budgetController.deleteBudgetAlert.bind(budgetController)
);

/**
 * POST /api/budgets/:period/alerts/:alertId/test - Testa alerta
 */
router.post('/:period/alerts/:alertId/test',
    validateSchema(budgetParamsSchema, 'params'),
    AuthMiddleware.authorize(['budgets:write']),
    AuthMiddleware.authorizeOwnerOrAdmin('userId'),
    budgetController.testBudgetAlert.bind(budgetController)
);

/**
 * Rotas de templates e automatização
 */

/**
 * GET /api/budgets/templates - Lista templates de orçamento
 */
router.get('/templates',
    AuthMiddleware.authorize(['budgets:read']),
    budgetController.getBudgetTemplates.bind(budgetController)
);

/**
 * POST /api/budgets/templates - Cria template a partir de orçamento
 */
router.post('/templates',
    AuthMiddleware.authorize(['budgets:write']),
    AuthMiddleware.logUserActivity('create_budget_template'),
    budgetController.createBudgetTemplate.bind(budgetController)
);

/**
 * POST /api/budgets/from-template/:templateId - Cria orçamento a partir de template
 */
router.post('/from-template/:templateId',
    AuthMiddleware.authorize(['budgets:write']),
    AuthMiddleware.logUserActivity('create_budget_from_template'),
    budgetController.createBudgetFromTemplate.bind(budgetController)
);

/**
 * POST /api/budgets/auto-create - Auto-criação de orçamento baseado no histórico
 */
router.post('/auto-create',
    AuthMiddleware.authorize(['budgets:write']),
    AuthMiddleware.logUserActivity('auto_create_budget'),
    budgetController.autoCreateBudget.bind(budgetController)
);

/**
 * POST /api/budgets/:period/auto-adjust - Auto-ajuste do orçamento
 */
router.post('/:period/auto-adjust',
    validateSchema(budgetParamsSchema, 'params'),
    AuthMiddleware.authorize(['budgets:write']),
    AuthMiddleware.authorizeOwnerOrAdmin('userId'),
    AuthMiddleware.logUserActivity('auto_adjust_budget'),
    budgetController.autoAdjustBudget.bind(budgetController)
);

/**
 * Rotas de importação/exportação
 */

/**
 * POST /api/budgets/import - Importa orçamento de arquivo
 */
router.post('/import',
    AuthMiddleware.authorize(['budgets:import']),
    AuthMiddleware.logUserActivity('import_budget'),
    budgetController.importBudget.bind(budgetController)
);

/**
 * GET /api/budgets/:period/export - Exporta orçamento
 */
router.get('/:period/export',
    validateSchema(budgetParamsSchema, 'params'),
    AuthMiddleware.authorize(['budgets:export']),
    AuthMiddleware.authorizeOwnerOrAdmin('userId'),
    AuthMiddleware.logUserActivity('export_budget'),
    budgetController.exportBudget.bind(budgetController)
);

/**
 * Rotas de validação e sugestões
 */

/**
 * POST /api/budgets/validate - Valida dados de orçamento sem criar
 */
router.post('/validate',
    validateSchema(createBudgetSchema, 'body'),
    AuthMiddleware.authorize(['budgets:read']),
    budgetController.validateBudget.bind(budgetController)
);

/**
 * GET /api/budgets/suggestions - Sugestões para orçamento
 */
router.get('/suggestions',
    AuthMiddleware.authorize(['budgets:read']),
    budgetController.getBudgetSuggestions.bind(budgetController)
);

/**
 * GET /api/budgets/:period/recommendations - Recomendações de melhoria
 */
router.get('/:period/recommendations',
    validateSchema(budgetParamsSchema, 'params'),
    AuthMiddleware.authorize(['budgets:read']),
    AuthMiddleware.authorizeOwnerOrAdmin('userId'),
    budgetController.getBudgetRecommendations.bind(budgetController)
);

/**
 * Rotas de histórico e auditoria
 */

/**
 * GET /api/budgets/:period/history - Histórico de alterações
 */
router.get('/:period/history',
    validateSchema(budgetParamsSchema, 'params'),
    AuthMiddleware.authorize(['budgets:read']),
    AuthMiddleware.authorizeOwnerOrAdmin('userId'),
    budgetController.getBudgetHistory.bind(budgetController)
);

/**
 * GET /api/budgets/:period/audit-trail - Trilha de auditoria
 */
router.get('/:period/audit-trail',
    validateSchema(budgetParamsSchema, 'params'),
    AuthMiddleware.authorize(['budgets:read']),
    AuthMiddleware.authorizeOwnerOrAdmin('userId'),
    budgetController.getBudgetAuditTrail.bind(budgetController)
);

/**
 * POST /api/budgets/:period/restore/:version - Restaura versão anterior
 */
router.post('/:period/restore/:version',
    validateSchema(budgetParamsSchema, 'params'),
    AuthMiddleware.authorize(['budgets:write']),
    AuthMiddleware.authorizeOwnerOrAdmin('userId'),
    AuthMiddleware.logUserActivity('restore_budget_version'),
    budgetController.restoreBudgetVersion.bind(budgetController)
);

/**
 * Rotas administrativas
 */

/**
 * GET /api/budgets/admin/overview - Visão geral administrativa
 */
router.get('/admin/overview',
    AuthMiddleware.authorize(['admin:budgets:read']),
    budgetController.getAdminBudgetOverview.bind(budgetController)
);

/**
 * POST /api/budgets/admin/recalculate - Recalcula todos os orçamentos
 */
router.post('/admin/recalculate',
    AuthMiddleware.authorize(['admin:budgets:write']),
    AuthMiddleware.logUserActivity('admin_recalculate_budgets'),
    budgetController.recalculateAllBudgets.bind(budgetController)
);

/**
 * POST /api/budgets/admin/cleanup - Limpeza de dados órfãos
 */
router.post('/admin/cleanup',
    AuthMiddleware.authorize(['admin:budgets:write']),
    AuthMiddleware.logUserActivity('admin_cleanup_budgets'),
    budgetController.cleanupOrphanedBudgetData.bind(budgetController)
);

/**
 * GET /api/budgets/health - Health check dos orçamentos
 */
router.get('/health',
    AuthMiddleware.optionalAuthenticate,
    budgetController.healthCheck.bind(budgetController)
);

export default router;