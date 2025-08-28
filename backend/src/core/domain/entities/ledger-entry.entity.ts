// backend/src/core/domain/entities/ledger-entry.entity.ts
import { BaseEntity } from '../../../shared/types/database.types';
import { Money } from '../value-objects/money.vo';

export interface LedgerEntryProps {
    id: string;
    transactionId: string;
    accountId: string;
    accountName: string;
    accountType: AccountType;
    entryType: EntryType;
    amount: Money;
    description: string;
    referenceId?: string;
    referenceType?: ReferenceType;
    metadata?: Record<string, any>;
    journalEntryId: string;
    postedAt: Date;
    createdAt: Date;
    updatedAt: Date;
}

export enum AccountType {
    ASSET = 'ASSET',
    LIABILITY = 'LIABILITY', 
    EQUITY = 'EQUITY',
    REVENUE = 'REVENUE',
    EXPENSE = 'EXPENSE'
}

export enum EntryType {
    DEBIT = 'DEBIT',
    CREDIT = 'CREDIT'
}

export enum ReferenceType {
    TRANSACTION = 'TRANSACTION',
    BUDGET = 'BUDGET',
    CATEGORY = 'CATEGORY',
    USER = 'USER',
    ACCOUNT = 'ACCOUNT'
}

export class LedgerEntryEntity implements BaseEntity {
    private readonly props: LedgerEntryProps;

    constructor(props: LedgerEntryProps) {
        this.props = props;
        this.validate();
    }

    // Getters
    get id(): string { return this.props.id; }
    get transactionId(): string { return this.props.transactionId; }
    get accountId(): string { return this.props.accountId; }
    get accountName(): string { return this.props.accountName; }
    get accountType(): AccountType { return this.props.accountType; }
    get entryType(): EntryType { return this.props.entryType; }
    get amount(): Money { return this.props.amount; }
    get description(): string { return this.props.description; }
    get referenceId(): string | undefined { return this.props.referenceId; }
    get referenceType(): ReferenceType | undefined { return this.props.referenceType; }
    get metadata(): Record<string, any> | undefined { return this.props.metadata; }
    get journalEntryId(): string { return this.props.journalEntryId; }
    get postedAt(): Date { return this.props.postedAt; }
    get createdAt(): Date { return this.props.createdAt; }
    get updatedAt(): Date { return this.props.updatedAt; }

    /**
     * Checks if this is a debit entry
     */
    isDebit(): boolean {
        return this.props.entryType === EntryType.DEBIT;
    }

    /**
     * Checks if this is a credit entry  
     */
    isCredit(): boolean {
        return this.props.entryType === EntryType.CREDIT;
    }

    /**
     * Gets the signed amount based on entry type and account type
     * Following double-entry accounting rules:
     * - Asset/Expense accounts: Debit increases (positive), Credit decreases (negative)
     * - Liability/Equity/Revenue accounts: Credit increases (positive), Debit decreases (negative)
     */
    getSignedAmount(): Money {
        const isNormalDebitAccount = this.props.accountType === AccountType.ASSET || 
                                   this.props.accountType === AccountType.EXPENSE;

        let multiplier: number;
        if (isNormalDebitAccount) {
            // Asset/Expense accounts: Debit = +, Credit = -
            multiplier = this.props.entryType === EntryType.DEBIT ? 1 : -1;
        } else {
            // Liability/Equity/Revenue accounts: Credit = +, Debit = -
            multiplier = this.props.entryType === EntryType.CREDIT ? 1 : -1;
        }

        return new Money(
            this.props.amount.getAmount() * multiplier,
            this.props.amount.getCurrency(),
            true
        );
    }

    /**
     * Checks if this entry balances with another entry (opposite amounts)
     */
    balancesWith(otherEntry: LedgerEntryEntity): boolean {
        if (!this.props.amount.hasSameCurrency(otherEntry.props.amount)) {
            return false;
        }

        const thisSignedAmount = this.getSignedAmount();
        const otherSignedAmount = otherEntry.getSignedAmount();

        return Math.abs(thisSignedAmount.getAmount() + otherSignedAmount.getAmount()) < 0.01;
    }

