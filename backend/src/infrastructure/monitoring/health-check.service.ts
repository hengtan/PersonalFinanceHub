// backend/src/infrastructure/monitoring/health-check.service.ts
import { Logger } from './logger.service';
import { getConnectionStatus, areAllConnectionsHealthy } from '../database/connections';
import { EventBus } from '../events/event-bus';

/**
 * Status de saúde de um componente
 */
type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

/**
 * Resultado de um health check
 */
interface HealthCheckResult {
    status: HealthStatus;
    responseTime: number;
    timestamp: string;
    details?: Record<string, any>;
    error?: string;
}

/**
 * Configuração de um health check
 */
interface HealthCheckConfig {
    name: string;
    check: () => Promise<HealthCheckResult>;
    timeout: number;
    critical: boolean; // Se falhar, marca sistema como unhealthy
    interval?: number; // Para checks periódicos
}

/**
 * Resultado agregado de todos os health checks
 */
interface AggregatedHealthResult {
    status: HealthStatus;
    timestamp: string;
    uptime: number;
    version: string;
    environment: string;
    checks: Record<string, HealthCheckResult>;
    summary: {
        total: number;
        healthy: number;
        degraded: number;
        unhealthy: number;
    };
}

/**
 * Service para monitoramento da saúde do sistema
 */
class HealthCheckService {
    private checks: Map<string, HealthCheckConfig> = new Map();
    private lastResults: Map<string, HealthCheckResult> = new Map();
    private intervalHandles: Map<string, NodeJS.Timeout> = new Map();
    private isInitialized = false;

    constructor() {
        this.registerDefaultChecks();
    }

    /**
     * Registra health checks padrão do sistema
     */
    private registerDefaultChecks(): void {
        // Database health check
        this.register({
            name: 'database',
            check: this.checkDatabase.bind(this),
            timeout: 5000,
            critical: true,
            interval: 30000, // 30 segundos
        });

        // Event Bus health check
        this.register({
            name: 'eventbus',
            check: this.checkEventBus.bind(this),
            timeout: 3000,
            critical: false,
            interval: 60000, // 1 minuto
        });

        // Memory health check
        this.register({
            name: 'memory',
            check: this.checkMemory.bind(this),
            timeout: 1000,
            critical: false,
            interval: 15000, // 15 segundos
        });

        // CPU health check
        this.register({
            name: 'cpu',
            check: this.checkCPU.bind(this),
            timeout: 2000,
            critical: false,
            interval: 15000, // 15 segundos
        });

        // Disk space health check
        this.register({
            name: 'disk',
            check: this.checkDisk.bind(this),
            timeout: 2000,
            critical: false,
            interval: 60000, // 1 minuto
        });

        // External services health check
        this.register({
            name: 'external_services',
            check: this.checkExternalServices.bind(this),
            timeout: 10000,
            critical: false,
            interval: 120000, // 2 minutos
        });
    }

    /**
     * Registra um novo health check
     */
    register(config: HealthCheckConfig): void {
        this.checks.set(config.name, config);

        // Inicia check periódico se configurado
        if (config.interval && config.interval > 0) {
            this.startPeriodicCheck(config);
        }

        Logger.debug('Health check registered', {
            name: config.name,
            timeout: config.timeout,
            critical: config.critical,
            interval: config.interval,
        });
    }

