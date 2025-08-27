// backend/src/api/validators/budget.validator.ts
import { z } from 'zod';

/**
 * Schema para categoria de orçamento
 * Valida valores monetários com precisão decimal e porcentagens
 */
const budgetCategorySchema = z.object({
    categoryId: z.string()
        .uuid('Category ID must be a valid UUID'),

    budgetedAmount: z.number()
        .min(0, 'Budgeted amount must be non-negative')
        .max(999999999.99, 'Budgeted amount is too large')
        .multipleOf(0.01, 'Budgeted amount can have at most 2 decimal places'),

    percentageOfIncome: z.number()
        .min(0, 'Percentage must be non-negative')
        .max(100, 'Percentage cannot exceed 100%')
        .multipleOf(0.01, 'Percentage can have at most 2 decimal places')
        .optional(),

    notes: z.string()
        .max(500, 'Category notes must be less than 500 characters')
        .trim()
        .optional(),

    isEssential: z.boolean()
        .default(false)
        .optional(),

    alertThreshold: z.number()
        .min(0, 'Alert threshold must be non-negative')
        .max(100, 'Alert threshold cannot exceed 100%')
        .default(80)
        .optional(),
});

/**
 * Schema para meta de poupança dentro do orçamento
 */
const savingsGoalSchema = z.object({
    goalId: z.string()
        .uuid('Goal ID must be a valid UUID'),

    targetAmount: z.number()
        .min(0, 'Target amount must be non-negative')
        .max(999999999.99, 'Target amount is too large')
        .multipleOf(0.01, 'Target amount can have at most 2 decimal places'),

    monthlyContribution: z.number()
        .min(0, 'Monthly contribution must be non-negative')
        .max(999999999.99, 'Monthly contribution is too large')
        .multipleOf(0.01, 'Monthly contribution can have at most 2 decimal places'),

    priority: z.enum(['low', 'medium', 'high'])
        .default('medium'),
});

/**
 * Schema principal para criação de orçamento
 * Implementa validações de negócio complexas
 */
export const createBudgetSchema = z.object({
    period: z.string()
        .regex(/^\d{4}-\d{2}$/, 'Period must be in YYYY-MM format')
        .refine(
            (period) => {
                const [year, month] = period.split('-').map(Number);
                const currentYear = new Date().getFullYear();
                return year >= currentYear - 1 && year <= currentYear + 5 && month >= 1 && month <= 12;
            },
            'Period must be within valid range (current year -1 to +5 years)'
        ),

    totalIncomeBudget: z.number()
        .min(0, 'Total income budget must be non-negative')
        .max(999999999.99, 'Total income budget is too large')
        .multipleOf(0.01, 'Total income budget can have at most 2 decimal places')
        .default(0),

    totalExpenseBudget: z.number()
        .min(0, 'Total expense budget must be non-negative')
        .max(999999999.99, 'Total expense budget is too large')
        .multipleOf(0.01, 'Total expense budget can have at most 2 decimal places')
        .default(0),

    categories: z.array(budgetCategorySchema)
        .max(50, 'Maximum 50 budget categories allowed')
        .optional(),

    savingsGoals: z.array(savingsGoalSchema)
        .max(20, 'Maximum 20 savings goals allowed')
        .optional(),

    notes: z.string()
        .max(1000, 'Notes must be less than 1000 characters')
        .trim()
        .optional(),

    currency: z.string()
        .length(3, 'Currency must be a 3-letter ISO code')
        .regex(/^[A-Z]{3}$/, 'Currency must be uppercase letters only')
        .default('USD'),

    isActive: z.boolean()
        .default(true),

    budgetType: z.enum(['zero_based', 'percentage_based', 'envelope'])
        .default('percentage_based'),

    alertsEnabled: z.boolean()
        .default(true),

    rolloverUnspent: z.boolean()
        .default(false),
})
    .refine(
        (data) => {
            if (data.categories && data.categories.length > 0) {
                const totalCategoryBudget = data.categories.reduce((sum, cat) => sum + cat.budgetedAmount, 0);
                return totalCategoryBudget <= data.totalExpenseBudget + 1000; // Allow small variance
            }
            return true;
        },
        {
            message: 'Total category budgets cannot significantly exceed total expense budget',
            path: ['categories'],
        }
    )
    .refine(
        (data) => {
            if (data.categories && data.totalIncomeBudget > 0) {
                const totalPercentage = data.categories
                    .filter(cat => cat.percentageOfIncome)
                    .reduce((sum, cat) => sum + (cat.percentageOfIncome || 0), 0);
                return totalPercentage <= 100;
            }
            return true;
        },
        {
            message: 'Total percentage allocation cannot exceed 100%',
            path: ['categories'],
        }
    )
    .refine(
        (data) => {
            const totalSavingsContribution = data.savingsGoals?.reduce(
                (sum, goal) => sum + goal.monthlyContribution, 0
            ) || 0;
            return totalSavingsContribution <= data.totalIncomeBudget;
        },
        {
            message: 'Total savings contributions cannot exceed total income budget',
            path: ['savingsGoals'],
        }
    );

