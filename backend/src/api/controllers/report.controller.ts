// backend/src/api/controllers/report.controller.ts

import { Request, Response } from 'express';
import { ReportService } from '../../application/services/report.service';
import { GenerateFinancialReportUseCase } from '../../application/use-cases/report/generate-financial-report.use-case';
import { GenerateExpenseAnalysisUseCase } from '../../application/use-cases/report/generate-expense-analysis.use-case';
import { GenerateBudgetComparisonUseCase } from '../../application/use-cases/report/generate-budget-comparison.use-case';
import { ExportReportUseCase } from '../../application/use-cases/report/export-report.use-case';
import { CacheService } from '../../infrastructure/database/redis/cache.service';
import { logger } from '../../infrastructure/monitoring/logger.service';
import { ValidationException } from '../../shared/exceptions/validation.exception';
import { BusinessException } from '../../shared/exceptions/business.exception';
import { HTTP_STATUS } from '../../shared/constants/status-codes';
import { ReportType, ReportFormat, DateRange } from '../../shared/types/report.types';

export class ReportController {
    constructor(
        private readonly reportService: ReportService,
        private readonly generateFinancialReportUseCase: GenerateFinancialReportUseCase,
        private readonly generateExpenseAnalysisUseCase: GenerateExpenseAnalysisUseCase,
        private readonly generateBudgetComparisonUseCase: GenerateBudgetComparisonUseCase,
        private readonly exportReportUseCase: ExportReportUseCase,
        private readonly cacheService: CacheService
    ) {}

    /**
     * Gera relatório financeiro personalizado
     */
    async generateFinancialReport(req: Request, res: Response): Promise<void> {
        try {
            const userId = req.user?.id;
            const {
                reportType,
                dateRange,
                categories,
                accounts,
                groupBy,
                includeProjections
            } = req.body;

            if (!userId) {
                res.status(HTTP_STATUS.UNAUTHORIZED).json({
                    success: false,
                    message: 'Usuário não autenticado'
                });
                return;
            }

            logger.info('Generating financial report', {
                userId,
                reportType,
                dateRange
            });

            // Check cache first
            const cacheKey = `financial_report:${userId}:${JSON.stringify(req.body)}`;
            const cachedReport = await this.cacheService.get(cacheKey);

            if (cachedReport) {
                res.status(HTTP_STATUS.SUCCESS).json({
                    success: true,
                    message: 'Relatório gerado com sucesso (cache)',
                    data: cachedReport
                });
                return;
            }

            const report = await this.generateFinancialReportUseCase.execute({
                userId,
                reportType: reportType as ReportType,
                dateRange: dateRange as DateRange,
                filters: {
                    categories,
                    accounts,
                    groupBy,
                    includeProjections: includeProjections ?? false
                }
            });

            // Cache report for 30 minutes
            await this.cacheService.set(cacheKey, report, 1800);

            res.status(HTTP_STATUS.SUCCESS).json({
                success: true,
                message: 'Relatório gerado com sucesso',
                data: report
            });

            logger.info('Financial report generated successfully', {
                userId,
                reportType,
                dataPoints: report.data?.length || 0
            });

        } catch (error) {
            logger.error('Failed to generate financial report', {
                userId: req.user?.id,
                error: error.message,
                stack: error.stack
            });

            if (error instanceof ValidationException) {
                res.status(HTTP_STATUS.BAD_REQUEST).json({
                    success: false,
                    message: error.message,
                    errors: error.details
                });
                return;
            }

            if (error instanceof BusinessException) {
                res.status(HTTP_STATUS.BAD_REQUEST).json({
                    success: false,
                    message: error.message
                });
                return;
            }

            res.status(HTTP_STATUS.INTERNAL_ERROR).json({
                success: false,
                message: 'Erro ao gerar relatório financeiro'
            });
        }
    }

