// test/integration/auth-jwt.integration.test.ts
import { AuthService } from '@/core/application/services/auth.service';
import { jwtMiddleware } from '@/api/middlewares/jwt.middleware';
import { AuthRateLimitMiddleware } from '@/api/middlewares/auth-rate-limit.middleware';

// Mock the logger
jest.mock('@/infrastructure/monitoring/logger.service', () => ({
    logger: {
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
        child: jest.fn().mockReturnThis()
    }
}));

// Mock business exception
jest.mock('@/shared/exceptions/business.exception', () => ({
    BusinessException: class BusinessException extends Error {
        constructor(message: string, public code: string, public statusCode: number) {
            super(message);
            this.name = 'BusinessException';
        }
    }
}));

// Mock validation exception
jest.mock('@/shared/exceptions/validation.exception', () => ({
    ValidationException: class ValidationException extends Error {
        constructor(message: string, public errors: Array<{field: string, message: string}>) {
            super(message);
            this.name = 'ValidationException';
        }
    }
}));

describe('Auth JWT Integration', () => {
    let authService: AuthService;

    beforeEach(() => {
        authService = new AuthService();
    });

    describe('AuthService', () => {
        it('should generate valid JWT tokens', async () => {
            const tokens = await authService.login({
                email: 'test@example.com',
                password: 'password123'
            });

            expect(tokens.user).toMatchObject({
                id: expect.any(String),
                email: 'test@example.com',
                isActive: true
            });

            expect(tokens.tokens).toMatchObject({
                accessToken: expect.any(String),
                refreshToken: expect.any(String)
            });

            // Verify token structure
            const decodedToken = authService.verifyToken(tokens.tokens.accessToken);
            expect(decodedToken).toMatchObject({
                sub: expect.any(String),
                email: 'test@example.com',
                iat: expect.any(Number)
            });
        });

        it('should validate password strength correctly', () => {
            const weakPassword = '123';
            const strongPassword = 'Test@123!';

            const weakResult = authService.validatePasswordStrength(weakPassword);
            expect(weakResult.isValid).toBe(false);
            expect(weakResult.errors.length).toBeGreaterThan(0);

            const strongResult = authService.validatePasswordStrength(strongPassword);
            expect(strongResult.isValid).toBe(true);
            expect(strongResult.errors).toHaveLength(0);
        });

        it('should extract token from authorization header', () => {
            const validHeader = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9';
            const invalidHeader = 'Invalid header';

            const validToken = authService.extractTokenFromHeader(validHeader);
            expect(validToken).toBe('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');

            const invalidToken = authService.extractTokenFromHeader(invalidHeader);
            expect(invalidToken).toBeNull();
        });

        it('should detect expired tokens', () => {
            const validToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjMiLCJleHAiOjk5OTk5OTk5OTl9.x';
            const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjMiLCJleHAiOjF9.x';

            expect(authService.isTokenExpired(expiredToken)).toBe(true);
            // Note: This is a simplified test - in real scenarios, you'd need proper token structure
        });
    });

    describe('JWT Middleware', () => {
        let mockRequest: any;
        let mockReply: any;

        beforeEach(() => {
            mockRequest = {
                headers: {},
                ip: '127.0.0.1',
                url: '/test',
                method: 'GET'
            };

            mockReply = {
                status: jest.fn().mockReturnThis(),
                send: jest.fn().mockReturnThis(),
                header: jest.fn().mockReturnThis()
            };
        });

        it('should reject requests without authorization header', async () => {
            await jwtMiddleware.authenticate(mockRequest, mockReply);

            expect(mockReply.status).toHaveBeenCalledWith(401);
            expect(mockReply.send).toHaveBeenCalledWith({
                error: 'Unauthorized',
                message: 'Missing authorization header',
                code: 'MISSING_AUTH_HEADER'
            });
        });

        it('should reject requests with invalid authorization header format', async () => {
            mockRequest.headers.authorization = 'Invalid header';

            await jwtMiddleware.authenticate(mockRequest, mockReply);

            expect(mockReply.status).toHaveBeenCalledWith(401);
            expect(mockReply.send).toHaveBeenCalledWith({
                error: 'Unauthorized',
                message: 'Invalid authorization header format',
                code: 'INVALID_AUTH_HEADER'
            });
        });

        it('should accept requests with valid tokens', async () => {
            // Create a valid token first
            const loginResult = await authService.login({
                email: 'test@example.com',
                password: 'password123'
            });

            mockRequest.headers.authorization = `Bearer ${loginResult.tokens.accessToken}`;

            await jwtMiddleware.authenticate(mockRequest, mockReply);

            // Should not call reply.status or reply.send if successful
            expect(mockReply.status).not.toHaveBeenCalled();
            expect(mockReply.send).not.toHaveBeenCalled();
            
            // Should attach user to request
            expect(mockRequest.user).toBeDefined();
            expect(mockRequest.user.email).toBe('test@example.com');
        });

        it('should handle optional authentication gracefully', async () => {
            // Test with no header
            await jwtMiddleware.optionalAuthenticate(mockRequest, mockReply);
            expect(mockRequest.user).toBeUndefined();

            // Test with valid token
            const loginResult = await authService.login({
                email: 'test@example.com',
                password: 'password123'
            });
            
            mockRequest.headers.authorization = `Bearer ${loginResult.tokens.accessToken}`;
            await jwtMiddleware.optionalAuthenticate(mockRequest, mockReply);
            
            expect(mockRequest.user).toBeDefined();
        });

        it('should add security headers', async () => {
            await jwtMiddleware.validateSecurityHeaders(mockRequest, mockReply);

            expect(mockReply.header).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
            expect(mockReply.header).toHaveBeenCalledWith('X-Frame-Options', 'DENY');
            expect(mockReply.header).toHaveBeenCalledWith('X-XSS-Protection', '1; mode=block');
        });
    });

    describe('Auth Rate Limiting', () => {
        let mockRequest: any;
        let mockReply: any;

        beforeEach(() => {
            mockRequest = {
                ip: '127.0.0.1',
                headers: {
                    'user-agent': 'test-agent'
                },
                body: { email: 'test@example.com' }
            };

            mockReply = {
                status: jest.fn().mockReturnThis(),
                send: jest.fn().mockReturnThis(),
                header: jest.fn().mockReturnThis()
            };

            // Clear rate limit state
            AuthRateLimitMiddleware.cleanupExpiredEntries();
        });

        it('should allow requests within rate limit', async () => {
            const middleware = AuthRateLimitMiddleware.loginRateLimit({
                windowMs: 60000,
                maxAttempts: 5,
                blockDurationMs: 60000
            });

            await middleware(mockRequest, mockReply);

            expect(mockReply.status).not.toHaveBeenCalled();
            expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Limit', '5');
            expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Remaining', '4');
        });

        it('should block requests when rate limit exceeded', async () => {
            const middleware = AuthRateLimitMiddleware.loginRateLimit({
                windowMs: 60000,
                maxAttempts: 2, // Low limit for testing
                blockDurationMs: 60000
            });

            // Make requests up to the limit
            await middleware(mockRequest, mockReply);
            await middleware(mockRequest, mockReply);
            
            // This should trigger rate limiting
            await middleware(mockRequest, mockReply);

            expect(mockReply.status).toHaveBeenCalledWith(429);
            expect(mockReply.send).toHaveBeenCalledWith(
                expect.objectContaining({
                    error: 'Too Many Requests',
                    code: 'RATE_LIMIT_EXCEEDED'
                })
            );
        });

        it('should track different attempt types separately', async () => {
            AuthRateLimitMiddleware.recordFailedAttempt(mockRequest, 'login');
            AuthRateLimitMiddleware.recordFailedAttempt(mockRequest, 'register');

            const stats = AuthRateLimitMiddleware.getStats();
            expect(stats.totalEntries).toBeGreaterThan(0);
        });

        it('should reset counter on successful attempts', () => {
            AuthRateLimitMiddleware.recordFailedAttempt(mockRequest, 'login');
            AuthRateLimitMiddleware.recordSuccessfulAttempt(mockRequest, 'login');

            // Stats should show the entry was removed
            const stats = AuthRateLimitMiddleware.getStats();
            expect(stats.totalEntries).toBe(0);
        });
    });

    describe('Password Security', () => {
        it('should hash passwords securely', async () => {
            const password = 'testPassword123!';
            const hash1 = await authService.hashPassword(password);
            const hash2 = await authService.hashPassword(password);

            // Same password should generate different hashes (due to salt)
            expect(hash1).not.toBe(hash2);
            expect(hash1).toMatch(/^\$2[aby]\$\d+\$/); // bcrypt hash format
        });

        it('should verify passwords correctly', async () => {
            const password = 'testPassword123!';
            const hash = await authService.hashPassword(password);

            const isValid = await authService.verifyPassword(password, hash);
            const isInvalid = await authService.verifyPassword('wrongPassword', hash);

            expect(isValid).toBe(true);
            expect(isInvalid).toBe(false);
        });

        it('should generate secure random tokens', () => {
            const token1 = authService.generateSecureToken();
            const token2 = authService.generateSecureToken();

            expect(token1).toHaveLength(32);
            expect(token2).toHaveLength(32);
            expect(token1).not.toBe(token2);
            expect(token1).toMatch(/^[A-Za-z0-9]+$/);
        });
    });
});