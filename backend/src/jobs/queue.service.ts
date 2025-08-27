// backend/src/jobs/queue.service.ts
import { logger } from '../infrastructure/monitoring/logger.service';
import { MetricsService } from '../infrastructure/monitoring/metrics.service';
import { CacheService } from '../infrastructure/database/connections';

/**
 * Tipos de jobs disponíveis no sistema
 */
export enum JobType {
    EMAIL_NOTIFICATION = 'email:notification',
    REPORT_GENERATION = 'report:generation',
    DATA_AGGREGATION = 'data:aggregation',
    BUDGET_CALCULATION = 'budget:calculation',
    TRANSACTION_PROCESSING = 'transaction:processing',
    USER_CLEANUP = 'user:cleanup',
    BACKUP_DATABASE = 'backup:database',
    SEND_REMINDERS = 'notifications:reminders',
    EXPORT_DATA = 'data:export',
    IMPORT_DATA = 'data:import',
    CACHE_WARMUP = 'cache:warmup',
    AUDIT_LOG_CLEANUP = 'audit:cleanup',
}

/**
 * Prioridades de jobs
 */
export enum JobPriority {
    LOW = 1,
    NORMAL = 5,
    HIGH = 10,
    URGENT = 20,
}

/**
 * Status de job
 */
export enum JobStatus {
    PENDING = 'pending',
    PROCESSING = 'processing',
    COMPLETED = 'completed',
    FAILED = 'failed',
    RETRYING = 'retrying',
    CANCELLED = 'cancelled',
}

/**
 * Interface para dados de job
 */
export interface JobData {
    [key: string]: any;
}

/**
 * Interface para configuração de job
 */
export interface JobConfig {
    attempts?: number;
    delay?: number;
    timeout?: number;
    removeOnComplete?: number;
    removeOnFail?: number;
    backoff?: {
        type: 'fixed' | 'exponential';
        delay: number;
    };
}

/**
 * Interface para job completo
 */
export interface Job {
    id: string;
    type: JobType;
    data: JobData;
    priority: JobPriority;
    status: JobStatus;
    attempts: number;
    maxAttempts: number;
    createdAt: Date;
    updatedAt: Date;
    processedAt?: Date;
    completedAt?: Date;
    failedAt?: Date;
    error?: string;
    result?: any;
    config: JobConfig;
}

/**
 * Interface para processador de jobs
 */
export interface JobProcessor<T = JobData> {
    process(data: T, job: Job): Promise<any>;
}

/**
 * Interface para estatísticas da fila
 */
interface QueueStats {
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    totalProcessed: number;
    avgProcessingTime: number;
    lastProcessedAt?: Date;
}

/**
 * Service para gerenciamento de filas de background jobs
 */
class QueueServiceClass {
    private processors: Map<JobType, JobProcessor> = new Map();
    private jobs: Map<string, Job> = new Map();
    private isProcessing = false;
    private processingInterval?: NodeJS.Timeout;
    private isInitialized = false;
    private concurrency = parseInt(process.env.QUEUE_CONCURRENCY || '5');
    private processingJobs = new Set<string>();

    constructor() {
        this.registerDefaultProcessors();
    }

