// Updated budget validators for Sprint 2 - Percentage validation focus
import { z } from 'zod';
import { BudgetPeriod } from '../../core/domain/entities/budget.entity';

// Category allocation schema - Sprint 2 key feature: percentage validation
const categoryAllocationSchema = z.object({
    categoryId: z.string().uuid('Category ID must be a valid UUID'),
    categoryName: z.string().min(1, 'Category name is required').max(100, 'Category name too long'),
    percentage: z.number()
        .min(0.01, 'Percentage must be at least 0.01%')
        .max(100, 'Percentage cannot exceed 100%')
        .multipleOf(0.01, 'Percentage can have at most 2 decimal places'),
    allocatedAmount: z.number().min(0, 'Allocated amount cannot be negative').optional(),
    description: z.string().max(500, 'Description too long').optional(),
    isEssential: z.boolean().optional()
});

// Create budget schema with percentage validation
export const createBudgetSchema = z.object({
    name: z.string().min(1, 'Budget name is required').max(200, 'Budget name too long'),
    description: z.string().max(1000, 'Description too long').optional(),
    totalAmount: z.number().min(0.01, 'Total amount must be greater than zero').max(999999999.99, 'Total amount too large'),
    currency: z.string().length(3, 'Currency must be 3-letter code').regex(/^[A-Z]{3}$/, 'Currency must be uppercase'),
    period: z.nativeEnum(BudgetPeriod, { errorMap: () => ({ message: 'Invalid budget period' }) }),
    startDate: z.string().datetime('Invalid start date format'),
    endDate: z.string().datetime('Invalid end date format').optional(),
    categories: z.array(categoryAllocationSchema)
        .min(1, 'At least one category is required')
        .max(20, 'Maximum 20 categories allowed')
        .refine(
            (categories) => {
                const totalPercentage = categories.reduce((sum, cat) => sum + cat.percentage, 0);
                return Math.abs(totalPercentage - 100) <= 0.001; // Allow tiny floating point variance
            },
            {
                message: 'Category percentages must sum to exactly 100%',
                path: ['categories']
            }
        )
        .refine(
            (categories) => {
                const categoryIds = categories.map(c => c.categoryId);
                const uniqueIds = new Set(categoryIds);
                return categoryIds.length === uniqueIds.size;
            },
            {
                message: 'Duplicate categories are not allowed',
                path: ['categories']
            }
        ),
    alertThreshold: z.number()
        .min(0, 'Alert threshold cannot be negative')
        .max(100, 'Alert threshold cannot exceed 100%')
        .default(80),
    budgetType: z.enum(['zero_based', 'percentage_based', 'envelope']).default('percentage_based'),
    isActive: z.boolean().default(true)
});

// Update budget schema (partial)
export const updateBudgetSchema = createBudgetSchema.omit({
    period: true,
    startDate: true
}).partial().refine(
    (data) => Object.keys(data).length > 0,
    { message: 'At least one field must be provided for update' }
);

// Percentage validation schema - Sprint 2 key endpoint
export const validatePercentagesSchema = z.object({
    categories: z.array(categoryAllocationSchema).min(1, 'At least one category is required'),
    totalAmount: z.number().min(0.01, 'Total amount must be positive').optional(),
    currency: z.string().length(3).regex(/^[A-Z]{3}$/).default('BRL').optional()
});

// Query params schema
export const budgetQuerySchema = z.object({
    page: z.string().regex(/^\d+$/).transform(Number).refine(n => n >= 1).default('1'),
    limit: z.string().regex(/^\d+$/).transform(Number).refine(n => n >= 1 && n <= 100).default('10'),
    isActive: z.string().regex(/^(true|false)$/).transform(s => s === 'true').optional(),
    period: z.nativeEnum(BudgetPeriod).optional(),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
    budgetType: z.enum(['zero_based', 'percentage_based', 'envelope']).optional(),
    search: z.string().max(200).optional()
});

// Budget params schema
export const budgetParamsSchema = z.object({
    id: z.string().uuid('Budget ID must be a valid UUID')
});

// Type exports
export type CreateBudgetInput = z.infer<typeof createBudgetSchema>;
export type UpdateBudgetInput = z.infer<typeof updateBudgetSchema>;
export type ValidatePercentagesInput = z.infer<typeof validatePercentagesSchema>;
export type BudgetQueryInput = z.infer<typeof budgetQuerySchema>;
export type CategoryAllocationInput = z.infer<typeof categoryAllocationSchema>;