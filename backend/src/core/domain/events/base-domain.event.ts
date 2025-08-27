// backend/src/core/domain/events/base-domain.event.ts
export abstract class BaseDomainEvent {
    public readonly occurredOn: Date;
    public readonly eventId: string;
    public readonly eventVersion: number;

    constructor(
        public readonly aggregateId: string,
        public readonly eventType: string,
        eventId?: string,
        eventVersion: number = 1
    ) {
        this.occurredOn = new Date();
        this.eventId = eventId || this.generateEventId();
        this.eventVersion = eventVersion;
    }

    private generateEventId(): string {
        return `${this.eventType}_${this.aggregateId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    abstract getPayload(): any;

    toJSON(): any {
        return {
            eventId: this.eventId,
            eventType: this.eventType,
            aggregateId: this.aggregateId,
            eventVersion: this.eventVersion,
            occurredOn: this.occurredOn.toISOString(),
            payload: this.getPayload()
        };
    }
}