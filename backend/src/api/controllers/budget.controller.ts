// backend/src/api/controllers/budget.controller.ts
import { FastifyRequest, FastifyReply } from 'fastify';
import { BudgetApplicationService } from '../../core/application/services/budget-application.service';
import { CreateBudgetCommand, UpdateBudgetCommand, BudgetQueryParams, CategoryAllocation } from '../../core/application/dtos/budget.dto';
import { BaseException } from '../../shared/exceptions/base.exception';
import { ValidationException } from '../../shared/exceptions/validation.exception';
import { NotFoundException } from '../../shared/exceptions/not-found.exception';
import { logger } from '../../infrastructure/monitoring/logger.service';
import { MetricsService } from '../../infrastructure/monitoring/metrics.service';

export class BudgetController {
    private budgetService: BudgetApplicationService;

    constructor(budgetService: BudgetApplicationService) {
        this.budgetService = budgetService;
    }

    /**
     * Lista orçamentos com filtros e paginação
     */
    async list(request: FastifyRequest<{ Querystring: BudgetQueryParams }>, reply: FastifyReply) {
        try {
            const userId = (request as any).user?.id;
            if (!userId) {
                return reply.status(401).send({
                    success: false,
                    error: 'Unauthorized',
                    message: 'User ID is required'
                });
            }

            const queryParams = request.query || {};
            const budgets = await this.budgetService.listBudgets(userId, queryParams);

            MetricsService.incrementCounter('budget_list_requests_total', {
                user_id: userId,
                filters_count: Object.keys(queryParams).length.toString()
            });

            return reply.send({
                success: true,
                data: { budgets }
            });
        } catch (error) {
            logger.error('Error listing budgets', error as Error, { 
                userId: (request as any).user?.id,
                correlationId: (request as any).correlationId 
            });
            
            if (error instanceof BaseException) {
                return reply.status(error.statusCode).send({
                    success: false,
                    error: error.name,
                    message: error.message,
                    details: error.details
                });
            }
            
            return reply.status(500).send({
                success: false,
                error: 'Internal Server Error',
                message: 'An unexpected error occurred'
            });
        }
    }

    /**
     * Busca orçamento específico
     */
    async getById(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
        try {
            const userId = (request as any).user?.id;
            const { id } = request.params;

            if (!userId) {
                return reply.status(401).send({
                    success: false,
                    error: 'Unauthorized',
                    message: 'User ID is required'
                });
            }

            const budget = await this.budgetService.getBudgetById(id, userId);

            MetricsService.incrementCounter('budget_get_requests_total', {
                user_id: userId
            });

            return reply.send({
                success: true,
                data: { budget: budget.toJSON() }
            });
        } catch (error) {
            logger.error('Error getting budget', error as Error, { 
                budgetId: request.params.id,
                userId: (request as any).user?.id,
                correlationId: (request as any).correlationId 
            });
            
            if (error instanceof NotFoundException) {
                return reply.status(404).send({
                    success: false,
                    error: 'Not Found',
                    message: error.message
                });
            }
            
            if (error instanceof BaseException) {
                return reply.status(error.statusCode).send({
                    success: false,
                    error: error.name,
                    message: error.message,
                    details: error.details
                });
            }
            
            return reply.status(500).send({
                success: false,
                error: 'Internal Server Error',
                message: 'An unexpected error occurred'
            });
        }
    }

    /**
     * Cria novo orçamento com validação de percentual
     */
    async create(request: FastifyRequest<{ Body: CreateBudgetCommand }>, reply: FastifyReply) {
        try {
            const userId = (request as any).user?.id;
            if (!userId) {
                return reply.status(401).send({
                    success: false,
                    error: 'Unauthorized',
                    message: 'User ID is required'
                });
            }

            const command: CreateBudgetCommand = {
                ...request.body,
                userId
            };

            const budget = await this.budgetService.createBudget(command);

            MetricsService.incrementCounter('budget_created_total', {
                user_id: userId,
                budget_type: command.budgetType || 'percentage_based',
                currency: command.currency || 'BRL'
            });

            logger.info('Budget created successfully', {
                budgetId: budget.getId(),
                userId,
                name: budget.getName(),
                totalAmount: budget.getTotalAmount().getAmount(),
                categoriesCount: budget.getCategories().length,
                correlationId: (request as any).correlationId
            });

            return reply.status(201).send({
                success: true,
                data: { budget: budget.toJSON() }
            });
        } catch (error) {
            logger.error('Error creating budget', error as Error, { 
                userId: (request as any).user?.id,
                correlationId: (request as any).correlationId 
            });
            
            if (error instanceof ValidationException) {
                return reply.status(400).send({
                    success: false,
                    error: 'Validation Error',
                    message: error.message,
                    details: error.details
                });
            }
            
            if (error instanceof BaseException) {
                return reply.status(error.statusCode).send({
                    success: false,
                    error: error.name,
                    message: error.message,
                    details: error.details
                });
            }
            
            return reply.status(500).send({
                success: false,
                error: 'Internal Server Error',
                message: 'An unexpected error occurred'
            });
        }
    }

