// backend/src/shared/exceptions/not-found.exception.ts
import { BaseException } from './base.exception';

export class NotFoundException extends BaseException {
    constructor(message: string, details?: any) {
        super(message, 'NOT_FOUND_ERROR', 404, details);
    }
}