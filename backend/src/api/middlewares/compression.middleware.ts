// src/api/middlewares/compression.middleware.ts
import { FastifyRequest, FastifyReply } from 'fastify';
import * as zlib from 'zlib';
import { logger } from '../../infrastructure/monitoring/logger.service';

export interface CompressionConfig {
    threshold: number; // Minimum size in bytes to compress
    level: number; // Compression level (1-9)
    enableGzip: boolean;
    enableBrotli: boolean;
    enableCaching: boolean;
    cacheMaxAge: number;
}

export class CompressionMiddleware {
    private static config: CompressionConfig = {
        threshold: 1024, // 1KB
        level: 6, // Balanced compression
        enableGzip: true,
        enableBrotli: true,
        enableCaching: true,
        cacheMaxAge: 3600 // 1 hour
    };

    static configure(config: Partial<CompressionConfig>): void {
        this.config = { ...this.config, ...config };
        logger.info('Compression middleware configured', this.config);
    }

    static async compress(request: FastifyRequest, reply: FastifyReply): Promise<void> {
        const acceptEncoding = request.headers['accept-encoding'] || '';
        const userAgent = request.headers['user-agent'] || '';
        
        // Skip compression for certain user agents or content types
        if (this.shouldSkipCompression(request, userAgent)) {
            return;
        }

        // Set up compression based on client capabilities
        if (this.config.enableBrotli && acceptEncoding.includes('br')) {
            reply.header('Content-Encoding', 'br');
            reply.header('Vary', 'Accept-Encoding');
            this.setupBrotliCompression(reply);
        } else if (this.config.enableGzip && acceptEncoding.includes('gzip')) {
            reply.header('Content-Encoding', 'gzip');
            reply.header('Vary', 'Accept-Encoding');
            this.setupGzipCompression(reply);
        }

        // Add caching headers for better performance
        if (this.config.enableCaching) {
            this.addCachingHeaders(reply);
        }

        // Add performance headers
        this.addPerformanceHeaders(reply);
    }

    private static shouldSkipCompression(request: FastifyRequest, userAgent: string): boolean {
        // Skip compression for:
        // 1. Already compressed content
        // 2. Small responses (below threshold)
        // 3. Specific user agents that don't handle compression well
        // 4. WebSocket connections
        // 5. Server-sent events

        const contentType = request.headers['content-type'] || '';
        
        // Skip for already compressed content
        if (contentType.includes('image/') || 
            contentType.includes('video/') ||
            contentType.includes('application/zip') ||
            contentType.includes('application/gzip')) {
            return true;
        }

        // Skip for WebSocket upgrade requests
        if (request.headers.upgrade === 'websocket') {
            return true;
        }

        // Skip for server-sent events
        if (contentType.includes('text/event-stream')) {
            return true;
        }

        // Skip for specific user agents (if needed)
        if (userAgent.toLowerCase().includes('bot') && 
            !userAgent.toLowerCase().includes('googlebot')) {
            return true;
        }

        return false;
    }

    private static setupBrotliCompression(reply: FastifyReply): void {
        const originalSend = reply.send.bind(reply);
        
        reply.send = function(payload: any) {
            if (typeof payload === 'string' || Buffer.isBuffer(payload)) {
                const content = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
                
                if (content.length >= CompressionMiddleware.config.threshold) {
                    const compressed = zlib.brotliCompressSync(content, {
                        params: {
                            [zlib.constants.BROTLI_PARAM_QUALITY]: CompressionMiddleware.config.level
                        }
                    });
                    
                    logger.debug('Brotli compression applied', {
                        originalSize: content.length,
                        compressedSize: compressed.length,
                        ratio: ((1 - compressed.length / content.length) * 100).toFixed(2) + '%'
                    });
                    
                    return originalSend(compressed);
                }
            }
            
            return originalSend(payload);
        };
    }

    private static setupGzipCompression(reply: FastifyReply): void {
        const originalSend = reply.send.bind(reply);
        
        reply.send = function(payload: any) {
            if (typeof payload === 'string' || Buffer.isBuffer(payload)) {
                const content = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
                
                if (content.length >= CompressionMiddleware.config.threshold) {
                    const compressed = zlib.gzipSync(content, {
                        level: CompressionMiddleware.config.level
                    });
                    
                    logger.debug('Gzip compression applied', {
                        originalSize: content.length,
                        compressedSize: compressed.length,
                        ratio: ((1 - compressed.length / content.length) * 100).toFixed(2) + '%'
                    });
                    
                    return originalSend(compressed);
                }
            }
            
            return originalSend(payload);
        };
    }

    private static addCachingHeaders(reply: FastifyReply): void {
        // Add cache control headers for better performance
        reply.header('Cache-Control', `public, max-age=${this.config.cacheMaxAge}`);
        reply.header('X-Compression-Enabled', 'true');
    }

    private static addPerformanceHeaders(reply: FastifyReply): void {
        // Add performance-related headers
        reply.header('X-Content-Type-Options', 'nosniff');
        reply.header('X-Frame-Options', 'DENY');
        reply.header('X-XSS-Protection', '1; mode=block');
        reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    }

    /**
     * Minify JSON responses
     */
    static minifyJSON(request: FastifyRequest, reply: FastifyReply): void {
        const originalSend = reply.send.bind(reply);
        
        reply.send = function(payload: any) {
            if (typeof payload === 'object' && payload !== null) {
                // Remove null/undefined values and extra whitespace
                const minified = JSON.stringify(payload, (key, value) => {
                    // Remove null values to reduce payload size
                    if (value === null) {
                        return undefined;
                    }
                    // Remove empty arrays/objects if desired
                    if (Array.isArray(value) && value.length === 0) {
                        return undefined;
                    }
                    return value;
                });
                
                logger.debug('JSON minification applied', {
                    originalSize: JSON.stringify(payload).length,
                    minifiedSize: minified.length
                });
                
                reply.header('Content-Type', 'application/json; charset=utf-8');
                return originalSend(minified);
            }
            
            return originalSend(payload);
        };
    }

    /**
     * Add response size monitoring
     */
    static monitorResponseSize(request: FastifyRequest, reply: FastifyReply): void {
        const startTime = Date.now();
        const originalSend = reply.send.bind(reply);
        
        reply.send = function(payload: any) {
            const responseTime = Date.now() - startTime;
            let responseSize = 0;
            
            if (typeof payload === 'string') {
                responseSize = Buffer.byteLength(payload, 'utf8');
            } else if (Buffer.isBuffer(payload)) {
                responseSize = payload.length;
            } else if (typeof payload === 'object') {
                responseSize = Buffer.byteLength(JSON.stringify(payload), 'utf8');
            }
            
            // Add performance headers
            reply.header('X-Response-Time', `${responseTime}ms`);
            reply.header('X-Response-Size', `${responseSize}b`);
            
            logger.debug('Response metrics', {
                method: request.method,
                url: request.url,
                responseTime,
                responseSize,
                statusCode: reply.statusCode
            });
            
            return originalSend(payload);
        };
    }

    /**
     * Setup all compression and optimization middlewares
     */
    static setup() {
        return [
            this.monitorResponseSize.bind(this),
            this.compress.bind(this),
            this.minifyJSON.bind(this)
        ];
    }
}