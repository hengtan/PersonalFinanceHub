// backend/src/shared/exceptions/base.exception.ts
export abstract class BaseException extends Error {
    public readonly code: string;
    public readonly statusCode: number;
    public readonly details?: any;

    constructor(
        message: string,
        code: string,
        statusCode: number,
        details?: any
    ) {
        super(message);
        this.name = this.constructor.name;
        this.code = code;
        this.statusCode = statusCode;
        this.details = details;

        // Maintains proper stack trace for where our error was thrown
        Error.captureStackTrace(this, this.constructor);
    }
}

// backend/src/shared/exceptions/validation.exception.ts
import { BaseException } from './base.exception';
import { HTTP_STATUS } from '../constants/status-codes';

export interface ValidationError {
    field: string;
    message: string;
    value?: any;
}

export class ValidationException extends BaseException {
    public readonly validationErrors: ValidationError[];

    constructor(message: string, validationErrors: ValidationError[] = []) {
        super(message, 'VALIDATION_ERROR', HTTP_STATUS.BAD_REQUEST, validationErrors);
        this.validationErrors = validationErrors;
    }

    get details() {
        return this.validationErrors;
    }
}

// backend/src/shared/exceptions/business.exception.ts
import { BaseException } from './base.exception';
import { HTTP_STATUS } from '../constants/status-codes';

export class BusinessException extends BaseException {
    constructor(
        message: string,
        statusCode: number = HTTP_STATUS.BAD_REQUEST,
        details?: any
    ) {
        super(message, 'BUSINESS_ERROR', statusCode, details);
    }
}

// backend/src/shared/exceptions/infrastructure.exception.ts
import { BaseException } from './base.exception';
import { HTTP_STATUS } from '../constants/status-codes';

export class InfrastructureException extends BaseException {
    constructor(
        message: string,
        code: string = 'INFRASTRUCTURE_ERROR',
        statusCode: number = HTTP_STATUS.INTERNAL_ERROR,
        details?: any
    ) {
        super(message, code, statusCode, details);
    }
}

// Specific infrastructure exceptions
export class DatabaseException extends InfrastructureException {
    constructor(message: string, details?: any) {
        super(message, 'DATABASE_ERROR', HTTP_STATUS.INTERNAL_ERROR, details);
    }
}

export class CacheException extends InfrastructureException {
    constructor(message: string, details?: any) {
        super(message, 'CACHE_ERROR', HTTP_STATUS.INTERNAL_ERROR, details);
    }
}

export class ExternalServiceException extends InfrastructureException {
    constructor(message: string, details?: any) {
        super(message, 'EXTERNAL_SERVICE_ERROR', HTTP_STATUS.SERVICE_UNAVAILABLE, details);
    }
}

export class FileStorageException extends InfrastructureException {
    constructor(message: string, details?: any) {
        super(message, 'FILE_STORAGE_ERROR', HTTP_STATUS.INTERNAL_ERROR, details);
    }
}

export class MessagingException extends InfrastructureException {
    constructor(message: string, details?: any) {
        super(message, 'MESSAGING_ERROR', HTTP_STATUS.INTERNAL_ERROR, details);
    }
}