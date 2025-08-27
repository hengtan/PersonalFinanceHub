// backend/src/api/validators/auth.validator.ts
import { z } from 'zod';
import { ValidationUtil } from '../../shared/utils/validation.util';

/**
 * Schema de registro de usuário
 */
export const registerSchema = z.object({
    email: z.string()
        .min(1, 'Email is required')
        .max(255, 'Email must be less than 255 characters')
        .email('Invalid email format')
        .toLowerCase()
        .refine(
            (email) => ValidationUtil.isValidEmail(email),
            'Invalid email format'
        ),

    password: z.string()
        .min(8, 'Password must be at least 8 characters long')
        .max(128, 'Password must be less than 128 characters')
        .refine(
            (password) => ValidationUtil.validatePassword(password).isValid,
            (password) => ({
                message: `Password validation failed: ${ValidationUtil.validatePassword(password).errors.join(', ')}`
            })
        ),

    confirmPassword: z.string()
        .min(1, 'Password confirmation is required'),

    firstName: z.string()
        .min(1, 'First name is required')
        .max(50, 'First name must be less than 50 characters')
        .trim()
        .refine(
            (name) => ValidationUtil.isValidName(name),
            'First name contains invalid characters'
        ),

    lastName: z.string()
        .min(1, 'Last name is required')
        .max(50, 'Last name must be less than 50 characters')
        .trim()
        .refine(
            (name) => ValidationUtil.isValidName(name),
            'Last name contains invalid characters'
        ),

    acceptTerms: z.boolean()
        .refine(val => val === true, 'You must accept the terms and conditions'),

    marketingConsent: z.boolean()
        .optional()
        .default(false),

    referralCode: z.string()
        .max(20, 'Referral code must be less than 20 characters')
        .optional(),
})
    .refine(
        (data) => data.password === data.confirmPassword,
        {
            message: 'Passwords do not match',
            path: ['confirmPassword'],
        }
    );

/**
 * Schema de login
 */
export const loginSchema = z.object({
    email: z.string()
        .min(1, 'Email is required')
        .email('Invalid email format')
        .toLowerCase(),

    password: z.string()
        .min(1, 'Password is required')
        .max(128, 'Password is too long'),

    rememberMe: z.boolean()
        .optional()
        .default(false),

    totpCode: z.string()
        .length(6, 'TOTP code must be 6 digits')
        .regex(/^\d{6}$/, 'TOTP code must contain only numbers')
        .optional(),

    deviceInfo: z.object({
        name: z.string().max(100, 'Device name too long').optional(),
        type: z.enum(['desktop', 'mobile', 'tablet']).optional(),
        os: z.string().max(50, 'OS name too long').optional(),
        browser: z.string().max(50, 'Browser name too long').optional(),
    }).optional(),
});

/**
 * Schema de refresh token
 */
export const refreshTokenSchema = z.object({
    refreshToken: z.string()
        .min(1, 'Refresh token is required'),
});

/**
 * Schema de solicitação de reset de senha
 */
export const passwordResetRequestSchema = z.object({
    email: z.string()
        .min(1, 'Email is required')
        .email('Invalid email format')
        .toLowerCase(),
});

/**
 * Schema de confirmação de reset de senha
 */
export const passwordResetSchema = z.object({
    token: z.string()
        .min(1, 'Reset token is required')
        .length(64, 'Invalid reset token format'),

    password: z.string()
        .min(8, 'Password must be at least 8 characters long')
        .max(128, 'Password must be less than 128 characters')
        .refine(
            (password) => ValidationUtil.validatePassword(password).isValid,
            (password) => ({
                message: `Password validation failed: ${ValidationUtil.validatePassword(password).errors.join(', ')}`
            })
        ),

    confirmPassword: z.string()
        .min(1, 'Password confirmation is required'),
})
    .refine(
        (data) => data.password === data.confirmPassword,
        {
            message: 'Passwords do not match',
            path: ['confirmPassword'],
        }
    );

/**
 * Schema de alteração de senha
 */
export const changePasswordSchema = z.object({
    currentPassword: z.string()
        .min(1, 'Current password is required'),

    newPassword: z.string()
        .min(8, 'New password must be at least 8 characters long')
        .max(128, 'New password must be less than 128 characters')
        .refine(
            (password) => ValidationUtil.validatePassword(password).isValid,
            (password) => ({
                message: `Password validation failed: ${ValidationUtil.validatePassword(password).errors.join(', ')}`
            })
        ),

    confirmPassword: z.string()
        .min(1, 'Password confirmation is required'),

    totpCode: z.string()
        .length(6, 'TOTP code must be 6 digits')
        .regex(/^\d{6}$/, 'TOTP code must contain only numbers')
        .optional(),
})
    .refine(
        (data) => data.newPassword === data.confirmPassword,
        {
            message: 'Passwords do not match',
            path: ['confirmPassword'],
        }
    )
    .refine(
        (data) => data.currentPassword !== data.newPassword,
        {
            message: 'New password must be different from current password',
            path: ['newPassword'],
        }
    );

