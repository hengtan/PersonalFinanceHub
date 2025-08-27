// backend/src/core/domain/entities/budget.entity.ts
import { BaseEntity } from '../../../shared/types/database.types';
import { Money } from '../value-objects/money.vo';
import { DateRange } from '../value-objects/date-range.vo';

export interface BudgetEntityProps {
    id: string;
    userId: string;
    name: string;
    description?: string;
    totalAmount: Money;
    period: BudgetPeriod;
    dateRange: DateRange;
    categories: BudgetCategory[];
    isActive: boolean;
    alertThreshold: number; // Percentage (0-100)
    metadata?: Record<string, any>;
    createdAt: Date;
    updatedAt: Date;
    deletedAt?: Date;
}

export interface BudgetCategory {
    categoryId: string;
    categoryName: string;
    allocatedAmount: Money;
    spentAmount: Money;
    remainingAmount: Money;
    percentageUsed: number;
}

export enum BudgetPeriod {
    WEEKLY = 'WEEKLY',
    MONTHLY = 'MONTHLY',
    QUARTERLY = 'QUARTERLY',
    YEARLY = 'YEARLY',
    CUSTOM = 'CUSTOM'
}

export class BudgetEntity implements BaseEntity {
    private readonly props: BudgetEntityProps;

    constructor(props: BudgetEntityProps) {
        this.props = props;
        this.validate();
    }

    // Getters
    get id(): string { return this.props.id; }
    get userId(): string { return this.props.userId; }
    get name(): string { return this.props.name; }
    get description(): string | undefined { return this.props.description; }
    get totalAmount(): Money { return this.props.totalAmount; }
    get period(): BudgetPeriod { return this.props.period; }
    get dateRange(): DateRange { return this.props.dateRange; }
    get categories(): BudgetCategory[] { return [...this.props.categories]; }
    get isActive(): boolean { return this.props.isActive; }
    get alertThreshold(): number { return this.props.alertThreshold; }
    get metadata(): Record<string, any> | undefined { return this.props.metadata; }
    get createdAt(): Date { return this.props.createdAt; }
    get updatedAt(): Date { return this.props.updatedAt; }
    get deletedAt(): Date | undefined { return this.props.deletedAt; }

    // Business methods
    activate(): void {
        this.props.isActive = true;
        this.props.updatedAt = new Date();
    }

    deactivate(): void {
        this.props.isActive = false;
        this.props.updatedAt = new Date();
    }

    updateSpentAmount(categoryId: string, spentAmount: Money): void {
        const category = this.props.categories.find(c => c.categoryId === categoryId);
        if (!category) {
            throw new Error(`Categoria ${categoryId} não encontrada no orçamento`);
        }

        category.spentAmount = spentAmount;
        category.remainingAmount = new Money(
            category.allocatedAmount.amount - spentAmount.amount,
            spentAmount.currency
        );
        category.percentageUsed = (spentAmount.amount / category.allocatedAmount.amount) * 100;

        this.props.updatedAt = new Date();
    }

    addCategory(category: Omit<BudgetCategory, 'spentAmount' | 'remainingAmount' | 'percentageUsed'>): void {
        const existingCategory = this.props.categories.find(c => c.categoryId === category.categoryId);
        if (existingCategory) {
            throw new Error(`Categoria ${category.categoryName} já existe neste orçamento`);
        }

        const budgetCategory: BudgetCategory = {
            ...category,
            spentAmount: new Money(0, category.allocatedAmount.currency),
            remainingAmount: category.allocatedAmount,
            percentageUsed: 0
        };

        this.props.categories.push(budgetCategory);
        this.recalculateTotalAmount();
        this.props.updatedAt = new Date();
    }

    removeCategory(categoryId: string): void {
        const index = this.props.categories.findIndex(c => c.categoryId === categoryId);
        if (index === -1) {
            throw new Error(`Categoria ${categoryId} não encontrada no orçamento`);
        }

        this.props.categories.splice(index, 1);
        this.recalculateTotalAmount();
        this.props.updatedAt = new Date();
    }

    updateCategoryAllocation(categoryId: string, newAmount: Money): void {
        const category = this.props.categories.find(c => c.categoryId === categoryId);
        if (!category) {
            throw new Error(`Categoria ${categoryId} não encontrada no orçamento`);
        }

        category.allocatedAmount = newAmount;
        category.remainingAmount = new Money(
            newAmount.amount - category.spentAmount.amount,
            newAmount.currency
        );
        category.percentageUsed = (category.spentAmount.amount / newAmount.amount) * 100;

        this.recalculateTotalAmount();
        this.props.updatedAt = new Date();
    }

    getTotalSpent(): Money {
        const totalSpent = this.props.categories.reduce((total, category) => {
            return total + category.spentAmount.amount;
        }, 0);

        return new Money(totalSpent, this.props.totalAmount.currency);
    }

    getTotalRemaining(): Money {
        const totalSpent = this.getTotalSpent();
        return new Money(
            this.props.totalAmount.amount - totalSpent.amount,
            this.props.totalAmount.currency
        );
    }

    getUsagePercentage(): number {
        const totalSpent = this.getTotalSpent();
        return (totalSpent.amount / this.props.totalAmount.amount) * 100;
    }

    isOverBudget(): boolean {
        return this.getUsagePercentage() > 100;
    }

    shouldAlert(): boolean {
        return this.getUsagePercentage() >= this.props.alertThreshold;
    }

    getCategoriesOverBudget(): BudgetCategory[] {
        return this.props.categories.filter(category => category.percentageUsed > 100);
    }

    getCategoriesNearLimit(): BudgetCategory[] {
        return this.props.categories.filter(
            category => category.percentageUsed >= this.props.alertThreshold && category.percentageUsed <= 100
        );
    }

    isCurrentlyActive(): boolean {
        if (!this.props.isActive) return false;

        const now = new Date();
        return this.props.dateRange.contains(now);
    }

    private recalculateTotalAmount(): void {
        const totalAllocated = this.props.categories.reduce((total, category) => {
            return total + category.allocatedAmount.amount;
        }, 0);

        this.props.totalAmount = new Money(totalAllocated, this.props.totalAmount.currency);
    }

    private validate(): void {
        if (!this.props.name || this.props.name.trim().length === 0) {
            throw new Error('Nome do orçamento é obrigatório');
        }

        if (this.props.totalAmount.amount <= 0) {
            throw new Error('Valor total do orçamento deve ser maior que zero');
        }

        if (this.props.alertThreshold < 0 || this.props.alertThreshold > 100) {
            throw new Error('Limite de alerta deve estar entre 0 e 100');
        }

        if (this.props.categories.length === 0) {
            throw new Error('Orçamento deve ter pelo menos uma categoria');
        }
    }

    toJSON(): any {
        return {
            id: this.id,
            userId: this.userId,
            name: this.name,
            description: this.description,
            totalAmount: this.totalAmount.toJSON(),
            period: this.period,
            dateRange: this.dateRange.toJSON(),
            categories: this.categories.map(c => ({
                ...c,
                allocatedAmount: c.allocatedAmount.toJSON(),
                spentAmount: c.spentAmount.toJSON(),
                remainingAmount: c.remainingAmount.toJSON()
            })),
            isActive: this.isActive,
            alertThreshold: this.alertThreshold,
            metadata: this.metadata,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt
        };
    }
}