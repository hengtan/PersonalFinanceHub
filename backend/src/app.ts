import fastify, { FastifyInstance } from 'fastify';
import { logger } from './infrastructure/monitoring/logger.service';
import { MetricsService } from './infrastructure/monitoring/metrics.service';

// Import route modules
import authRoutes from './api/routes/auth.routes';
import dashboardRoutes from './api/routes/dashboard.routes';
import transactionRoutes from './api/routes/transaction.routes';
// import budgetRoutes from './api/routes/budget.routes';

// import userRoutes from './api/routes/user.routes';
// import transactionRoutes from './api/routes/transaction.routes';
// import accountRoutes from './api/routes/account.routes';
// import budgetRoutes from './api/routes/budget.routes';
// import categoryRoutes from './api/routes/category.routes';
// import reportRoutes from './api/routes/report.routes';

export interface AppConfig {
    apiVersion: string;
    apiPrefix: string;
    environment: string;
    host: string;
    port: number;
    cors: {
        origin: string | string[] | boolean;
        credentials: boolean;
    };
}

export class App {
    private fastify: FastifyInstance;
    private config: AppConfig;

    constructor(config?: Partial<AppConfig>) {
        this.config = {
            apiVersion: 'v1',
            apiPrefix: '/api',
            environment: process.env.NODE_ENV || 'development',
            host: process.env.HOST || '0.0.0.0',
            port: parseInt(process.env.PORT || '3333', 10),
            cors: {
                origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
                credentials: true
            },
            ...config
        };
        
        this.fastify = fastify({
            logger: false, // Usamos nosso logger customizado
            trustProxy: true,
            requestTimeout: 30000,
            bodyLimit: 1048576 * 10, // 10MB
        });
    }

    public async initialize(): Promise<void> {
        try {
            logger.info('Initializing application...', {
                apiVersion: this.config.apiVersion,
                apiPrefix: this.config.apiPrefix,
                environment: this.config.environment,
                host: this.config.host,
                port: this.config.port
            });

            logger.info('🔧 Setting up plugins...');
            await this.setupPlugins();
            logger.info('🛡️ Setting up middlewares...');
            await this.setupMiddlewares();
            logger.info('🛣️ Setting up routes...');
            await this.setupRoutes();
            logger.info('❤️ Setting up health check...');
            await this.setupHealthCheck();
            logger.info('🚨 Setting up error handlers...');
            await this.setupErrorHandlers();

            logger.info('Application initialized successfully');

        } catch (error) {
            logger.fatal('Failed to initialize application', error as Error);
            throw error;
        }
    }

    private async setupPlugins(): Promise<void> {
        try {
            // CORS
            await this.fastify.register(import('@fastify/cors'), {
                origin: this.config.cors.origin,
                credentials: this.config.cors.credentials
            });

            // Cookie support
            await this.fastify.register(import('@fastify/cookie'), {
                secret: process.env.COOKIE_SECRET || 'cookie-secret-change-in-production',
                parseOptions: {
                    httpOnly: true,
                    secure: this.config.environment === 'production',
                    sameSite: 'strict'
                }
            });

            // Security headers
            await this.fastify.register(import('@fastify/helmet'), {
                contentSecurityPolicy: false
            });

            // Rate limiting
            await this.fastify.register(import('@fastify/rate-limit'), {
                max: 100,
                timeWindow: '1 minute',
                addHeaders: {
                    'x-ratelimit-limit': true,
                    'x-ratelimit-remaining': true,
                    'x-ratelimit-reset': true
                }
            });

            // Swagger documentation
            if (this.config.environment === 'development') {
                await this.fastify.register(import('@fastify/swagger'), {
                    swagger: {
                        info: {
                            title: 'Personal Finance Hub API',
                            description: 'Comprehensive financial management platform API',
                            version: '1.0.0'
                        },
                        host: `localhost:${this.config.port}`,
                        schemes: ['http', 'https'],
                        consumes: ['application/json'],
                        produces: ['application/json'],
                        tags: [
                            { name: 'Health', description: 'Health check endpoints' },
                            { name: 'Metrics', description: 'Metrics endpoints' },
                            { name: 'Auth', description: 'Authentication endpoints' },
                            { name: 'Transactions', description: 'Transaction management' }
                        ]
                    }
                });

                await this.fastify.register(import('@fastify/swagger-ui'), {
                    routePrefix: '/docs',
                    uiConfig: {
                        docExpansion: 'list',
                        deepLinking: false
                    },
                    staticCSP: true,
                    transformStaticCSP: (header) => header,
                    transformSpecification: (swaggerObject) => swaggerObject,
                    transformSpecificationClone: true
                });
            }

            logger.info('Fastify plugins registered successfully');

        } catch (error) {
            logger.error('Failed to setup plugins', error as Error);
            throw error;
        }
    }

