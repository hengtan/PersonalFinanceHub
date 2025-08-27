// backend/src/shared/exceptions/business.exception.ts
export class BusinessException extends Error {
    public readonly statusCode = 422;
    public readonly code: string;

    constructor(message: string, code: string = 'BUSINESS_ERROR', statusCode: number = 422) {
        super(message);
        this.name = 'BusinessException';
        this.code = code;
        this.statusCode = statusCode;
    }

    toJSON() {
        return {
            name: this.name,
            message: this.message,
            statusCode: this.statusCode,
            code: this.code,
        };
    }
}