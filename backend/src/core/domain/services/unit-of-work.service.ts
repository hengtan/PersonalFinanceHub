// backend/src/core/domain/services/unit-of-work.service.ts
import { PoolClient } from 'pg';
import { logger } from '../../../infrastructure/monitoring/logger.service';
import { EventStore } from '../../../infrastructure/events/event-store';
import { BaseDomainEvent } from '../events/base-domain.event';
import { EventDispatcher, eventDispatcher } from '../../application/handlers/event-dispatcher.service';

export interface IRepository {
    setConnection(connection: PoolClient): void;
    clearConnection(): void;
}

export interface IUnitOfWorkContext {
    connection: PoolClient;
    isActive: boolean;
    isCommitted: boolean;
    isRolledBack: boolean;
}

export class UnitOfWork {
    private context: IUnitOfWorkContext | null = null;
    private repositories: IRepository[] = [];
    private readonly changeTracker = new Map<string, any>();
    private readonly domainEvents: BaseDomainEvent[] = [];
    private readonly eventStore: EventStore;
    private readonly eventDispatcher: EventDispatcher;

    constructor(
        private connection: PoolClient, 
        eventStore?: EventStore,
        eventDispatcherInstance?: EventDispatcher
    ) {
        this.eventStore = eventStore || new EventStore();
        this.eventDispatcher = eventDispatcherInstance || eventDispatcher;
    }

    /**
     * Registers a repository with this unit of work
     */
    registerRepository(repository: IRepository): void {
        this.repositories.push(repository);
        
        // Set connection if transaction is active
        if (this.context?.isActive) {
            try {
                repository.setConnection(this.context.connection);
            } catch (error) {
                logger.error('Error setting connection on repository', { error, repositoryType: repository.constructor.name });
                // Continue gracefully - repository will handle connection issues
            }
        }
    }

    /**
     * Begins a new transaction
     */
    async begin(): Promise<void> {
        if (this.context?.isActive) {
            throw new Error('Transaction is already active');
        }

        try {
            await this.connection.query('BEGIN');
            
            this.context = {
                connection: this.connection,
                isActive: true,
                isCommitted: false,
                isRolledBack: false
            };

            // Set connection for all registered repositories
            this.repositories.forEach(repo => {
                repo.setConnection(this.connection);
            });

            logger.debug('Unit of Work transaction started', {
                transactionId: this.connection.processID
            });
        } catch (error) {
            logger.error('Failed to start Unit of Work transaction', error as Error);
            throw error;
        }
    }

    /**
     * Commits the current transaction
     */
    async commit(): Promise<void> {
        if (!this.context?.isActive) {
            throw new Error('No active transaction to commit');
        }

        if (this.context.isCommitted) {
            throw new Error('Transaction has already been committed');
        }

        if (this.context.isRolledBack) {
            throw new Error('Cannot commit a rolled back transaction');
        }

        try {
            // First commit the database transaction
            await this.connection.query('COMMIT');
            
            this.context.isCommitted = true;
            this.context.isActive = false;

            // Only publish events after successful database commit
            await this.publishDomainEvents();

            logger.debug('Unit of Work transaction committed', {
                transactionId: this.connection.processID,
                changesCount: this.changeTracker.size,
                eventsCount: this.domainEvents.length
            });

            // Clear change tracking and events after successful commit
            this.clearChangeTracker();
            this.clearDomainEvents();
            
        } catch (error) {
            logger.error('Failed to commit Unit of Work transaction', error as Error, {
                transactionId: this.connection.processID
            });
            
            // Attempt to rollback after commit failure
            await this.rollback();
            throw error;
        } finally {
            this.clearRepositoryConnections();
        }
    }

    /**
     * Rolls back the current transaction
     */
    async rollback(): Promise<void> {
        if (this.context?.isCommitted) {
            throw new Error('Cannot rollback a committed transaction');
        }

        if (!this.context?.isActive) {
            throw new Error('No active transaction to rollback');
        }

        try {
            await this.connection.query('ROLLBACK');
            
            this.context.isRolledBack = true;
            this.context.isActive = false;

            logger.debug('Unit of Work transaction rolled back', {
                transactionId: this.connection.processID,
                changesCount: this.changeTracker.size
            });

            // Clear change tracking after rollback
            this.clearChangeTracker();
            this.clearDomainEvents();
            
        } catch (error) {
            logger.error('Failed to rollback Unit of Work transaction', error as Error, {
                transactionId: this.connection.processID
            });
            throw error;
        } finally {
            this.clearRepositoryConnections();
        }
    }

    /**
     * Executes a function within a transaction scope
     */
    async execute<T>(operation: () => Promise<T>): Promise<T> {
        await this.begin();

        try {
            const result = await operation();
            await this.commit();
            return result;
        } catch (error) {
            await this.rollback();
            throw error;
        }
    }

