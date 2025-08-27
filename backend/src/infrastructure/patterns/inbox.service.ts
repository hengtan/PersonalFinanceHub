import { Logger } from '../../shared/utils/logger.util';
import { InfrastructureException } from '../../shared/exceptions/base.exception';

const logger = Logger.createChildLogger('InboxService');

export interface InboxMessage {
    id: string;
    messageId: string; // Unique message identifier from external system
    source: string;
    eventType: string;
    payload: any;
    headers?: Record<string, any>;
    receivedAt: Date;
    processedAt?: Date;
    status: 'PENDING' | 'PROCESSED' | 'FAILED' | 'DUPLICATE';
    retryCount: number;
    errorMessage?: string;
    processingStartedAt?: Date;
}

export class InboxService {
    private static instance: InboxService;
    private messages: Map<string, InboxMessage> = new Map();
    private processedMessageIds: Set<string> = new Set();
    private isProcessing = false;
    private processingInterval: NodeJS.Timeout | null = null;

    private constructor() {}

    public static getInstance(): InboxService {
        if (!InboxService.instance) {
            InboxService.instance = new InboxService();
        }
        return InboxService.instance;
    }

    public async receiveMessage(
        messageId: string,
        source: string,
        eventType: string,
        payload: any,
        headers?: Record<string, any>
    ): Promise<void> {
        try {
            // Check for duplicate messages
            if (this.processedMessageIds.has(messageId)) {
                logger.warn(`Duplicate message received: ${messageId}`, {
                    source,
                    eventType
                });
                
                const duplicateMessage: InboxMessage = {
                    id: this.generateInboxId(),
                    messageId,
                    source,
                    eventType,
                    payload,
                    headers,
                    receivedAt: new Date(),
                    status: 'DUPLICATE',
                    retryCount: 0
                };
                
                this.messages.set(duplicateMessage.id, duplicateMessage);
                return;
            }

            const inboxMessage: InboxMessage = {
                id: this.generateInboxId(),
                messageId,
                source,
                eventType,
                payload,
                headers,
                receivedAt: new Date(),
                status: 'PENDING',
                retryCount: 0
            };

            this.messages.set(inboxMessage.id, inboxMessage);
            
            logger.info(`Message received in inbox: ${eventType}`, {
                messageId,
                source,
                inboxId: inboxMessage.id
            });

            // Start processing if not already running
            if (!this.isProcessing) {
                this.startProcessing();
            }
        } catch (error) {
            logger.error('Failed to receive message in inbox', error);
            throw new InfrastructureException('Failed to receive message in inbox', 'INBOX_ERROR', 500, error);
        }
    }

    public async startProcessing(): Promise<void> {
        if (this.isProcessing) {
            return;
        }

        this.isProcessing = true;
        logger.info('Starting inbox message processing');

        this.processingInterval = setInterval(async () => {
            await this.processMessages();
        }, 3000); // Process every 3 seconds
    }

    public stopProcessing(): void {
        this.isProcessing = false;
        if (this.processingInterval) {
            clearInterval(this.processingInterval);
            this.processingInterval = null;
        }
        logger.info('Stopped inbox message processing');
    }

    private async processMessages(): Promise<void> {
        const pendingMessages = Array.from(this.messages.values())
            .filter(message => 
                message.status === 'PENDING' || 
                (message.status === 'FAILED' && message.retryCount < 3)
            )
            .sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime());

        if (pendingMessages.length === 0) {
            return;
        }

        logger.debug(`Processing ${pendingMessages.length} inbox messages`);

