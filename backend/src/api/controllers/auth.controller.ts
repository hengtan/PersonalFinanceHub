// backend/src/api/controllers/auth.fastify.controller.ts
import { FastifyRequest, FastifyReply } from 'fastify';
import { AuthService } from '../../core/application/services/auth.service';
import { LoginUserUseCase } from '../../core/application/use-cases/auth/login-user.use-case';
import { logger } from '../../infrastructure/monitoring/logger.service';
import { ValidationException } from '../../shared/exceptions/validation.exception';
import { BusinessException } from '../../shared/exceptions/business.exception';
import { cacheService } from '../../infrastructure/database/redis/cache.service';

// Interfaces para requests
interface LoginRequest {
    email: string;
    password: string;
}

interface RegisterRequest {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    confirmPassword?: string;
    acceptTerms: boolean;
}

interface RefreshTokenRequest {
    refreshToken: string;
}

// Interfaces para params
interface UserParamsRequest {
    id: string;
}

export class AuthFastifyController {
    private readonly authService: AuthService;
    private readonly loginUserUseCase: LoginUserUseCase;

    constructor() {
        this.authService = new AuthService();
        this.loginUserUseCase = new LoginUserUseCase(this.authService);
    }

    /**
     * Autentica usuário e retorna tokens JWT
     */
    async login(
        request: FastifyRequest<{ Body: LoginRequest }>, 
        reply: FastifyReply
    ): Promise<void> {
        try {
            const { email, password } = request.body;

            logger.info('Attempting login', { email });

            const result = await this.loginUserUseCase.execute({
                email,
                password,
                ipAddress: request.ip,
                userAgent: request.headers['user-agent']
            });

            // Set refresh token as httpOnly cookie
            reply.setCookie('refreshToken', result.tokens.refreshToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
                path: '/'
            });

            reply.code(200).send({
                success: true,
                data: {
                    user: result.user,
                    accessToken: result.tokens.accessToken,
                    expiresIn: result.expiresIn
                }
            });

        } catch (error) {
            logger.error('Login failed', error as Error, { email: request.body?.email });

            if (error instanceof ValidationException) {
                reply.code(400).send({
                    success: false,
                    message: error.message,
                    error: 'VALIDATION_ERROR',
                    details: error.validationErrors
                });
            } else if (error instanceof BusinessException) {
                reply.code(error.statusCode).send({
                    success: false,
                    message: error.message,
                    error: error.code
                });
            } else {
                reply.code(500).send({
                    success: false,
                    message: 'Internal server error'
                });
            }
        }
    }

    /**
     * Registra novo usuário
     */
    async register(
        request: FastifyRequest<{ Body: RegisterRequest }>, 
        reply: FastifyReply
    ): Promise<void> {
        try {
            const userData = request.body;

            logger.info('Attempting user registration', { email: userData.email });

            const result = await this.authService.register(userData);

            // Set refresh token as httpOnly cookie
            reply.setCookie('refreshToken', result.tokens.refreshToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
                path: '/'
            });

            reply.code(201).send({
                success: true,
                data: {
                    user: result.user,
                    tokens: {
                        accessToken: result.tokens.accessToken,
                        refreshToken: result.tokens.refreshToken
                    },
                    expiresIn: process.env.JWT_EXPIRES_IN || '15m'
                }
            });

        } catch (error) {
            logger.error('Registration failed', error as Error, { email: request.body?.email });

            if (error instanceof ValidationException) {
                reply.code(400).send({
                    success: false,
                    message: error.message,
                    error: 'VALIDATION_ERROR',
                    details: error.validationErrors
                });
            } else if (error instanceof BusinessException) {
                reply.code(error.statusCode).send({
                    success: false,
                    message: error.message,
                    error: error.code
                });
            } else {
                reply.code(500).send({
                    success: false,
                    message: 'Internal server error'
                });
            }
        }
    }

    /**
     * Renova tokens JWT usando refresh token
     */
    async refreshToken(
        request: FastifyRequest<{ Body: RefreshTokenRequest }>, 
        reply: FastifyReply
    ): Promise<void> {
        try {
            // Try to get refresh token from cookie first, then from body
            const refreshToken = request.cookies.refreshToken || request.body?.refreshToken;

            if (!refreshToken) {
                reply.code(400).send({
                    success: false,
                    message: 'Refresh token is required',
                    error: 'MISSING_REFRESH_TOKEN'
                });
                return;
            }

            logger.debug('Attempting token refresh');

            const tokens = await this.authService.refreshTokens(refreshToken);

            // Update refresh token cookie
            reply.setCookie('refreshToken', tokens.refreshToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
                path: '/'
            });

            reply.code(200).send({
                success: true,
                data: {
                    accessToken: tokens.accessToken,
                    expiresIn: process.env.JWT_EXPIRES_IN || '15m'
                }
            });

        } catch (error) {
            logger.error('Token refresh failed', error as Error);

            reply.code(401).send({
                success: false,
                message: 'Invalid or expired refresh token',
                error: 'INVALID_REFRESH_TOKEN'
            });
        }
    }

    /**
     * Faz logout do usuário
     */
    async logout(
        request: FastifyRequest<{ Body: { refreshToken?: string } }>, 
        reply: FastifyReply
    ): Promise<void> {
        try {
            // Get user from JWT token (would be set by auth middleware)
            const userId = (request as any).user?.id;

            if (userId) {
                const refreshToken = request.cookies.refreshToken || request.body?.refreshToken;
                await this.authService.logout(userId, refreshToken);

                // Remove refresh token cache entry
                if (refreshToken) {
                    await cacheService.del(`refresh_token:${userId}`);
                }
            }

            // Clear refresh token cookie
            reply.clearCookie('refreshToken', {
                path: '/'
            });

            reply.code(200).send({
                success: true,
                message: 'Logged out successfully'
            });

        } catch (error) {
            logger.error('Logout failed', error as Error);

            reply.code(500).send({
                success: false,
                message: 'Logout failed'
            });
        }
    }

    /**
     * Retorna informações do usuário atual
     */
    async me(
        request: FastifyRequest, 
        reply: FastifyReply
    ): Promise<void> {
        try {
            // User would be set by auth middleware
            const user = (request as any).user;

            if (!user) {
                reply.code(401).send({
                    success: false,
                    message: 'Authentication required',
                    error: 'AUTHENTICATION_REQUIRED'
                });
                return;
            }

            reply.code(200).send({
                success: true,
                data: {
                    user: {
                        id: user.id,
                        email: user.email,
                        name: user.name,
                        isActive: user.isActive
                    }
                }
            });

        } catch (error) {
            logger.error('Failed to get user info', error as Error);

            reply.code(500).send({
                success: false,
                message: 'Failed to get user information'
            });
        }
    }

    /**
     * Valida token JWT
     */
    async validateToken(
        request: FastifyRequest<{ Body: { token: string } }>, 
        reply: FastifyReply
    ): Promise<void> {
        try {
            const { token } = request.body;

            if (!token) {
                reply.code(400).send({
                    success: false,
                    message: 'Token is required',
                    error: 'MISSING_TOKEN'
                });
                return;
            }

            const payload = this.authService.verifyToken(token);

            reply.code(200).send({
                success: true,
                data: {
                    valid: true,
                    payload: {
                        userId: payload.sub,
                        email: payload.email,
                        name: payload.name
                    },
                    expiresAt: payload.exp ? new Date(payload.exp * 1000).toISOString() : null
                }
            });

        } catch (error) {
            logger.error('Token validation failed', error as Error);

            reply.code(401).send({
                success: false,
                data: {
                    valid: false
                },
                message: 'Invalid or expired token',
                error: 'INVALID_TOKEN'
            });
        }
    }
}

// Singleton instance
export const authController = new AuthFastifyController();