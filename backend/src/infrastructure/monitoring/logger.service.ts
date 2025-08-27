import pino, { Logger, LoggerOptions } from 'pino';
import { Transform } from 'stream';

export interface LogContext {
    requestId?: string;
    userId?: string;
    transactionId?: string;
    correlationId?: string;
    span?: string;
    [key: string]: any;
}

export interface LogMeta {
    timestamp?: string;
    level?: string;
    message?: string;
    context?: LogContext;
    error?: Error;
    stack?: string;
}

export enum LogLevel {
    TRACE = 'trace',
    DEBUG = 'debug',
    INFO = 'info',
    WARN = 'warn',
    ERROR = 'error',
    FATAL = 'fatal'
}

export class LoggerService {
    private static instance: LoggerService;
    private logger: Logger;
    private context: LogContext = {};

    private constructor() {
        this.logger = this.createLogger();
    }

    static getInstance(): LoggerService {
        if (!LoggerService.instance) {
            LoggerService.instance = new LoggerService();
        }
        return LoggerService.instance;
    }

    private createLogger(): Logger {
        const isDevelopment = process.env.NODE_ENV === 'development';
        const logLevel = process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info');

        const baseOptions: LoggerOptions = {
            level: logLevel,
            timestamp: pino.stdTimeFunctions.isoTime,
            formatters: {
                level: (label) => ({ level: label }),
                log: (object) => object
            }
        };

        if (isDevelopment) {
            // Para desenvolvimento, usar pretty print
            return pino({
                ...baseOptions,
                transport: {
                    target: 'pino-pretty',
                    options: {
                        colorize: true,
                        translateTime: 'HH:MM:ss Z',
                        ignore: 'pid,hostname'
                    }
                }
            });
        }

        // Para produção, usar formato JSON estruturado
        return pino({
            ...baseOptions,
            serializers: {
                error: pino.stdSerializers.err,
                request: pino.stdSerializers.req,
                response: pino.stdSerializers.res
            }
        });
    }

    setContext(context: LogContext): LoggerService {
        this.context = { ...this.context, ...context };
        return this;
    }

    clearContext(): LoggerService {
        this.context = {};
        return this;
    }

    private formatMessage(message: string, meta?: LogMeta): object {
        return {
            message,
            ...this.context,
            ...meta,
            timestamp: new Date().toISOString()
        };
    }

    trace(message: string, meta?: LogMeta): void {
        this.logger.trace(this.formatMessage(message, meta));
    }

    debug(message: string, meta?: LogMeta): void {
        this.logger.debug(this.formatMessage(message, meta));
    }

    verbose(message: string, meta?: LogMeta): void {
        this.logger.debug(this.formatMessage(message, meta)); // Using debug level for verbose
    }

    info(message: string, meta?: LogMeta): void {
        this.logger.info(this.formatMessage(message, meta));
    }

    warn(message: string, meta?: LogMeta): void {
        this.logger.warn(this.formatMessage(message, meta));
    }

    error(message: string, error?: Error, meta?: LogMeta): void {
        const errorMeta = error ? {
            error: {
                name: error.name,
                message: error.message,
                stack: error.stack
            }
        } : {};

        this.logger.error(this.formatMessage(message, { ...meta, ...errorMeta }));
    }

    fatal(message: string, error?: Error, meta?: LogMeta): void {
        const errorMeta = error ? {
            error: {
                name: error.name,
                message: error.message,
                stack: error.stack
            }
        } : {};

        this.logger.fatal(this.formatMessage(message, { ...meta, ...errorMeta }));
    }

    // Métodos para diferentes contextos de aplicação
    http(message: string, meta?: LogMeta): void {
        this.info(`[HTTP] ${message}`, meta);
    }

    database(message: string, meta?: LogMeta): void {
        this.debug(`[DATABASE] ${message}`, meta);
    }

    cache(message: string, meta?: LogMeta): void {
        this.debug(`[CACHE] ${message}`, meta);
    }

    event(message: string, meta?: LogMeta): void {
        this.info(`[EVENT] ${message}`, meta);
    }

    metrics(message: string, meta?: LogMeta): void {
        this.debug(`[METRICS] ${message}`, meta);
    }

    security(message: string, meta?: LogMeta): void {
        this.warn(`[SECURITY] ${message}`, meta);
    }

    performance(message: string, duration?: number, meta?: LogMeta): void {
        const perfMeta = duration ? { ...meta, duration: `${duration}ms` } : meta;
        this.info(`[PERFORMANCE] ${message}`, perfMeta);
    }

    // Método para criar child logger com contexto específico
    child(context: LogContext): LoggerService {
        const childLogger = LoggerService.getInstance();
        childLogger.context = { ...this.context, ...context };
        return childLogger;
    }

    // Stream personalizado para integração com outros serviços
    createStream(): Transform {
        return new Transform({
            objectMode: true,
            transform: (chunk: any, encoding: string, callback: Function) => {
                try {
                    this.logger.info(chunk);
                    callback();
                } catch (error) {
                    callback(error);
                }
            }
        });
    }

    // Método para structured logging
    structured(level: LogLevel, message: string, data: Record<string, any> = {}): void {
        const logData = {
            message,
            ...this.context,
            ...data,
            timestamp: new Date().toISOString()
        };

        this.logger[level](logData);
    }

    // Método para auditoria
    audit(action: string, resource: string, userId?: string, meta?: LogMeta): void {
        this.info(`[AUDIT] ${action} on ${resource}`, {
            ...meta,
            audit: {
                action,
                resource,
                userId: userId || this.context.userId,
                timestamp: new Date().toISOString()
            }
        });
    }

    // Método para transações
    transaction(transactionId: string, action: string, meta?: LogMeta): void {
        this.info(`[TRANSACTION] ${action}`, {
            ...meta,
            transactionId,
            transactionAction: action
        });
    }

    // Flush logs (útil para testes e shutdown graceful)
    async flush(): Promise<void> {
        return new Promise((resolve) => {
            this.logger.flush();
            // Pequeno delay para garantir que logs foram escritos
            setTimeout(resolve, 100);
        });
    }
}

// Singleton instance
export const logger = LoggerService.getInstance();

// Export da classe para casos onde precisamos de instâncias específicas
export { LoggerService };

// Tipos utilitários para TypeScript
export type { Logger } from 'pino';