// backend/src/api/middlewares/auth.middleware.ts

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { CacheService } from '../../infrastructure/database/redis/cache.service';
import { UserRepository } from '../../core/domain/repositories/user.repository';
import { logger } from '../../shared/utils/logger.util';
import { HTTP_STATUS } from '../../shared/constants/status-codes';
import { BusinessException } from '../../shared/exceptions/business.exception';

interface JWTPayload {
    userId: string;
    email: string;
    iat: number;
    exp: number;
}

declare global {
    namespace Express {
        interface Request {
            user?: {
                id: string;
                email: string;
                name: string;
                role: string;
            };
        }
    }
}

export class AuthMiddleware {
    constructor(
        private readonly cacheService: CacheService,
        private readonly userRepository: UserRepository
    ) {}

    /**
     * Middleware para autenticação JWT obrigatória
     */
    authenticate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const token = this.extractToken(req);

            if (!token) {
                res.status(HTTP_STATUS.UNAUTHORIZED).json({
                    success: false,
                    message: 'Token de acesso requerido'
                });
                return;
            }

            // Check if token is blacklisted
            const isBlacklisted = await this.cacheService.get(`blacklisted_token:${token}`);
            if (isBlacklisted) {
                res.status(HTTP_STATUS.UNAUTHORIZED).json({
                    success: false,
                    message: 'Token inválido'
                });
                return;
            }

            // Verify JWT token
            const decoded = jwt.verify(token, process.env.JWT_SECRET!) as JWTPayload;

            // Try to get user from cache first
            let user = await this.cacheService.get(`user_session:${decoded.userId}`);

            if (!user) {
                // If not in cache, get from database
                user = await this.userRepository.findById(decoded.userId);

                if (!user) {
                    res.status(HTTP_STATUS.UNAUTHORIZED).json({
                        success: false,
                        message: 'Usuário não encontrado'
                    });
                    return;
                }

                // Cache user for future requests
                await this.cacheService.set(`user_session:${user.id}`, user, 3600);
            }

            // Check if user is active
            if (!user.isActive) {
                res.status(HTTP_STATUS.UNAUTHORIZED).json({
                    success: false,
                    message: 'Conta desativada'
                });
                return;
            }

            // Attach user to request
            req.user = {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role
            };

            logger.info('Authentication successful', {
                userId: user.id,
                endpoint: req.path
            });

            next();

        } catch (error) {
            logger.error('Authentication failed', {
                error: error.message,
                endpoint: req.path,
                ip: req.ip
            });

            if (error instanceof jwt.JsonWebTokenError) {
                res.status(HTTP_STATUS.UNAUTHORIZED).json({
                    success: false,
                    message: 'Token inválido'
                });
                return;
            }

            if (error instanceof jwt.TokenExpiredError) {
                res.status(HTTP_STATUS.UNAUTHORIZED).json({
                    success: false,
                    message: 'Token expirado'
                });
                return;
            }

            res.status(HTTP_STATUS.INTERNAL_ERROR).json({
                success: false,
                message: 'Erro de autenticação'
            });
        }
    };

    /**
     * Middleware para autenticação JWT opcional
     */
    optionalAuthenticate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const token = this.extractToken(req);

            if (!token) {
                // No token provided, continue without authentication
                next();
                return;
            }

            // If token is provided, validate it
            await this.authenticate(req, res, next);

        } catch (error) {
            // If authentication fails with optional auth, continue without user
            logger.warn('Optional authentication failed', {
                error: error.message,
                endpoint: req.path
            });
            next();
        }
    };

    /**
     * Middleware para verificar roles específicas
     */
    requireRole = (allowedRoles: string[]) => {
        return (req: Request, res: Response, next: NextFunction): void => {
            if (!req.user) {
                res.status(HTTP_STATUS.UNAUTHORIZED).json({
                    success: false,
                    message: 'Usuário não autenticado'
                });
                return;
            }

            if (!allowedRoles.includes(req.user.role)) {
                logger.warn('Access denied - insufficient permissions', {
                    userId: req.user.id,
                    userRole: req.user.role,
                    requiredRoles: allowedRoles,
                    endpoint: req.path
                });

                res.status(HTTP_STATUS.FORBIDDEN).json({
                    success: false,
                    message: 'Acesso negado - permissões insuficientes'
                });
                return;
            }

            next();
        };
    };

    /**
     * Middleware para rate limiting por usuário
     */
    rateLimitByUser = (maxRequests: number, windowMs: number) => {
        return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
            try {
                if (!req.user?.id) {
                    next();
                    return;
                }

                const key = `rate_limit:${req.user.id}`;
                const current = await this.cacheService.get(key) || 0;

                if (current >= maxRequests) {
                    res.status(HTTP_STATUS.TOO_MANY_REQUESTS).json({
                        success: false,
                        message: 'Muitas requisições. Tente novamente mais tarde.'
                    });
                    return;
                }

                await this.cacheService.set(key, current + 1, Math.ceil(windowMs / 1000));
                next();

            } catch (error) {
                logger.error('Rate limiting error', {
                    error: error.message,
                    userId: req.user?.id
                });
                next(); // Continue on rate limit error
            }
        };
    };

    /**
     * Extrai token do header Authorization
     */
    private extractToken(req: Request): string | null {
        const authHeader = req.headers.authorization;

        if (!authHeader) {
            return null;
        }

        const parts = authHeader.split(' ');

        if (parts.length !== 2 || parts[0] !== 'Bearer') {
            return null;
        }

        return parts[1];
    }
}