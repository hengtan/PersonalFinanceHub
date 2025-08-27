// MongoDB Schema for Daily Category Spending (Read Model)
export interface DailyCategorySpendDocument {
  _id?: string;
  userId: string;
  date: Date; // YYYY-MM-DD format
  categoryId: string;
  categoryName: string;
  
  // Daily aggregates
  totalAmount: number;
  transactionCount: number;
  averageAmount: number;
  
  // Transaction details for this day/category
  transactions: {
    transactionId: string;
    amount: number;
    description: string;
    timestamp: Date;
    paymentMethod: string;
    tags?: string[];
  }[];
  
  // Comparative data
  comparison: {
    previousDay: number;
    previousWeek: number;
    previousMonth: number;
    monthlyBudget?: number;
    remainingBudget?: number;
  };
  
  // Behavioral insights
  patterns: {
    timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
    isWeekend: boolean;
    isHoliday?: boolean;
    paymentMethodMostUsed: string;
  };
  
  // Update metadata
  lastUpdated: Date;
  version: number;
}

// Weekly aggregation model
export interface WeeklyCategorySpendDocument {
  _id?: string;
  userId: string;
  weekStartDate: Date;
  weekEndDate: Date;
  weekNumber: number;
  year: number;
  categoryId: string;
  categoryName: string;
  
  totalAmount: number;
  transactionCount: number;
  averageAmount: number;
  dailyBreakdown: {
    date: Date;
    amount: number;
    transactionCount: number;
  }[];
  
  // Weekly patterns
  peakDay: string;
  lowestDay: string;
  variance: number;
  trend: 'increasing' | 'decreasing' | 'stable';
  
  lastUpdated: Date;
  version: number;
}

// Analytics aggregation for reporting
export interface CategoryAnalyticsDocument {
  _id?: string;
  userId: string;
  categoryId: string;
  categoryName: string;
  period: 'monthly' | 'quarterly' | 'yearly';
  periodStart: Date;
  periodEnd: Date;
  
  // Financial metrics
  totalSpent: number;
  averageMonthlySpend: number;
  highestMonthlySpend: number;
  lowestMonthlySpend: number;
  budgetAdherence: number; // Percentage of budget used
  
  // Behavioral metrics
  transactionFrequency: number; // Average transactions per month
  averageTransactionSize: number;
  preferredPaymentMethods: {
    method: string;
    percentage: number;
    amount: number;
  }[];
  
  // Trends and insights
  monthlyTrends: {
    month: string;
    amount: number;
    transactionCount: number;
    budgetUsage: number;
  }[];
  
  seasonalPatterns: {
    season: 'spring' | 'summer' | 'fall' | 'winter';
    averageSpend: number;
    variance: number;
  }[];
  
  // Predictions (ML-generated)
  predictions: {
    nextMonthEstimate: number;
    confidence: number;
    factors: string[];
  };
  
  lastUpdated: Date;
  version: number;
}

export const DailyCategorySpendCollectionName = 'daily_category_spend';
export const WeeklyCategorySpendCollectionName = 'weekly_category_spend';
export const CategoryAnalyticsCollectionName = 'category_analytics';

// Index definitions for optimal query performance
export const DailyCategorySpendIndexes = [
  { userId: 1, date: -1 }, // Daily lookups
  { userId: 1, categoryId: 1, date: -1 }, // Category-specific queries
  { userId: 1, 'patterns.isWeekend': 1, date: -1 }, // Weekend analysis
  { lastUpdated: 1 }, // Maintenance queries
];

export const WeeklyCategorySpendIndexes = [
  { userId: 1, weekStartDate: -1 },
  { userId: 1, categoryId: 1, weekStartDate: -1 },
  { userId: 1, year: -1, weekNumber: -1 },
];

export const CategoryAnalyticsIndexes = [
  { userId: 1, categoryId: 1, period: 1, periodStart: -1 },
  { userId: 1, periodEnd: -1 },
  { lastUpdated: 1 },
];