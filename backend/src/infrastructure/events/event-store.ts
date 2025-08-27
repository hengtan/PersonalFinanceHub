// backend/src/infrastructure/events/event-store.ts
import { Pool } from 'pg';
import { pgWritePool, pgReadPool } from '../database/connections';
import { BaseDomainEvent } from '../../core/domain/events/base-domain.event';
import { logger } from '../monitoring/logger.service';

export interface StoredEvent {
    id: string;
    eventId: string;
    eventType: string;
    aggregateId: string;
    aggregateType: string;
    version: number;
    userId: string;
    eventData: any;
    metadata: any;
    occurredOn: Date;
    storedOn: Date;
}

export interface EventFilter {
    aggregateId?: string;
    aggregateType?: string;
    eventType?: string;
    userId?: string;
    fromDate?: Date;
    toDate?: Date;
    limit?: number;
    offset?: number;
}

export class EventStore {
    
    async append(event: BaseDomainEvent): Promise<void> {
        const client = await pgWritePool.connect();
        
        try {
            await client.query('BEGIN');

            const eventJson = event.toJSON();
            
            const query = `
                INSERT INTO event_store (
                    id, event_id, event_type, aggregate_id, aggregate_type,
                    version, user_id, event_data, metadata, occurred_on, stored_on
                )
                VALUES (
                    gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW()
                )
            `;

            const values = [
                eventJson.eventId,
                eventJson.eventType,
                eventJson.aggregateId,
                eventJson.aggregateType,
                eventJson.version,
                eventJson.userId,
                JSON.stringify(eventJson.data),
                JSON.stringify(eventJson.metadata || {}),
                eventJson.occurredOn
            ];

            await client.query(query, values);
            await client.query('COMMIT');

            logger.info('Event stored successfully', {
                eventId: eventJson.eventId,
                eventType: eventJson.eventType,
                aggregateId: eventJson.aggregateId
            });

        } catch (error) {
            await client.query('ROLLBACK');
            logger.error('Failed to store event', error as Error, {
                eventId: event.eventId,
                eventType: (event as any).eventType
            });
            throw error;
        } finally {
            client.release();
        }
    }

    async appendBatch(events: BaseDomainEvent[]): Promise<void> {
        if (events.length === 0) return;

        const client = await pgWritePool.connect();
        
        try {
            await client.query('BEGIN');

            const query = `
                INSERT INTO event_store (
                    id, event_id, event_type, aggregate_id, aggregate_type,
                    version, user_id, event_data, metadata, occurred_on, stored_on
                )
                VALUES (
                    gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW()
                )
            `;

            for (const event of events) {
                const eventJson = event.toJSON();
                
                const values = [
                    eventJson.eventId,
                    eventJson.eventType,
                    eventJson.aggregateId,
                    eventJson.aggregateType,
                    eventJson.version,
                    eventJson.userId,
                    JSON.stringify(eventJson.data),
                    JSON.stringify(eventJson.metadata || {}),
                    eventJson.occurredOn
                ];

                await client.query(query, values);
            }

            await client.query('COMMIT');

            logger.info('Batch events stored successfully', {
                eventCount: events.length
            });

        } catch (error) {
            await client.query('ROLLBACK');
            logger.error('Failed to store batch events', error as Error, {
                eventCount: events.length
            });
            throw error;
        } finally {
            client.release();
        }
    }

    async getEvents(filter: EventFilter = {}): Promise<StoredEvent[]> {
        try {
            const { whereClause, values } = this.buildWhereClause(filter);
            
            let query = `
                SELECT 
                    id, event_id, event_type, aggregate_id, aggregate_type,
                    version, user_id, event_data, metadata, occurred_on, stored_on
                FROM event_store
            `;

            if (whereClause) {
                query += ` WHERE ${whereClause}`;
            }

            query += ` ORDER BY occurred_on ASC, version ASC`;

            if (filter.limit) {
                query += ` LIMIT $${values.length + 1}`;
                values.push(filter.limit);
            }

            if (filter.offset) {
                query += ` OFFSET $${values.length + 1}`;
                values.push(filter.offset);
            }

            const result = await pgReadPool.query(query, values);
            
            return result.rows.map(this.mapRowToStoredEvent);

        } catch (error) {
            logger.error('Failed to get events', error as Error, { filter });
            throw error;
        }
    }

