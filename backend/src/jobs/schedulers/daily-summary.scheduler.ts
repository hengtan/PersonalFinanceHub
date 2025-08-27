// backend/src/infrastructure/jobs/schedulers/daily-summary.scheduler.ts
import cron from 'node-cron';
import { UserRepository } from '../../../core/domain/repositories/user.repository';
import { TransactionRepository } from '../../../core/domain/repositories/transaction.repository';
import { logger } from '../../infrastructure/monitoring/logger.service';

export class DailySummaryScheduler {
    constructor(
        private readonly userRepository: UserRepository,
        private readonly transactionRepository: TransactionRepository
    ) {}

    start(): void {
        // Run daily at 8:00 AM
        cron.schedule('0 8 * * *', async () => {
            await this.generateDailySummaries();
        }, {
            scheduled: true,
            timezone: 'America/Sao_Paulo'
        });

        logger.info('Daily summary scheduler started');
    }

    async generateDailySummaries(): Promise<void> {
        try {
            logger.info('Starting daily summary generation');

            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            yesterday.setHours(0, 0, 0, 0);

            const today = new Date();
            today.setHours(0, 0, 0, 0);

            // Get all active users
            const { users } = await this.userRepository.findMany(
                { isActive: true },
                { page: 1, limit: 1000 }
            );

            let processedUsers = 0;

            for (const user of users) {
                try {
                    // Skip if user doesn't want daily summaries
                    if (!user.preferences.notifications.email) {
                        continue;
                    }

                    // Get yesterday's transactions
                    const transactions = await this.transactionRepository.findByDateRange(
                        user.id,
                        yesterday,
                        today
                    );

                    if (transactions.length === 0) {
                        continue;
                    }

                    // Calculate summary
                    const summary = {
                        date: yesterday.toISOString().split('T')[0],
                        totalTransactions: transactions.length,
                        totalIncome: 0,
                        totalExpenses: 0,
                        netAmount: 0,
                        topCategories: new Map<string, number>()
                    };

                    transactions.forEach(transaction => {
                        if (transaction.type === 'INCOME') {
                            summary.totalIncome += transaction.amount.amount;
                        } else if (transaction.type === 'EXPENSE') {
                            summary.totalExpenses += transaction.amount.amount;
                        }

                        // Track category spending
                        const currentAmount = summary.topCategories.get(transaction.categoryId) || 0;
                        summary.topCategories.set(transaction.categoryId, currentAmount + transaction.amount.amount);
                    });

                    summary.netAmount = summary.totalIncome - summary.totalExpenses;

                    // TODO: Send email with summary
                    // await this.emailService.sendDailySummary(user.email, summary);

                    processedUsers++;

                    logger.debug('Daily summary generated for user', {
                        userId: user.id,
                        transactionCount: summary.totalTransactions,
                        netAmount: summary.netAmount
                    });

                } catch (error) {
                    logger.error('Error generating daily summary for user', error as Error, {
                        userId: user.id
                    });
                }
            }

            logger.info('Daily summary generation completed', {
                totalUsers: users.length,
                processedUsers
            });

        } catch (error) {
            logger.error('Error in daily summary scheduler', error as Error);
        }
    }
}