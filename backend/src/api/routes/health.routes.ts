// backend/src/api/routes/health.routes.ts
import { Router, Request, Response } from 'express';
import { checkPostgresHealth, checkMongoHealth, checkRedisHealth } from '../../infrastructure/database/connections';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
    const startTime = Date.now();

    try {
        const [postgresHealth, mongoHealth, redisHealth] = await Promise.allSettled([
            checkPostgresHealth(),
            checkMongoHealth(),
            checkRedisHealth(),
        ]);

        const responseTime = Date.now() - startTime;

        const healthStatus = {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            responseTime: `${responseTime}ms`,
            version: process.env.npm_package_version || '1.0.0',
            environment: process.env.NODE_ENV || 'development',
            services: {
                postgres: {
                    status: postgresHealth.status === 'fulfilled' && postgresHealth.value ? 'healthy' : 'unhealthy',
                    message: postgresHealth.status === 'fulfilled' ? 'Connected' : 'Connection failed',
                },
                mongodb: {
                    status: mongoHealth.status === 'fulfilled' && mongoHealth.value ? 'healthy' : 'unhealthy',
                    message: mongoHealth.status === 'fulfilled' ? 'Connected' : 'Connection failed',
                },
                redis: {
                    status: redisHealth.status === 'fulfilled' && redisHealth.value ? 'healthy' : 'unhealthy',
                    message: redisHealth.status === 'fulfilled' ? 'Connected' : 'Connection failed',
                },
            },
        };

        // Determine overall health
        const servicesHealthy = Object.values(healthStatus.services).every(service => service.status === 'healthy');
        healthStatus.status = servicesHealthy ? 'healthy' : 'degraded';

        const statusCode = servicesHealthy ? 200 : 503;

        res.status(statusCode).json({
            success: servicesHealthy,
            data: healthStatus,
        });
    } catch (error) {
        res.status(503).json({
            success: false,
            data: {
                status: 'unhealthy',
                timestamp: new Date().toISOString(),
                error: 'Health check failed',
            },
        });
    }
});

// Detailed health check for monitoring systems
router.get('/detailed', async (req: Request, res: Response) => {
    const startTime = Date.now();

    try {
        const healthChecks = await Promise.allSettled([
            checkPostgresHealth(),
            checkMongoHealth(),
            checkRedisHealth(),
        ]);

        const responseTime = Date.now() - startTime;

        res.json({
            success: true,
            data: {
                status: 'healthy',
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
                responseTime: `${responseTime}ms`,
                memory: {
                    used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
                    total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
                    external: Math.round(process.memoryUsage().external / 1024 / 1024),
                },
                cpu: process.cpuUsage(),
                node: process.version,
                pid: process.pid,
                platform: process.platform,
                services: {
                    postgres: {
                        status: healthChecks[0].status === 'fulfilled' && healthChecks[0].value ? 'healthy' : 'unhealthy',
                        responseTime: `${Date.now() - startTime}ms`,
                    },
                    mongodb: {
                        status: healthChecks[1].status === 'fulfilled' && healthChecks[1].value ? 'healthy' : 'unhealthy',
                        responseTime: `${Date.now() - startTime}ms`,
                    },
                    redis: {
                        status: healthChecks[2].status === 'fulfilled' && healthChecks[2].value ? 'healthy' : 'unhealthy',
                        responseTime: `${Date.now() - startTime}ms`,
                    },
                },
            },
        });
    } catch (error) {
        res.status(503).json({
            success: false,
            error: {
                code: 'HEALTH_CHECK_FAILED',
                message: 'Detailed health check failed',
            },
        });
    }
});

export { router as healthRoutes };




