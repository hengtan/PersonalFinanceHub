// src/api/middlewares/jwt.middleware.ts
import { FastifyRequest, FastifyReply } from 'fastify';
import { AuthService } from '@/core/application/services/auth.service';
import { logger } from '@/infrastructure/monitoring/logger.service';

export interface AuthenticatedUser {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    isActive: boolean;
}

// Extend FastifyRequest to include user property
declare module 'fastify' {
    interface FastifyRequest {
        user?: AuthenticatedUser;
    }
}

export class JWTMiddleware {
    private authService: AuthService;

    constructor() {
        this.authService = new AuthService();
    }

    /**
     * Middleware that requires valid JWT authentication
     */
    authenticate = async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const authHeader = request.headers.authorization;
            
            if (!authHeader) {
                return reply.status(401).send({
                    error: 'Unauthorized',
                    message: 'Missing authorization header',
                    code: 'MISSING_AUTH_HEADER'
                });
            }

            const token = this.extractTokenFromHeader(authHeader);
            
            if (!token) {
                return reply.status(401).send({
                    error: 'Unauthorized',
                    message: 'Invalid authorization header format',
                    code: 'INVALID_AUTH_HEADER'
                });
            }

            // Verify and decode the token
            const payload = this.authService.verifyToken(token);
            
            // TODO: In a real implementation, fetch user from database
            // const user = await userRepository.findById(payload.sub);
            // if (!user || !user.isActive) {
            //     return reply.status(401).send({
            //         error: 'Unauthorized',
            //         message: 'User not found or inactive',
            //         code: 'USER_NOT_FOUND'
            //     });
            // }

            // Mock user for now
            const user: AuthenticatedUser = {
                id: payload.sub,
                email: payload.email,
                firstName: payload.name?.split(' ')[0] || 'Unknown',
                lastName: payload.name?.split(' ').slice(1).join(' ') || '',
                isActive: true
            };

            // Attach user to request
            request.user = user;

            logger.debug('JWT authentication successful', {
                userId: user.id,
                email: user.email,
                path: request.url,
                method: request.method
            });

        } catch (error) {
            logger.warn('JWT authentication failed', {
                error: (error as Error).message,
                path: request.url,
                method: request.method,
                userAgent: request.headers['user-agent']
            });

            return reply.status(401).send({
                error: 'Unauthorized',
                message: 'Invalid or expired token',
                code: 'INVALID_TOKEN'
            });
        }
    };

    /**
     * Optional JWT middleware - doesn't fail if no token provided
     */
    optionalAuthenticate = async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const authHeader = request.headers.authorization;
            
            if (!authHeader) {
                // No token provided, continue without user
                return;
            }

            const token = this.extractTokenFromHeader(authHeader);
            
            if (!token) {
                // Invalid header format, continue without user
                return;
            }

            // Try to verify token
            const payload = this.authService.verifyToken(token);
            
            // Mock user
            const user: AuthenticatedUser = {
                id: payload.sub,
                email: payload.email,
                firstName: payload.name?.split(' ')[0] || 'Unknown',
                lastName: payload.name?.split(' ').slice(1).join(' ') || '',
                isActive: true
            };

            request.user = user;

            logger.debug('Optional JWT authentication successful', {
                userId: user.id,
                email: user.email
            });

        } catch (error) {
            // If token is invalid, just continue without user
            logger.debug('Optional JWT authentication failed, continuing without user', {
                error: (error as Error).message
            });
        }
    };

    /**
     * Middleware to check if user has specific role/permission
     */
    requireRole = (requiredRoles: string[]) => {
        return async (request: FastifyRequest, reply: FastifyReply) => {
            if (!request.user) {
                return reply.status(401).send({
                    error: 'Unauthorized',
                    message: 'Authentication required',
                    code: 'AUTH_REQUIRED'
                });
            }

            // TODO: Implement role checking
            // const userRoles = await this.getUserRoles(request.user.id);
            // const hasRole = requiredRoles.some(role => userRoles.includes(role));
            
            // Mock role check - for now assume all authenticated users have access
            const hasRole = true;

            if (!hasRole) {
                logger.warn('Access denied - insufficient permissions', {
                    userId: request.user.id,
                    requiredRoles,
                    path: request.url
                });

                return reply.status(403).send({
                    error: 'Forbidden',
                    message: 'Insufficient permissions',
                    code: 'INSUFFICIENT_PERMISSIONS'
                });
            }

            logger.debug('Role check passed', {
                userId: request.user.id,
                requiredRoles
            });
        };
    };

    /**
     * Extract Bearer token from Authorization header
     */
    private extractTokenFromHeader(authHeader: string): string | null {
        const parts = authHeader.split(' ');
        
        if (parts.length !== 2) {
            return null;
        }
        
        const [scheme, token] = parts;
        
        if (!/^Bearer$/i.test(scheme)) {
            return null;
        }
        
        return token;
    }

    /**
     * Validate request origin and other security headers
     */
    validateSecurityHeaders = async (request: FastifyRequest, reply: FastifyReply) => {
        // Check CORS origin if specified
        const origin = request.headers.origin;
        const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'];
        
        if (origin && !allowedOrigins.includes(origin)) {
            logger.warn('Request from unauthorized origin', {
                origin,
                allowedOrigins,
                path: request.url
            });
        }

        // Add security headers to response
        reply.header('X-Content-Type-Options', 'nosniff');
        reply.header('X-Frame-Options', 'DENY');
        reply.header('X-XSS-Protection', '1; mode=block');
    };

    /**
     * Rate limiting check for authenticated users
     */
    authenticatedRateLimit = async (request: FastifyRequest, reply: FastifyReply) => {
        if (!request.user) {
            return;
        }

        // TODO: Implement per-user rate limiting
        // This would check Redis for user-specific rate limit counters
        logger.debug('Rate limit check for authenticated user', {
            userId: request.user.id,
            path: request.url
        });
    };
}

// Export singleton instance
export const jwtMiddleware = new JWTMiddleware();