    private async setupMiddlewares(): Promise<void> {
        try {
            // Request logging middleware
            this.fastify.addHook('onRequest', async (request, reply) => {
                const startTime = Date.now();

                // Adicionar contexto de request para logs
                logger.setContext({
                    requestId: request.id,
                    method: request.method,
                    url: request.url,
                    ip: request.ip
                });

                // Iniciar timer para métricas
                (request as any).startTime = startTime;

                // Middleware para adicionar headers de API versioning
                reply.header('X-API-Version', this.config.apiVersion);
                reply.header('X-Environment', this.config.environment);
            });

            // Response logging middleware
            this.fastify.addHook('onResponse', async (request, reply) => {
                const duration = Date.now() - ((request as any).startTime || Date.now());
                const statusCode = reply.statusCode;

                // Log da request
                logger.http(`${request.method} ${request.url} - ${statusCode} - ${duration}ms`, {
                    method: request.method,
                    url: request.url,
                    statusCode,
                    duration,
                    ip: request.ip
                });

                // Registrar métricas
                MetricsService.recordHttpRequest(
                    request.method,
                    request.routeOptions?.url || request.url,
                    statusCode,
                    duration
                );

                // Limpar contexto
                logger.clearContext();
            });

            // Middleware para validação de content-type em requests POST/PUT/PATCH
            this.fastify.addHook('preValidation', async (request, reply) => {
                if (['POST', 'PUT', 'PATCH'].includes(request.method)) {
                    const contentType = request.headers['content-type'];
                    if (!contentType || !contentType.includes('application/json')) {
                        MetricsService.incrementCounter('http_requests_total', {
                            method: request.method,
                            route: request.routeOptions?.url || request.url,
                            status_code: '400'
                        });

                        return reply.code(400).send({
                            success: false,
                            message: 'Content-Type must be application/json',
                            error: 'INVALID_CONTENT_TYPE'
                        });
                    }
                }
            });

            logger.debug('Application middlewares setup completed');

        } catch (error) {
            logger.error('Failed to setup middlewares', error as Error);
            throw error;
        }
    }

