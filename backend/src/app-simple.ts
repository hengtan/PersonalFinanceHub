import fastify, { FastifyInstance } from 'fastify';

// Import simple route modules
import authRoutes from './api/routes/auth.simple';
import dashboardRoutes from './api/routes/dashboard.simple';
import transactionRoutes from './api/routes/transaction.simple';

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
            logger: false,
            trustProxy: true,
            requestTimeout: 30000,
            bodyLimit: 1048576 * 10, // 10MB
        });
    }

    public async initialize(): Promise<void> {
        try {
            console.log('Initializing simple application...');

            await this.setupPlugins();
            await this.setupRoutes();
            await this.setupHealthCheck();

            console.log('Simple application initialized successfully');

        } catch (error) {
            console.error('Failed to initialize application', error);
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
                            { name: 'Auth', description: 'Authentication endpoints' },
                            { name: 'Dashboard', description: 'Dashboard data endpoints' },
                            { name: 'Transactions', description: 'Transaction management' }
                        ]
                    }
                });

                await this.fastify.register(import('@fastify/swagger-ui'), {
                    routePrefix: '/docs',
                    uiConfig: {
                        docExpansion: 'list',
                        deepLinking: false
                    }
                });
            }

            console.log('Simple plugins registered successfully');

        } catch (error) {
            console.error('Failed to setup plugins', error);
            throw error;
        }
    }

    private async setupRoutes(): Promise<void> {
        try {
            const basePrefix = this.config.apiPrefix;

            // Authentication routes
            await this.fastify.register(authRoutes, {
                prefix: `${basePrefix}/auth`
            });

            // Dashboard routes
            await this.fastify.register(dashboardRoutes, {
                prefix: `${basePrefix}/dashboard`
            });

            // Financial transaction routes
            await this.fastify.register(transactionRoutes, {
                prefix: `${basePrefix}/transactions`
            });

            console.log('Simple routes setup completed');

        } catch (error) {
            console.error('Failed to setup routes', error);
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
                                version: { type: 'string' }
                            }
                        }
                    }
                }
            }, async (request, reply) => {
                const health = {
                    status: 'healthy',
                    timestamp: new Date().toISOString(),
                    uptime: process.uptime(),
                    version: '1.0.0'
                };

                return reply.code(200).send(health);
            });

            console.log('Simple health check endpoints setup completed');

        } catch (error) {
            console.error('Failed to setup health check', error);
            throw error;
        }
    }

    public async start(): Promise<void> {
        try {
            await this.fastify.listen({
                host: this.config.host,
                port: this.config.port
            });

            console.log(`🚀 Simple server is running on http://${this.config.host}:${this.config.port}`);

        } catch (error) {
            console.error('Failed to start server', error);
            throw error;
        }
    }

    public async close(): Promise<void> {
        try {
            await this.fastify.close();
            console.log('Simple server closed successfully');
        } catch (error) {
            console.error('Error closing server', error);
            throw error;
        }
    }

    public getFastifyInstance(): FastifyInstance {
        return this.fastify;
    }
}

export default App;