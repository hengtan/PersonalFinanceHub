// src/infrastructure/monitoring/performance.service.ts
import { CacheService } from '../cache/cache.service';
import { QueryOptimizerService } from '../database/postgres/query-optimizer.service';
import { logger } from './logger.service';

export interface PerformanceMetrics {
    cache: {
        hitRate: number;
        totalHits: number;
        totalMisses: number;
        totalOperations: number;
    };
    database: {
        averageQueryTime: number;
        slowQueryCount: number;
        totalQueries: number;
        connectionPoolStatus: any;
    };
    http: {
        averageResponseTime: number;
        requestsPerSecond: number;
        totalRequests: number;
        errorRate: number;
    };
    memory: {
        heapUsed: number;
        heapTotal: number;
        external: number;
        rss: number;
    };
    compression: {
        totalCompressed: number;
        compressionRatio: number;
        bandwidthSaved: number;
    };
}

export interface PerformanceAlert {
    type: 'warning' | 'critical';
    metric: string;
    threshold: number;
    currentValue: number;
    message: string;
    timestamp: Date;
}

export class PerformanceService {
    private static instance: PerformanceService;
    private cacheService: CacheService;
    private metrics: PerformanceMetrics;
    private alerts: PerformanceAlert[] = [];
    private httpMetrics = {
        requestCount: 0,
        totalResponseTime: 0,
        errorCount: 0,
        requestsPerSecond: 0,
        lastRequestTime: Date.now()
    };
    private compressionMetrics = {
        totalOriginalSize: 0,
        totalCompressedSize: 0,
        compressionCount: 0
    };

    private constructor() {
        this.cacheService = CacheService.getInstance();
        this.initializeMetrics();
        this.startPerformanceMonitoring();
    }

    static getInstance(): PerformanceService {
        if (!PerformanceService.instance) {
            PerformanceService.instance = new PerformanceService();
        }
        return PerformanceService.instance;
    }

    private initializeMetrics(): void {
        this.metrics = {
            cache: {
                hitRate: 0,
                totalHits: 0,
                totalMisses: 0,
                totalOperations: 0
            },
            database: {
                averageQueryTime: 0,
                slowQueryCount: 0,
                totalQueries: 0,
                connectionPoolStatus: {}
            },
            http: {
                averageResponseTime: 0,
                requestsPerSecond: 0,
                totalRequests: 0,
                errorRate: 0
            },
            memory: {
                heapUsed: 0,
                heapTotal: 0,
                external: 0,
                rss: 0
            },
            compression: {
                totalCompressed: 0,
                compressionRatio: 0,
                bandwidthSaved: 0
            }
        };
    }

    /**
     * Start periodic performance monitoring
     */
    private startPerformanceMonitoring(): void {
        // Update metrics every 30 seconds
        setInterval(() => {
            this.updateMetrics();
            this.checkPerformanceThresholds();
        }, 30000);

        // Generate performance reports every 5 minutes
        setInterval(() => {
            this.generatePerformanceReport();
        }, 300000);
    }

    /**
     * Update all performance metrics
     */
    private updateMetrics(): void {
        // Update cache metrics
        const cacheStats = this.cacheService.getStats();
        this.metrics.cache = {
            hitRate: cacheStats.hitRate,
            totalHits: cacheStats.hits,
            totalMisses: cacheStats.misses,
            totalOperations: cacheStats.hits + cacheStats.misses + cacheStats.sets + cacheStats.deletes
        };

        // Update memory metrics
        const memUsage = process.memoryUsage();
        this.metrics.memory = {
            heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
            heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
            external: Math.round(memUsage.external / 1024 / 1024), // MB
            rss: Math.round(memUsage.rss / 1024 / 1024) // MB
        };

        // Update HTTP metrics
        this.metrics.http = {
            averageResponseTime: this.httpMetrics.requestCount > 0 ? 
                this.httpMetrics.totalResponseTime / this.httpMetrics.requestCount : 0,
            requestsPerSecond: this.httpMetrics.requestsPerSecond,
            totalRequests: this.httpMetrics.requestCount,
            errorRate: this.httpMetrics.requestCount > 0 ? 
                (this.httpMetrics.errorCount / this.httpMetrics.requestCount) * 100 : 0
        };

        // Update compression metrics
        if (this.compressionMetrics.compressionCount > 0) {
            this.metrics.compression = {
                totalCompressed: this.compressionMetrics.compressionCount,
                compressionRatio: ((this.compressionMetrics.totalOriginalSize - this.compressionMetrics.totalCompressedSize) 
                    / this.compressionMetrics.totalOriginalSize) * 100,
                bandwidthSaved: this.compressionMetrics.totalOriginalSize - this.compressionMetrics.totalCompressedSize
            };
        }
    }