    /**
     * Atualiza orçamento com validação de percentual
     */
    async update(request: FastifyRequest<{ Params: { id: string }, Body: UpdateBudgetCommand }>, reply: FastifyReply) {
        try {
            const userId = (request as any).user?.id;
            const { id } = request.params;

            if (!userId) {
                return reply.status(401).send({
                    success: false,
                    error: 'Unauthorized',
                    message: 'User ID is required'
                });
            }

            const command: UpdateBudgetCommand = {
                ...request.body,
                id,
                userId
            };

            const budget = await this.budgetService.updateBudget(command);

            MetricsService.incrementCounter('budget_updated_total', {
                user_id: userId
            });

            logger.info('Budget updated successfully', {
                budgetId: budget.getId(),
                userId,
                name: budget.getName(),
                correlationId: (request as any).correlationId
            });

            return reply.send({
                success: true,
                data: { budget: budget.toJSON() }
            });
        } catch (error) {
            logger.error('Error updating budget', error as Error, { 
                budgetId: request.params.id,
                userId: (request as any).user?.id,
                correlationId: (request as any).correlationId 
            });
            
            if (error instanceof ValidationException) {
                return reply.status(400).send({
                    success: false,
                    error: 'Validation Error',
                    message: error.message,
                    details: error.details
                });
            }
            
            if (error instanceof NotFoundException) {
                return reply.status(404).send({
                    success: false,
                    error: 'Not Found',
                    message: error.message
                });
            }
            
            if (error instanceof BaseException) {
                return reply.status(error.statusCode).send({
                    success: false,
                    error: error.name,
                    message: error.message,
                    details: error.details
                });
            }
            
            return reply.status(500).send({
                success: false,
                error: 'Internal Server Error',
                message: 'An unexpected error occurred'
            });
        }
    }

    /**
     * Remove orçamento
     */
    async delete(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
        try {
            const userId = (request as any).user?.id;
            const { id } = request.params;

            if (!userId) {
                return reply.status(401).send({
                    success: false,
                    error: 'Unauthorized',
                    message: 'User ID is required'
                });
            }

            await this.budgetService.deleteBudget(id, userId);

            MetricsService.incrementCounter('budget_deleted_total', {
                user_id: userId
            });

            logger.info('Budget deleted successfully', {
                budgetId: id,
                userId,
                correlationId: (request as any).correlationId
            });

            return reply.send({
                success: true,
                message: 'Budget deleted successfully'
            });
        } catch (error) {
            logger.error('Error deleting budget', error as Error, { 
                budgetId: request.params.id,
                userId: (request as any).user?.id,
                correlationId: (request as any).correlationId 
            });
            
            if (error instanceof NotFoundException) {
                return reply.status(404).send({
                    success: false,
                    error: 'Not Found',
                    message: error.message
                });
            }
            
            if (error instanceof BaseException) {
                return reply.status(error.statusCode).send({
                    success: false,
                    error: error.name,
                    message: error.message,
                    details: error.details
                });
            }
            
            return reply.status(500).send({
                success: false,
                error: 'Internal Server Error',
                message: 'An unexpected error occurred'
            });
        }
    }

    /**
     * Validates percentage allocation for categories - Sprint 2 key feature
     */
    async validatePercentages(request: FastifyRequest<{ Body: { categories: CategoryAllocation[] } }>, reply: FastifyReply) {
        try {
            const { categories = [] } = request.body;

            const totalPercentage = categories.reduce((sum, category) => sum + (category.percentage || 0), 0);
            const isValid = Math.abs(totalPercentage - 100) <= 0.001;

            return reply.send({
                success: true,
                data: {
                    isValid,
                    totalPercentage: parseFloat(totalPercentage.toFixed(3)),
                    expectedPercentage: 100,
                    variance: parseFloat((totalPercentage - 100).toFixed(3)),
                    categories: categories.map(cat => ({
                        categoryId: cat.categoryId,
                        categoryName: cat.categoryName,
                        percentage: cat.percentage,
                        allocatedAmount: cat.allocatedAmount
                    }))
                }
            });
        } catch (error) {
            logger.error('Error validating percentages', error as Error, {
                correlationId: (request as any).correlationId
            });

            return reply.status(500).send({
                success: false,
                error: 'Internal Server Error',
                message: 'An unexpected error occurred'
            });
        }
    }
}