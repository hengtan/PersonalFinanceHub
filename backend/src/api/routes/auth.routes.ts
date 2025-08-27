import { FastifyInstance } from 'fastify';
import { logger } from '../../infrastructure/monitoring/logger.service';
import { MetricsService } from '../../infrastructure/monitoring/metrics.service';
import { authController } from '../controllers/auth.controller';

// Tipos para as requests de autenticação
interface LoginRequest {
    email: string;
    password: string;
    rememberMe?: boolean;
}

interface RegisterRequest {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    acceptTerms: boolean;
}

interface RefreshTokenRequest {
    refreshToken: string;
}

interface ForgotPasswordRequest {
    email: string;
}

interface ResetPasswordRequest {
    token: string;
    password: string;
}

// Schemas para validação
const loginSchema = {
    tags: ['Auth'],
    description: 'User login',
    body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
            email: {
                type: 'string',
                format: 'email',
                description: 'User email address'
            },
            password: {
                type: 'string',
                minLength: 6,
                description: 'User password'
            },
            rememberMe: {
                type: 'boolean',
                default: false,
                description: 'Keep user logged in'
            }
        }
    },
    response: {
        200: {
            type: 'object',
            properties: {
                success: { type: 'boolean' },
                message: { type: 'string' },
                data: {
                    type: 'object',
                    properties: {
                        user: {
                            type: 'object',
                            properties: {
                                id: { type: 'string' },
                                email: { type: 'string' },
                                firstName: { type: 'string' },
                                lastName: { type: 'string' }
                            }
                        },
                        tokens: {
                            type: 'object',
                            properties: {
                                accessToken: { type: 'string' },
                                refreshToken: { type: 'string' },
                                expiresIn: { type: 'number' }
                            }
                        }
                    }
                }
            }
        },
        400: {
            type: 'object',
            properties: {
                success: { type: 'boolean' },
                message: { type: 'string' },
                errors: { type: 'array' }
            }
        },
        401: {
            type: 'object',
            properties: {
                success: { type: 'boolean' },
                message: { type: 'string' }
            }
        }
    }
};

const registerSchema = {
    tags: ['Auth'],
    description: 'User registration',
    body: {
        type: 'object',
        required: ['email', 'password', 'firstName', 'lastName', 'acceptTerms'],
        properties: {
            email: {
                type: 'string',
                format: 'email',
                description: 'User email address'
            },
            password: {
                type: 'string',
                minLength: 8,
                pattern: '^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]',
                description: 'Strong password with uppercase, lowercase, number and special char'
            },
            firstName: {
                type: 'string',
                minLength: 2,
                maxLength: 50,
                description: 'User first name'
            },
            lastName: {
                type: 'string',
                minLength: 2,
                maxLength: 50,
                description: 'User last name'
            },
            acceptTerms: {
                type: 'boolean',
                const: true,
                description: 'User must accept terms and conditions'
            }
        }
    },
    response: {
        201: {
            type: 'object',
            properties: {
                success: { type: 'boolean' },
                message: { type: 'string' },
                data: {
                    type: 'object',
                    properties: {
                        user: {
                            type: 'object',
                            properties: {
                                id: { type: 'string' },
                                email: { type: 'string' },
                                firstName: { type: 'string' },
                                lastName: { type: 'string' }
                            }
                        }
                    }
                }
            }
        }
    }
};