    /**
     * Check performance thresholds and generate alerts
     */
    private checkPerformanceThresholds(): void {
        const alerts: PerformanceAlert[] = [];

        // Cache hit rate threshold
        if (this.metrics.cache.hitRate < 70) {
            alerts.push({
                type: 'warning',
                metric: 'cache.hitRate',
                threshold: 70,
                currentValue: this.metrics.cache.hitRate,
                message: `Cache hit rate is low: ${this.metrics.cache.hitRate.toFixed(2)}%`,
                timestamp: new Date()
            });
        }

        // Memory usage threshold
        if (this.metrics.memory.heapUsed > 500) { // 500MB
            alerts.push({
                type: 'warning',
                metric: 'memory.heapUsed',
                threshold: 500,
                currentValue: this.metrics.memory.heapUsed,
                message: `High memory usage: ${this.metrics.memory.heapUsed}MB`,
                timestamp: new Date()
            });
        }

        // Response time threshold
        if (this.metrics.http.averageResponseTime > 1000) { // 1 second
            alerts.push({
                type: 'critical',
                metric: 'http.averageResponseTime',
                threshold: 1000,
                currentValue: this.metrics.http.averageResponseTime,
                message: `Slow response time: ${this.metrics.http.averageResponseTime.toFixed(2)}ms`,
                timestamp: new Date()
            });
        }

        // Error rate threshold
        if (this.metrics.http.errorRate > 5) { // 5%
            alerts.push({
                type: 'critical',
                metric: 'http.errorRate',
                threshold: 5,
                currentValue: this.metrics.http.errorRate,
                message: `High error rate: ${this.metrics.http.errorRate.toFixed(2)}%`,
                timestamp: new Date()
            });
        }

        // Store alerts and log them
        if (alerts.length > 0) {
            this.alerts.push(...alerts);
            this.alerts = this.alerts.slice(-100); // Keep last 100 alerts

            alerts.forEach(alert => {
                const logLevel = alert.type === 'critical' ? 'error' : 'warn';
                logger[logLevel]('Performance alert', alert);
            });
        }
    }

    /**
     * Generate performance report
     */
    private generatePerformanceReport(): void {
        const report = {
            timestamp: new Date(),
            metrics: this.metrics,
            recentAlerts: this.alerts.slice(-10),
            recommendations: this.generateRecommendations()
        };

        logger.info('Performance report generated', {
            cacheHitRate: this.metrics.cache.hitRate.toFixed(2) + '%',
            memoryUsage: this.metrics.memory.heapUsed + 'MB',
            avgResponseTime: this.metrics.http.averageResponseTime.toFixed(2) + 'ms',
            errorRate: this.metrics.http.errorRate.toFixed(2) + '%',
            alertCount: this.alerts.length
        });

        // Cache the report for dashboard display
        this.cacheService.set('performance:report:latest', report, 300); // 5 minutes
    }

    /**
     * Generate performance recommendations
     */
    private generateRecommendations(): string[] {
        const recommendations: string[] = [];

        // Cache recommendations
        if (this.metrics.cache.hitRate < 70) {
            recommendations.push('Consider increasing cache TTL or adding more caching strategies');
        }

        // Memory recommendations
        if (this.metrics.memory.heapUsed > 400) {
            recommendations.push('Monitor memory usage and consider implementing memory optimization strategies');
        }

        // Response time recommendations
        if (this.metrics.http.averageResponseTime > 500) {
            recommendations.push('Optimize database queries and consider adding more caching layers');
        }

        // Compression recommendations
        if (this.metrics.compression.compressionRatio < 30) {
            recommendations.push('Review compression settings and consider enabling Brotli compression');
        }

        return recommendations;
    }

    /**
     * Record HTTP request metrics
     */
    recordHttpRequest(responseTime: number, statusCode: number): void {
        this.httpMetrics.requestCount++;
        this.httpMetrics.totalResponseTime += responseTime;

        if (statusCode >= 400) {
            this.httpMetrics.errorCount++;
        }

        // Calculate requests per second (simple sliding window)
        const now = Date.now();
        const timeDiff = (now - this.httpMetrics.lastRequestTime) / 1000;
        if (timeDiff > 0) {
            this.httpMetrics.requestsPerSecond = 1 / timeDiff;
        }
        this.httpMetrics.lastRequestTime = now;
    }

    /**
     * Record compression metrics
     */
    recordCompression(originalSize: number, compressedSize: number): void {
        this.compressionMetrics.totalOriginalSize += originalSize;
        this.compressionMetrics.totalCompressedSize += compressedSize;
        this.compressionMetrics.compressionCount++;
    }

    /**
     * Get current metrics
     */
    getMetrics(): PerformanceMetrics {
        return { ...this.metrics };
    }

    /**
     * Get recent alerts
     */
    getAlerts(limit: number = 50): PerformanceAlert[] {
        return this.alerts.slice(-limit);
    }

    /**
     * Clear old alerts
     */
    clearAlerts(): void {
        this.alerts = [];
        logger.info('Performance alerts cleared');
    }

    /**
     * Get performance health score (0-100)
     */
    getHealthScore(): number {
        let score = 100;

        // Deduct points for poor performance
        if (this.metrics.cache.hitRate < 70) score -= 15;
        if (this.metrics.cache.hitRate < 50) score -= 10;

        if (this.metrics.http.averageResponseTime > 1000) score -= 20;
        if (this.metrics.http.averageResponseTime > 2000) score -= 15;

        if (this.metrics.http.errorRate > 5) score -= 25;
        if (this.metrics.http.errorRate > 10) score -= 15;

        if (this.metrics.memory.heapUsed > 500) score -= 10;
        if (this.metrics.memory.heapUsed > 750) score -= 10;

        return Math.max(0, score);
    }

    /**
     * Export metrics for external monitoring systems
     */
    exportMetrics(): any {
        return {
            timestamp: new Date().toISOString(),
            service: 'personal-finance-hub-backend',
            version: process.env.npm_package_version || '1.0.0',
            environment: process.env.NODE_ENV || 'development',
            metrics: this.metrics,
            healthScore: this.getHealthScore(),
            alerts: this.alerts.slice(-5) // Last 5 alerts
        };
    }
}