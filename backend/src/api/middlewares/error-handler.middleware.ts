// backend/src/api/middlewares/error-handler.middleware.ts
import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { ERROR_CODES, ERROR_MESSAGES, HTTP_STATUS_MAP } from '../../shared/constants/error-codes';
import { Logger } from 'pino';
import { MetricsService } from '../../infrastructure/monitoring/metrics.service';

/**
 * Classe customizada para erros da aplicação
 */
export class AppError extends Error {
    public readonly statusCode: number;
    public readonly errorCode: string;
    public readonly isOperational: boolean;
    public readonly timestamp: string;
    public readonly correlationId?: string;

    constructor(
        message: string,
        statusCode: number = 500,
        errorCode: string = ERROR_CODES.INTERNAL_SERVER_ERROR,
        isOperational: boolean = true
    ) {
        super(message);

        this.name = this.constructor.name;
        this.statusCode = statusCode;
        this.errorCode = errorCode;
        this.isOperational = isOperational;
        this.timestamp = new Date().toISOString();

        // Captura o stack trace excluindo o construtor
        Error.captureStackTrace(this, this.constructor);
    }

    /**
     * Cria AppError com código de erro predefinido
     */
    static fromErrorCode(errorCode: keyof typeof ERROR_CODES, customMessage?: string) {
        const code = ERROR_CODES[errorCode];
        const message = customMessage || ERROR_MESSAGES[code];
        const statusCode = HTTP_STATUS_MAP[code] || 500;

        return new AppError(message, statusCode, code);
    }

    /**
     * Converte para formato JSON para resposta da API
     */
    toJSON() {
        return {
            success: false,
            error: {
                code: this.errorCode,
                message: this.message,
                timestamp: this.timestamp,
                ...(this.correlationId && { correlationId: this.correlationId }),
            },
        };
    }
}

/**
 * Classe para erros de validação
 */
export class ValidationError extends AppError {
    public readonly validationErrors: Record<string, string[]>;

    constructor(
        message: string = 'Validation failed',
        validationErrors: Record<string, string[]> = {},
        correlationId?: string
    ) {
        super(message, 400, ERROR_CODES.VALIDATION_ERROR);
        this.validationErrors = validationErrors;
        this.correlationId = correlationId;
    }

    toJSON() {
        return {
            success: false,
            error: {
                code: this.errorCode,
                message: this.message,
                timestamp: this.timestamp,
                validationErrors: this.validationErrors,
                ...(this.correlationId && { correlationId: this.correlationId }),
            },
        };
    }
}

/**
 * Classe para erros de rate limiting
 */
export class RateLimitError extends AppError {
    public readonly retryAfter: number;

    constructor(message: string = 'Rate limit exceeded', retryAfter: number = 60) {
        super(message, 429, ERROR_CODES.RATE_LIMIT_EXCEEDED);
        this.retryAfter = retryAfter;
    }

    toJSON() {
        return {
            success: false,
            error: {
                code: this.errorCode,
                message: this.message,
                timestamp: this.timestamp,
                retryAfter: this.retryAfter,
            },
        };
    }
}

/**
 * Middleware principal de tratamento de erros
 */
export class ErrorHandler {
    /**
     * Middleware de tratamento global de erros
     */
    static handle = (error: Error, req: Request, res: Response, next: NextFunction): void => {
        const correlationId = req.correlationId || 'unknown';

        // Incrementa métrica de erro
        MetricsService.incrementCounter('http_errors_total', {
            method: req.method,
            endpoint: req.route?.path || req.path,
            error_type: error.constructor.name,
        });

        // Log do erro
        ErrorHandler.logError(error, req, correlationId);

        // Trata diferentes tipos de erro
        if (error instanceof AppError) {
            ErrorHandler.handleAppError(error, req, res);
        } else if (error instanceof ZodError) {
            ErrorHandler.handleZodError(error, req, res, correlationId);
        } else if (ErrorHandler.isDatabaseError(error)) {
            ErrorHandler.handleDatabaseError(error, req, res, correlationId);
        } else if (ErrorHandler.isJWTError(error)) {
            ErrorHandler.handleJWTError(error, req, res, correlationId);
        } else {
            ErrorHandler.handleUnknownError(error, req, res, correlationId);
        }
    };