    /**
     * Inicializa o service de filas
     */
    async initialize(): Promise<void> {
        try {
            await this.loadPendingJobs();
            this.startProcessing();
            this.isInitialized = true;

            logger.info('✅ Queue Service initialized', {
                concurrency: this.concurrency,
                registeredProcessors: this.processors.size,
                pendingJobs: this.getPendingJobsCount(),
            });

        } catch (error) {
            logger.error('❌ Failed to initialize Queue Service', {
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    }

    /**
     * Registra processadores padrão
     */
    private registerDefaultProcessors(): void {
        // Email notifications
        this.register(JobType.EMAIL_NOTIFICATION, {
            process: this.processEmailNotification.bind(this),
        });

        // Report generation
        this.register(JobType.REPORT_GENERATION, {
            process: this.processReportGeneration.bind(this),
        });

        // Data aggregation
        this.register(JobType.DATA_AGGREGATION, {
            process: this.processDataAggregation.bind(this),
        });

        // Budget calculations
        this.register(JobType.BUDGET_CALCULATION, {
            process: this.processBudgetCalculation.bind(this),
        });

        // Transaction processing
        this.register(JobType.TRANSACTION_PROCESSING, {
            process: this.processTransactionProcessing.bind(this),
        });

        // Cache warmup
        this.register(JobType.CACHE_WARMUP, {
            process: this.processCacheWarmup.bind(this),
        });

        // Cleanup jobs
        this.register(JobType.USER_CLEANUP, {
            process: this.processUserCleanup.bind(this),
        });

        this.register(JobType.AUDIT_LOG_CLEANUP, {
            process: this.processAuditLogCleanup.bind(this),
        });
    }

    /**
     * Registra um processador para um tipo de job
     */
    register<T = JobData>(jobType: JobType, processor: JobProcessor<T>): void {
        this.processors.set(jobType, processor);

        logger.debug('Job processor registered', {
            jobType,
            totalProcessors: this.processors.size,
        });
    }

    /**
     * Remove processador de um tipo de job
     */
    unregister(jobType: JobType): void {
        this.processors.delete(jobType);

        logger.debug('Job processor unregistered', {
            jobType,
            totalProcessors: this.processors.size,
        });
    }

    /**
     * Adiciona job à fila
     */
    async add<T = JobData>(
        type: JobType,
        data: T,
        options: {
            priority?: JobPriority;
            delay?: number;
            config?: JobConfig;
        } = {}
    ): Promise<string> {
        const jobId = this.generateJobId();
        const now = new Date();

        const job: Job = {
            id: jobId,
            type,
            data,
            priority: options.priority || JobPriority.NORMAL,
            status: JobStatus.PENDING,
            attempts: 0,
            maxAttempts: options.config?.attempts || 3,
            createdAt: now,
            updatedAt: now,
            config: {
                attempts: 3,
                delay: 0,
                timeout: 30000,
                removeOnComplete: 10,
                removeOnFail: 50,
                backoff: {
                    type: 'exponential',
                    delay: 1000,
                },
                ...options.config,
            },
        };

        // Adiciona delay se especificado
        if (options.delay && options.delay > 0) {
            setTimeout(() => {
                this.jobs.set(jobId, job);
                this.persistJob(job);
            }, options.delay);
        } else {
            this.jobs.set(jobId, job);
            await this.persistJob(job);
        }

        MetricsService.incrementCounter('jobs_added_total', {
            job_type: type,
            priority: options.priority?.toString() || 'normal',
        });

        logger.debug('Job added to queue', {
            jobId,
            type,
            priority: job.priority,
            delay: options.delay,
        });

        return jobId;
    }

    /**
     * Obtém job por ID
     */
    async getJob(jobId: string): Promise<Job | null> {
        let job = this.jobs.get(jobId);

        if (!job) {
            // Tenta carregar do cache/storage
            job = await this.loadJob(jobId);
        }

        return job || null;
    }

    /**
     * Lista jobs com filtros
     */
    getJobs(filter: {
        type?: JobType;
        status?: JobStatus;
        limit?: number;
    } = {}): Job[] {
        let jobs = Array.from(this.jobs.values());

        if (filter.type) {
            jobs = jobs.filter(job => job.type === filter.type);
        }

        if (filter.status) {
            jobs = jobs.filter(job => job.status === filter.status);
        }

        // Ordena por prioridade e data de criação
        jobs.sort((a, b) => {
            if (a.priority !== b.priority) {
                return b.priority - a.priority; // Maior prioridade primeiro
            }
            return a.createdAt.getTime() - b.createdAt.getTime(); // Mais antigo primeiro
        });

        if (filter.limit) {
            jobs = jobs.slice(0, filter.limit);
        }

        return jobs;
    }

    /**
     * Cancela job
     */
    async cancel(jobId: string): Promise<boolean> {
        const job = this.jobs.get(jobId);

        if (!job) {
            return false;
        }

        if (job.status === JobStatus.PROCESSING) {
            logger.warn('Attempting to cancel job that is currently processing', { jobId });
            return false;
        }

        job.status = JobStatus.CANCELLED;
        job.updatedAt = new Date();

        await this.persistJob(job);

        MetricsService.incrementCounter('jobs_cancelled_total', {
            job_type: job.type,
        });

        logger.info('Job cancelled', { jobId, type: job.type });

        return true;
    }

    /**
     * Remove job da fila
     */
    async remove(jobId: string): Promise<boolean> {
        const job = this.jobs.get(jobId);

        if (!job) {
            return false;
        }

        if (job.status === JobStatus.PROCESSING) {
            logger.warn('Cannot remove job that is currently processing', { jobId });
            return false;
        }

        this.jobs.delete(jobId);
        await this.deleteJob(jobId);

        logger.debug('Job removed from queue', { jobId, type: job.type });

        return true;
    }

    /**
     * Limpa jobs completados/falharam
     */
    async clean(options: {
        olderThan?: number; // em ms
        status?: JobStatus[];
        limit?: number;
    } = {}): Promise<number> {
        const olderThan = options.olderThan || 24 * 60 * 60 * 1000; // 24 horas
        const statusFilter = options.status || [JobStatus.COMPLETED, JobStatus.FAILED];
        const limit = options.limit || 100;
        const cutoffDate = new Date(Date.now() - olderThan);

        let cleaned = 0;
        const jobsToClean: string[] = [];

        for (const [jobId, job] of this.jobs) {
            if (statusFilter.includes(job.status) && job.updatedAt < cutoffDate) {
                jobsToClean.push(jobId);

                if (jobsToClean.length >= limit) {
                    break;
                }
            }
        }

        // Remove jobs
        for (const jobId of jobsToClean) {
            this.jobs.delete(jobId);
            await this.deleteJob(jobId);
            cleaned++;
        }

        if (cleaned > 0) {
            logger.info('Queue cleanup completed', {
                cleaned,
                olderThanHours: olderThan / (60 * 60 * 1000),
                statusFilter,
            });
        }

        return cleaned;
    }

    /**
     * Obtém estatísticas da fila
     */
    getStats(): QueueStats {
        const jobs = Array.from(this.jobs.values());
        const completedJobs = jobs.filter(j => j.status === JobStatus.COMPLETED);

        let avgProcessingTime = 0;
        let lastProcessedAt: Date | undefined;

        if (completedJobs.length > 0) {
            const processingTimes = completedJobs
                .filter(j => j.processedAt && j.completedAt)
                .map(j => j.completedAt!.getTime() - j.processedAt!.getTime());

            if (processingTimes.length > 0) {
                avgProcessingTime = processingTimes.reduce((sum, time) => sum + time, 0) / processingTimes.length;
            }

            lastProcessedAt = completedJobs
                .filter(j => j.completedAt)
                .sort((a, b) => b.completedAt!.getTime() - a.completedAt!.getTime())[0]?.completedAt;
        }

        return {
            pending: jobs.filter(j => j.status === JobStatus.PENDING).length,
            processing: jobs.filter(j => j.status === JobStatus.PROCESSING).length,
            completed: jobs.filter(j => j.status === JobStatus.COMPLETED).length,
            failed: jobs.filter(j => j.status === JobStatus.FAILED).length,
            totalProcessed: completedJobs.length + jobs.filter(j => j.status === JobStatus.FAILED).length,
            avgProcessingTime,
            lastProcessedAt,
        };
    }

    /**
     * Inicia o processamento de jobs
     */
    private startProcessing(): void {
        if (this.isProcessing) {
            return;
        }

        this.isProcessing = true;

        this.processingInterval = setInterval(async () => {
            await this.processJobs();
        }, 1000); // Verifica jobs a cada segundo

        logger.info('Job processing started', { concurrency: this.concurrency });
    }

    /**
     * Para o processamento de jobs
     */
    private stopProcessing(): void {
        if (this.processingInterval) {
            clearInterval(this.processingInterval);
            this.processingInterval = undefined;
        }

        this.isProcessing = false;
        logger.info('Job processing stopped');
    }

    /**
     * Processa jobs pendentes
     */
    private async processJobs(): Promise<void> {
        if (this.processingJobs.size >= this.concurrency) {
            return; // Já processando o máximo de jobs em paralelo
        }

        const pendingJobs = this.getJobs({
            status: JobStatus.PENDING,
            limit: this.concurrency - this.processingJobs.size,
        });

        const promises = pendingJobs.map(job => this.processJob(job));
        await Promise.allSettled(promises);
    }

    /**
     * Processa um job específico
     */
    private async processJob(job: Job): Promise<void> {
        if (this.processingJobs.has(job.id)) {
            return; // Job já está sendo processado
        }

        const processor = this.processors.get(job.type);
        if (!processor) {
            logger.error('No processor found for job type', {
                jobId: job.id,
                type: job.type,
            });

            job.status = JobStatus.FAILED;
            job.error = `No processor found for job type: ${job.type}`;
            job.failedAt = new Date();
            job.updatedAt = new Date();

            await this.persistJob(job);
            return;
        }

        this.processingJobs.add(job.id);

        const startTime = Date.now();

        try {
            job.status = JobStatus.PROCESSING;
            job.processedAt = new Date();
            job.updatedAt = new Date();
            job.attempts++;

            logger.debug('Processing job', {
                jobId: job.id,
                type: job.type,
                attempt: job.attempts,
            });

            // Timeout do job
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Job timeout')), job.config.timeout || 30000);
            });

            const processingPromise = processor.process(job.data, job);

            const result = await Promise.race([processingPromise, timeoutPromise]);

            // Job completado com sucesso
            job.status = JobStatus.COMPLETED;
            job.completedAt = new Date();
            job.updatedAt = new Date();
            job.result = result;

            const duration = Date.now() - startTime;

            MetricsService.recordHistogram('job_duration_ms', duration, {
                job_type: job.type,
                status: 'completed',
            });

            MetricsService.incrementCounter('jobs_processed_total', {
                job_type: job.type,
                status: 'completed',
            });

            logger.info('Job completed successfully', {
                jobId: job.id,
                type: job.type,
                duration,
                attempts: job.attempts,
            });

            // Remove job se configurado
            if (job.config.removeOnComplete && job.config.removeOnComplete > 0) {
                setTimeout(() => this.remove(job.id), job.config.removeOnComplete * 1000);
            }

        } catch (error) {
            const duration = Date.now() - startTime;
            const errorMessage = error instanceof Error ? error.message : String(error);

            job.error = errorMessage;
            job.updatedAt = new Date();

            // Verifica se deve tentar novamente
            if (job.attempts < job.maxAttempts) {
                job.status = JobStatus.RETRYING;

                // Calcula delay para retry
                let retryDelay = job.config.backoff?.delay || 1000;
                if (job.config.backoff?.type === 'exponential') {
                    retryDelay = retryDelay * Math.pow(2, job.attempts - 1);
                }

                // Reagenda job
                setTimeout(() => {
                    job.status = JobStatus.PENDING;
                    job.updatedAt = new Date();
                    this.persistJob(job);
                }, retryDelay);

                logger.warn('Job failed, retrying', {
                    jobId: job.id,
                    type: job.type,
                    attempt: job.attempts,
                    maxAttempts: job.maxAttempts,
                    retryDelay,
                    error: errorMessage,
                });

            } else {
                // Job falharam definitivamente
                job.status = JobStatus.FAILED;
                job.failedAt = new Date();

                logger.error('Job failed permanently', {
                    jobId: job.id,
                    type: job.type,
                    attempts: job.attempts,
                    duration,
                    error: errorMessage,
                });

                // Remove job se configurado
                if (job.config.removeOnFail && job.config.removeOnFail > 0) {
                    setTimeout(() => this.remove(job.id), job.config.removeOnFail * 1000);
                }
            }

            MetricsService.recordHistogram('job_duration_ms', duration, {
                job_type: job.type,
                status: 'failed',
            });

            MetricsService.incrementCounter('jobs_processed_total', {
                job_type: job.type,
                status: 'failed',
            });
        } finally {
            this.processingJobs.delete(job.id);
            await this.persistJob(job);
        }
    }

    // Processadores padrão de jobs

    private async processEmailNotification(data: any): Promise<void> {
        // Mock implementation - em produção integraria com SendGrid, AWS SES, etc.
        logger.info('Processing email notification', {
            to: data.to,
            subject: data.subject,
            template: data.template,
        });

        // Simula envio de email
        await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));

