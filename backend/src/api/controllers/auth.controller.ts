// backend/src/api/controllers/auth.controller.ts

import { Request, Response } from 'express';
import { AuthService } from '../../core/application/services/auth.service';
import { LoginUserUseCase } from '../../core/application/use-cases/auth/login-user.use-case';
import { RegisterUserUseCase } from '../../application/use-cases/auth/register-user.use-case';
import { RefreshTokenUseCase } from '../../application/use-cases/auth/refresh-token.use-case';
import { CacheService } from '../../infrastructure/database/redis/cache.service';
import { logger } from '../../shared/utils/logger.util';
import { ValidationException } from '../../shared/exceptions/validation.exception';
import { BusinessException } from '../../shared/exceptions/business.exception';
import { HTTP_STATUS } from '../../shared/constants/status-codes';

export class AuthController {
    constructor(
        private readonly authService: AuthService,
        private readonly loginUserUseCase: LoginUserUseCase,
        private readonly registerUserUseCase: RegisterUserUseCase,
        private readonly refreshTokenUseCase: RefreshTokenUseCase,
        private readonly cacheService: CacheService
    ) {}

    /**
     * Autentica usuário e retorna tokens JWT
     */
    async login(req: Request, res: Response): Promise<void> {
        try {
            const { email, password } = req.body;

            logger.info('Attempting login', { email });

            const result = await this.loginUserUseCase.execute({
                email,
                password,
                ipAddress: req.ip,
                userAgent: req.get('User-Agent')
            });

            // Cache user session
            await this.cacheService.set(
                `user_session:${result.user.id}`,
                result.user,
                3600 // 1 hour
            );

            res.status(HTTP_STATUS.SUCCESS).json({
                success: true,
                message: 'Login realizado com sucesso',
                data: {
                    user: result.user,
                    accessToken: result.accessToken,
                    refreshToken: result.refreshToken,
                    expiresIn: result.expiresIn
                }
            });

            logger.info('Login successful', { userId: result.user.id });

        } catch (error) {
            logger.error('Login failed', {
                email: req.body?.email,
                error: error.message
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
                res.status(HTTP_STATUS.UNAUTHORIZED).json({
                    success: false,
                    message: error.message
                });
                return;
            }

            res.status(HTTP_STATUS.INTERNAL_ERROR).json({
                success: false,
                message: 'Erro interno do servidor'
            });
        }
    }

    /**
     * Registra novo usuário
     */
    async register(req: Request, res: Response): Promise<void> {
        try {
            const userData = req.body;

            logger.info('Attempting user registration', { email: userData.email });

            const result = await this.registerUserUseCase.execute({
                ...userData,
                ipAddress: req.ip,
                userAgent: req.get('User-Agent')
            });

            res.status(HTTP_STATUS.CREATED).json({
                success: true,
                message: 'Usuário criado com sucesso',
                data: {
                    user: result.user,
                    accessToken: result.accessToken,
                    refreshToken: result.refreshToken
                }
            });

            logger.info('User registration successful', { userId: result.user.id });

        } catch (error) {
            logger.error('Registration failed', {
                email: req.body?.email,
                error: error.message
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
                res.status(HTTP_STATUS.CONFLICT).json({
                    success: false,
                    message: error.message
                });
                return;
            }

            res.status(HTTP_STATUS.INTERNAL_ERROR).json({
                success: false,
                message: 'Erro interno do servidor'
            });
        }
    }

    /**
     * Renova tokens JWT
     */
    async refreshToken(req: Request, res: Response): Promise<void> {
        try {
            const { refreshToken } = req.body;

            const result = await this.refreshTokenUseCase.execute({ refreshToken });

            res.status(HTTP_STATUS.SUCCESS).json({
                success: true,
                message: 'Token renovado com sucesso',
                data: {
                    accessToken: result.accessToken,
                    refreshToken: result.refreshToken,
                    expiresIn: result.expiresIn
                }
            });

        } catch (error) {
            logger.error('Token refresh failed', { error: error.message });

            res.status(HTTP_STATUS.UNAUTHORIZED).json({
                success: false,
                message: 'Token inválido ou expirado'
            });
        }
    }

    /**
     * Logout do usuário
     */
    async logout(req: Request, res: Response): Promise<void> {
        try {
            const userId = req.user?.id;

            if (userId) {
                // Remove user session from cache
                await this.cacheService.delete(`user_session:${userId}`);

                // Blacklist current token
                const token = req.headers.authorization?.replace('Bearer ', '');
                if (token) {
                    await this.cacheService.set(
                        `blacklisted_token:${token}`,
                        true,
                        3600 // 1 hour
                    );
                }

                logger.info('User logout successful', { userId });
            }

            res.status(HTTP_STATUS.SUCCESS).json({
                success: true,
                message: 'Logout realizado com sucesso'
            });

        } catch (error) {
            logger.error('Logout failed', { error: error.message });

            res.status(HTTP_STATUS.INTERNAL_ERROR).json({
                success: false,
                message: 'Erro durante logout'
            });
        }
    }

    /**
     * Verifica se usuário está autenticado
     */
    async me(req: Request, res: Response): Promise<void> {
        try {
            const userId = req.user?.id;

            if (!userId) {
                res.status(HTTP_STATUS.UNAUTHORIZED).json({
                    success: false,
                    message: 'Usuário não autenticado'
                });
                return;
            }

            // Try to get from cache first
            let user = await this.cacheService.get(`user_session:${userId}`);

            if (!user) {
                user = await this.authService.getUserById(userId);

                if (user) {
                    await this.cacheService.set(`user_session:${userId}`, user, 3600);
                }
            }

            if (!user) {
                res.status(HTTP_STATUS.NOT_FOUND).json({
                    success: false,
                    message: 'Usuário não encontrado'
                });
                return;
            }

            res.status(HTTP_STATUS.SUCCESS).json({
                success: true,
                data: { user }
            });

        } catch (error) {
            logger.error('Get current user failed', {
                userId: req.user?.id,
                error: error.message
            });

            res.status(HTTP_STATUS.INTERNAL_ERROR).json({
                success: false,
                message: 'Erro interno do servidor'
            });
        }
    }
}