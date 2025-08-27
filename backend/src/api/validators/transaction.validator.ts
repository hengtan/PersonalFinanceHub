// backend/src/api/validators/transaction.validator.ts
import { z } from 'zod';

/**
 * Tipos de transação suportados pelo sistema
 */
const transactionTypes = ['income', 'expense', 'transfer'] as const;

/**
 * Status disponíveis para transações
 */
const transactionStatuses = ['pending', 'completed', 'cancelled', 'failed'] as const;

/**
 * Schema para criação de transação
 * Implementa validações rigorosas para integridade financeira
 */
export const createTransactionSchema = z.object({
    description: z.string()
        .min(1, 'Description is required')
        .max(500, 'Description must be less than 500 characters')
        .trim()
        .refine(
            (desc) => desc.length > 0,
            'Description cannot be empty after trimming'
        ),

    amount: z.number()
        .positive('Amount must be positive')
        .max(999999999.99, 'Amount is too large')
        .multipleOf(0.01, 'Amount can have at most 2 decimal places')
        .refine(
            (amount) => amount >= 0.01,
            'Amount must be at least 0.01'
        ),

    transactionType: z.enum(transactionTypes, {
        errorMap: () => ({ message: 'Transaction type must be income, expense, or transfer' }),
    }),

    transactionDate: z.string()
        .datetime('Transaction date must be a valid ISO datetime')
        .or(z.date())
        .transform((val) => new Date(val))
        .refine(
            (date) => {
                const now = new Date();
                const maxPastDate = new Date(now.getFullYear() - 10, 0, 1); // 10 years ago
                const maxFutureDate = new Date(now.getFullYear() + 1, 11, 31); // 1 year in future
                return date >= maxPastDate && date <= maxFutureDate;
            },
            'Transaction date must be within the last 10 years or next year'
        ),

    categoryId: z.string()
        .uuid('Category ID must be a valid UUID')
        .optional(),

    accountId: z.string()
        .uuid('Account ID must be a valid UUID'),

    transferAccountId: z.string()
        .uuid('Transfer account ID must be a valid UUID')
        .optional(),

    merchantId: z.string()
        .uuid('Merchant ID must be a valid UUID')
        .optional(),

    notes: z.string()
        .max(1000, 'Notes must be less than 1000 characters')
        .trim()
        .optional(),

    tags: z.array(z.string().uuid('Tag ID must be a valid UUID'))
        .max(10, 'Maximum 10 tags allowed')
        .optional()
        .default([]),

    referenceNumber: z.string()
        .max(100, 'Reference number must be less than 100 characters')
        .trim()
        .optional(),

    location: z.object({
        latitude: z.number()
            .min(-90, 'Latitude must be between -90 and 90')
            .max(90, 'Latitude must be between -90 and 90'),
        longitude: z.number()
            .min(-180, 'Longitude must be between -180 and 180')
            .max(180, 'Longitude must be between -180 and 180'),
        address: z.string()
            .max(200, 'Address must be less than 200 characters')
            .optional(),
    }).optional(),

    attachments: z.array(z.object({
        filename: z.string()
            .min(1, 'Filename is required')
            .max(255, 'Filename must be less than 255 characters'),
        mimeType: z.string()
            .regex(/^(image|application\/pdf|text)\//i, 'Invalid file type'),
        size: z.number()
            .max(10 * 1024 * 1024, 'File size must be less than 10MB'),
        url: z.string()
            .url('Invalid attachment URL'),
    }))
        .max(5, 'Maximum 5 attachments allowed')
        .optional(),

    recurringRule: z.object({
        frequency: z.enum(['daily', 'weekly', 'monthly', 'yearly']),
        interval: z.number()
            .min(1, 'Interval must be at least 1')
            .max(100, 'Interval cannot exceed 100'),
        endDate: z.date()
            .optional(),
        occurrences: z.number()
            .min(1, 'Occurrences must be at least 1')
            .max(1000, 'Occurrences cannot exceed 1000')
            .optional(),
    }).optional(),

    status: z.enum(transactionStatuses)
        .default('completed'),
})
    .refine(
        (data) => {
            // Transfer transactions must have a transfer account
            if (data.transactionType === 'transfer' && !data.transferAccountId) {
                return false;
            }
            return true;
        },
        {
            message: 'Transfer account is required for transfer transactions',
            path: ['transferAccountId'],
        }
    )
    .refine(
        (data) => {
            // Transfer transactions cannot have the same source and destination account
            if (data.transactionType === 'transfer' && data.accountId === data.transferAccountId) {
                return false;
            }
            return true;
        },
        {
            message: 'Source and destination accounts must be different for transfers',
            path: ['transferAccountId'],
        }
    )
    .refine(
        (data) => {
            // Category is recommended for income/expense transactions
            if ((data.transactionType === 'income' || data.transactionType === 'expense') && !data.categoryId) {
                // This is a warning, not an error - we'll handle this in the business logic
                return true;
            }
            return true;
        }
    )
    .refine(
        (data) => {
            // Recurring rule end date must be after transaction date
            if (data.recurringRule?.endDate && data.recurringRule.endDate <= data.transactionDate) {
                return false;
            }
            return true;
        },
        {
            message: 'Recurring rule end date must be after transaction date',
            path: ['recurringRule', 'endDate'],
        }
    );

/**
 * Schema para atualização de transação
 * Permite atualizações parciais mas mantém validações de integridade
 */
export const updateTransactionSchema = createTransactionSchema.partial()
    .omit({
        recurringRule: true, // Recurring rules cannot be updated, only created/deleted
    })
    .refine(
        (data) => Object.keys(data).length > 0,
        {
            message: 'At least one field must be provided for update',
        }
    );

/**
 * Schema para consultas de transação com filtros avançados
 */
export const transactionQuerySchema = z.object({
    page: z.string()
        .regex(/^\d+$/, 'Page must be a positive integer')
        .transform(Number)
        .refine(val => val > 0, 'Page must be greater than 0')
        .default('1'),

    limit: z.string()
        .regex(/^\d+$/, 'Limit must be a positive integer')
        .transform(Number)
        .refine(val => val > 0 && val <= 100, 'Limit must be between 1 and 100')
        .default('20'),

    sortBy: z.enum(['transactionDate', 'amount', 'description', 'createdAt'])
        .default('transactionDate'),

    sortOrder: z.enum(['asc', 'desc'])
        .default('desc'),

    transactionType: z.enum(transactionTypes)
        .optional(),

    status: z.enum(transactionStatuses)
        .optional(),

    categoryId: z.string()
        .uuid('Category ID must be a valid UUID')
        .optional(),

    accountId: z.string()
        .uuid('Account ID must be a valid UUID')
        .optional(),

    merchantId: z.string()
        .uuid('Merchant ID must be a valid UUID')
        .optional(),

    startDate: z.string()
        .datetime('Start date must be a valid ISO datetime')
        .optional(),

    endDate: z.string()
        .datetime('End date must be a valid ISO datetime')
        .optional(),

    minAmount: z.string()
        .regex(/^\d+(\.\d{1,2})?$/, 'Min amount must be a valid decimal')
        .transform(Number)
        .refine(val => val >= 0, 'Min amount must be non-negative')
        .optional(),

    maxAmount: z.string()
        .regex(/^\d+(\.\d{1,2})?$/, 'Max amount must be a valid decimal')
        .transform(Number)
        .refine(val => val >= 0, 'Max amount must be non-negative')
        .optional(),

    search: z.string()
        .max(100, 'Search term must be less than 100 characters')
        .trim()
        .optional(),

    tags: z.string()
        .transform((str) => str.split(',').map(s => s.trim()).filter(Boolean))
        .pipe(z.array(z.string().uuid('Tag ID must be a valid UUID')))
        .optional(),

    hasAttachments: z.enum(['true', 'false'])
        .transform(val => val === 'true')
        .optional(),

    includeRecurring: z.enum(['true', 'false'])
        .transform(val => val === 'true')
        .default('true'),

    currency: z.string()
        .length(3, 'Currency must be a 3-letter ISO code')
        .regex(/^[A-Z]{3}$/, 'Currency must be uppercase letters only')
        .optional(),
})
    .refine(
        (data) => {
            if (data.startDate && data.endDate) {
                return new Date(data.startDate) <= new Date(data.endDate);
            }
            return true;
        },
        {
            message: 'Start date must be before or equal to end date',
            path: ['startDate', 'endDate'],
        }
    )
    .refine(
        (data) => {
            if (data.minAmount !== undefined && data.maxAmount !== undefined) {
                return data.minAmount <= data.maxAmount;
            }
            return true;
        },
        {
            message: 'Min amount must be less than or equal to max amount',
            path: ['minAmount', 'maxAmount'],
        }
    );

/**
 * Schema para parâmetros de transação
 */
export const transactionParamsSchema = z.object({
    id: z.string()
        .uuid('Transaction ID must be a valid UUID'),
});

/**
 * Schema para bulk operations
 */
export const bulkTransactionSchema = z.object({
    operation: z.enum(['delete', 'update', 'categorize']),

    transactionIds: z.array(z.string().uuid('Transaction ID must be a valid UUID'))
        .min(1, 'At least one transaction ID is required')
        .max(100, 'Maximum 100 transactions can be processed at once'),

    updateData: updateTransactionSchema
        .optional(),

    categoryId: z.string()
        .uuid('Category ID must be a valid UUID')
        .optional(),
})
    .refine(
        (data) => {
            if (data.operation === 'update' && !data.updateData) {
                return false;
            }
            if (data.operation === 'categorize' && !data.categoryId) {
                return false;
            }
            return true;
        },
        {
            message: 'Required data missing for the specified operation',
        }
    );

/**
 * Schema para importação de transações
 */
export const importTransactionSchema = z.object({
    format: z.enum(['csv', 'ofx', 'qif']),

    fileData: z.string()
        .min(1, 'File data is required'),

    mapping: z.object({
        date: z.string().min(1, 'Date column mapping is required'),
        description: z.string().min(1, 'Description column mapping is required'),
        amount: z.string().min(1, 'Amount column mapping is required'),
        category: z.string().optional(),
        account: z.string().optional(),
        reference: z.string().optional(),
    }),

    accountId: z.string()
        .uuid('Default account ID must be a valid UUID'),

    skipFirstRow: z.boolean()
        .default(true),

    dateFormat: z.string()
        .default('YYYY-MM-DD'),

    duplicateHandling: z.enum(['skip', 'merge', 'create'])
        .default('skip'),
});

/**
 * Schema para relatórios de transações
 */
export const transactionReportSchema = z.object({
    reportType: z.enum(['summary', 'detailed', 'category_breakdown', 'trends']),

    startDate: z.string()
        .datetime('Start date must be a valid ISO datetime'),

    endDate: z.string()
        .datetime('End date must be a valid ISO datetime'),

    groupBy: z.enum(['day', 'week', 'month', 'quarter', 'year', 'category', 'account'])
        .optional(),

    includeSubcategories: z.boolean()
        .default(true),

    format: z.enum(['json', 'csv', 'pdf'])
        .default('json'),

    currency: z.string()
        .length(3, 'Currency must be a 3-letter ISO code')
        .regex(/^[A-Z]{3}$/, 'Currency must be uppercase letters only')
        .optional(),
})
    .refine(
        (data) => new Date(data.startDate) <= new Date(data.endDate),
        {
            message: 'Start date must be before or equal to end date',
            path: ['startDate', 'endDate'],
        }
    );

// Type exports para TypeScript
export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;
export type UpdateTransactionInput = z.infer<typeof updateTransactionSchema>;
export type TransactionQueryInput = z.infer<typeof transactionQuerySchema>;
export type BulkTransactionInput = z.infer<typeof bulkTransactionSchema>;
export type ImportTransactionInput = z.infer<typeof importTransactionSchema>;
export type TransactionReportInput = z.infer<typeof transactionReportSchema>;
export type TransactionParamsInput = z.infer<typeof transactionParamsSchema>;

// Enums para uso no frontend
export const TransactionTypes = transactionTypes;
export const TransactionStatuses = transactionStatuses;