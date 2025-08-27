// backend/src/api/controllers/dashboard.controller.ts
import { Request, Response, NextFunction } from 'express';
import { mongoDb, CacheService } from '@/infrastructure/database/connections';
import { AppError } from '../middlewares/error-handler.middleware';

export class DashboardController {
    async getDashboard(req: Request, res: Response, next: NextFunction) {
        try {
            const userId = req.user!.id;
            const period = req.query.period as string || this.getCurrentPeriod();

            // Try to get from cache first
            const cacheKey = `dash:${userId}:${period}`;
            const cachedData = await CacheService.get(cacheKey);

            if (cachedData) {
                return res.json({
                    success: true,
                    data: cachedData,
                    cached: true,
                });
            }

            // Get data from MongoDB (read database)
            const collection = mongoDb.collection('daily_category_spend');

            const pipeline = [
                {
                    $match: {
                        user_id: userId,
                        date: {
                            $gte: new Date(`${period}-01`),
                            $lt: new Date(this.getNextPeriod(period)),
                        },
                    },
                },
                {
                    $group: {
                        _id: '$category',
                        totalAmount: { $sum: '$amount' },
                        transactionCount: { $sum: '$transaction_count' },
                    },
                },
                {
                    $sort: { totalAmount: -1 },
                },
            ];

            const categorySpending = await collection.aggregate(pipeline).toArray();

            const dashboardData = {
                period,
                totalExpenses: categorySpending.reduce((sum, cat) => sum + cat.totalAmount, 0),
                totalTransactions: categorySpending.reduce((sum, cat) => sum + cat.transactionCount, 0),
                categoriesBreakdown: categorySpending.map(cat => ({
                    category: cat._id,
                    amount: cat.totalAmount,
                    transactionCount: cat.transactionCount,
                })),
                generatedAt: new Date().toISOString(),
            };

            // Cache for 5 minutes
            await CacheService.set(cacheKey, dashboardData, 300);

            res.json({
                success: true,
                data: dashboardData,
                cached: false,
            });
        } catch (error) {
            next(error);
        }
    }

    async getSummary(req: Request, res: Response, next: NextFunction) {
        try {
            const userId = req.user!.id;

            // Get summary from monthly_summaries collection
            const collection = mongoDb.collection('monthly_summaries');

            const currentPeriod = this.getCurrentPeriod();
            const summary = await collection.findOne({
                user_id: userId,
                period: currentPeriod,
            });

            res.json({
                success: true,
                data: summary || {
                    period: currentPeriod,
                    total_income: 0,
                    total_expenses: 0,
                    net_income: 0,
                    categories: {},
                },
            });
        } catch (error) {
            next(error);
        }
    }

    async getCategorySpending(req: Request, res: Response, next: NextFunction) {
        try {
            const userId = req.user!.id;
            const period = req.query.period as string || this.getCurrentPeriod();

            const collection = mongoDb.collection('daily_category_spend');

            const categoryData = await collection.aggregate([
                {
                    $match: {
                        user_id: userId,
                        date: {
                            $gte: new Date(`${period}-01`),
                            $lt: new Date(this.getNextPeriod(period)),
                        },
                    },
                },
                {
                    $group: {
                        _id: {
                            category: '$category',
                            date: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
                        },
                        amount: { $sum: '$amount' },
                    },
                },
                {
                    $group: {
                        _id: '$_id.category',
                        dailySpending: {
                            $push: {
                                date: '$_id.date',
                                amount: '$amount',
                            },
                        },
                        totalAmount: { $sum: '$amount' },
                    },
                },
                {
                    $sort: { totalAmount: -1 },
                },
            ]).toArray();

            res.json({
                success: true,
                data: {
                    period,
                    categories: categoryData,
                },
            });
        } catch (error) {
            next(error);
        }
    }

    async getTrends(req: Request, res: Response, next: NextFunction) {
        try {
            const userId = req.user!.id;

            // Get last 6 months of data
            const months = [];
            const currentDate = new Date();

            for (let i = 5; i >= 0; i--) {
                const date = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
                months.push(date.toISOString().substring(0, 7));
            }

            const collection = mongoDb.collection('monthly_summaries');

            const trends = await collection.find({
                user_id: userId,
                period: { $in: months },
            }).sort({ period: 1 }).toArray();

            res.json({
                success: true,
                data: {
                    months,
                    trends: trends.map(trend => ({
                        period: trend.period,
                        totalIncome: trend.total_income || 0,
                        totalExpenses: trend.total_expenses || 0,
                        netIncome: trend.net_income || 0,
                    })),
                },
            });
        } catch (error) {
            next(error);
        }
    }

    private getCurrentPeriod(): string {
        return new Date().toISOString().substring(0, 7); // YYYY-MM
    }

    private getNextPeriod(period: string): string {
        const [year, month] = period.split('-').map(Number);
        const date = new Date(year, month, 1); // Next month, day 1
        return date.toISOString().substring(0, 7);
    }
}