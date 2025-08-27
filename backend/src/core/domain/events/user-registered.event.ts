// backend/src/core/domain/events/user-registered.event.ts
import { BaseDomainEvent } from './base-domain.event';

export interface UserRegisteredPayload {
    email: string;
    name: string;
    registrationDate: Date;
    ipAddress?: string;
    userAgent?: string;
}

export class UserRegisteredEvent extends BaseDomainEvent {
    constructor(
        userId: string,
        private readonly payload: UserRegisteredPayload
    ) {
        super(userId, 'UserRegistered');
    }

    getPayload(): UserRegisteredPayload {
        return {
            ...this.payload,
            registrationDate: new Date(this.payload.registrationDate)
        };
    }

    get email(): string {
        return this.payload.email;
    }

    get name(): string {
        return this.payload.name;
    }

    get registrationDate(): Date {
        return this.payload.registrationDate;
    }

    get ipAddress(): string | undefined {
        return this.payload.ipAddress;
    }

    get userAgent(): string | undefined {
        return this.payload.userAgent;
    }
}
