// MongoDB Schema for Dashboard Cache (Read Model)
export interface DashboardCacheDocument {
  _id?: string;
  userId: string;
  cacheKey: string; // Unique key for specific dashboard view
  data: {
    // Current month overview
    currentMonth: {
      totalIncome: number;
      totalExpenses: number;
      netIncome: number;
      budgetUtilization: number;
      transactionCount: number;
    };
    
    // Recent transactions
    recentTransactions: {
      id: string;
      amount: number;
      description: string;
      category: string;
      date: Date;
      type: 'income' | 'expense' | 'transfer';
    }[];
    
    // Budget status
    budgetStatus: {
      categoryId: string;
      categoryName: string;
      budgeted: number;
      spent: number;
      remaining: number;
      percentageUsed: number;
      status: 'healthy' | 'warning' | 'exceeded';
      trend: 'up' | 'down' | 'stable';
    }[];
    
    // Monthly trends (last 6 months)
    monthlyTrends: {
      month: string;
      income: number;
      expenses: number;
      netIncome: number;
    }[];
    
    // Category spending (pie chart data)
    categorySpending: {
      categoryName: string;
      amount: number;
      percentage: number;
      color: string;
    }[];
    
    // Account balances
    accountBalances: {
      accountId: string;
      accountName: string;
      balance: number;
      accountType: string;
      currency: string;
    }[];
    
    // Alerts and notifications
    alerts: {
      type: 'budget_warning' | 'budget_exceeded' | 'unusual_spending' | 'bill_reminder';
      message: string;
      priority: 'low' | 'medium' | 'high';
      category?: string;
      amount?: number;
    }[];
    
    // Financial goals progress
    goals: {
      goalId: string;
      goalName: string;
      targetAmount: number;
      currentAmount: number;
      percentage: number;
      dueDate?: Date;
      status: 'on_track' | 'behind' | 'achieved';
    }[];
  };
  
  // Cache metadata
  generatedAt: Date;
  expiresAt: Date;
  version: number;
  lastTransactionId?: string; // To detect if new transactions require cache refresh
  hash: string; // For cache validation
}

export const DashboardCacheCollectionName = 'dashboard_cache';

// Index definitions for optimal cache retrieval
export const DashboardCacheIndexes = [
  { userId: 1, cacheKey: 1 }, // Primary cache lookup
  { expiresAt: 1 }, // TTL-based cleanup
  { userId: 1, generatedAt: -1 }, // Recent cache entries
  { hash: 1 }, // Cache validation
];