    /**
     * Análise detalhada de gastos por categoria
     */
    async generateExpenseAnalysis(req: Request, res: Response): Promise<void> {
        try {
            const userId = req.user?.id;
            const { dateRange, categories, analysisType } = req.body;

            if (!userId) {
                res.status(HTTP_STATUS.UNAUTHORIZED).json({
                    success: false,
                    message: 'Usuário não autenticado'
                });
                return;
            }

            const analysis = await this.generateExpenseAnalysisUseCase.execute({
                userId,
                dateRange: dateRange as DateRange,
                categories,
                analysisType: analysisType || 'detailed'
            });

            res.status(HTTP_STATUS.SUCCESS).json({
                success: true,
                message: 'Análise de gastos gerada com sucesso',
                data: analysis
            });

            logger.info('Expense analysis generated', {
                userId,
                categories: categories?.length || 0,
                analysisType
            });

        } catch (error) {
            logger.error('Failed to generate expense analysis', {
                userId: req.user?.id,
                error: error.message
            });

            res.status(HTTP_STATUS.INTERNAL_ERROR).json({
                success: false,
                message: 'Erro ao gerar análise de gastos'
            });
        }
    }

    /**
     * Comparação entre orçamento planejado vs real
     */
    async generateBudgetComparison(req: Request, res: Response): Promise<void> {
        try {
            const userId = req.user?.id;
            const { budgetId, dateRange, includeProjections } = req.body;

            if (!userId) {
                res.status(HTTP_STATUS.UNAUTHORIZED).json({
                    success: false,
                    message: 'Usuário não autenticado'
                });
                return;
            }

            const comparison = await this.generateBudgetComparisonUseCase.execute({
                userId,
                budgetId,
                dateRange: dateRange as DateRange,
                includeProjections: includeProjections ?? true
            });

            res.status(HTTP_STATUS.SUCCESS).json({
                success: true,
                message: 'Comparação de orçamento gerada com sucesso',
                data: comparison
            });

            logger.info('Budget comparison generated', {
                userId,
                budgetId,
                variance: comparison.summary?.totalVariance
            });

        } catch (error) {
            logger.error('Failed to generate budget comparison', {
                userId: req.user?.id,
                budgetId: req.body.budgetId,
                error: error.message
            });

            res.status(HTTP_STATUS.INTERNAL_ERROR).json({
                success: false,
                message: 'Erro ao gerar comparação de orçamento'
            });
        }
    }

    /**
     * Exporta relatório em diferentes formatos
     */
    async exportReport(req: Request, res: Response): Promise<void> {
        try {
            const userId = req.user?.id;
            const { reportId, format, includeCharts } = req.body;

            if (!userId) {
                res.status(HTTP_STATUS.UNAUTHORIZED).json({
                    success: false,
                    message: 'Usuário não autenticado'
                });
                return;
            }

            const exportResult = await this.exportReportUseCase.execute({
                userId,
                reportId,
                format: format as ReportFormat,
                options: {
                    includeCharts: includeCharts ?? true,
                    includeMetadata: true
                }
            });

            // Set appropriate headers for file download
            const contentTypes = {
                PDF: 'application/pdf',
                EXCEL: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                CSV: 'text/csv'
            };

            const fileExtensions = {
                PDF: 'pdf',
                EXCEL: 'xlsx',
                CSV: 'csv'
            };

            const fileName = `relatorio_financeiro_${reportId}.${fileExtensions[format]}`;

            res.setHeader('Content-Type', contentTypes[format]);
            res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

            if (exportResult.buffer) {
                res.send(exportResult.buffer);
            } else {
                res.status(HTTP_STATUS.SUCCESS).json({
                    success: true,
                    message: 'Relatório exportado com sucesso',
                    data: {
                        downloadUrl: exportResult.downloadUrl,
                        fileName: fileName,
                        size: exportResult.fileSize
                    }
                });
            }

            logger.info('Report exported successfully', {
                userId,
                reportId,
                format,
                fileSize: exportResult.fileSize
            });

        } catch (error) {
            logger.error('Failed to export report', {
                userId: req.user?.id,
                reportId: req.body.reportId,
                format: req.body.format,
                error: error.message
            });

            res.status(HTTP_STATUS.INTERNAL_ERROR).json({
                success: false,
                message: 'Erro ao exportar relatório'
            });
        }
    }