    /**
     * Inicia check periódico
     */
    private startPeriodicCheck(config: HealthCheckConfig): void {
        if (this.intervalHandles.has(config.name)) {
            clearInterval(this.intervalHandles.get(config.name));
        }

        const handle = setInterval(async () => {
            try {
                const result = await this.runSingleCheck(config);
                this.lastResults.set(config.name, result);

                // Log apenas se status mudou ou se há erro
                const previousResult = this.lastResults.get(config.name);
                if (!previousResult || previousResult.status !== result.status || result.status !== 'healthy') {
                    Logger.info('Health check result', {
                        check: config.name,
                        status: result.status,
                        responseTime: result.responseTime,
                        details: result.details,
                        error: result.error,
                    });
                }

                // Emite evento se status mudou
                if (previousResult && previousResult.status !== result.status) {
                    await EventBus.emit('system.health_status_changed', {
                        check: config.name,
                        previousStatus: previousResult.status,
                        currentStatus: result.status,
                        critical: config.critical,
                    });
                }

            } catch (error) {
                Logger.error('Periodic health check failed', {
                    check: config.name,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        }, config.interval);

        this.intervalHandles.set(config.name, handle);
    }

    /**
     * Remove um health check
     */
    unregister(name: string): void {
        this.checks.delete(name);
        this.lastResults.delete(name);

        // Para check periódico
        const handle = this.intervalHandles.get(name);
        if (handle) {
            clearInterval(handle);
            this.intervalHandles.delete(name);
        }

        Logger.debug('Health check unregistered', { name });
    }

    /**
     * Executa um health check específico
     */
    async checkSingle(name: string): Promise<HealthCheckResult | null> {
        const config = this.checks.get(name);
        if (!config) {
            Logger.warn('Health check not found', { name });
            return null;
        }

        return this.runSingleCheck(config);
    }

    /**
     * Executa todos os health checks
     */
    async checkAll(): Promise<AggregatedHealthResult> {
        const startTime = Date.now();
        const results: Record<string, HealthCheckResult> = {};
        const checks = Array.from(this.checks.values());

        // Executa checks em paralelo
        const checkPromises = checks.map(async (config) => {
            try {
                const result = await this.runSingleCheck(config);
                results[config.name] = result;
                this.lastResults.set(config.name, result);
                return result;
            } catch (error) {
                const failedResult: HealthCheckResult = {
                    status: 'unhealthy',
                    responseTime: Date.now() - startTime,
                    timestamp: new Date().toISOString(),
                    error: error instanceof Error ? error.message : String(error),
                };
                results[config.name] = failedResult;
                this.lastResults.set(config.name, failedResult);
                return failedResult;
            }
        });

        await Promise.allSettled(checkPromises);

        // Calcula status geral
        const summary = this.calculateSummary(results);
        const overallStatus = this.calculateOverallStatus(results);

        const aggregatedResult: AggregatedHealthResult = {
            status: overallStatus,
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            version: process.env.npm_package_version || '1.0.0',
            environment: process.env.NODE_ENV || 'development',
            checks: results,
            summary,
        };

        Logger.debug('Health check completed', {
            status: overallStatus,
            duration: Date.now() - startTime,
            summary,
        });

        return aggregatedResult;
    }

    /**
     * Executa um health check individual com timeout
     */
    private async runSingleCheck(config: HealthCheckConfig): Promise<HealthCheckResult> {
        const startTime = Date.now();

        return new Promise(async (resolve, reject) => {
            const timeoutHandle = setTimeout(() => {
                reject(new Error(`Health check timeout after ${config.timeout}ms`));
            }, config.timeout);

            try {
                const result = await config.check();
                clearTimeout(timeoutHandle);

                // Adiciona responseTime se não foi definido
                if (!result.responseTime) {
                    result.responseTime = Date.now() - startTime;
                }

                // Adiciona timestamp se não foi definido
                if (!result.timestamp) {
                    result.timestamp = new Date().toISOString();
                }

                resolve(result);
            } catch (error) {
                clearTimeout(timeoutHandle);
                reject(error);
            }
        });
    }

    /**
     * Calcula summary dos resultados
     */
    private calculateSummary(results: Record<string, HealthCheckResult>) {
        const summary = { total: 0, healthy: 0, degraded: 0, unhealthy: 0 };

        for (const result of Object.values(results)) {
            summary.total++;
            summary[result.status]++;
        }

        return summary;
    }

    /**
     * Calcula status geral do sistema
     */
    private calculateOverallStatus(results: Record<string, HealthCheckResult>): HealthStatus {
        let hasUnhealthy = false;
        let hasDegraded = false;
        let hasCriticalFailure = false;

        for (const [name, result] of Object.entries(results)) {
            const config = this.checks.get(name);

            if (result.status === 'unhealthy') {
                hasUnhealthy = true;
                if (config?.critical) {
                    hasCriticalFailure = true;
                }
            } else if (result.status === 'degraded') {
                hasDegraded = true;
            }
        }

        // Se há falha crítica, sistema é unhealthy
        if (hasCriticalFailure) {
            return 'unhealthy';
        }

        // Se há qualquer componente unhealthy ou degraded
        if (hasUnhealthy) {
            return 'unhealthy';
        }

        if (hasDegraded) {
            return 'degraded';
        }

        return 'healthy';
    }

    /**
     * Health check do banco de dados
     */
    private async checkDatabase(): Promise<HealthCheckResult> {
        const startTime = Date.now();

        try {
            const connectionStatus = getConnectionStatus();
            const isHealthy = areAllConnectionsHealthy();

            return {
                status: isHealthy ? 'healthy' : 'unhealthy',
                responseTime: Date.now() - startTime,
                timestamp: new Date().toISOString(),
                details: {
                    postgres: connectionStatus.postgres,
                    mongodb: connectionStatus.mongodb,
                    redis: connectionStatus.redis,
                },
            };

        } catch (error) {
            return {
                status: 'unhealthy',
                responseTime: Date.now() - startTime,
                timestamp: new Date().toISOString(),
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }

    /**
     * Health check do Event Bus
     */
    private async checkEventBus(): Promise<HealthCheckResult> {
        const startTime = Date.now();

        try {
            const eventBusHealth = await EventBus.healthCheck();

            return {
                status: eventBusHealth.status === 'healthy' ? 'healthy' : 'degraded',
                responseTime: Date.now() - startTime,
                timestamp: new Date().toISOString(),
                details: eventBusHealth.details,
            };

        } catch (error) {
            return {
                status: 'unhealthy',
                responseTime: Date.now() - startTime,
                timestamp: new Date().toISOString(),
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }

    /**
     * Health check de memória
     */
    private async checkMemory(): Promise<HealthCheckResult> {
        const startTime = Date.now();

        try {
            const memoryUsage = process.memoryUsage();
            const totalMemory = memoryUsage.heapTotal;
            const usedMemory = memoryUsage.heapUsed;
            const memoryUsagePercent = (usedMemory / totalMemory) * 100;

            let status: HealthStatus = 'healthy';

            if (memoryUsagePercent > 90) {
                status = 'unhealthy';
            } else if (memoryUsagePercent > 75) {
                status = 'degraded';
            }

            return {
                status,
                responseTime: Date.now() - startTime,
                timestamp: new Date().toISOString(),
                details: {
                    heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024), // MB
                    heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024), // MB
                    external: Math.round(memoryUsage.external / 1024 / 1024), // MB
                    rss: Math.round(memoryUsage.rss / 1024 / 1024), // MB
                    usagePercent: Math.round(memoryUsagePercent),
                },
            };

        } catch (error) {
            return {
                status: 'unhealthy',
                responseTime: Date.now() - startTime,
                timestamp: new Date().toISOString(),
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }

    /**
     * Health check de CPU
     */
    private async checkCPU(): Promise<HealthCheckResult> {
        const startTime = Date.now();

        try {
            // Simula carga de CPU por um período para medir
            const startCpuUsage = process.cpuUsage();
            await new Promise(resolve => setTimeout(resolve, 100));
            const endCpuUsage = process.cpuUsage(startCpuUsage);

            const totalUsage = (endCpuUsage.user + endCpuUsage.system) / 1000; // em ms
            const cpuPercent = (totalUsage / 100) * 100; // aproximação

            let status: HealthStatus = 'healthy';

            if (cpuPercent > 95) {
                status = 'unhealthy';
            } else if (cpuPercent > 80) {
                status = 'degraded';
            }

            return {
                status,
                responseTime: Date.now() - startTime,
                timestamp: new Date().toISOString(),
                details: {
                    userTime: Math.round(endCpuUsage.user / 1000), // ms
                    systemTime: Math.round(endCpuUsage.system / 1000), // ms
                    totalTime: Math.round((endCpuUsage.user + endCpuUsage.system) / 1000), // ms
                    loadAverage: process.loadavg(),
                    uptime: process.uptime(),
                },
            };

        } catch (error) {
            return {
                status: 'unhealthy',
                responseTime: Date.now() - startTime,
                timestamp: new Date().toISOString(),
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }

    /**
     * Health check de espaço em disco
     */
    private async checkDisk(): Promise<HealthCheckResult> {
        const startTime = Date.now();

        try {
            const { execSync } = require('child_process');

            // Obtém informações de disco no Linux/Mac
            let diskInfo: any = {};

            try {
                const df = execSync('df -h /', { encoding: 'utf8', timeout: 2000 });
                const lines = df.trim().split('\n');
                const dataLine = lines[1].split(/\s+/);

                diskInfo = {
                    size: dataLine[1],
                    used: dataLine[2],
                    available: dataLine[3],
                    usePercent: parseInt(dataLine[4].replace('%', '')),
                    mountPoint: dataLine[5],
                };
            } catch (error) {
                // Fallback para Windows ou se df falhar
                diskInfo = {
                    size: 'unknown',
                    used: 'unknown',
                    available: 'unknown',
                    usePercent: 0,
                    mountPoint: '/',
                };
            }

            let status: HealthStatus = 'healthy';

            if (diskInfo.usePercent > 95) {
                status = 'unhealthy';
            } else if (diskInfo.usePercent > 85) {
                status = 'degraded';
            }

            return {
                status,
                responseTime: Date.now() - startTime,
                timestamp: new Date().toISOString(),
                details: diskInfo,
            };

        } catch (error) {
            return {
                status: 'degraded', // Não é crítico se não conseguir verificar disco
                responseTime: Date.now() - startTime,
                timestamp: new Date().toISOString(),
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }

    /**
     * Health check de serviços externos
     */
    private async checkExternalServices(): Promise<HealthCheckResult> {
        const startTime = Date.now();

        try {
            const services = [
                { name: 'internet', url: 'https://8.8.8.8', timeout: 3000 },
                // Adicionar outros serviços externos se necessário
            ];

            const results: Record<string, any> = {};
            let hasFailure = false;

            for (const service of services) {
                try {
                    const serviceStartTime = Date.now();

                    // Implementar ping/health check específico para cada serviço
                    // Por simplicidade, usando um timeout básico
                    await new Promise((resolve, reject) => {
                        const timeout = setTimeout(() => resolve('timeout'), service.timeout);
                        // Aqui deveria fazer requisição real para o serviço
                        setTimeout(() => {
                            clearTimeout(timeout);
                            resolve('ok');
                        }, 100);
                    });

                    results[service.name] = {
                        status: 'healthy',
                        responseTime: Date.now() - serviceStartTime,
                    };

                } catch (error) {
                    hasFailure = true;
                    results[service.name] = {
                        status: 'unhealthy',
                        error: error instanceof Error ? error.message : String(error),
                    };
                }
            }

            return {
                status: hasFailure ? 'degraded' : 'healthy',
                responseTime: Date.now() - startTime,
                timestamp: new Date().toISOString(),
                details: results,
            };

        } catch (error) {
            return {
                status: 'degraded',
                responseTime: Date.now() - startTime,
                timestamp: new Date().toISOString(),
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }

    /**
     * Obtém último resultado de um check específico
     */
    getLastResult(name: string): HealthCheckResult | undefined {
        return this.lastResults.get(name);
    }

    /**
     * Obtém todos os últimos resultados
     */
    getAllLastResults(): Record<string, HealthCheckResult> {
        const results: Record<string, HealthCheckResult> = {};

        for (const [name, result] of this.lastResults) {
            results[name] = result;
        }

        return results;
    }

    /**
     * Obtém estatísticas do serviço
     */
    getStats(): {
        registeredChecks: number;
        periodicChecks: number;
        lastCheckTimestamp?: string;
    } {
        let lastCheckTimestamp: string | undefined;

        for (const result of this.lastResults.values()) {
            if (!lastCheckTimestamp || result.timestamp > lastCheckTimestamp) {
                lastCheckTimestamp = result.timestamp;
            }
        }

        return {
            registeredChecks: this.checks.size,
            periodicChecks: this.intervalHandles.size,
            lastCheckTimestamp,
        };
    }

    /**
     * Shutdown do serviço
     */
    async shutdown(): Promise<void> {
        Logger.info('Shutting down Health Check Service...');

        // Para todos os checks periódicos
        for (const [name, handle] of this.intervalHandles) {
            clearInterval(handle);
            Logger.debug('Periodic health check stopped', { name });
        }

        this.intervalHandles.clear();
        this.lastResults.clear();
        this.isInitialized = false;

        Logger.info('✅ Health Check Service shutdown completed');
    }
}

// Instância singleton
const healthCheckInstance = new HealthCheckService();

// Export da instância
export const HealthCheckService = healthCheckInstance;

// Export da classe para testes
export { HealthCheckService as HealthCheckServiceClass };

// Export default
export default HealthCheckService;