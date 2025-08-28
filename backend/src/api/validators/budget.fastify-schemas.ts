// Fastify-compatible JSON schemas for budget routes
// Converted from Zod to pure JSON Schema format

export const createBudgetSchema = {
    type: 'object',
    required: ['name', 'totalAmount', 'currency', 'period', 'startDate', 'categories', 'alertThreshold'],
    properties: {
        name: {
            type: 'string',
            minLength: 1,
            maxLength: 200,
            description: 'Budget name'
        },
        description: {
            type: 'string',
            maxLength: 1000,
            description: 'Budget description'
        },
        totalAmount: {
            type: 'number',
            minimum: 0.01,
            maximum: 999999999.99,
            description: 'Total budget amount'
        },
        currency: {
            type: 'string',
            pattern: '^[A-Z]{3}$',
            description: 'Currency code (3 letters)'
        },
        period: {
            type: 'string',
            enum: ['WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY', 'CUSTOM'],
            description: 'Budget period'
        },
        startDate: {
            type: 'string',
            format: 'date-time',
            description: 'Budget start date'
        },
        endDate: {
            type: 'string',
            format: 'date-time',
            description: 'Budget end date (optional)'
        },
        categories: {
            type: 'array',
            minItems: 1,
            maxItems: 20,
            items: {
                type: 'object',
                required: ['categoryId', 'categoryName', 'percentage'],
                properties: {
                    categoryId: {
                        type: 'string',
                        format: 'uuid',
                        description: 'Category UUID'
                    },
                    categoryName: {
                        type: 'string',
                        minLength: 1,
                        maxLength: 100,
                        description: 'Category name'
                    },
                    percentage: {
                        type: 'number',
                        minimum: 0.01,
                        maximum: 100,
                        multipleOf: 0.01,
                        description: 'Percentage allocation (must sum to 100)'
                    },
                    allocatedAmount: {
                        type: 'number',
                        minimum: 0,
                        description: 'Allocated amount (optional)'
                    },
                    description: {
                        type: 'string',
                        maxLength: 500,
                        description: 'Category description'
                    },
                    isEssential: {
                        type: 'boolean',
                        description: 'Is this an essential category'
                    }
                },
                additionalProperties: false
            },
            description: 'Budget categories that must sum to 100%'
        },
        alertThreshold: {
            type: 'number',
            minimum: 0,
            maximum: 100,
            default: 80,
            description: 'Alert threshold percentage'
        },
        budgetType: {
            type: 'string',
            enum: ['zero_based', 'percentage_based', 'envelope'],
            default: 'percentage_based',
            description: 'Type of budget'
        },
        isActive: {
            type: 'boolean',
            default: true,
            description: 'Is budget active'
        }
    },
    additionalProperties: false
};

export const updateBudgetSchema = {
    type: 'object',
    properties: {
        name: {
            type: 'string',
            minLength: 1,
            maxLength: 200
        },
        description: {
            type: 'string',
            maxLength: 1000
        },
        totalAmount: {
            type: 'number',
            minimum: 0.01,
            maximum: 999999999.99
        },
        categories: {
            type: 'array',
            minItems: 1,
            maxItems: 20,
            items: {
                type: 'object',
                required: ['categoryId', 'categoryName', 'percentage'],
                properties: {
                    categoryId: {
                        type: 'string',
                        format: 'uuid'
                    },
                    categoryName: {
                        type: 'string',
                        minLength: 1,
                        maxLength: 100
                    },
                    percentage: {
                        type: 'number',
                        minimum: 0.01,
                        maximum: 100,
                        multipleOf: 0.01
                    },
                    allocatedAmount: {
                        type: 'number',
                        minimum: 0
                    },
                    description: {
                        type: 'string',
                        maxLength: 500
                    },
                    isEssential: {
                        type: 'boolean'
                    }
                },
                additionalProperties: false
            }
        },
        alertThreshold: {
            type: 'number',
            minimum: 0,
            maximum: 100
        },
        isActive: {
            type: 'boolean'
        }
    },
    additionalProperties: false
};

export const validatePercentagesSchema = {
    type: 'object',
    required: ['categories'],
    properties: {
        categories: {
            type: 'array',
            minItems: 1,
            items: {
                type: 'object',
                required: ['categoryId', 'categoryName', 'percentage'],
                properties: {
                    categoryId: {
                        type: 'string',
                        format: 'uuid'
                    },
                    categoryName: {
                        type: 'string',
                        minLength: 1,
                        maxLength: 100
                    },
                    percentage: {
                        type: 'number',
                        minimum: 0.01,
                        maximum: 100,
                        multipleOf: 0.01
                    },
                    allocatedAmount: {
                        type: 'number',
                        minimum: 0
                    }
                },
                additionalProperties: false
            }
        },
        totalAmount: {
            type: 'number',
            minimum: 0.01
        },
        currency: {
            type: 'string',
            pattern: '^[A-Z]{3}$',
            default: 'BRL'
        }
    },
    additionalProperties: false
};

export const budgetQuerySchema = {
    type: 'object',
    properties: {
        page: {
            type: 'string',
            pattern: '^[1-9]\\d*$',
            default: '1'
        },
        limit: {
            type: 'string',
            pattern: '^[1-9]\\d*$',
            default: '10'
        },
        isActive: {
            type: 'string',
            enum: ['true', 'false']
        },
        period: {
            type: 'string',
            enum: ['WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY', 'CUSTOM']
        },
        startDate: {
            type: 'string',
            format: 'date-time'
        },
        endDate: {
            type: 'string',
            format: 'date-time'
        },
        budgetType: {
            type: 'string',
            enum: ['zero_based', 'percentage_based', 'envelope']
        },
        search: {
            type: 'string',
            maxLength: 200
        }
    },
    additionalProperties: false
};

export const budgetParamsSchema = {
    type: 'object',
    required: ['id'],
    properties: {
        id: {
            type: 'string',
            format: 'uuid'
        }
    },
    additionalProperties: false
};