    /**
     * Lista histórico de relatórios gerados
     */
    async getReportHistory(req: Request, res: Response): Promise<void> {
        try {
            const userId = req.user?.id;
            const { page = 1, limit = 20, type } = req.query;

            if (!userId) {
                res.status(HTTP_STATUS.UNAUTHORIZED).json({
                    success: false,
                    message: 'Usuário não autenticado'
                });
                return;
            }

            const history = await this.reportService.getReportHistory({
                userId,
                pagination: {
                    page: parseInt(page as string),
                    limit: parseInt(limit as string)
                },
                filters: {
                    type: type as ReportType
                }
            });

            res.status(HTTP_STATUS.SUCCESS).json({
                success: true,
                message: 'Histórico de relatórios recuperado com sucesso',
                data: history
            });

        } catch (error) {
            logger.error('Failed to get report history', {
                userId: req.user?.id,
                error: error.message
            });

            res.status(HTTP_STATUS.INTERNAL_ERROR).json({
                success: false,
                message: 'Erro ao recuperar histórico de relatórios'
            });
        }
    }

    /**
     * Deleta relatório do histórico
     */
    async deleteReport(req: Request, res: Response): Promise<void> {
        try {
            const userId = req.user?.id;
            const { reportId } = req.params;

            if (!userId) {
                res.status(HTTP_STATUS.UNAUTHORIZED).json({
                    success: false,
                    message: 'Usuário não autenticado'
                });
                return;
            }

            await this.reportService.deleteReport(userId, reportId);

            // Clear related cache
            const cachePattern = `*report*${userId}*`;
            await this.cacheService.deletePattern(cachePattern);

            res.status(HTTP_STATUS.SUCCESS).json({
                success: true,
                message: 'Relatório deletado com sucesso'
            });

            logger.info('Report deleted successfully', { userId, reportId });

        } catch (error) {
            logger.error('Failed to delete report', {
                userId: req.user?.id,
                reportId: req.params.reportId,
                error: error.message
            });

            if (error instanceof BusinessException) {
                res.status(HTTP_STATUS.NOT_FOUND).json({
                    success: false,
                    message: error.message
                });
                return;
            }

            res.status(HTTP_STATUS.INTERNAL_ERROR).json({
                success: false,
                message: 'Erro ao deletar relatório'
            });
        }
    }

    /**
     * Gera insights automáticos baseados nos dados financeiros
     */
    async generateFinancialInsights(req: Request, res: Response): Promise<void> {
        try {
            const userId = req.user?.id;
            const { analysisDepth = 'standard' } = req.body;

            if (!userId) {
                res.status(HTTP_STATUS.UNAUTHORIZED).json({
                    success: false,
                    message: 'Usuário não autenticado'
                });
                return;
            }

            // Check cache first
            const cacheKey = `financial_insights:${userId}:${analysisDepth}`;
            const cachedInsights = await this.cacheService.get(cacheKey);

            if (cachedInsights) {
                res.status(HTTP_STATUS.SUCCESS).json({
                    success: true,
                    message: 'Insights gerados com sucesso (cache)',
                    data: cachedInsights
                });
                return;
            }

            const insights = await this.reportService.generateFinancialInsights({
                userId,
                analysisDepth
            });

            // Cache insights for 2 hours
            await this.cacheService.set(cacheKey, insights, 7200);

            res.status(HTTP_STATUS.SUCCESS).json({
                success: true,
                message: 'Insights financeiros gerados com sucesso',
                data: insights
            });

            logger.info('Financial insights generated', {
                userId,
                analysisDepth,
                insightsCount: insights.insights?.length || 0
            });

        } catch (error) {
            logger.error('Failed to generate financial insights', {
                userId: req.user?.id,
                error: error.message
            });

            res.status(HTTP_STATUS.INTERNAL_ERROR).json({
                success: false,
                message: 'Erro ao gerar insights financeiros'
            });
        }
    }
}