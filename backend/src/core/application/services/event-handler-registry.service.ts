// src/core/application/services/event-handler-registry.service.ts
import { eventDispatcher } from '../handlers/event-dispatcher.service';
import { JournalEntryPostedHandler } from '../handlers/journal-entry-posted.handler';
import { JournalEntryReversedHandler } from '../handlers/journal-entry-reversed.handler';
import { TransactionLedgerProcessedHandler } from '../handlers/transaction-ledger-processed.handler';
import { logger } from '@/infrastructure/monitoring/logger.service';

export class EventHandlerRegistry {
    private static initialized = false;

    static initialize(): void {
        if (this.initialized) {
            logger.warn('Event handlers already initialized');
            return;
        }

        logger.info('Initializing event handlers...');

        // Register all event handlers
        eventDispatcher.register(new JournalEntryPostedHandler());
        eventDispatcher.register(new JournalEntryReversedHandler());
        eventDispatcher.register(new TransactionLedgerProcessedHandler());

        this.initialized = true;
        
        const registeredHandlers = eventDispatcher.getRegisteredHandlers();
        logger.info('Event handlers initialized successfully', {
            handlerCount: registeredHandlers.length,
            handlers: registeredHandlers.map(h => h.constructor.name)
        });
    }

    static isInitialized(): boolean {
        return this.initialized;
    }

    static reset(): void {
        eventDispatcher.clear();
        this.initialized = false;
        logger.info('Event handler registry reset');
    }
}