    async getEventsByAggregateId(aggregateId: string): Promise<StoredEvent[]> {
        try {
            const query = `
                SELECT 
                    id, event_id, event_type, aggregate_id, aggregate_type,
                    version, user_id, event_data, metadata, occurred_on, stored_on
                FROM event_store
                WHERE aggregate_id = $1
                ORDER BY version ASC
            `;

            const result = await pgReadPool.query(query, [aggregateId]);
            
            return result.rows.map(this.mapRowToStoredEvent);

        } catch (error) {
            logger.error('Failed to get events by aggregate ID', error as Error, { aggregateId });
            throw error;
        }
    }

    async getEventsByUserId(userId: string, limit: number = 100, offset: number = 0): Promise<StoredEvent[]> {
        try {
            const query = `
                SELECT 
                    id, event_id, event_type, aggregate_id, aggregate_type,
                    version, user_id, event_data, metadata, occurred_on, stored_on
                FROM event_store
                WHERE user_id = $1
                ORDER BY occurred_on DESC
                LIMIT $2 OFFSET $3
            `;

            const result = await pgReadPool.query(query, [userId, limit, offset]);
            
            return result.rows.map(this.mapRowToStoredEvent);

        } catch (error) {
            logger.error('Failed to get events by user ID', error as Error, { userId });
            throw error;
        }
    }

    async getEventsByType(eventType: string, limit: number = 100): Promise<StoredEvent[]> {
        try {
            const query = `
                SELECT 
                    id, event_id, event_type, aggregate_id, aggregate_type,
                    version, user_id, event_data, metadata, occurred_on, stored_on
                FROM event_store
                WHERE event_type = $1
                ORDER BY occurred_on DESC
                LIMIT $2
            `;

            const result = await pgReadPool.query(query, [eventType, limit]);
            
            return result.rows.map(this.mapRowToStoredEvent);

        } catch (error) {
            logger.error('Failed to get events by type', error as Error, { eventType });
            throw error;
        }
    }

    async getAuditLog(aggregateId: string): Promise<StoredEvent[]> {
        return this.getEventsByAggregateId(aggregateId);
    }

    async getUserActivityLog(userId: string, fromDate?: Date, toDate?: Date, limit: number = 50): Promise<StoredEvent[]> {
        try {
            const conditions: string[] = ['user_id = $1'];
            const values: any[] = [userId];
            let paramIndex = 2;

            if (fromDate) {
                conditions.push(`occurred_on >= $${paramIndex++}`);
                values.push(fromDate);
            }

            if (toDate) {
                conditions.push(`occurred_on <= $${paramIndex++}`);
                values.push(toDate);
            }

            const query = `
                SELECT 
                    id, event_id, event_type, aggregate_id, aggregate_type,
                    version, user_id, event_data, metadata, occurred_on, stored_on
                FROM event_store
                WHERE ${conditions.join(' AND ')}
                ORDER BY occurred_on DESC
                LIMIT $${paramIndex}
            `;

            values.push(limit);

            const result = await pgReadPool.query(query, values);
            
            return result.rows.map(this.mapRowToStoredEvent);

        } catch (error) {
            logger.error('Failed to get user activity log', error as Error, { userId });
            throw error;
        }
    }

    private buildWhereClause(filter: EventFilter): { whereClause: string; values: any[] } {
        const conditions: string[] = [];
        const values: any[] = [];
        let paramIndex = 1;

        if (filter.aggregateId) {
            conditions.push(`aggregate_id = $${paramIndex++}`);
            values.push(filter.aggregateId);
        }

        if (filter.aggregateType) {
            conditions.push(`aggregate_type = $${paramIndex++}`);
            values.push(filter.aggregateType);
        }

        if (filter.eventType) {
            conditions.push(`event_type = $${paramIndex++}`);
            values.push(filter.eventType);
        }

        if (filter.userId) {
            conditions.push(`user_id = $${paramIndex++}`);
            values.push(filter.userId);
        }

        if (filter.fromDate) {
            conditions.push(`occurred_on >= $${paramIndex++}`);
            values.push(filter.fromDate);
        }

        if (filter.toDate) {
            conditions.push(`occurred_on <= $${paramIndex++}`);
            values.push(filter.toDate);
        }

        return {
            whereClause: conditions.join(' AND '),
            values
        };
    }

    private mapRowToStoredEvent(row: any): StoredEvent {
        return {
            id: row.id,
            eventId: row.event_id,
            eventType: row.event_type,
            aggregateId: row.aggregate_id,
            aggregateType: row.aggregate_type,
            version: row.version,
            userId: row.user_id,
            eventData: row.event_data,
            metadata: row.metadata,
            occurredOn: row.occurred_on,
            storedOn: row.stored_on
        };
    }
}