/**
 * Schema de atualização de perfil
 */
export const updateProfileSchema = z.object({
    firstName: z.string()
        .min(1, 'First name is required')
        .max(50, 'First name must be less than 50 characters')
        .trim()
        .refine(
            (name) => ValidationUtil.isValidName(name),
            'First name contains invalid characters'
        )
        .optional(),

    lastName: z.string()
        .min(1, 'Last name is required')
        .max(50, 'Last name must be less than 50 characters')
        .trim()
        .refine(
            (name) => ValidationUtil.isValidName(name),
            'Last name contains invalid characters'
        )
        .optional(),

    phone: z.string()
        .max(20, 'Phone number must be less than 20 characters')
        .refine(
            (phone) => !phone || ValidationUtil.isValidBrazilianPhone(phone),
            'Invalid phone number format'
        )
        .optional(),

    dateOfBirth: z.string()
        .datetime('Invalid date format')
        .refine(
            (date) => {
                const birthDate = new Date(date);
                const today = new Date();
                const age = today.getFullYear() - birthDate.getFullYear();
                return age >= 13 && age <= 120;
            },
            'Age must be between 13 and 120 years'
        )
        .optional(),

    address: z.object({
        street: z.string().max(200, 'Street must be less than 200 characters').optional(),
        number: z.string().max(10, 'Number must be less than 10 characters').optional(),
        complement: z.string().max(100, 'Complement must be less than 100 characters').optional(),
        neighborhood: z.string().max(100, 'Neighborhood must be less than 100 characters').optional(),
        city: z.string().max(100, 'City must be less than 100 characters').optional(),
        state: z.string().length(2, 'State must be 2 characters').toUpperCase().optional(),
        zipCode: z.string()
            .refine(
                (cep) => !cep || ValidationUtil.isValidCEP(cep),
                'Invalid ZIP code format'
            )
            .optional(),
        country: z.string().length(2, 'Country must be 2 characters').toUpperCase().default('BR'),
    }).optional(),

    preferences: z.object({
        currency: z.string()
            .length(3, 'Currency must be 3 characters')
            .toUpperCase()
            .refine(
                (currency) => ValidationUtil.isValidCurrencyCode(currency),
                'Invalid currency code'
            )
            .default('BRL'),

        language: z.enum(['pt-BR', 'en-US', 'es-ES'])
            .default('pt-BR'),

        timezone: z.string()
            .max(50, 'Timezone must be less than 50 characters')
            .default('America/Sao_Paulo'),

        theme: z.enum(['light', 'dark', 'auto'])
            .default('auto'),

        notifications: z.object({
            email: z.boolean().default(true),
            push: z.boolean().default(true),
            sms: z.boolean().default(false),
            marketing: z.boolean().default(false),
        }).default({}),
    }).optional(),

    avatar: z.object({
        url: z.string().url('Invalid avatar URL').optional(),
        filename: z.string().max(255, 'Filename too long').optional(),
        mimeType: z.string()
            .regex(/^image\/(jpeg|png|gif|webp)$/, 'Invalid image type')
            .optional(),
    }).optional(),
})
    .refine(
        (data) => Object.keys(data).length > 0,
        {
            message: 'At least one field must be provided for update',
        }
    );

/**
 * Schema de habilitação de MFA
 */
export const enableMFASchema = z.object({
    totpSecret: z.string()
        .min(1, 'TOTP secret is required'),

    totpCode: z.string()
        .length(6, 'TOTP code must be 6 digits')
        .regex(/^\d{6}$/, 'TOTP code must contain only numbers'),

    password: z.string()
        .min(1, 'Password is required for MFA setup'),
});

/**
 * Schema de desabilitação de MFA
 */
export const disableMFASchema = z.object({
    password: z.string()
        .min(1, 'Password is required'),

    totpCode: z.string()
        .length(6, 'TOTP code must be 6 digits')
        .regex(/^\d{6}$/, 'TOTP code must contain only numbers')
        .optional(),

    backupCode: z.string()
        .length(8, 'Backup code must be 8 characters')
        .regex(/^[A-Z0-9]{8}$/, 'Invalid backup code format')
        .optional(),

    reason: z.string()
        .max(500, 'Reason must be less than 500 characters')
        .optional(),
})
    .refine(
        (data) => data.totpCode || data.backupCode,
        {
            message: 'Either TOTP code or backup code is required',
        }
    );

