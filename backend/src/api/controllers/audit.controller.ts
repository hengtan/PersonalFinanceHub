// backend/src/api/controllers/audit.controller.ts
import { FastifyRequest, FastifyReply } from 'fastify';
import { eventPublisherService } from '../../infrastructure/events/event-publisher.service';
import { logger } from '../../infrastructure/monitoring/logger.service';

interface AuditLogRequest {
    aggregateId?: string;
    userId?: string;
    eventType?: string;
    fromDate?: string;
    toDate?: string;
    limit?: number;
    offset?: number;
}

interface UserActivityRequest {
    fromDate?: string;
    toDate?: string;
    limit?: number;
}

interface AggregateAuditRequest {
    id: string;
}

export class AuditController {
    private readonly eventStore = eventPublisherService.getEventStore();

    /**
     * Get audit logs with filters
     * GET /api/audit/logs
     */
    async getAuditLogs(
        request: FastifyRequest<{ Querystring: AuditLogRequest }>,
        reply: FastifyReply
    ): Promise<void> {
        try {
            // Check if user has admin/audit permissions
            const user = (request as any).user;
            if (!user) {
                reply.code(401).send({
                    success: false,
                    message: 'Authentication required',
                    error: 'AUTHENTICATION_REQUIRED'
                });
                return;
            }

            // TODO: Check if user has audit permissions
            // if (!user.hasPermission('audit:read')) { ... }

            const {
                aggregateId,
                userId,
                eventType,
                fromDate,
                toDate,
                limit = 50,
                offset = 0
            } = request.query;

            logger.info('Retrieving audit logs', {
                requestedBy: user.id,
                filters: request.query
            });

            const events = await this.eventStore.getEvents({
                aggregateId,
                userId,
                eventType,
                fromDate: fromDate ? new Date(fromDate) : undefined,
                toDate: toDate ? new Date(toDate) : undefined,
                limit,
                offset
            });

            reply.code(200).send({
                success: true,
                data: {
                    events: events.map(event => ({
                        id: event.id,
                        eventId: event.eventId,
                        eventType: event.eventType,
                        aggregateId: event.aggregateId,
                        aggregateType: event.aggregateType,
                        userId: event.userId,
                        occurredOn: event.occurredOn,
                        storedOn: event.storedOn,
                        eventData: event.eventData,
                        metadata: event.metadata
                    })),
                    pagination: {
                        limit,
                        offset,
                        hasMore: events.length === limit
                    }
                }
            });

        } catch (error) {
            this.handleError(error, reply, 'Failed to retrieve audit logs');
        }
    }

    /**
     * Get user activity log
     * GET /api/audit/users/:userId/activity
     */
    async getUserActivity(
        request: FastifyRequest<{ 
            Params: { userId: string };
            Querystring: UserActivityRequest;
        }>,
        reply: FastifyReply
    ): Promise<void> {
        try {
            const requestingUser = (request as any).user;
            if (!requestingUser) {
                reply.code(401).send({
                    success: false,
                    message: 'Authentication required',
                    error: 'AUTHENTICATION_REQUIRED'
                });
                return;
            }

            const { userId } = request.params;
            const { fromDate, toDate, limit = 50 } = request.query;

            // Users can only see their own activity, unless they're admin
            if (requestingUser.id !== userId) {
                // TODO: Check admin permissions
                reply.code(403).send({
                    success: false,
                    message: 'Access denied',
                    error: 'ACCESS_DENIED'
                });
                return;
            }

            logger.info('Retrieving user activity', {
                userId,
                requestedBy: requestingUser.id,
                fromDate,
                toDate
            });

            const events = await this.eventStore.getUserActivityLog(
                userId,
                fromDate ? new Date(fromDate) : undefined,
                toDate ? new Date(toDate) : undefined,
                limit
            );

            reply.code(200).send({
                success: true,
                data: {
                    userId,
                    activities: events.map(event => ({
                        eventId: event.eventId,
                        eventType: event.eventType,
                        aggregateType: event.aggregateType,
                        aggregateId: event.aggregateId,
                        occurredOn: event.occurredOn,
                        description: this.getEventDescription(event),
                        metadata: event.metadata
                    })),
                    totalEvents: events.length
                }
            });

        } catch (error) {
            this.handleError(error, reply, 'Failed to retrieve user activity');
        }
    }