    /**
     * Middleware para captura de erros assíncronos
     */
    static asyncHandler = (fn: Function) => {
        return (req: Request, res: Response, next: NextFunction) => {
            Promise.resolve(fn(req, res, next)).catch(next);
        };
    };

    /**
     * Trata erros da aplicação (AppError)
     */
    private static handleAppError(error: AppError, req: Request, res: Response): void {
        error.correlationId = req.correlationId;

        // Headers especiais para alguns tipos de erro
        if (error instanceof RateLimitError) {
            res.set('Retry-After', error.retryAfter.toString());
        }

        res.status(error.statusCode).json(error.toJSON());
    }

    /**
     * Trata erros de validação Zod
     */
    private static handleZodError(
        error: ZodError,
        req: Request,
        res: Response,
        correlationId: string
    ): void {
        const validationErrors: Record<string, string[]> = {};

        error.errors.forEach((err) => {
            const path = err.path.join('.');
            if (!validationErrors[path]) {
                validationErrors[path] = [];
            }
            validationErrors[path].push(err.message);
        });

        const validationError = new ValidationError(
            'Request validation failed',
            validationErrors,
            correlationId
        );

        res.status(400).json(validationError.toJSON());
    }

    /**
     * Trata erros de banco de dados
     */
    private static handleDatabaseError(
        error: any,
        req: Request,
        res: Response,
        correlationId: string
    ): void {
        let appError: AppError;

        // PostgreSQL errors
        if (error.code === '23505') { // Unique constraint violation
            appError = new AppError(
                'Resource already exists',
                409,
                ERROR_CODES.CONSTRAINT_VIOLATION
            );
        } else if (error.code === '23503') { // Foreign key violation
            appError = new AppError(
                'Referenced resource not found',
                400,
                ERROR_CODES.CONSTRAINT_VIOLATION
            );
        } else if (error.code === '23514') { // Check constraint violation
            appError = new AppError(
                'Invalid data format',
                400,
                ERROR_CODES.CONSTRAINT_VIOLATION
            );
        } else if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
            appError = new AppError(
                'Database connection failed',
                503,
                ERROR_CODES.CONNECTION_FAILED
            );
        } else {
            appError = new AppError(
                'Database operation failed',
                500,
                ERROR_CODES.DATABASE_ERROR
            );
        }