        if (Math.random() < 0.05) { // 5% chance de falha
            throw new Error('Failed to send email');
        }
    }

    private async processReportGeneration(data: any): Promise<string> {
        logger.info('Processing report generation', {
            userId: data.userId,
            reportType: data.reportType,
            period: data.period,
        });

        // Simula geração de relatório
        await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 3000));

        return `report_${data.userId}_${Date.now()}.pdf`;
    }

    private async processDataAggregation(data: any): Promise<void> {
        logger.info('Processing data aggregation', {
            userId: data.userId,
            aggregationType: data.aggregationType,
        });

        // Simula agregação de dados
        await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));
    }

    private async processBudgetCalculation(data: any): Promise<void> {
        logger.info('Processing budget calculation', {
            userId: data.userId,
            budgetId: data.budgetId,
        });

        // Simula cálculo de orçamento
        await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 1000));
    }

    private async processTransactionProcessing(data: any): Promise<void> {
        logger.info('Processing transaction', {
            transactionId: data.transactionId,
            type: data.type,
        });

        // Simula processamento de transação
        await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 300));
    }

    private async processCacheWarmup(data: any): Promise<void> {
        logger.info('Processing cache warmup', {
            cacheKeys: data.keys?.length || 0,
        });

        // Implementa warmup de cache
        if (data.keys && Array.isArray(data.keys)) {
            for (const key of data.keys) {
                await CacheService.get(key); // Força carregamento
            }
        }
    }

    private async processUserCleanup(data: any): Promise<number> {
        logger.info('Processing user cleanup', {
            olderThan: data.olderThan,
            dryRun: data.dryRun,
        });

        // Mock implementation para limpeza de usuários inativos
        await new Promise(resolve => setTimeout(resolve, 1000));

        return Math.floor(Math.random() * 10); // Simula quantidade de usuários limpos
    }

    private async processAuditLogCleanup(data: any): Promise<number> {
        logger.info('Processing audit log cleanup', {
            olderThan: data.olderThan,
        });

        // Mock implementation para limpeza de logs de auditoria
        await new Promise(resolve => setTimeout(resolve, 500));

        return Math.floor(Math.random() * 1000); // Simula quantidade de logs limpos
    }

    // Métodos auxiliares privados

    private generateJobId(): string {
        return `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    private getPendingJobsCount(): number {
        return Array.from(this.jobs.values()).filter(j => j.status === JobStatus.PENDING).length;
    }

    private async persistJob(job: Job): Promise<void> {
        // Em produção, salvaria no banco de dados ou Redis
        // Por simplicidade, usando cache Redis aqui
        await CacheService.set(`job:${job.id}`, job, 86400); // 24 horas
    }

    private async loadJob(jobId: string): Promise<Job | null> {
        return await CacheService.get(`job:${jobId}`);
    }

    private async deleteJob(jobId: string): Promise<void> {
        await CacheService.del(`job:${jobId}`);
    }

    private async loadPendingJobs(): Promise<void> {
        // Em produção, carregaria jobs pendentes do banco
        // Por simplicidade, não implementado
        logger.debug('Loading pending jobs from storage');
    }

    /**
     * Health check do queue service
     */
    async healthCheck(): Promise<{ status: 'healthy' | 'unhealthy'; details: Record<string, any> }> {
        const stats = this.getStats();
        const isHealthy = this.isInitialized && this.isProcessing;

        return {
            status: isHealthy ? 'healthy' : 'unhealthy',
            details: {
                initialized: this.isInitialized,
                processing: this.isProcessing,
                concurrency: this.concurrency,
                registeredProcessors: this.processors.size,
                stats,
            },
        };
    }

    /**
     * Shutdown graceful do queue service
     */
    async shutdown(): Promise<void> {
        logger.info('Shutting down Queue Service...');

        this.stopProcessing();

        // Aguarda jobs em processamento terminarem
        let attempts = 0;
        while (this.processingJobs.size > 0 && attempts < 30) { // Max 30 segundos
            logger.info(`Waiting for ${this.processingJobs.size} jobs to complete...`);
            await new Promise(resolve => setTimeout(resolve, 1000));
            attempts++;
        }

        if (this.processingJobs.size > 0) {
            logger.warn('Some jobs are still processing during shutdown', {
                count: this.processingJobs.size,
            });
        }

        this.jobs.clear();
        this.processors.clear();
        this.isInitialized = false;

        logger.info('✅ Queue Service shutdown completed');
    }
}

// Instância singleton
const queueServiceInstance = new QueueServiceClass();

// Export da instância
export const QueueService = queueServiceInstance;

// Export da classe para testes
export { QueueServiceClass };

// Export default
export default QueueService;