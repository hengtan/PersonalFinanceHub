// backend/src/server.ts
import 'reflect-metadata'; // Para decorators se necessário
import dotenv from 'dotenv';
import path from 'path';

// Carrega variáveis de ambiente baseado no NODE_ENV
const envFile = process.env.NODE_ENV === 'production'
    ? '.env.production'
    : process.env.NODE_ENV === 'test'
        ? '.env.test'
        : '.env.development';

dotenv.config({ path: path.join(__dirname, '..', envFile) });
dotenv.config(); // Fallback para .env padrão

import App from './app';
import { logger } from './infrastructure/monitoring/logger.service';
import { connectDatabases, closeDatabases } from './infrastructure/database/connections';
import { EventBus } from './infrastructure/events/event-bus';
import { QueueService } from './jobs/queue.service';

/**
 * Servidor principal da aplicação
 * Gerencia inicialização, conexões de banco e shutdown graceful
 */
class Server {
    private app: App;
    private shutdownInProgress = false;

    constructor() {
        this.validateEnvironment();
        this.app = new App();
        this.setupShutdownHandlers();
    }

    /**
     * Valida variáveis de ambiente obrigatórias
     */
    private validateEnvironment(): void {
        const requiredEnvVars = [
            'NODE_ENV',
            'PORT',
            'POSTGRES_HOST',
            'POSTGRES_PORT',
            'POSTGRES_DB',
            'POSTGRES_USER',
            'POSTGRES_PASSWORD',
            'MONGODB_URI',
            'REDIS_HOST',
            'REDIS_PORT',
            'JWT_SECRET',
            'JWT_REFRESH_SECRET',
        ];

        const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

        if (missingVars.length > 0) {
            logger.error('Missing required environment variables', undefined, {
                missingVariables: missingVars,
            });
            process.exit(1);
        }

        // Validações específicas
        if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
            logger.error('JWT_SECRET must be at least 32 characters long');
            process.exit(1);
        }

        if (process.env.JWT_REFRESH_SECRET && process.env.JWT_REFRESH_SECRET.length < 32) {
            logger.error('JWT_REFRESH_SECRET must be at least 32 characters long');
            process.exit(1);
        }

