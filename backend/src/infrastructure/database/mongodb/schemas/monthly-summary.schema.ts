// MongoDB Schema for Monthly Summary (Read Model)
export interface MonthlySummaryDocument {
  _id?: string;
  userId: string;
  month: number;
  year: number;
  totalIncome: number;
  totalExpenses: number;
  netIncome: number;
  transactionCount: number;
  categoryBreakdown: {
    categoryId: string;
    categoryName: string;
    amount: number;
    percentage: number;
    transactionCount: number;
  }[];
  budgetComparison: {
    categoryId: string;
    budgeted: number;
    spent: number;
    remaining: number;
    percentageUsed: number;
    status: 'under_budget' | 'on_budget' | 'over_budget';
  }[];
  averageTransactionValue: number;
  highestExpense: {
    amount: number;
    description: string;
    date: Date;
  };
  topCategories: {
    categoryName: string;
    amount: number;
    count: number;
  }[];
  comparedToPreviousMonth: {
    incomeChange: number;
    expenseChange: number;
    netIncomeChange: number;
    changePercentage: number;
  };
  trends: {
    dailyAverages: number[];
    weeklyTotals: number[];
    peakSpendingDay: string;
  };
  lastUpdated: Date;
  version: number;
}

export const MonthlySummaryCollectionName = 'monthly_summaries';

// Index definitions for optimal query performance
export const MonthlySummaryIndexes = [
  { userId: 1, year: -1, month: -1 }, // Primary query pattern
  { userId: 1, lastUpdated: -1 }, // Recent summaries
  { lastUpdated: 1 }, // Cleanup old records
  { 'categoryBreakdown.categoryId': 1 }, // Category analysis
];