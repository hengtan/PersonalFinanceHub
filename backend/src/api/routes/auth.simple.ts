// Simple auth routes for testing
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../../infrastructure/monitoring/logger.service';

interface LoginRequest {
    email: string;
    password: string;
}

interface RegisterRequest {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
}

export default async function authRoutes(fastify: FastifyInstance) {
    // Register endpoint
    fastify.post<{ Body: RegisterRequest }>('/register', {
        schema: {
            tags: ['Auth'],
            description: 'User registration',
            body: {
                type: 'object',
                required: ['email', 'password', 'firstName', 'lastName'],
                properties: {
                    email: { type: 'string', format: 'email' },
                    password: { type: 'string', minLength: 6 },
                    firstName: { type: 'string' },
                    lastName: { type: 'string' }
                }
            }
        }
    }, async (request: FastifyRequest<{ Body: RegisterRequest }>, reply: FastifyReply) => {
        try {
            const { email, password, firstName, lastName } = request.body;

            logger.info('User registration attempt', { email });

            // Mock user creation
            const mockUser = {
                id: 'user-' + Date.now(),
                email,
                firstName,
                lastName,
                createdAt: new Date()
            };

            const mockTokens = {
                accessToken: 'mock-access-token-' + Date.now(),
                refreshToken: 'mock-refresh-token-' + Date.now(),
                expiresIn: 3600
            };

            return reply.code(201).send({
                success: true,
                message: 'User registered successfully',
                data: {
                    user: mockUser,
                    tokens: mockTokens
                }
            });

        } catch (error) {
            logger.error('Registration error', error as Error);
            return reply.code(500).send({
                success: false,
                message: 'Internal server error'
            });
        }
    });

    // Login endpoint
    fastify.post<{ Body: LoginRequest }>('/login', {
        schema: {
            tags: ['Auth'],
            description: 'User login',
            body: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                    email: { type: 'string', format: 'email' },
                    password: { type: 'string' }
                }
            }
        }
    }, async (request: FastifyRequest<{ Body: LoginRequest }>, reply: FastifyReply) => {
        try {
            const { email, password } = request.body;

            logger.info('User login attempt', { email });

            // Mock authentication
            const mockUser = {
                id: 'user-123',
                email,
                firstName: 'Test',
                lastName: 'User'
            };

            const mockTokens = {
                accessToken: 'mock-access-token-' + Date.now(),
                refreshToken: 'mock-refresh-token-' + Date.now(),
                expiresIn: 3600
            };

            return reply.code(200).send({
                success: true,
                message: 'Login successful',
                data: {
                    user: mockUser,
                    tokens: mockTokens
                }
            });

        } catch (error) {
            logger.error('Login error', error as Error);
            return reply.code(500).send({
                success: false,
                message: 'Internal server error'
            });
        }
    });

    // Logout endpoint
    fastify.post('/logout', {
        schema: {
            tags: ['Auth'],
            description: 'User logout'
        }
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        return reply.code(200).send({
            success: true,
            message: 'Logout successful'
        });
    });

    // Me endpoint
    fastify.get('/me', {
        schema: {
            tags: ['Auth'],
            description: 'Get current user profile',
            headers: {
                type: 'object',
                properties: {
                    authorization: { type: 'string', description: 'Bearer token' }
                }
            }
        }
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        // Mock authentication check
        const authHeader = request.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return reply.code(401).send({
                success: false,
                message: 'Authentication required'
            });
        }

        return reply.code(200).send({
            success: true,
            data: {
                user: {
                    id: 'user-123',
                    email: 'test@example.com',
                    firstName: 'Test',
                    lastName: 'User'
                }
            }
        });
    });

    logger.info('Simple auth routes registered successfully');
}