        appError.correlationId = correlationId;
        res.status(appError.statusCode).json(appError.toJSON());
    }

    /**
     * Trata erros JWT
     */
    private static handleJWTError(
        error: any,
        req: Request,
        res: Response,
        correlationId: string
    ): void {
        let appError: AppError;

        if (error.name === 'TokenExpiredError') {
            appError = new AppError(
                'Authentication token has expired',
                401,
                ERROR_CODES.TOKEN_EXPIRED
            );
        } else if (error.name === 'JsonWebTokenError') {
            appError = new AppError(
                'Invalid authentication token',
                401,
                ERROR_CODES.INVALID_TOKEN
            );
        } else {
            appError = new AppError(
                'Authentication failed',
                401,
                ERROR_CODES.NOT_AUTHENTICATED
            );
        }

        appError.correlationId = correlationId;
        res.status(appError.statusCode).json(appError.toJSON());
    }

    /**
     * Trata erros desconhecidos
     */
    private static handleUnknownError(
        error: Error,
        req: Request,
        res: Response,
        correlationId: string
    ): void {
        // Em produção, não expor detalhes do erro interno
        const message = process.env.NODE_ENV === 'production'
            ? 'An internal server error occurred'
            : error.message;

        const appError = new AppError(
            message,
            500,
            ERROR_CODES.INTERNAL_SERVER_ERROR
        );

        appError.correlationId = correlationId;
        res.status(500).json(appError.toJSON());
    }

    /**
     * Faz log estruturado do erro
     */
    private static logError(error: Error, req: Request, correlationId: string): void {
        const errorInfo = {
            name: error.name,
            message: error.message,
            stack: error.stack,
            correlationId,
            request: {
                method: req.method,
                url: req.url,
                headers: ErrorHandler.sanitizeHeaders(req.headers),
                body: ErrorHandler.sanitizeBody(req.body),
                params: req.params,
                query: req.query,
                ip: req.ip,
                userAgent: req.headers['user-agent'],
            },
            user: req.user ? {
                id: req.user.id,
                email: req.user.email,
                role: req.user.role,
            } : null,
        };

        if (error instanceof AppError && error.isOperational) {
            Logger.warn('Operational error', errorInfo);
        } else {
            Logger.error('Unexpected error', errorInfo);

            // Alertas críticos para erros não operacionais
            if (process.env.NODE_ENV === 'production') {
                // Implementar notificação para Slack, Discord, etc.
                MetricsService.incrementCounter('critical_errors_total');
            }
        }
    }

    /**
     * Sanitiza headers para log (remove tokens sensíveis)
     */
    private static sanitizeHeaders(headers: any): any {
        const sanitized = { ...headers };
        if (sanitized.authorization) {
            sanitized.authorization = '[REDACTED]';
        }
        if (sanitized.cookie) {
            sanitized.cookie = '[REDACTED]';
        }
        return sanitized;
    }

    /**
     * Sanitiza body para log (remove dados sensíveis)
     */
    private static sanitizeBody(body: any): any {
        if (!body || typeof body !== 'object') return body;

        const sanitized = { ...body };
        const sensitiveFields = ['password', 'token', 'secret', 'key', 'authorization'];

        const sanitizeObject = (obj: any): any => {
            if (!obj || typeof obj !== 'object') return obj;

            const result = Array.isArray(obj) ? [] : {};

            for (const [key, value] of Object.entries(obj)) {
                const lowerKey = key.toLowerCase();
                const isSensitive = sensitiveFields.some(field => lowerKey.includes(field));

                if (isSensitive) {
                    (result as any)[key] = '[REDACTED]';
                } else if (typeof value === 'object' && value !== null) {
                    (result as any)[key] = sanitizeObject(value);
                } else {
                    (result as any)[key] = value;
                }
            }

            return result;
        };

        return sanitizeObject(sanitized);
    }

    /**
     * Verifica se é erro de banco de dados
     */
    private static isDatabaseError(error: any): boolean {
        return (
            error.code && (
                error.code.startsWith('23') || // PostgreSQL constraint errors
                error.code === 'ECONNREFUSED' ||
                error.code === 'ETIMEDOUT' ||
                error.code === 'ENOTFOUND'
            )
        ) || (
            error.name && (
                error.name === 'MongoError' ||
                error.name === 'MongoTimeoutError' ||
                error.name === 'MongoNetworkError'
            )
        );
    }

    /**
     * Verifica se é erro JWT
     */
    private static isJWTError(error: any): boolean {
        return error.name === 'JsonWebTokenError' ||
            error.name === 'TokenExpiredError' ||
            error.name === 'NotBeforeError';
    }

    /**
     * Middleware para tratar rotas não encontradas (404)
     */
    static notFoundHandler = (req: Request, res: Response, next: NextFunction): void => {
        const error = new AppError(
            `Route ${req.method} ${req.path} not found`,
            404,
            ERROR_CODES.RESOURCE_NOT_FOUND
        );

        next(error);
    };

    /**
     * Handler para shutdown graceful
     */
    static gracefulShutdown = (error: Error): void => {
        Logger.error('Graceful shutdown initiated', {
            error: error.message,
            stack: error.stack
        });

        // Cleanup de recursos
        process.exit(1);
    };
}

/**
 * Middleware de validação com Zod
 */
export const validateSchema = (schema: any, property: 'body' | 'query' | 'params' = 'body') => {
    return (req: Request, res: Response, next: NextFunction) => {
        try {
            const validated = schema.parse(req[property]);
            req[property] = validated;
            next();
        } catch (error) {
            if (error instanceof ZodError) {
                next(error);
            } else {
                next(new AppError(
                    'Validation failed',
                    400,
                    ERROR_CODES.VALIDATION_ERROR
                ));
            }
        }
    };
};