// backend/src/infrastructure/jobs/processors/transaction-sync.processor.ts
import { Job } from 'bull';
import { TransactionRepository } from '../../../core/domain/repositories/transaction.repository';
import { EventDispatcherService } from '../../../core/services/event-dispatcher.service';
import { TransactionCreatedEvent } from '../../../core/domain/events/transaction-created.event';
import { logger } from '../../../shared/utils/logger.util';

export interface TransactionSyncJobData {
    userId: string;
    accountId: string;
    externalTransactions: Array<{
        externalId: string;
        description: string;
        amount: number;
        currency: string;
        type: 'INCOME' | 'EXPENSE';
        transactionDate: string;
        categoryId?: string;
    }>;
}

export class TransactionSyncProcessor {
    constructor(
        private readonly transactionRepository: TransactionRepository,
        private readonly eventDispatcher: EventDispatcherService
    ) {}

    async process(job: Job<TransactionSyncJobData>): Promise<void> {
        const { userId, accountId, externalTransactions } = job.data;

        logger.info('Processing transaction sync job', {
            jobId: job.id,
            userId,
            accountId,
            transactionsCount: externalTransactions.length
        });

        try {
            let processedCount = 0;
            let skippedCount = 0;

            for (const extTransaction of externalTransactions) {
                try {
                    // Check if transaction already exists
                    const existing = await this.transactionRepository.findByExternalId(
                        extTransaction.externalId
                    );

                    if (existing) {
                        skippedCount++;
                        continue;
                    }

                    // Create new transaction
                    const transaction = await this.transactionRepository.create({
                        userId,
                        accountId,
                        categoryId: extTransaction.categoryId || await this.getDefaultCategoryId(extTransaction.type),
                        description: extTransaction.description,
                        amount: extTransaction.amount,
                        currency: extTransaction.currency as any,
                        type: extTransaction.type,
                        paymentMethod: 'BANK_TRANSFER',
                        transactionDate: new Date(extTransaction.transactionDate),
                        isPaid: true,
                        isRecurring: false,
                        tags: ['imported', 'bank-sync'],
                        metadata: {
                            externalId: extTransaction.externalId,
                            syncedAt: new Date().toISOString()
                        }
                    });

                    // Dispatch event
                    await this.eventDispatcher.dispatch(
                        new TransactionCreatedEvent(transaction.id, {
                            userId: transaction.userId,
                            accountId: transaction.accountId,
                            categoryId: transaction.categoryId,
                            description: transaction.description,
                            amount: transaction.amount.amount,
                            currency: transaction.amount.currency,
                            type: transaction.type,
                            paymentMethod: transaction.paymentMethod,
                            transactionDate: transaction.transactionDate,
                            tags: transaction.tags
                        })
                    );

                    processedCount++;

                    // Update job progress
                    const progress = Math.round(
                        ((processedCount + skippedCount) / externalTransactions.length) * 100
                    );
                    await job.progress(progress);

                } catch (error) {
                    logger.error('Error processing individual transaction in sync', {
                        jobId: job.id,
                        externalId: extTransaction.externalId,
                        error: error.message
                    });

                    // Continue processing other transactions
                }
            }

            logger.info('Transaction sync job completed', {
                jobId: job.id,
                userId,
                accountId,
                processedCount,
                skippedCount,
                totalCount: externalTransactions.length
            });

        } catch (error) {
            logger.error('Error in transaction sync job', {
                jobId: job.id,
                userId,
                accountId,
                error: error.message,
                stack: error.stack
            });

            throw error;
        }
    }

    private async getDefaultCategoryId(type: 'INCOME' | 'EXPENSE'): Promise<string> {
        // This should fetch from a categories repository or return default IDs
        // For now, return hardcoded defaults
        return type === 'INCOME' ? 'default-income-category' : 'default-expense-category';
    }
}