export default async function authRoutes(fastify: FastifyInstance) {
    const routeContext = logger.child({ module: 'auth-routes' });

    // Login endpoint
    fastify.post<{ Body: LoginRequest }>('/login', { schema: loginSchema }, authController.login.bind(authController));

    // Register endpoint
    fastify.post<{ Body: RegisterRequest }>('/register', { schema: registerSchema }, authController.register.bind(authController));

    // Refresh token endpoint
    fastify.post<{ Body: RefreshTokenRequest }>('/refresh', {
        schema: {
            tags: ['Auth'],
            description: 'Refresh access token',
            body: {
                type: 'object',
                properties: {
                    refreshToken: { type: 'string' }
                }
            }
        }
    }, authController.refreshToken.bind(authController));

    // Forgot password endpoint
    fastify.post<{ Body: ForgotPasswordRequest }>('/forgot-password', {
        schema: {
            tags: ['Auth'],
            description: 'Request password reset',
            body: {
                type: 'object',
                required: ['email'],
                properties: {
                    email: { type: 'string', format: 'email' }
                }
            }
        }
    }, async (request, reply) => {
        try {
            const { email } = request.body;

            routeContext.info('Password reset requested', {
                email: email.replace(/(.{2})(.*)(@.*)/, '$1***$3'),
                ip: request.ip
            });

            // TODO: Implementar envio de email real
            MetricsService.incrementCounter('auth_attempts_total', {
                type: 'forgot_password',
                status: 'success',
                method: 'email'
            });

            return reply.code(200).send({
                success: true,
                message: 'If the email exists, you will receive password reset instructions.'
            });

        } catch (error) {
            routeContext.error('Forgot password error', error as Error);

            return reply.code(500).send({
                success: false,
                message: 'Internal server error'
            });
        }
    });

    // Reset password endpoint
    fastify.post<{ Body: ResetPasswordRequest }>('/reset-password', {
        schema: {
            tags: ['Auth'],
            description: 'Reset password with token',
            body: {
                type: 'object',
                required: ['token', 'password'],
                properties: {
                    token: { type: 'string' },
                    password: {
                        type: 'string',
                        minLength: 8,
                        pattern: '^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]'
                    }
                }
            }
        }
    }, async (request, reply) => {
        try {
            const { token, password } = request.body;

            // TODO: Implementar validação real do token e reset da senha
            MetricsService.incrementCounter('auth_attempts_total', {
                type: 'reset_password',
                status: 'success',
                method: 'token'
            });

            routeContext.audit('PASSWORD_RESET', 'user', 'unknown', {
                success: true,
                ip: request.ip
            });

            return reply.code(200).send({
                success: true,
                message: 'Password reset successful. You can now login with your new password.'
            });

        } catch (error) {
            routeContext.error('Password reset error', error as Error);

            return reply.code(400).send({
                success: false,
                message: 'Invalid or expired reset token'
            });
        }
    });

    // Logout endpoint
    fastify.post('/logout', {
        schema: {
            tags: ['Auth'],
            description: 'User logout',
            headers: {
                type: 'object',
                properties: {
                    authorization: { type: 'string' }
                }
            }
        }
    }, authController.logout.bind(authController));

    // User profile endpoint
    fastify.get('/me', {
        schema: {
            tags: ['Auth'],
            description: 'Get current user profile',
            headers: {
                type: 'object',
                properties: {
                    authorization: { type: 'string' }
                }
            }
        }
    }, authController.me.bind(authController));

    // Token validation endpoint
    fastify.post('/validate', {
        schema: {
            tags: ['Auth'],
            description: 'Validate JWT token',
            body: {
                type: 'object',
                required: ['token'],
                properties: {
                    token: { type: 'string' }
                }
            }
        }
    }, authController.validateToken.bind(authController));

    // Verify email endpoint
    fastify.get('/verify-email/:token', {
        schema: {
            tags: ['Auth'],
            description: 'Verify email address',
            params: {
                type: 'object',
                properties: {
                    token: { type: 'string' }
                }
            }
        }
    }, async (request, reply) => {
        try {
            const { token } = request.params as { token: string };

            // TODO: Implementar verificação real do email

            MetricsService.incrementCounter('auth_attempts_total', {
                type: 'verify_email',
                status: 'success',
                method: 'token'
            });

            routeContext.audit('EMAIL_VERIFIED', 'user', 'unknown', {
                success: true,
                token: token.substring(0, 10) + '...',
                ip: request.ip
            });

            return reply.code(200).send({
                success: true,
                message: 'Email verified successfully'
            });

        } catch (error) {
            routeContext.error('Email verification error', error as Error);

            return reply.code(400).send({
                success: false,
                message: 'Invalid or expired verification token'
            });
        }
    });

    routeContext.info('Auth routes registered successfully');
}