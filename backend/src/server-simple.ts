import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
const envFile = process.env.NODE_ENV === 'production'
    ? '.env.production'
    : process.env.NODE_ENV === 'test'
        ? '.env.test'
        : '.env.development';

dotenv.config({ path: path.join(__dirname, '..', envFile) });
dotenv.config(); // Fallback to default .env

import App from './app-simple';

/**
 * Simple server for testing basic functionality
 */
class SimpleServer {
    private app: App;

    constructor() {
        this.app = new App();
        this.setupShutdownHandlers();
    }

    private setupShutdownHandlers(): void {
        const gracefulShutdown = async (signal: string) => {
            console.log(`\n${signal} received. Starting graceful shutdown...`);
            
            try {
                await this.app.close();
                console.log('✅ Graceful shutdown completed');
                process.exit(0);
            } catch (error) {
                console.error('❌ Error during shutdown:', error);
                process.exit(1);
            }
        };

        process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
        process.on('SIGINT', () => gracefulShutdown('SIGINT'));
        
        process.on('uncaughtException', (error) => {
            console.error('Uncaught Exception:', error);
            process.exit(1);
        });

        process.on('unhandledRejection', (reason) => {
            console.error('Unhandled Rejection:', reason);
            process.exit(1);
        });
    }

    public async start(): Promise<void> {
        try {
            console.log('🔄 Initializing simple server...');
            
            await this.app.initialize();
            await this.app.start();

            console.log('🎉 Simple server initialization completed successfully');

        } catch (error) {
            console.error('❌ Failed to start simple server:', error);
            process.exit(1);
        }
    }
}

// Main execution
async function main() {
    const server = new SimpleServer();
    await server.start();
}

if (require.main === module) {
    main().catch((error) => {
        console.error('Failed to start application:', error);
        process.exit(1);
    });
}

export default SimpleServer;