        for (const message of pendingMessages) {
            try {
                message.processingStartedAt = new Date();
                this.messages.set(message.id, message);

                await this.handleMessage(message);
                
                message.status = 'PROCESSED';
                message.processedAt = new Date();
                this.processedMessageIds.add(message.messageId);
                this.messages.set(message.id, message);

                logger.info(`Message processed successfully: ${message.eventType}`, {
                    messageId: message.messageId,
                    inboxId: message.id,
                    source: message.source
                });
            } catch (error) {
                message.retryCount++;
                message.errorMessage = error instanceof Error ? error.message : 'Unknown error';

                if (message.retryCount >= 3) {
                    message.status = 'FAILED';
                    logger.error(`Message failed after max retries: ${message.eventType}`, {
                        messageId: message.messageId,
                        inboxId: message.id,
                        source: message.source,
                        retryCount: message.retryCount,
                        error
                    });
                } else {
                    message.status = 'PENDING'; // Reset to pending for retry
                    logger.warn(`Message processing failed, will retry: ${message.eventType}`, {
                        messageId: message.messageId,
                        inboxId: message.id,
                        source: message.source,
                        retryCount: message.retryCount,
                        error
                    });
                }

                this.messages.set(message.id, message);
            }
        }
    }

    private async handleMessage(message: InboxMessage): Promise<void> {
        // This would route to appropriate handlers based on event type
        logger.debug(`Handling message: ${message.eventType}`, {
            messageId: message.messageId,
            source: message.source,
            payload: message.payload
        });

        // Simulate message processing
        switch (message.eventType) {
            case 'user.registered':
                await this.handleUserRegistered(message);
                break;
            case 'transaction.created':
                await this.handleTransactionCreated(message);
                break;
            case 'budget.exceeded':
                await this.handleBudgetExceeded(message);
                break;
            default:
                logger.warn(`No handler found for event type: ${message.eventType}`);
        }

        // Simulate potential failure
        if (Math.random() < 0.05) { // 5% failure rate for testing
            throw new Error(`Simulated handler failure for ${message.eventType}`);
        }
    }

    private async handleUserRegistered(message: InboxMessage): Promise<void> {
        // Handle user registration event
        logger.debug('Handling user registered event', message.payload);
        // Implementation would trigger business logic
    }

    private async handleTransactionCreated(message: InboxMessage): Promise<void> {
        // Handle transaction created event
        logger.debug('Handling transaction created event', message.payload);
        // Implementation would update projections, trigger notifications, etc.
    }

    private async handleBudgetExceeded(message: InboxMessage): Promise<void> {
        // Handle budget exceeded event
        logger.debug('Handling budget exceeded event', message.payload);
        // Implementation would send alerts, notifications, etc.
    }

    public async getMessages(status?: InboxMessage['status']): Promise<InboxMessage[]> {
        const messages = Array.from(this.messages.values());
        
        if (status) {
            return messages.filter(message => message.status === status);
        }
        
        return messages;
    }

    public async getMessageById(inboxId: string): Promise<InboxMessage | null> {
        return this.messages.get(inboxId) || null;
    }

    public async getMessageByMessageId(messageId: string): Promise<InboxMessage | null> {
        return Array.from(this.messages.values())
            .find(message => message.messageId === messageId) || null;
    }

    public async markMessageAsProcessed(inboxId: string): Promise<void> {
        const message = this.messages.get(inboxId);
        if (message) {
            message.status = 'PROCESSED';
            message.processedAt = new Date();
            this.processedMessageIds.add(message.messageId);
            this.messages.set(inboxId, message);
        }
    }

    public async markMessageAsFailed(inboxId: string, errorMessage: string): Promise<void> {
        const message = this.messages.get(inboxId);
        if (message) {
            message.status = 'FAILED';
            message.errorMessage = errorMessage;
            this.messages.set(inboxId, message);
        }
    }

    public async cleanup(olderThanDays: number = 7): Promise<void> {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

        const messagesToDelete = Array.from(this.messages.entries())
            .filter(([_, message]) => 
                message.status === 'PROCESSED' && 
                message.processedAt && 
                message.processedAt < cutoffDate
            )
            .map(([id]) => id);

        messagesToDelete.forEach(id => {
            const message = this.messages.get(id);
            if (message) {
                this.processedMessageIds.delete(message.messageId);
                this.messages.delete(id);
            }
        });

        logger.info(`Cleaned up ${messagesToDelete.length} processed messages older than ${olderThanDays} days`);
    }

    private generateInboxId(): string {
        return `inbox_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    }

    public getStats(): {
        total: number;
        pending: number;
        processed: number;
        failed: number;
        duplicate: number;
        isProcessing: boolean;
        uniqueProcessedMessages: number;
    } {
        const messages = Array.from(this.messages.values());
        
        return {
            total: messages.length,
            pending: messages.filter(m => m.status === 'PENDING').length,
            processed: messages.filter(m => m.status === 'PROCESSED').length,
            failed: messages.filter(m => m.status === 'FAILED').length,
            duplicate: messages.filter(m => m.status === 'DUPLICATE').length,
            isProcessing: this.isProcessing,
            uniqueProcessedMessages: this.processedMessageIds.size
        };
    }
}