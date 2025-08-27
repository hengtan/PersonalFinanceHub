// backend/src/routes/auth.fastify.ts
import { FastifyPluginAsync } from 'fastify';

const authRoutes: FastifyPluginAsync = async (fastify) => {
    // Registro "fake" pra passar no teste
    fastify.post('/register', async (req, reply) => {
        return reply.code(201).send({
            success: true,
            message: 'User registered (dev stub)',
            userId: 'dev-user-id',
        });
    });

    // Login "fake" retornando um token
    fastify.post('/login', async (req, reply) => {
        return reply.send({
            success: true,
            accessToken: 'dev-access-token',
            refreshToken: 'dev-refresh-token',
            tokenType: 'Bearer',
            expiresIn: 3600,
        });
    });
};

export default authRoutes;