    private async setupRoutes(): Promise<void> {
        try {
            logger.info('🔄 Setting up routes...');
            const basePrefix = this.config.apiPrefix;
            const versionedPrefix = `${basePrefix}/${this.config.apiVersion}`;

            // Test route to verify registration works
            this.fastify.get(`${basePrefix}/test`, async (request, reply) => {
                return reply.code(200).send({ message: 'Test route working' });
            });
            logger.info(`✅ Test route registered at ${basePrefix}/test`);

            // Authentication routes
            await this.fastify.register(authRoutes, {
                prefix: `${basePrefix}/auth`
            });

            // Dashboard routes (temporarily disabled for testing)
            // await this.fastify.register(dashboardRoutes, {
            //     prefix: `${basePrefix}/dashboard`
            // });

            // Financial transaction routes (temporarily disabled for testing)
            // await this.fastify.register(transactionRoutes, {
            //     prefix: `${basePrefix}/transactions`
            // });

            // Account management routes (commented until implemented)
            // await this.fastify.register(accountRoutes, {
            //   prefix: `${versionedPrefix}/accounts`
            // });

            // Budget management routes (temporarily disabled)
            // await this.fastify.register(budgetRoutes, {
            //     prefix: `${basePrefix}/budgets`
            // });

            // Category management routes (commented until implemented)
            // await this.fastify.register(categoryRoutes, {
            //   prefix: `${versionedPrefix}/categories`
            // });

            // Reports and analytics routes (commented until implemented)
            // await this.fastify.register(reportRoutes, {
            //   prefix: `${versionedPrefix}/reports`
            // });

            // API Info route
            this.fastify.get(`${basePrefix}/info`, {
                schema: {
                    tags: ['System'],
                    description: 'API Information',
                    response: {
                        200: {
                            type: 'object',
                            properties: {
                                success: { type: 'boolean' },
                                data: {
                                    type: 'object',
                                    properties: {
                                        name: { type: 'string' },
                                        version: { type: 'string' },
                                        apiVersion: { type: 'string' },
                                        environment: { type: 'string' },
                                        timestamp: { type: 'string' },
                                        uptime: { type: 'number' },
                                        endpoints: {
                                            type: 'object',
                                            properties: {
                                                auth: { type: 'string' },
                                                health: { type: 'string' },
                                                metrics: { type: 'string' },
                                                docs: { type: 'string' }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }, async (request, reply) => {
                const host = `${request.protocol}://${request.hostname}`;
                const port = process.env.PORT || '3333';
                const baseUrl = this.config.environment === 'development'
                    ? `${host}:${port}`
                    : host;

                return reply.code(200).send({
                    success: true,
                    data: {
                        name: 'Personal Finance Hub API',
                        version: '1.0.0',
                        apiVersion: this.config.apiVersion,
                        environment: this.config.environment,
                        timestamp: new Date().toISOString(),
                        uptime: process.uptime(),
                        endpoints: {
                            auth: `${baseUrl}${versionedPrefix}/auth`,
                            health: `${baseUrl}/health`,
                            metrics: `${baseUrl}/metrics`,
                            docs: this.config.environment === 'development'
                                ? `${baseUrl}/docs`
                                : 'Not available in production'
                        }
                    }
                });
            });

            // Catch-all route for undefined API endpoints
            this.fastify.all(`${basePrefix}/*`, async (request, reply) => {
                MetricsService.incrementCounter('http_requests_total', {
                    method: request.method,
                    route: 'undefined',
                    status_code: '404'
                });

                logger.warn('API endpoint not found', {
                    method: request.method,
                    url: request.url,
                    ip: request.ip,
                    userAgent: request.headers['user-agent']
                });

                return reply.code(404).send({
                    success: false,
                    message: 'API endpoint not found',
                    error: 'ENDPOINT_NOT_FOUND',
                    suggestion: `Check available endpoints at ${basePrefix}/info`
                });
            });

            logger.info('Routes setup completed', {
                basePrefix,
                versionedPrefix,
                totalRoutes: this.fastify.printRoutes({ commonPrefix: false }).split('\n').length
            });

        } catch (error) {
            logger.error('Failed to setup routes', error as Error);
            throw error;
        }
    }

    private async setupErrorHandlers(): Promise<void> {
        try {
            // Global error handler
            this.fastify.setErrorHandler(async (error, request, reply) => {
                const errorId = `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

                // Log error with context
                logger.error('Request error', error, {
                    errorId,
                    method: request.method,
                    url: request.url,
                    ip: request.ip,
                    userAgent: request.headers['user-agent'],
                    stack: error.stack
                });

                // Update error metrics
                MetricsService.incrementCounter('http_errors_total', {
                    method: request.method,
                    route: request.routeOptions?.url || request.url,
                    error_type: error.name || 'UnknownError',
                    status_code: error.statusCode?.toString() || '500'
                });

                // Handle different types of errors
                if (error.validation) {
                    return reply.code(400).send({
                        success: false,
                        message: 'Validation error',
                        error: 'VALIDATION_ERROR',
                        details: error.validation,
                        errorId
                    });
                }

                if (error.statusCode === 429) {
                    return reply.code(429).send({
                        success: false,
                        message: 'Rate limit exceeded',
                        error: 'RATE_LIMIT_EXCEEDED',
                        errorId
                    });
                }

                if (error.statusCode && error.statusCode < 500) {
                    return reply.code(error.statusCode).send({
                        success: false,
                        message: error.message || 'Client error',
                        error: error.code || 'CLIENT_ERROR',
                        errorId
                    });
                }

                // Server errors (5xx)
                return reply.code(500).send({
                    success: false,
                    message: this.config.environment === 'development'
                        ? error.message
                        : 'Internal server error',
                    error: 'SERVER_ERROR',
                    errorId,
                    ...(this.config.environment === 'development' && {
                        stack: error.stack
                    })
                });
            });

            // Not found handler
            this.fastify.setNotFoundHandler(async (request, reply) => {
                MetricsService.incrementCounter('http_requests_total', {
                    method: request.method,
                    route: 'not_found',
                    status_code: '404'
                });

                logger.warn('Route not found', {
                    method: request.method,
                    url: request.url,
                    ip: request.ip
                });

                return reply.code(404).send({
                    success: false,
                    message: 'Route not found',
                    error: 'ROUTE_NOT_FOUND',
                    suggestion: 'Check the URL and try again'
                });
            });

            logger.debug('Error handlers setup completed');

        } catch (error) {
            logger.error('Failed to setup error handlers', error as Error);
            throw error;
        }
    }

    private async setupHealthCheck(): Promise<void> {
        try {
            const basePrefix = this.config.apiPrefix;
            
            // Health check endpoint
            this.fastify.get(`${basePrefix}/health`, {
                schema: {
                    tags: ['Health'],
                    description: 'Health check endpoint',
                    response: {
                        200: {
                            type: 'object',
                            properties: {
                                status: { type: 'string' },
                                timestamp: { type: 'string' },
                                uptime: { type: 'number' },
                                version: { type: 'string' },
                                services: {
                                    type: 'object',
                                    properties: {
                                        metrics: { type: 'string' }
                                    }
                                }
                            }
                        }
                    }
                }
            }, async (request, reply) => {
                const health = {
                    status: 'healthy',
                    timestamp: new Date().toISOString(),
                    uptime: process.uptime(),
                    version: '1.0.0',
                    services: {
                        metrics: MetricsService.isHealthy() ? 'healthy' : 'unhealthy'
                    }
                };

                return reply.code(200).send(health);
            });

            // Readiness check
            this.fastify.get('/ready', async (request, reply) => {
                return reply.code(200).send({ status: 'ready' });
            });

            // Liveness check
            this.fastify.get('/live', async (request, reply) => {
                return reply.code(200).send({ status: 'alive' });
            });

            // Metrics endpoint
            this.fastify.get('/metrics', {
                schema: {
                    tags: ['Metrics'],
                    description: 'Prometheus metrics endpoint'
                }
            }, async (request, reply) => {
                const metrics = await MetricsService.getMetrics();
                return reply
                    .header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
                    .send(metrics);
            });

            // Root route
            this.fastify.get('/', async (request, reply) => {
                return {
                    message: 'Personal Finance Hub API',
                    version: '1.0.0',
                    timestamp: new Date().toISOString(),
                    environment: this.config.environment
                };
            });

            logger.info('Health check endpoints setup completed');

        } catch (error) {
            logger.error('Failed to setup health check', error as Error);
            throw error;
        }
    }

    public async start(): Promise<void> {
        try {
            await this.fastify.listen({
                host: this.config.host,
                port: this.config.port
            });

            logger.info(`🚀 Server is running on http://${this.config.host}:${this.config.port}`, {
                environment: this.config.environment,
                host: this.config.host,
                port: this.config.port,
                pid: process.pid
            });

            if (this.config.environment === 'development') {
                logger.info(`📚 API Documentation available at http://localhost:${this.config.port}/docs`);
                logger.info(`📊 Metrics available at http://localhost:${this.config.port}/metrics`);
            }

            // Registrar que o servidor está pronto
            MetricsService.setCustomMetric('server_started', 1);

        } catch (error) {
            logger.fatal('Failed to start server', error as Error);
            throw error;
        }
    }

    public async close(): Promise<void> {
        try {
            await this.fastify.close();
            logger.info('Server closed successfully');
        } catch (error) {
            logger.error('Error closing server', error as Error);
            throw error;
        }
    }

    public getFastifyInstance(): FastifyInstance {
        return this.fastify;
    }

    public getConfig(): AppConfig {
        return { ...this.config };
    }

    public getPort(): number {
        return this.config.port;
    }

    // Method to get route information (useful for debugging)
    public getRouteInfo(): string {
        return this.fastify.printRoutes({ commonPrefix: false });
    }

    // Method to check if the app is ready
    public isReady(): boolean {
        return this.fastify.server.listening;
    }
}

// Declarar tipos globais para Fastify
declare module 'fastify' {
    interface FastifyRequest {
        startTime?: number;
    }
}

export default App;