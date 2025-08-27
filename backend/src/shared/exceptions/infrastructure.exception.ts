// backend/src/shared/exceptions/infrastructure.exception.ts
export class InfrastructureException extends Error {
    public readonly statusCode = 500;
    public readonly code: string;

    constructor(message: string, code: string = 'INFRASTRUCTURE_ERROR', statusCode: number = 500) {
        super(message);
        this.name = 'InfrastructureException';
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