// backend/src/core/domain/entities/transaction.entity.ts
import { BaseEntity } from '../../../shared/types/database.types';
import { Money } from '../value-objects/money.vo';
import { DateRange } from '../value-objects/date-range.vo';

export interface TransactionEntityProps {
    id: string;
    userId: string;
    accountId: string;
    destinationAccountId?: string;
    categoryId: string;
    description: string;
    amount: Money;
    type: TransactionType;
    status: TransactionStatus;
    paymentMethod: PaymentMethod;
    transactionDate: Date;
    dueDate?: Date;
    isPaid: boolean;
    isRecurring: boolean;
    recurringConfig?: RecurringConfig;
    tags: string[];
    notes?: string;
    attachments: string[];
    metadata?: Record<string, any>;
    createdAt: Date;
    updatedAt: Date;
    deletedAt?: Date;
}

export enum TransactionType {
    INCOME = 'INCOME',
    EXPENSE = 'EXPENSE',
    TRANSFER = 'TRANSFER'
}

export enum TransactionStatus {
    PENDING = 'PENDING',
    COMPLETED = 'COMPLETED',
    CANCELLED = 'CANCELLED',
    FAILED = 'FAILED'
}

export enum PaymentMethod {
    CASH = 'CASH',
    DEBIT_CARD = 'DEBIT_CARD',
    CREDIT_CARD = 'CREDIT_CARD',
    PIX = 'PIX',
    BANK_TRANSFER = 'BANK_TRANSFER',
    CRYPTOCURRENCY = 'CRYPTOCURRENCY'
}

export interface RecurringConfig {
    frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
    interval: number;
    endDate?: Date;
    nextDate?: Date;
}

export class TransactionEntity implements BaseEntity {
    private readonly props: TransactionEntityProps;

    constructor(props: TransactionEntityProps) {
        this.props = props;
        this.validate();
    }

    // Getters
    get id(): string { return this.props.id; }
    get userId(): string { return this.props.userId; }
    get accountId(): string { return this.props.accountId; }
    get destinationAccountId(): string | undefined { return this.props.destinationAccountId; }
    get categoryId(): string { return this.props.categoryId; }
    get description(): string { return this.props.description; }
    get amount(): Money { return this.props.amount; }
    get type(): TransactionType { return this.props.type; }
    get status(): TransactionStatus { return this.props.status; }
    get paymentMethod(): PaymentMethod { return this.props.paymentMethod; }
    get transactionDate(): Date { return this.props.transactionDate; }
    get dueDate(): Date | undefined { return this.props.dueDate; }
    get isPaid(): boolean { return this.props.isPaid; }
    get isRecurring(): boolean { return this.props.isRecurring; }
    get recurringConfig(): RecurringConfig | undefined { return this.props.recurringConfig; }
    get tags(): string[] { return [...this.props.tags]; }
    get notes(): string | undefined { return this.props.notes; }
    get attachments(): string[] { return [...this.props.attachments]; }
    get metadata(): Record<string, any> | undefined { return this.props.metadata; }
    get createdAt(): Date { return this.props.createdAt; }
    get updatedAt(): Date { return this.props.updatedAt; }
    get deletedAt(): Date | undefined { return this.props.deletedAt; }

    // Business methods
    markAsPaid(): void {
        if (this.props.status === TransactionStatus.CANCELLED) {
            throw new Error('Não é possível marcar como pago uma transação cancelada');
        }

        this.props.isPaid = true;
        this.props.status = TransactionStatus.COMPLETED;
        this.props.updatedAt = new Date();
    }

    markAsUnpaid(): void {
        if (this.props.status === TransactionStatus.CANCELLED) {
            throw new Error('Não é possível desmarcar como pago uma transação cancelada');
        }

        this.props.isPaid = false;
        this.props.status = TransactionStatus.PENDING;
        this.props.updatedAt = new Date();
    }

    cancel(): void {
        if (this.props.status === TransactionStatus.COMPLETED && this.props.isPaid) {
            throw new Error('Não é possível cancelar uma transação já concluída');
        }

        this.props.status = TransactionStatus.CANCELLED;
        this.props.updatedAt = new Date();
    }

    addTag(tag: string): void {
        if (!this.props.tags.includes(tag)) {
            this.props.tags.push(tag);
            this.props.updatedAt = new Date();
        }
    }

    removeTag(tag: string): void {
        const index = this.props.tags.indexOf(tag);
        if (index > -1) {
            this.props.tags.splice(index, 1);
            this.props.updatedAt = new Date();
        }
    }

    addAttachment(url: string): void {
        if (!this.props.attachments.includes(url)) {
            this.props.attachments.push(url);
            this.props.updatedAt = new Date();
        }
    }

    removeAttachment(url: string): void {
        const index = this.props.attachments.indexOf(url);
        if (index > -1) {
            this.props.attachments.splice(index, 1);
            this.props.updatedAt = new Date();
        }
    }

    updateNotes(notes: string): void {
        this.props.notes = notes;
        this.props.updatedAt = new Date();
    }

    isOverdue(): boolean {
        if (!this.props.dueDate || this.props.isPaid) {
            return false;
        }
        return new Date() > this.props.dueDate;
    }

    isTransfer(): boolean {
        return this.props.type === TransactionType.TRANSFER;
    }

    isIncome(): boolean {
        return this.props.type === TransactionType.INCOME;
    }

    isExpense(): boolean {
        return this.props.type === TransactionType.EXPENSE;
    }

    getEffectiveAmount(): number {
        // For expenses, return negative amount
        if (this.props.type === TransactionType.EXPENSE) {
            return -this.props.amount.amount;
        }
        return this.props.amount.amount;
    }

    private validate(): void {
        if (!this.props.description || this.props.description.trim().length === 0) {
            throw new Error('Descrição é obrigatória');
        }

        if (this.props.amount.amount <= 0) {
            throw new Error('Valor deve ser maior que zero');
        }

        if (this.props.type === TransactionType.TRANSFER && !this.props.destinationAccountId) {
            throw new Error('Conta de destino é obrigatória para transferências');
        }

        if (this.props.isRecurring && !this.props.recurringConfig) {
            throw new Error('Configuração de recorrência é obrigatória quando transação é recorrente');
        }

        if (this.props.dueDate && this.props.transactionDate > this.props.dueDate) {
            throw new Error('Data de vencimento não pode ser anterior à data da transação');
        }
    }

    toJSON(): any {
        return {
            id: this.id,
            userId: this.userId,
            accountId: this.accountId,
            destinationAccountId: this.destinationAccountId,
            categoryId: this.categoryId,
            description: this.description,
            amount: this.amount.toJSON(),
            type: this.type,
            status: this.status,
            paymentMethod: this.paymentMethod,
            transactionDate: this.transactionDate,
            dueDate: this.dueDate,
            isPaid: this.isPaid,
            isRecurring: this.isRecurring,
            recurringConfig: this.recurringConfig,
            tags: this.tags,
            notes: this.notes,
            attachments: this.attachments,
            metadata: this.metadata,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt
        };
    }
}