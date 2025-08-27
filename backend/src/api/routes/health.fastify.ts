// backend/src/routes/health.fastify.ts
import { FastifyPluginAsync } from 'fastify';

const healthRoutes: FastifyPluginAsync = async (fastify) => {
    fastify.get('/health', async () => {
        return {
            status: 'ok',
            service: 'personal-finance-hub-backend',
            uptime: process.uptime(),
            timestamp: new Date().toISOString(),
        };
    });
};

export default healthRoutes;