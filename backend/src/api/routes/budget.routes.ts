// backend/src/api/routes/budget.routes.ts
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { BudgetController } from '../controllers/budget.controller';
import { BudgetApplicationService } from '../../core/application/services/budget-application.service';
import { jwtMiddleware } from '../middlewares/jwt.middleware';
import { BudgetRepositoryPostgres } from '../../infrastructure/database/postgres/repositories/budget.repository';
import {
    createBudgetSchema,
    updateBudgetSchema,
    validatePercentagesSchema,
    budgetQuerySchema,
    budgetParamsSchema
} from '../validators/budget.fastify-schemas';

export default async function budgetRoutes(fastify: FastifyInstance, options: FastifyPluginOptions) {
    // Initialize dependencies - using mocks for Sprint 2 focus on percentage validation
    // const budgetRepository = new BudgetRepositoryPostgres();
    const budgetService = new BudgetApplicationService();
    const budgetController = new BudgetController(budgetService);

    // Apply JWT authentication to all budget routes
    fastify.addHook('preHandler', jwtMiddleware.authenticate);

    // Rate limiting for budget operations
    await fastify.register(import('@fastify/rate-limit'), {
        max: 100,
        timeWindow: '15 minutes',
        keyGenerator: (request) => {
            return request.ip + ':budget';
        }
    });

    // Authentication hook for all budget routes
    fastify.addHook('preHandler', async (request, reply) => {
        try {
            await request.jwtVerify();
        } catch (err) {
            reply.status(401).send({ 
                success: false, 
                error: 'Unauthorized',
                message: 'Valid JWT token required' 
            });
        }
    });

    /**
     * GET /api/budgets - List budgets with filters
     */
    fastify.get('/', {
        schema: {
            tags: ['Budgets'],
            description: 'List budgets with filters and pagination',
            querystring: budgetQuerySchema,
            response: {
                200: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        data: {
                            type: 'object',
                            properties: {
                                budgets: {
                                    type: 'array',
                                    items: { type: 'object' }
                                }
                            }
                        }
                    }
                }
            }
        }
    }, budgetController.list.bind(budgetController));

    /**
     * POST /api/budgets - Create new budget with percentage validation
     */
    fastify.post('/', {
        schema: {
            body: createBudgetSchema,
            response: {
                201: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        data: {
                            type: 'object',
                            properties: {
                                budget: { type: 'object' }
                            }
                        }
                    }
                },
                400: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        error: { type: 'string' },
                        message: { type: 'string' },
                        details: { type: 'array' }
                    }
                }
            }
        },
        preHandler: [
            // Additional rate limiting for budget creation
            async function (request, reply) {
                const rateLimit = await fastify.rateLimit({
                    max: 10,
                    timeWindow: '5 minutes'
                });
                return rateLimit(request, reply);
            }
        ]
    }, budgetController.create.bind(budgetController));

    /**
     * GET /api/budgets/:id - Get budget by ID
     */
    fastify.get('/:id', {
        schema: {
            tags: ['Budgets'],
            description: 'Get budget by ID',
            params: budgetParamsSchema,
            response: {
                200: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        data: {
                            type: 'object',
                            properties: {
                                budget: { type: 'object' }
                            }
                        }
                    }
                },
                404: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        error: { type: 'string' },
                        message: { type: 'string' }
                    }
                }
            }
        }
    }, budgetController.getById.bind(budgetController));

    /**
     * PUT /api/budgets/:id - Update budget with percentage validation
     */
    fastify.put('/:id', {
        schema: {
            params: budgetParamsSchema,
            body: updateBudgetSchema,
            response: {
                200: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        data: {
                            type: 'object',
                            properties: {
                                budget: { type: 'object' }
                            }
                        }
                    }
                },
                400: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        error: { type: 'string' },
                        message: { type: 'string' },
                        details: { type: 'array' }
                    }
                },
                404: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        error: { type: 'string' },
                        message: { type: 'string' }
                    }
                }
            }
        }
    }, budgetController.update.bind(budgetController));

    /**
     * DELETE /api/budgets/:id - Delete budget
     */
    fastify.delete('/:id', {
        schema: {
            params: budgetParamsSchema,
            response: {
                200: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        message: { type: 'string' }
                    }
                },
                404: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        error: { type: 'string' },
                        message: { type: 'string' }
                    }
                }
            }
        }
    }, budgetController.delete.bind(budgetController));

    /**
     * POST /api/budgets/validate-percentages - Validate category percentage allocation
     * Sprint 2 key feature: Ensures categories sum to exactly 100%
     */
    fastify.post('/validate-percentages', {
        schema: {
            body: validatePercentagesSchema,
            response: {
                200: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        data: {
                            type: 'object',
                            properties: {
                                isValid: { type: 'boolean' },
                                totalPercentage: { type: 'number' },
                                expectedPercentage: { type: 'number' },
                                variance: { type: 'number' },
                                categories: {
                                    type: 'array',
                                    items: {
                                        type: 'object',
                                        properties: {
                                            categoryId: { type: 'string' },
                                            categoryName: { type: 'string' },
                                            percentage: { type: 'number' },
                                            allocatedAmount: { type: 'number' }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }, budgetController.validatePercentages.bind(budgetController));
}