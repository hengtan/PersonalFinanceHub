import promClient from 'prom-client';
import { logger } from './logger.service';
import { EventEmitter } from 'events';

export interface MetricConfig {
    name: string;
    help: string;
    labels?: string[];
}

export interface HistogramConfig extends MetricConfig {
    buckets?: number[];
}

export interface CounterConfig extends MetricConfig {}

export interface GaugeConfig extends MetricConfig {}

export interface SummaryConfig extends MetricConfig {
    percentiles?: number[];
    maxAgeSeconds?: number;
    ageBuckets?: number;
}

export interface MetricsData {
    timestamp: number;
    metrics: Record<string, number>;
}

class MetricsServiceClass extends EventEmitter {
    private registry: promClient.Registry;
    private counters: Map<string, promClient.Counter> = new Map();
    private gauges: Map<string, promClient.Gauge> = new Map();
    private histograms: Map<string, promClient.Histogram> = new Map();
    private summaries: Map<string, promClient.Summary> = new Map();
    private customMetrics: Map<string, number> = new Map();
    private startTime: number;

    constructor() {
        super();

        this.startTime = Date.now();
        this.registry = new promClient.Registry();

        // Configurar coleta padrão de métricas do Node.js
        promClient.collectDefaultMetrics({
            register: this.registry,
            prefix: 'pfh_nodejs_'
        });

        this.initializeDefaultMetrics();
    }