/**
 * Schema de verificação de MFA
 */
export const verifyMFASchema = z.object({
    totpCode: z.string()
        .length(6, 'TOTP code must be 6 digits')
        .regex(/^\d{6}$/, 'TOTP code must contain only numbers')
        .optional(),

    backupCode: z.string()
        .length(8, 'Backup code must be 8 characters')
        .regex(/^[A-Z0-9]{8}$/, 'Invalid backup code format')
        .optional(),

    rememberDevice: z.boolean()
        .optional()
        .default(false),
})
    .refine(
        (data) => data.totpCode || data.backupCode,
        {
            message: 'Either TOTP code or backup code is required',
        }
    );

/**
 * Schema de atualização de status de usuário (admin)
 */
export const updateUserStatusSchema = z.object({
    status: z.enum(['active', 'inactive', 'suspended', 'deleted'], {
        errorMap: () => ({ message: 'Status must be active, inactive, suspended, or deleted' }),
    }),

    reason: z.string()
        .min(10, 'Reason must be at least 10 characters')
        .max(500, 'Reason must be less than 500 characters')
        .trim(),

    notifyUser: z.boolean()
        .optional()
        .default(true),

    suspendUntil: z.string()
        .datetime('Invalid date format')
        .refine(
            (date) => new Date(date) > new Date(),
            'Suspension date must be in the future'
        )
        .optional(),
})
    .refine(
        (data) => {
            if (data.status === 'suspended' && !data.suspendUntil) {
                return false;
            }
            return true;
        },
        {
            message: 'Suspension date is required when status is suspended',
            path: ['suspendUntil'],
        }
    );

/**
 * Schema para consultas de usuários (admin)
 */
export const userQuerySchema = z.object({
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

    search: z.string()
        .max(100, 'Search term must be less than 100 characters')
        .trim()
        .optional(),

    status: z.enum(['active', 'inactive', 'suspended', 'deleted'])
        .optional(),

    role: z.enum(['user', 'admin', 'moderator'])
        .optional(),

    createdAfter: z.string()
        .datetime('Invalid date format')
        .optional(),

    createdBefore: z.string()
        .datetime('Invalid date format')
        .optional(),

    lastLoginAfter: z.string()
        .datetime('Invalid date format')
        .optional(),

    lastLoginBefore: z.string()
        .datetime('Invalid date format')
        .optional(),

    sortBy: z.enum(['createdAt', 'lastLoginAt', 'email', 'firstName', 'lastName'])
        .default('createdAt'),

    sortOrder: z.enum(['asc', 'desc'])
        .default('desc'),

    emailVerified: z.enum(['true', 'false'])
        .transform(val => val === 'true')
        .optional(),

    mfaEnabled: z.enum(['true', 'false'])
        .transform(val => val === 'true')
        .optional(),
})
    .refine(
        (data) => {
            if (data.createdAfter && data.createdBefore) {
                return new Date(data.createdAfter) <= new Date(data.createdBefore);
            }
            return true;
        },
        {
            message: 'Created after date must be before or equal to created before date',
            path: ['createdAfter', 'createdBefore'],
        }
    )
    .refine(
        (data) => {
            if (data.lastLoginAfter && data.lastLoginBefore) {
                return new Date(data.lastLoginAfter) <= new Date(data.lastLoginBefore);
            }
            return true;
        },
        {
            message: 'Last login after date must be before or equal to last login before date',
            path: ['lastLoginAfter', 'lastLoginBefore'],
        }
    );

/**
 * Schema para auditoria
 */
export const auditQuerySchema = z.object({
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

    action: z.string()
        .max(100, 'Action must be less than 100 characters')
        .optional(),

    startDate: z.string()
        .datetime('Invalid date format')
        .optional(),

    endDate: z.string()
        .datetime('Invalid date format')
        .optional(),

    ipAddress: z.string()
        .ip('Invalid IP address')
        .optional(),

    resource: z.string()
        .max(100, 'Resource must be less than 100 characters')
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
    );

// Type exports para TypeScript
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
export type PasswordResetRequestInput = z.infer<typeof passwordResetRequestSchema>;
export type PasswordResetInput = z.infer<typeof passwordResetSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type EnableMFAInput = z.infer<typeof enableMFASchema>;
export type DisableMFAInput = z.infer<typeof disableMFASchema>;
export type VerifyMFAInput = z.infer<typeof verifyMFASchema>;
export type UpdateUserStatusInput = z.infer<typeof updateUserStatusSchema>;
export type UserQueryInput = z.infer<typeof userQuerySchema>;
export type AuditQueryInput = z.infer<typeof auditQuerySchema>;