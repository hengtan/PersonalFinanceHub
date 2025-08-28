// src/api/middlewares/auth-rate-limit.middleware.ts
import { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '@/infrastructure/monitoring/logger.service';

interface RateLimitConfig {
    windowMs: number; // Time window in milliseconds
    maxAttempts: number; // Maximum number of attempts per window
    blockDurationMs: number; // How long to block after exceeding limit
    keyGenerator?: (request: FastifyRequest) => string; // Custom key generator
}

interface RateLimitEntry {
    attempts: number;
    resetTime: number;
    blockedUntil?: number;
}

export class AuthRateLimitMiddleware {
    private static attempts: Map<string, RateLimitEntry> = new Map();

    /**
     * Rate limiting for login attempts
     */
    static loginRateLimit(config: RateLimitConfig = {
        windowMs: 15 * 60 * 1000, // 15 minutes
        maxAttempts: 5, // 5 attempts
        blockDurationMs: 30 * 60 * 1000 // Block for 30 minutes
    }) {
        return async (request: FastifyRequest, reply: FastifyReply) => {
            const key = config.keyGenerator 
                ? config.keyGenerator(request)
                : `login:${this.getClientIdentifier(request)}`;

            const result = this.checkRateLimit(key, config);

            if (result.blocked) {
                logger.warn('Login rate limit exceeded', {
                    clientId: key,
                    attempts: result.attempts,
                    blockedUntil: result.blockedUntil,
                    ip: request.ip,
                    userAgent: request.headers['user-agent']
                });

                return reply.status(429).send({
                    error: 'Too Many Requests',
                    message: 'Too many login attempts. Please try again later.',
                    code: 'RATE_LIMIT_EXCEEDED',
                    retryAfter: Math.ceil((result.blockedUntil! - Date.now()) / 1000)
                });
            }

            // Add rate limit headers
            reply.header('X-RateLimit-Limit', config.maxAttempts.toString());
            reply.header('X-RateLimit-Remaining', (config.maxAttempts - result.attempts).toString());
            reply.header('X-RateLimit-Reset', Math.ceil(result.resetTime / 1000).toString());
        };
    }

    /**
     * Rate limiting for registration attempts
     */
    static registrationRateLimit(config: RateLimitConfig = {
        windowMs: 60 * 60 * 1000, // 1 hour
        maxAttempts: 3, // 3 attempts per hour
        blockDurationMs: 2 * 60 * 60 * 1000 // Block for 2 hours
    }) {
        return async (request: FastifyRequest, reply: FastifyReply) => {
            const key = config.keyGenerator 
                ? config.keyGenerator(request)
                : `register:${this.getClientIdentifier(request)}`;

            const result = this.checkRateLimit(key, config);

            if (result.blocked) {
                logger.warn('Registration rate limit exceeded', {
                    clientId: key,
                    attempts: result.attempts,
                    ip: request.ip
                });

                return reply.status(429).send({
                    error: 'Too Many Requests',
                    message: 'Too many registration attempts. Please try again later.',
                    code: 'RATE_LIMIT_EXCEEDED',
                    retryAfter: Math.ceil((result.blockedUntil! - Date.now()) / 1000)
                });
            }

            reply.header('X-RateLimit-Limit', config.maxAttempts.toString());
            reply.header('X-RateLimit-Remaining', (config.maxAttempts - result.attempts).toString());
            reply.header('X-RateLimit-Reset', Math.ceil(result.resetTime / 1000).toString());
        };
    }

    /**
     * Rate limiting for password reset requests
     */
    static passwordResetRateLimit(config: RateLimitConfig = {
        windowMs: 60 * 60 * 1000, // 1 hour
        maxAttempts: 3, // 3 password reset attempts per hour
        blockDurationMs: 60 * 60 * 1000 // Block for 1 hour
    }) {
        return async (request: FastifyRequest, reply: FastifyReply) => {
            const body = request.body as any;
            const email = body?.email;
            
            const key = email 
                ? `password-reset:${email}` 
                : `password-reset:${this.getClientIdentifier(request)}`;

            const result = this.checkRateLimit(key, config);

            if (result.blocked) {
                logger.warn('Password reset rate limit exceeded', {
                    email,
                    clientId: key,
                    ip: request.ip
                });

                return reply.status(429).send({
                    error: 'Too Many Requests',
                    message: 'Too many password reset attempts. Please try again later.',
                    code: 'RATE_LIMIT_EXCEEDED',
                    retryAfter: Math.ceil((result.blockedUntil! - Date.now()) / 1000)
                });
            }

            reply.header('X-RateLimit-Limit', config.maxAttempts.toString());
            reply.header('X-RateLimit-Remaining', (config.maxAttempts - result.attempts).toString());
            reply.header('X-RateLimit-Reset', Math.ceil(result.resetTime / 1000).toString());
        };
    }

    /**
     * Track failed authentication attempts
     */
    static recordFailedAttempt(request: FastifyRequest, attemptType: 'login' | 'register' | 'password-reset' = 'login'): void {
        const key = `${attemptType}:${this.getClientIdentifier(request)}`;
        const now = Date.now();
        
        const entry = this.attempts.get(key);
        if (entry) {
            entry.attempts += 1;
            
            logger.debug('Failed authentication attempt recorded', {
                key,
                attempts: entry.attempts,
                type: attemptType,
                ip: request.ip
            });
        }
    }

    /**
     * Clear successful authentication (reset counter)
     */
    static recordSuccessfulAttempt(request: FastifyRequest, attemptType: 'login' | 'register' | 'password-reset' = 'login'): void {
        const key = `${attemptType}:${this.getClientIdentifier(request)}`;
        
        // Remove the rate limit entry on successful authentication
        this.attempts.delete(key);
        
        logger.debug('Successful authentication - rate limit reset', {
            key,
            type: attemptType,
            ip: request.ip
        });
    }

    /**
     * Check rate limit for a given key
     */
    private static checkRateLimit(key: string, config: RateLimitConfig): {
        blocked: boolean;
        attempts: number;
        resetTime: number;
        blockedUntil?: number;
    } {
        const now = Date.now();
        const entry = this.attempts.get(key);

        // If no entry exists, create one
        if (!entry) {
            const newEntry: RateLimitEntry = {
                attempts: 1,
                resetTime: now + config.windowMs
            };
            this.attempts.set(key, newEntry);
            
            return {
                blocked: false,
                attempts: 1,
                resetTime: newEntry.resetTime
            };
        }

        // If currently blocked, check if block period has expired
        if (entry.blockedUntil && now < entry.blockedUntil) {
            return {
                blocked: true,
                attempts: entry.attempts,
                resetTime: entry.resetTime,
                blockedUntil: entry.blockedUntil
            };
        }

        // If window has expired, reset counter
        if (now > entry.resetTime) {
            entry.attempts = 1;
            entry.resetTime = now + config.windowMs;
            delete entry.blockedUntil;
            
            return {
                blocked: false,
                attempts: 1,
                resetTime: entry.resetTime
            };
        }

        // Increment attempts
        entry.attempts += 1;

        // Check if limit exceeded
        if (entry.attempts > config.maxAttempts) {
            entry.blockedUntil = now + config.blockDurationMs;
            
            return {
                blocked: true,
                attempts: entry.attempts,
                resetTime: entry.resetTime,
                blockedUntil: entry.blockedUntil
            };
        }

        return {
            blocked: false,
            attempts: entry.attempts,
            resetTime: entry.resetTime
        };
    }

    /**
     * Get client identifier (IP + User Agent hash for better uniqueness)
     */
    private static getClientIdentifier(request: FastifyRequest): string {
        const ip = request.ip;
        const userAgent = request.headers['user-agent'] || '';
        
        // Create a simple hash of user agent for privacy
        let hash = 0;
        for (let i = 0; i < userAgent.length; i++) {
            const char = userAgent.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        
        return `${ip}:${Math.abs(hash)}`;
    }

    /**
     * Cleanup expired entries (should be called periodically)
     */
    static cleanupExpiredEntries(): void {
        const now = Date.now();
        let cleaned = 0;
        
        for (const [key, entry] of this.attempts.entries()) {
            // Remove if both window and block period have expired
            if (now > entry.resetTime && (!entry.blockedUntil || now > entry.blockedUntil)) {
                this.attempts.delete(key);
                cleaned++;
            }
        }

        if (cleaned > 0) {
            logger.debug('Cleaned up expired rate limit entries', {
                cleaned,
                remaining: this.attempts.size
            });
        }
    }

    /**
     * Get current stats (for monitoring/debugging)
     */
    static getStats(): {
        totalEntries: number;
        blockedEntries: number;
        activeEntries: number;
    } {
        const now = Date.now();
        let blocked = 0;
        let active = 0;

        for (const entry of this.attempts.values()) {
            if (entry.blockedUntil && now < entry.blockedUntil) {
                blocked++;
            } else if (now < entry.resetTime) {
                active++;
            }
        }

        return {
            totalEntries: this.attempts.size,
            blockedEntries: blocked,
            activeEntries: active
        };
    }
}

// Cleanup expired entries every 5 minutes
setInterval(() => {
    AuthRateLimitMiddleware.cleanupExpiredEntries();
}, 5 * 60 * 1000);