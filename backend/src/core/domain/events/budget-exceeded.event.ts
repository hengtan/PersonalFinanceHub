// backend/src/core/domain/events/budget-exceeded.event.ts
import { BaseDomainEvent } from './base-domain.event';

export interface BudgetExceededPayload {
    userId: string;
    budgetId: string;
    budgetName: string;
    categoryId?: string;
    categoryName?: string;
    allocatedAmount: number;
    spentAmount: number;
    currency: string;
    exceedsBy: number;
    exceedsPercentage: number;
    period: string;
}

export class BudgetExceededEvent extends BaseDomainEvent {
    constructor(
        budgetId: string,
        private readonly payload: BudgetExceededPayload
    ) {
        super(budgetId, 'BudgetExceeded');
    }

    getPayload(): BudgetExceededPayload {
        return { ...this.payload };
    }

    get userId(): string {
        return this.payload.userId;
    }

    get budgetName(): string {
        return this.payload.budgetName;
    }

    get categoryId(): string | undefined {
        return this.payload.categoryId;
    }

    get categoryName(): string | undefined {
        return this.payload.categoryName;
    }

    get allocatedAmount(): number {
        return this.payload.allocatedAmount;
    }

    get spentAmount(): number {
        return this.payload.spentAmount;
    }

    get currency(): string {
        return this.payload.currency;
    }

    get exceedsBy(): number {
        return this.payload.exceedsBy;
    }

    get exceedsPercentage(): number {
        return this.payload.exceedsPercentage;
    }

    get period(): string {
        return this.payload.period;
    }
}