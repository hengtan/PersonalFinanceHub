// backend/src/core/domain/events/user-logged-in.event.ts
import { BaseDomainEvent } from './base-domain.event';

export interface UserLoggedInPayload {
    ipAddress?: string;
    userAgent?: string;
    timestamp: Date;
}

export class UserLoggedInEvent extends BaseDomainEvent {
    constructor(
        userId: string,
        private readonly payload: UserLoggedInPayload
    ) {
        super(userId, 'UserLoggedIn');
    }

    getPayload(): UserLoggedInPayload {
        return {
            ...this.payload,
            timestamp: new Date(this.payload.timestamp)
        };
    }

    get ipAddress(): string | undefined {
        return this.payload.ipAddress;
    }

    get userAgent(): string | undefined {
        return this.payload.userAgent;
    }

    get timestamp(): Date {
        return this.payload.timestamp;
    }
}