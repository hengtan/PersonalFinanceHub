// src/core/application/handlers/base-event.handler.ts
import { BaseDomainEvent } from '@/core/domain/events/base-domain.event';

export interface IEventHandler<TEvent extends BaseDomainEvent = BaseDomainEvent> {
    canHandle(event: BaseDomainEvent): event is TEvent;
    handle(event: TEvent): Promise<void>;
}

export abstract class BaseEventHandler<TEvent extends BaseDomainEvent> implements IEventHandler<TEvent> {
    abstract readonly eventType: string;

    canHandle(event: BaseDomainEvent): event is TEvent {
        return event.eventType === this.eventType;
    }

    abstract handle(event: TEvent): Promise<void>;
}