/**
 * Schema para atualização de orçamento
 * Permite atualizações parciais mas mantém validações de integridade
 */
export const updateBudgetSchema = createBudgetSchema.omit({ period: true }).partial()
    .refine(
        (data) => Object.keys(data).length > 0,
        {
            message: 'At least one field must be provided for update',
        }
    );

/**
 * Schema para parâmetros de período
 */
export const budgetParamsSchema = z.object({
    period: z.string()
        .regex(/^\d{4}-\d{2}$/, 'Period must be in YYYY-MM format'),
});

/**
 * Schema para consultas de orçamento com filtros
 */
export const budgetQuerySchema = z.object({
    period: z.string()
        .regex(/^\d{4}-\d{2}$/, 'Period must be in YYYY-MM format')
        .optional(),

    startPeriod: z.string()
        .regex(/^\d{4}-\d{2}$/, 'Start period must be in YYYY-MM format')
        .optional(),

    endPeriod: z.string()
        .regex(/^\d{4}-\d{2}$/, 'End period must be in YYYY-MM format')
        .optional(),

    budgetType: z.enum(['zero_based', 'percentage_based', 'envelope'])
        .optional(),

    isActive: z.enum(['true', 'false'])
        .transform(val => val === 'true')
        .optional(),

    includeArchived: z.enum(['true', 'false'])
        .transform(val => val === 'true')
        .default('false'),

    categoryId: z.string()
        .uuid('Category ID must be a valid UUID')
        .optional(),
})
    .refine(
        (data) => {
            if (data.startPeriod && data.endPeriod) {
                const start = new Date(data.startPeriod + '-01');
                const end = new Date(data.endPeriod + '-01');
                return start <= end;
            }
            return true;
        },
        {
            message: 'Start period must be before or equal to end period',
            path: ['startPeriod', 'endPeriod'],
        }
    );

/**
 * Schema para relatório de performance do orçamento
 */
export const budgetReportSchema = z.object({
    period: z.string()
        .regex(/^\d{4}-\d{2}$/, 'Period must be in YYYY-MM format'),

    compareWithPrevious: z.enum(['true', 'false'])
        .transform(val => val === 'true')
        .default('false'),

    includeCategoryBreakdown: z.enum(['true', 'false'])
        .transform(val => val === 'true')
        .default('true'),

    includeProjections: z.enum(['true', 'false'])
        .transform(val => val === 'true')
        .default('false'),

    currency: z.string()
        .length(3, 'Currency must be a 3-letter ISO code')
        .regex(/^[A-Z]{3}$/, 'Currency must be uppercase letters only')
        .optional(),
});

/**
 * Schema para cópia de orçamento
 */
export const copyBudgetSchema = z.object({
    sourcePeriod: z.string()
        .regex(/^\d{4}-\d{2}$/, 'Source period must be in YYYY-MM format'),

    targetPeriod: z.string()
        .regex(/^\d{4}-\d{2}$/, 'Target period must be in YYYY-MM format'),

    copyCategories: z.boolean()
        .default(true),

    copySavingsGoals: z.boolean()
        .default(true),

    adjustForInflation: z.boolean()
        .default(false),

    inflationRate: z.number()
        .min(-10, 'Inflation rate cannot be less than -10%')
        .max(20, 'Inflation rate cannot exceed 20%')
        .multipleOf(0.01, 'Inflation rate can have at most 2 decimal places')
        .default(0)
        .optional(),
})
    .refine(
        (data) => data.sourcePeriod !== data.targetPeriod,
        {
            message: 'Source and target periods must be different',
            path: ['targetPeriod'],
        }
    )
    .refine(
        (data) => {
            if (data.adjustForInflation && !data.inflationRate) {
                return false;
            }
            return true;
        },
        {
            message: 'Inflation rate is required when adjusting for inflation',
            path: ['inflationRate'],
        }
    );

/**
 * Schema para alertas de orçamento
 */
export const budgetAlertSchema = z.object({
    budgetId: z.string()
        .uuid('Budget ID must be a valid UUID'),

    alertType: z.enum(['overspend', 'underspend', 'goal_progress', 'budget_completion']),

    threshold: z.number()
        .min(0, 'Threshold must be non-negative')
        .max(200, 'Threshold cannot exceed 200%')
        .default(80),

    isEnabled: z.boolean()
        .default(true),

    notificationMethods: z.array(z.enum(['email', 'sms', 'push', 'in_app']))
        .min(1, 'At least one notification method must be selected')
        .default(['in_app']),
});

// Type exports para TypeScript
export type CreateBudgetInput = z.infer<typeof createBudgetSchema>;
export type UpdateBudgetInput = z.infer<typeof updateBudgetSchema>;
export type BudgetQueryInput = z.infer<typeof budgetQuerySchema>;
export type BudgetReportInput = z.infer<typeof budgetReportSchema>;
export type CopyBudgetInput = z.infer<typeof copyBudgetSchema>;
export type BudgetAlertInput = z.infer<typeof budgetAlertSchema>;
export type BudgetCategoryInput = z.infer<typeof budgetCategorySchema>;
export type SavingsGoalInput = z.infer<typeof savingsGoalSchema>;