        const port = parseInt(process.env.PORT || '3333', 10);
        if (isNaN(port) || port < 1 || port > 65535) {
            logger.error('PORT must be a valid port number between 1 and 65535');
            process.exit(1);
        }
    }

    /**
     * Inicializa todos os serviços e inicia o servidor
     */
    async start(): Promise<void> {
        try {
            logger.info('🔄 Initializing server...', {
                nodeVersion: process.version,
                environment: process.env.NODE_ENV,
                timestamp: new Date().toISOString(),
            });

            // 1. Conecta aos bancos de dados
            logger.info('📊 Connecting to databases...');
            await connectDatabases();
            logger.info('✅ Database connections established');

            // 2. Inicializa o sistema de eventos
            logger.info('⚡ Initializing event system...');
            await EventBus.initialize();
            logger.info('✅ Event system initialized');

            // 3. Inicializa as filas de processamento
            logger.info('🔄 Initializing job queues...');
            await QueueService.initialize();
            logger.info('✅ Job queues initialized');

            // 4. Inicializa a aplicação (rotas, middleware, etc.)
            logger.info('🔧 Initializing application...');
            await this.app.initialize();

            // 5. Inicia o servidor HTTP
            logger.info('🌐 Starting HTTP server...');
            await this.app.start();

            logger.info('🎉 Server initialization completed successfully', {
                port: this.app.getPort(),
                environment: process.env.NODE_ENV,
                processId: process.pid,
                uptime: process.uptime(),
            });

            // 5. Health check inicial
            await this.performInitialHealthCheck();

        } catch (error) {
            logger.error('❌ Failed to start server', error as Error, {
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
            });

            await this.gracefulShutdown();
            process.exit(1);
        }
    }

    /**
     * Executa verificação inicial de saúde dos serviços
     */
    private async performInitialHealthCheck(): Promise<void> {
        try {
            // Simula uma pequena operação para verificar se tudo está funcionando
            const testOperations = [
                () => this.testDatabaseConnection(),
                () => this.testCacheConnection(),
                () => this.testEventSystem(),
            ];

            for (const operation of testOperations) {
                await operation();
            }

            logger.info('✅ Initial health check passed');
        } catch (error) {
            logger.warn('⚠️  Initial health check failed', undefined, {
                error: error instanceof Error ? error.message : String(error),
            });
            // Não falha o startup, apenas log warning
        }
    }

    /**
     * Testa conexão com PostgreSQL
     */
    private async testDatabaseConnection(): Promise<void> {
        const { pgWritePool } = await import('./infrastructure/database/connections');
        const result = await pgWritePool.query('SELECT 1 as test');
        if (result.rows[0]?.test !== 1) {
            throw new Error('PostgreSQL connection test failed');
        }
    }

    /**
     * Testa conexão com Redis
     */
    private async testCacheConnection(): Promise<void> {
        const { CacheService } = await import('./infrastructure/database/connections');
        await CacheService.set('health_check', 'ok', 10);
        const result = await CacheService.get('health_check');
        if (result !== 'ok') {
            throw new Error('Redis connection test failed');
        }
        await CacheService.del('health_check');
    }

    /**
     * Testa sistema de eventos
     */
    private async testEventSystem(): Promise<void> {
        let eventReceived = false;

        // Listener temporário
        const unsubscribe = EventBus.on('health_check', () => {
            eventReceived = true;
        });

        // Emite evento de teste
        await EventBus.emit('health_check', { test: true });

        // Aguarda um pouco
        await new Promise(resolve => setTimeout(resolve, 100));

        unsubscribe();

        if (!eventReceived) {
            throw new Error('Event system test failed');
        }
    }

    /**
     * Configura handlers para shutdown graceful
     */
    private setupShutdownHandlers(): void {
        // Captura sinais de sistema
        process.on('SIGTERM', this.handleShutdownSignal.bind(this, 'SIGTERM'));
        process.on('SIGINT', this.handleShutdownSignal.bind(this, 'SIGINT'));

        // Captura exceções não tratadas
        process.on('uncaughtException', (error: Error) => {
            logger.error('Uncaught Exception - shutting down', error, {
                error: error.message,
                stack: error.stack,
            });
            this.gracefulShutdown().then(() => process.exit(1));
        });

        process.on('unhandledRejection', (reason: any) => {
            logger.error('Unhandled Rejection - shutting down', undefined, {
                reason: String(reason),
            });
            this.gracefulShutdown().then(() => process.exit(1));
        });
    }

    /**
     * Manipula sinais de shutdown
     */
    private handleShutdownSignal(signal: string): void {
        logger.info(`${signal} received - initiating graceful shutdown`);
        this.gracefulShutdown().then(() => {
            logger.info('Graceful shutdown completed');
            process.exit(0);
        });
    }

    /**
     * Executa shutdown graceful de todos os serviços
     */
    private async gracefulShutdown(): Promise<void> {
        if (this.shutdownInProgress) {
            logger.warn('Shutdown already in progress, ignoring...');
            return;
        }

        this.shutdownInProgress = true;

        try {
            logger.info('🔄 Starting graceful shutdown...');

            // Define timeout para shutdown forçado
            const shutdownTimeout = setTimeout(() => {
                logger.error('⏰ Shutdown timeout exceeded, forcing exit');
                process.exit(1);
            }, 30000); // 30 segundos

            // 1. Para de aceitar novas conexões HTTP
            logger.info('🌐 Stopping HTTP server...');
            // Note: Express não tem método built-in para stop, seria necessário armazenar a instância do server

            // 2. Finaliza processamento de jobs
            logger.info('🔄 Stopping job queues...');
            try {
                await QueueService.shutdown();
                logger.info('✅ Job queues stopped');
            } catch (error) {
                logger.warn('⚠️  Error stopping job queues', undefined, { error });
            }

            // 3. Finaliza sistema de eventos
            logger.info('⚡ Stopping event system...');
            try {
                await EventBus.shutdown();
                logger.info('✅ Event system stopped');
            } catch (error) {
                logger.warn('⚠️  Error stopping event system', undefined, { error });
            }

            // 4. Fecha conexões de banco
            logger.info('📊 Closing database connections...');
            try {
                await closeDatabases();
                logger.info('✅ Database connections closed');
            } catch (error) {
                logger.warn('⚠️  Error closing database connections', undefined, { error });
            }

            clearTimeout(shutdownTimeout);
            logger.info('✅ Graceful shutdown completed successfully');

        } catch (error) {
            logger.error('❌ Error during graceful shutdown', error instanceof Error ? error : new Error(String(error)), {
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
            });
        }
    }
}

/**
 * Função principal para inicialização
 */
async function main(): Promise<void> {
    const server = new Server();
    await server.start();
}

// Executa apenas se este arquivo foi executado diretamente
if (require.main === module) {
    main().catch((error) => {
        logger.error('Failed to start application', error instanceof Error ? error : new Error(String(error)), {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
        });
        process.exit(1);
    });
}

export default Server;