    private initializeDefaultMetrics(): void {
        try {
            // HTTP Request Metrics
            this.registerHistogram({
                name: 'http_request_duration_seconds',
                help: 'Duration of HTTP requests in seconds',
                labels: ['method', 'route', 'status_code'],
                buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
            });

            this.registerCounter({
                name: 'http_requests_total',
                help: 'Total number of HTTP requests',
                labels: ['method', 'route', 'status_code']
            });

            // Database Metrics
            this.registerHistogram({
                name: 'database_query_duration_seconds',
                help: 'Duration of database queries in seconds',
                labels: ['operation', 'table', 'database'],
                buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5]
            });

            this.registerCounter({
                name: 'database_queries_total',
                help: 'Total number of database queries',
                labels: ['operation', 'table', 'database', 'status']
            });

            // Cache Metrics
            this.registerCounter({
                name: 'cache_operations_total',
                help: 'Total cache operations',
                labels: ['operation', 'cache_name', 'result']
            });

            this.registerGauge({
                name: 'cache_size_bytes',
                help: 'Current cache size in bytes',
                labels: ['cache_name']
            });

            // Event System Metrics
            this.registerCounter({
                name: 'events_published_total',
                help: 'Total events published',
                labels: ['event_type', 'source']
            });

            this.registerCounter({
                name: 'events_processed_total',
                help: 'Total events processed',
                labels: ['event_type', 'handler', 'status']
            });

            // Business Metrics
            this.registerCounter({
                name: 'transactions_total',
                help: 'Total financial transactions',
                labels: ['type', 'status', 'user_id']
            });

            this.registerGauge({
                name: 'active_users_total',
                help: 'Current number of active users',
                labels: ['session_type']
            });

            // System Health Metrics
            this.registerGauge({
                name: 'system_uptime_seconds',
                help: 'System uptime in seconds'
            });

            // Event Bus (compat com código legado)
            this.registerCounter({
                name: 'events_emitted_total',
                help: 'Total events emitted',
                labels: ['event']
            });

            this.registerCounter({
                name: 'events_handled_total',
                help: 'Total events handled',
                labels: ['event', 'status']
            });

            logger.info('Default metrics initialized successfully');

        } catch (error) {
            logger.error('Failed to initialize default metrics', error);
            throw error;
        }
    }

    registerCounter(config: CounterConfig): promClient.Counter {
        try {
            if (this.counters.has(config.name)) {
                return this.counters.get(config.name)!;
            }

            const counter = new promClient.Counter({
                name: `pfh_${config.name}`,
                help: config.help,
                labelNames: config.labels || [],
                registers: [this.registry]
            });

            this.counters.set(config.name, counter);
            logger.debug(`Counter metric registered: ${config.name}`);

            return counter;

        } catch (error) {
            logger.error(`Failed to register counter metric: ${config.name}`, error);
            throw error;
        }
    }

    registerGauge(config: GaugeConfig): promClient.Gauge {
        try {
            if (this.gauges.has(config.name)) {
                return this.gauges.get(config.name)!;
            }

            const gauge = new promClient.Gauge({
                name: `pfh_${config.name}`,
                help: config.help,
                labelNames: config.labels || [],
                registers: [this.registry]
            });

            this.gauges.set(config.name, gauge);
            logger.debug(`Gauge metric registered: ${config.name}`);

            return gauge;

        } catch (error) {
            logger.error(`Failed to register gauge metric: ${config.name}`, error);
            throw error;
        }
    }

    registerHistogram(config: HistogramConfig): promClient.Histogram {
        try {
            if (this.histograms.has(config.name)) {
                return this.histograms.get(config.name)!;
            }

            const histogram = new promClient.Histogram({
                name: `pfh_${config.name}`,
                help: config.help,
                labelNames: config.labels || [],
                buckets: config.buckets || promClient.exponentialBuckets(0.001, 2, 15),
                registers: [this.registry]
            });

            this.histograms.set(config.name, histogram);
            logger.debug(`Histogram metric registered: ${config.name}`);

            return histogram;

        } catch (error) {
            logger.error(`Failed to register histogram metric: ${config.name}`, error);
            throw error;
        }
    }

    registerSummary(config: SummaryConfig): promClient.Summary {
        try {
            if (this.summaries.has(config.name)) {
                return this.summaries.get(config.name)!;
            }

            const summary = new promClient.Summary({
                name: `pfh_${config.name}`,
                help: config.help,
                labelNames: config.labels || [],
                percentiles: config.percentiles || [0.5, 0.9, 0.95, 0.99],
                maxAgeSeconds: config.maxAgeSeconds || 600,
                ageBuckets: config.ageBuckets || 5,
                registers: [this.registry]
            });

            this.summaries.set(config.name, summary);
            logger.debug(`Summary metric registered: ${config.name}`);

            return summary;

        } catch (error) {
            logger.error(`Failed to register summary metric: ${config.name}`, error);
            throw error;
        }
    }

    // Counter operations
    incrementCounter(name: string, labels?: Record<string, string>, value: number = 1): void {
        try {
            const counter = this.counters.get(name);
            if (!counter) {
                logger.warn(`Counter not found: ${name}`);
                return;
            }

            if (labels) {
                counter.labels(labels).inc(value);
            } else {
                counter.inc(value);
            }

        } catch (error) {
            logger.error(`Failed to increment counter: ${name}`, error);
        }
    }

    // Gauge operations
    setGauge(name: string, value: number, labels?: Record<string, string>): void {
        try {
            const gauge = this.gauges.get(name);
            if (!gauge) {
                logger.warn(`Gauge not found: ${name}`);
                return;
            }

            if (labels) {
                gauge.labels(labels).set(value);
            } else {
                gauge.set(value);
            }

        } catch (error) {
            logger.error(`Failed to set gauge: ${name}`, error);
        }
    }

    incrementGauge(name: string, labels?: Record<string, string>, value: number = 1): void {
        try {
            const gauge = this.gauges.get(name);
            if (!gauge) {
                logger.warn(`Gauge not found: ${name}`);
                return;
            }

            if (labels) {
                gauge.labels(labels).inc(value);
            } else {
                gauge.inc(value);
            }

        } catch (error) {
            logger.error(`Failed to increment gauge: ${name}`, error);
        }
    }

    decrementGauge(name: string, labels?: Record<string, string>, value: number = 1): void {
        try {
            const gauge = this.gauges.get(name);
            if (!gauge) {
                logger.warn(`Gauge not found: ${name}`);
                return;
            }

            if (labels) {
                gauge.labels(labels).dec(value);
            } else {
                gauge.dec(value);
            }

        } catch (error) {
            logger.error(`Failed to decrement gauge: ${name}`, error);
        }
    }

    // Histogram operations
    observeHistogram(name: string, value: number, labels?: Record<string, string>): void {
        try {
            const histogram = this.histograms.get(name);
            if (!histogram) {
                logger.warn(`Histogram not found: ${name}`);
                return;
            }

            if (labels) {
                histogram.labels(labels).observe(value);
            } else {
                histogram.observe(value);
            }

        } catch (error) {
            logger.error(`Failed to observe histogram: ${name}`, error);
        }
    }

    // Summary operations
    observeSummary(name: string, value: number, labels?: Record<string, string>): void {
        try {
            const summary = this.summaries.get(name);
            if (!summary) {
                logger.warn(`Summary not found: ${name}`);
                return;
            }

            if (labels) {
                summary.labels(labels).observe(value);
            } else {
                summary.observe(value);
            }

        } catch (error) {
            logger.error(`Failed to observe summary: ${name}`, error);
        }
    }

    // Timer utilities
    startTimer(name: string, labels?: Record<string, string>): () => void {
        const start = Date.now();

        return () => {
            const duration = (Date.now() - start) / 1000;
            this.observeHistogram(name, duration, labels);
        };
    }

    // Custom metrics
    setCustomMetric(name: string, value: number): void {
        this.customMetrics.set(name, value);
        this.emit('customMetric', { name, value });
    }

    getCustomMetric(name: string): number | undefined {
        return this.customMetrics.get(name);
    }

    // HTTP specific helpers
    recordHttpRequest(method: string, route: string, statusCode: number, duration: number): void {
        this.incrementCounter('http_requests_total', {
            method: method.toUpperCase(),
            route,
            status_code: statusCode.toString()
        });

        this.observeHistogram('http_request_duration_seconds', duration / 1000, {
            method: method.toUpperCase(),
            route,
            status_code: statusCode.toString()
        });
    }

    // Database specific helpers
    recordDatabaseQuery(operation: string, table: string, database: string, duration: number, success: boolean): void {
        this.incrementCounter('database_queries_total', {
            operation: operation.toUpperCase(),
            table,
            database,
            status: success ? 'success' : 'error'
        });

        this.observeHistogram('database_query_duration_seconds', duration / 1000, {
            operation: operation.toUpperCase(),
            table,
            database
        });
    }

    // Cache specific helpers
    recordCacheOperation(operation: 'hit' | 'miss' | 'set' | 'delete', cacheName: string): void {
        this.incrementCounter('cache_operations_total', {
            operation,
            cache_name: cacheName,
            result: operation === 'hit' ? 'hit' : operation === 'miss' ? 'miss' : 'success'
        });
    }

    // Event specific helpers
    recordEventPublished(eventType: string, source: string): void {
        this.incrementCounter('events_published_total', {
            event_type: eventType,
            source
        });
    }

    recordEventProcessed(eventType: string, handler: string, success: boolean): void {
        this.incrementCounter('events_processed_total', {
            event_type: eventType,
            handler,
            status: success ? 'success' : 'error'
        });
    }

    // Business specific helpers
    recordTransaction(type: string, status: string, userId: string): void {
        this.incrementCounter('transactions_total', {
            type,
            status,
            user_id: userId
        });
    }

    updateActiveUsers(count: number, sessionType: string = 'web'): void {
        this.setGauge('active_users_total', count, {
            session_type: sessionType
        });
    }

    // coloque dentro da classe MetricsServiceClass
    recordHistogram(name: string, value: number, labels?: Record<string, string>): void {
        const seconds = value > 10 ? value / 1000 : value; // se vier em ms, converte
        this.observeHistogram(name, seconds, labels);
    }

    // System health
    updateSystemUptime(): void {
        const uptime = (Date.now() - this.startTime) / 1000;
        this.setGauge('system_uptime_seconds', uptime);
    }

    // Get all metrics for Prometheus exposition
    async getMetrics(): Promise<string> {
        try {
            this.updateSystemUptime();
            return await this.registry.metrics();
        } catch (error) {
            logger.error('Failed to get metrics', error);
            throw error;
        }
    }

    // Get metrics in JSON format
    async getMetricsJSON(): Promise<promClient.MetricObject[]> {
        try {
            return await this.registry.getMetricsAsJSON();
        } catch (error) {
            logger.error('Failed to get metrics as JSON', error);
            throw error;
        }
    }

    // Clear all metrics (útil para testes)
    clear(): void {
        this.registry.clear();
        this.counters.clear();
        this.gauges.clear();
        this.histograms.clear();
        this.summaries.clear();
        this.customMetrics.clear();
    }

    // Health check
    isHealthy(): boolean {
        try {
            // Verificar se o registry está funcionando
            this.registry.metrics();
            return true;
        } catch {
            return false;
        }
    }

    // Graceful shutdown
    async shutdown(): Promise<void> {
        try {
            logger.info('Shutting down metrics service...');
            this.clear();
            this.removeAllListeners();
            logger.info('Metrics service shutdown completed');
        } catch (error) {
            logger.error('Error during metrics service shutdown', error);
        }
    }
}

// Singleton instance
export const MetricsService = new MetricsServiceClass();

// Export da classe para casos específicos
export { MetricsServiceClass };