    /**
     * Creates a savepoint within the current transaction
     */
    async savepoint(name: string): Promise<void> {
        if (!this.context?.isActive) {
            throw new Error('Cannot create savepoint without active transaction');
        }

        try {
            await this.connection.query(`SAVEPOINT ${name}`);
            
            logger.debug('Savepoint created', {
                transactionId: this.connection.processID,
                savepointName: name
            });
        } catch (error) {
            logger.error('Failed to create savepoint', error as Error, {
                savepointName: name
            });
            throw error;
        }
    }

    /**
     * Releases a savepoint
     */
    async releaseSavepoint(name: string): Promise<void> {
        if (!this.context?.isActive) {
            throw new Error('Cannot release savepoint without active transaction');
        }

        try {
            await this.connection.query(`RELEASE SAVEPOINT ${name}`);
            
            logger.debug('Savepoint released', {
                transactionId: this.connection.processID,
                savepointName: name
            });
        } catch (error) {
            logger.error('Failed to release savepoint', error as Error, {
                savepointName: name
            });
            throw error;
        }
    }

    /**
     * Rolls back to a specific savepoint
     */
    async rollbackToSavepoint(name: string): Promise<void> {
        if (!this.context?.isActive) {
            throw new Error('Cannot rollback to savepoint without active transaction');
        }

        try {
            await this.connection.query(`ROLLBACK TO SAVEPOINT ${name}`);
            
            logger.debug('Rolled back to savepoint', {
                transactionId: this.connection.processID,
                savepointName: name
            });
        } catch (error) {
            logger.error('Failed to rollback to savepoint', error as Error, {
                savepointName: name
            });
            throw error;
        }
    }

    /**
     * Tracks changes to an entity
     */
    trackChange(entityId: string, entity: any, changeType: 'INSERT' | 'UPDATE' | 'DELETE'): void {
        const changeKey = `${changeType}:${entityId}`;
        this.changeTracker.set(changeKey, {
            entityId,
            entity: entity,
            changeType,
            timestamp: new Date()
        });

        logger.debug('Entity change tracked', {
            entityId,
            changeType,
            transactionId: this.connection?.processID
        });
    }

    /**
     * Adds a domain event to be published on commit
     */
    addDomainEvent(event: BaseDomainEvent): void {
        this.domainEvents.push(event);

        logger.debug('Domain event added to unit of work', {
            eventType: event.eventType,
            aggregateId: event.aggregateId,
            eventId: event.eventId,
            transactionId: this.connection?.processID
        });
    }

    /**
     * Gets all tracked changes
     */
    getTrackedChanges(): Map<string, any> {
        return new Map(this.changeTracker);
    }

    /**
     * Gets all domain events
     */
    getDomainEvents(): any[] {
        return [...this.domainEvents];
    }

    /**
     * Checks if the unit of work has an active transaction
     */
    isActive(): boolean {
        return this.context?.isActive ?? false;
    }

    /**
     * Checks if the transaction was committed
     */
    isCommitted(): boolean {
        return this.context?.isCommitted ?? false;
    }

    /**
     * Checks if the transaction was rolled back
     */
    isRolledBack(): boolean {
        return this.context?.isRolledBack ?? false;
    }

    /**
     * Gets the current transaction connection
     */
    getConnection(): PoolClient {
        if (!this.context?.isActive) {
            throw new Error('No active transaction');
        }
        return this.context.connection;
    }

    /**
     * Disposes of the unit of work
     */
    async dispose(): Promise<void> {
        try {
            if (this.context?.isActive) {
                await this.rollback();
            }
        } catch (error) {
            logger.error('Error disposing Unit of Work', error as Error);
        } finally {
            this.clearRepositoryConnections();
            this.clearChangeTracker();
            this.clearDomainEvents();
            this.context = null;
        }
    }

    /**
     * Publishes domain events
     */
    private async publishDomainEvents(): Promise<void> {
        if (this.domainEvents.length === 0) {
            return;
        }

        try {
            // Store events in EventStore for persistence and replay capability
            await this.eventStore.appendBatch(this.domainEvents);
            
            logger.info('Domain events persisted to event store', {
                eventCount: this.domainEvents.length,
                transactionId: this.connection?.processID,
                events: this.domainEvents.map(e => ({
                    eventId: e.eventId,
                    eventType: e.eventType,
                    aggregateId: e.aggregateId
                }))
            });

            // Dispatch events to registered handlers for immediate processing
            await this.eventDispatcher.dispatchBatch(this.domainEvents);

            logger.info('Domain events dispatched to handlers', {
                eventCount: this.domainEvents.length,
                transactionId: this.connection?.processID
            });
        } catch (error) {
            logger.error('Failed to publish domain events', error as Error, {
                eventCount: this.domainEvents.length
            });
            throw error;
        }
    }

    /**
     * Clears repository connections
     */
    private clearRepositoryConnections(): void {
        this.repositories.forEach(repo => {
            try {
                repo.clearConnection();
            } catch (error) {
                logger.warn('Failed to clear repository connection', { error });
            }
        });
    }

    /**
     * Clears the change tracker
     */
    private clearChangeTracker(): void {
        this.changeTracker.clear();
    }

    /**
     * Clears domain events
     */
    private clearDomainEvents(): void {
        this.domainEvents.length = 0;
    }
}