    /**
     * Gets the opposite entry type (debit <-> credit)
     */
    getOppositeEntryType(): EntryType {
        return this.props.entryType === EntryType.DEBIT ? EntryType.CREDIT : EntryType.DEBIT;
    }

    /**
     * Creates a reversing entry for this ledger entry
     */
    createReversingEntry(journalEntryId: string, description?: string): LedgerEntryEntity {
        return new LedgerEntryEntity({
            ...this.props,
            id: `${this.props.id}-rev-${Date.now()}`, // Generate unique reversal ID
            entryType: this.getOppositeEntryType(),
            journalEntryId,
            description: description || `Reversal of: ${this.props.description}`,
            postedAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date()
        });
    }

    /**
     * Updates the metadata for this entry
     */
    updateMetadata(newMetadata: Record<string, any>): void {
        this.props.metadata = { ...this.props.metadata, ...newMetadata };
        this.props.updatedAt = new Date();
    }

    /**
     * Checks if this entry matches specific criteria for querying
     */
    matches(criteria: {
        accountType?: AccountType;
        entryType?: EntryType;
        referenceId?: string;
        referenceType?: ReferenceType;
        amountRange?: { min?: number; max?: number };
        dateRange?: { start?: Date; end?: Date };
    }): boolean {
        if (criteria.accountType && this.props.accountType !== criteria.accountType) {
            return false;
        }

        if (criteria.entryType && this.props.entryType !== criteria.entryType) {
            return false;
        }

        if (criteria.referenceId && this.props.referenceId !== criteria.referenceId) {
            return false;
        }

        if (criteria.referenceType && this.props.referenceType !== criteria.referenceType) {
            return false;
        }

        if (criteria.amountRange) {
            const amount = this.props.amount.getAmount();
            if (criteria.amountRange.min && amount < criteria.amountRange.min) {
                return false;
            }
            if (criteria.amountRange.max && amount > criteria.amountRange.max) {
                return false;
            }
        }

        if (criteria.dateRange) {
            if (criteria.dateRange.start && this.props.postedAt < criteria.dateRange.start) {
                return false;
            }
            if (criteria.dateRange.end && this.props.postedAt > criteria.dateRange.end) {
                return false;
            }
        }

        return true;
    }

    private validate(): void {
        if (!this.props.id || this.props.id.trim().length === 0) {
            throw new Error('Ledger entry ID is required');
        }

        if (!this.props.transactionId || this.props.transactionId.trim().length === 0) {
            throw new Error('Transaction ID is required');
        }

        if (!this.props.accountId || this.props.accountId.trim().length === 0) {
            throw new Error('Account ID is required');
        }

        if (!this.props.accountName || this.props.accountName.trim().length === 0) {
            throw new Error('Account name is required');
        }

        if (!Object.values(AccountType).includes(this.props.accountType)) {
            throw new Error('Valid account type is required');
        }

        if (!Object.values(EntryType).includes(this.props.entryType)) {
            throw new Error('Valid entry type is required');
        }

        if (!this.props.amount || this.props.amount.getAmount() <= 0) {
            throw new Error('Amount must be positive');
        }

        if (!this.props.description || this.props.description.trim().length === 0) {
            throw new Error('Description is required');
        }

        if (!this.props.journalEntryId || this.props.journalEntryId.trim().length === 0) {
            throw new Error('Journal entry ID is required');
        }

        if (this.props.referenceType && !this.props.referenceId) {
            throw new Error('Reference ID is required when reference type is specified');
        }

        if (this.props.referenceId && !this.props.referenceType) {
            throw new Error('Reference type is required when reference ID is specified');
        }

        if (this.props.referenceType && !Object.values(ReferenceType).includes(this.props.referenceType)) {
            throw new Error('Valid reference type is required');
        }
    }

    toJSON(): any {
        return {
            id: this.id,
            transactionId: this.transactionId,
            accountId: this.accountId,
            accountName: this.accountName,
            accountType: this.accountType,
            entryType: this.entryType,
            amount: this.amount.toJSON(),
            description: this.description,
            referenceId: this.referenceId,
            referenceType: this.referenceType,
            metadata: this.metadata,
            journalEntryId: this.journalEntryId,
            postedAt: this.postedAt.toISOString(),
            createdAt: this.createdAt.toISOString(),
            updatedAt: this.updatedAt.toISOString()
        };
    }
}