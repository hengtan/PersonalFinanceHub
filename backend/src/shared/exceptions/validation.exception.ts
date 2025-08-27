// backend/src/shared/exceptions/validation.exception.ts
export class ValidationException extends Error {
    public readonly statusCode = 400;
    public readonly code = 'VALIDATION_ERROR';
    public readonly validationErrors: Array<{
        field: string;
        message: string;
        value?: any;
    }>;

    constructor(
        message: string,
        validationErrors: Array<{
            field: string;
            message: string;
            value?: any;
        }> = []
    ) {
        super(message);
        this.name = 'ValidationException';
        this.validationErrors = validationErrors;
    }

    toJSON() {
        return {
            name: this.name,
            message: this.message,
            statusCode: this.statusCode,
            code: this.code,
            validationErrors: this.validationErrors,
        };
    }
}