    /**
     * Get audit trail for specific aggregate
     * GET /api/audit/aggregates/:id
     */
    async getAggregateAuditTrail(
        request: FastifyRequest<{ Params: AggregateAuditRequest }>,
        reply: FastifyReply
    ): Promise<void> {
        try {
            const user = (request as any).user;
            if (!user) {
                reply.code(401).send({
                    success: false,
                    message: 'Authentication required',
                    error: 'AUTHENTICATION_REQUIRED'
                });
                return;
            }

            const { id } = request.params;

            logger.info('Retrieving aggregate audit trail', {
                aggregateId: id,
                requestedBy: user.id
            });

            const events = await this.eventStore.getAuditLog(id);

            reply.code(200).send({
                success: true,
                data: {
                    aggregateId: id,
                    auditTrail: events.map(event => ({
                        eventId: event.eventId,
                        eventType: event.eventType,
                        version: event.version,
                        userId: event.userId,
                        occurredOn: event.occurredOn,
                        changes: this.extractChanges(event),
                        metadata: event.metadata
                    })),
                    totalEvents: events.length
                }
            });

        } catch (error) {
            this.handleError(error, reply, 'Failed to retrieve aggregate audit trail');
        }
    }

    /**
     * Get audit statistics
     * GET /api/audit/stats
     */
    async getAuditStats(
        request: FastifyRequest,
        reply: FastifyReply
    ): Promise<void> {
        try {
            const user = (request as any).user;
            if (!user) {
                reply.code(401).send({
                    success: false,
                    message: 'Authentication required',
                    error: 'AUTHENTICATION_REQUIRED'
                });
                return;
            }

            // TODO: Check admin permissions

            logger.info('Retrieving audit statistics', {
                requestedBy: user.id
            });

            // Get events from last 30 days
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

            const recentEvents = await this.eventStore.getEvents({
                fromDate: thirtyDaysAgo,
                limit: 1000
            });

            // Calculate statistics
            const stats = this.calculateStats(recentEvents);

            reply.code(200).send({
                success: true,
                data: {
                    period: '30 days',
                    statistics: stats,
                    generatedAt: new Date()
                }
            });

        } catch (error) {
            this.handleError(error, reply, 'Failed to retrieve audit statistics');
        }
    }

    private getEventDescription(event: any): string {
        const data = event.eventData;
        
        switch (event.eventType) {
            case 'TransactionCreated':
                return `Created transaction: ${data.transaction?.description || 'Unknown'}`;
            case 'TransactionUpdated':
                return `Updated transaction: ${data.newTransaction?.description || 'Unknown'}`;
            case 'TransactionDeleted':
                return `Deleted transaction: ${data.transaction?.description || 'Unknown'}`;
            case 'TransactionPaid':
                return `Marked transaction as paid: ${data.transaction?.description || 'Unknown'}`;
            case 'TransactionCancelled':
                return `Cancelled transaction: ${data.transaction?.description || 'Unknown'}`;
            default:
                return `${event.eventType} event`;
        }
    }

    private extractChanges(event: any): any {
        const data = event.eventData;
        
        switch (event.eventType) {
            case 'TransactionUpdated':
                return {
                    changedFields: data.changedFields || [],
                    oldValues: this.extractRelevantFields(data.oldTransaction),
                    newValues: this.extractRelevantFields(data.newTransaction)
                };
            default:
                return null;
        }
    }

    private extractRelevantFields(transaction: any): any {
        if (!transaction) return null;
        
        return {
            description: transaction.description,
            amount: transaction.amount,
            type: transaction.type,
            status: transaction.status,
            paymentMethod: transaction.paymentMethod
        };
    }

    private calculateStats(events: any[]): any {
        const eventTypes: { [key: string]: number } = {};
        const userActivity: { [key: string]: number } = {};
        const dailyActivity: { [key: string]: number } = {};

        events.forEach(event => {
            // Event type statistics
            eventTypes[event.eventType] = (eventTypes[event.eventType] || 0) + 1;
            
            // User activity statistics
            if (event.userId) {
                userActivity[event.userId] = (userActivity[event.userId] || 0) + 1;
            }
            
            // Daily activity statistics
            const date = event.occurredOn.toISOString().split('T')[0];
            dailyActivity[date] = (dailyActivity[date] || 0) + 1;
        });

        return {
            totalEvents: events.length,
            eventTypeBreakdown: eventTypes,
            topUsers: Object.entries(userActivity)
                .sort(([,a], [,b]) => (b as number) - (a as number))
                .slice(0, 10),
            dailyActivity: Object.entries(dailyActivity)
                .sort(([a], [b]) => b.localeCompare(a))
                .slice(0, 30)
        };
    }

    private handleError(error: unknown, reply: FastifyReply, defaultMessage: string): void {
        logger.error(defaultMessage, error as Error);
        
        reply.code(500).send({
            success: false,
            message: defaultMessage,
            error: 'INTERNAL_SERVER_ERROR'
        });
    }
}

// Singleton instance
export const auditController = new AuditController();