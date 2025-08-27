// backend/src/worker.ts
import 'reflect-metadata';
import dotenv from 'dotenv';
import path from 'path';

// Carrega variáveis de ambiente
const envFile = process.env.NODE_ENV === 'production'
    ? '.env.production'
    : process.env.NODE_ENV === 'test'
        ? '.env.test'
        : '.env.development';

dotenv.config({ path: path.join(__dirname, '..', envFile) });
dotenv.config(); // Fallback para .env padrão

import { logger } from './infrastructure/monitoring/logger.service';
import { connectDatabases, closeDatabases } from './infrastructure/database/connections';
import { EventBus } from './infrastructure/events/event-bus';
import { QueueService } from './jobs/queue.service';

/**
 * Worker para processamento de jobs em background
 * Gerencia filas de trabalho e processamento assíncrono
 */
class Worker {
    private shutdownInProgress = false;

    constructor() {
        this.validateEnvironment();
        this.setupShutdownHandlers();
    }

    /**
     * Valida variáveis de ambiente obrigatórias
     */
    private validateEnvironment(): void {
        const requiredEnvVars = [
            'NODE_ENV',
            'POSTGRES_HOST',
            'POSTGRES_PORT',
            'POSTGRES_DB',
            'POSTGRES_USER',
            'POSTGRES_PASSWORD',
            'MONGODB_URI',
            'REDIS_HOST',
            'REDIS_PORT',
        ];

        const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

        if (missingVars.length > 0) {
            logger.error('Missing required environment variables', undefined, {
                missingVariables: missingVars,
            });
            process.exit(1);
        }
    }

    /**
     * Inicia o worker
     */
    async start(): Promise<void> {
        try {
            logger.info('= Starting Personal Finance Hub Worker...', {
                nodeVersion: process.version,
                environment: process.env.NODE_ENV,
                timestamp: new Date().toISOString(),
            });

            // 1. Conecta aos bancos de dados
            logger.info('=Ê Connecting to databases...');
            await connectDatabases();
            logger.info(' Database connections established');

            // 2. Inicializa o sistema de eventos
            logger.info('¡ Initializing event system...');
            await EventBus.initialize();
            logger.info(' Event system initialized');

            // 3. Inicializa as filas de processamento
            logger.info('= Initializing job queues...');
            await QueueService.initialize();
            logger.info(' Job queues initialized');

            // 4. Inicia o processamento
            logger.info('=€ Starting job processing...');
            await QueueService.startProcessing();
            logger.info(' Job processing started');

            logger.info('<‰ Worker initialization completed successfully', {
                environment: process.env.NODE_ENV,
                processId: process.pid,
                uptime: process.uptime(),
            });

        } catch (error) {
            logger.error('L Failed to start worker', error as Error, {
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
            });

            await this.gracefulShutdown();
            process.exit(1);
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
            logger.error('Uncaught Exception - shutting down worker', error, {
                error: error.message,
                stack: error.stack,
            });
            this.gracefulShutdown().then(() => process.exit(1));
        });

        process.on('unhandledRejection', (reason: any) => {
            logger.error('Unhandled Rejection - shutting down worker', new Error(String(reason)), {
                reason: String(reason),
            });
            this.gracefulShutdown().then(() => process.exit(1));
        });
    }

    /**
     * Manipula sinais de shutdown
     */
    private handleShutdownSignal(signal: string): void {
        logger.info(`${signal} received - initiating graceful worker shutdown`);
        this.gracefulShutdown().then(() => {
            logger.info('Graceful worker shutdown completed');
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
            logger.info('= Starting graceful worker shutdown...');

            // Define timeout para shutdown forçado
            const shutdownTimeout = setTimeout(() => {
                logger.error('ð Worker shutdown timeout exceeded, forcing exit');
                process.exit(1);
            }, 30000); // 30 segundos

            // 1. Para processamento de jobs
            logger.info('= Stopping job processing...');
            try {
                await QueueService.stopProcessing();
                logger.info(' Job processing stopped');
            } catch (error) {
                logger.warn('   Error stopping job processing', { error });
            }

            // 2. Finaliza filas
            logger.info('= Shutting down job queues...');
            try {
                await QueueService.shutdown();
                logger.info(' Job queues shutdown');
            } catch (error) {
                logger.warn('   Error shutting down job queues', { error });
            }

            // 3. Finaliza sistema de eventos
            logger.info('¡ Shutting down event system...');
            try {
                await EventBus.shutdown();
                logger.info(' Event system shutdown');
            } catch (error) {
                logger.warn('   Error shutting down event system', { error });
            }

            // 4. Fecha conexões de banco
            logger.info('=Ê Closing database connections...');
            try {
                await closeDatabases();
                logger.info(' Database connections closed');
            } catch (error) {
                logger.warn('   Error closing database connections', { error });
            }

            clearTimeout(shutdownTimeout);
            logger.info(' Graceful worker shutdown completed successfully');

        } catch (error) {
            logger.error('L Error during graceful worker shutdown', error as Error, {
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
            });
        }
    }
}

/**
 * Função principal para inicialização do worker
 */
async function main(): Promise<void> {
    const worker = new Worker();
    await worker.start();
}

// Executa apenas se este arquivo foi executado diretamente
if (require.main === module) {
    main().catch((error) => {
        logger.error('Failed to start worker', error as Error, {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
        });
        process.exit(1);
    });
}

export default Worker;