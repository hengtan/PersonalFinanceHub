// backend/src/core/domain/entities/journal-entry.entity.ts
import { BaseEntity } from '../../../shared/types/database.types';
import { LedgerEntryEntity, EntryType, AccountType } from './ledger-entry.entity';
import { Money } from '../value-objects/money.vo';
import { JournalEntryPostedEvent } from '../events/journal-entry-posted.event';
import { JournalEntryReversedEvent } from '../events/journal-entry-reversed.event';
import { BaseDomainEvent } from '../events/base-domain.event';

export interface JournalEntryProps {
    id: string;
    userId: string;
    transactionId: string;
    description: string;
    reference?: string;
    status: JournalEntryStatus;
    entries: LedgerEntryEntity[];
    totalAmount: Money;
    postedAt?: Date;
    reversedAt?: Date;
    reversedBy?: string;
    metadata?: Record<string, any>;
    createdAt: Date;
    updatedAt: Date;
}

export enum JournalEntryStatus {
    DRAFT = 'DRAFT',
    POSTED = 'POSTED',
    REVERSED = 'REVERSED',
    ERROR = 'ERROR'
}

export class JournalEntryEntity implements BaseEntity {
    private readonly props: JournalEntryProps;
    private readonly domainEvents: BaseDomainEvent[] = [];

    constructor(props: JournalEntryProps) {
        this.props = props;
        this.validate();
    }

    // Domain Events
    getDomainEvents(): BaseDomainEvent[] {
        return [...this.domainEvents];
    }

    clearDomainEvents(): void {
        this.domainEvents.length = 0;
    }

    private addDomainEvent(event: BaseDomainEvent): void {
        this.domainEvents.push(event);
    }

    // Getters
    get id(): string { return this.props.id; }
    get userId(): string { return this.props.userId; }
    get transactionId(): string { return this.props.transactionId; }
    get description(): string { return this.props.description; }
    get reference(): string | undefined { return this.props.reference; }
    get status(): JournalEntryStatus { return this.props.status; }
    get entries(): LedgerEntryEntity[] { return [...this.props.entries]; }
    get totalAmount(): Money { return this.props.totalAmount; }
    get postedAt(): Date | undefined { return this.props.postedAt; }
    get reversedAt(): Date | undefined { return this.props.reversedAt; }
    get reversedBy(): string | undefined { return this.props.reversedBy; }
    get metadata(): Record<string, any> | undefined { return this.props.metadata; }
    get createdAt(): Date { return this.props.createdAt; }
    get updatedAt(): Date { return this.props.updatedAt; }

    /**
     * Adds a ledger entry to this journal entry
     */
    addEntry(entry: LedgerEntryEntity): void {
        if (this.props.status === JournalEntryStatus.POSTED) {
            throw new Error('Cannot modify posted journal entry');
        }

        if (this.props.status === JournalEntryStatus.REVERSED) {
            throw new Error('Cannot modify reversed journal entry');
        }

        this.props.entries.push(entry);
        this.props.updatedAt = new Date();
    }

    /**
     * Removes a ledger entry from this journal entry
     */
    removeEntry(entryId: string): void {
        if (this.props.status === JournalEntryStatus.POSTED) {
            throw new Error('Cannot modify posted journal entry');
        }

        if (this.props.status === JournalEntryStatus.REVERSED) {
            throw new Error('Cannot modify reversed journal entry');
        }

        const index = this.props.entries.findIndex(entry => entry.id === entryId);
        if (index === -1) {
            throw new Error(`Ledger entry ${entryId} not found`);
        }

        this.props.entries.splice(index, 1);
        this.props.updatedAt = new Date();
    }

    /**
     * Posts the journal entry (makes it permanent)
     */
    post(): void {
        if (this.props.status === JournalEntryStatus.POSTED) {
            throw new Error('Journal entry is already posted');
        }

        if (this.props.status === JournalEntryStatus.REVERSED) {
            throw new Error('Cannot post reversed journal entry');
        }

        if (this.props.entries.length < 2) {
            throw new Error('Journal entry must have at least 2 entries');
        }

        if (!this.isBalanced()) {
            throw new Error('Journal entry must be balanced before posting');
        }

        this.props.status = JournalEntryStatus.POSTED;
        this.props.postedAt = new Date();
        this.props.updatedAt = new Date();

        // Publish domain event
        const event = new JournalEntryPostedEvent(this.props.id, {
            userId: this.props.userId,
            transactionId: this.props.transactionId,
            description: this.props.description,
            totalAmount: {
                amount: this.props.totalAmount.amount,
                currency: this.props.totalAmount.currency
            },
            entries: this.props.entries.map(entry => ({
                accountId: entry.accountId,
                accountType: entry.accountType,
                entryType: entry.entryType,
                amount: {
                    amount: entry.amount.amount,
                    currency: entry.amount.currency
                },
                description: entry.description
            })),
            postedAt: this.props.postedAt!,
            reference: this.props.reference,
            metadata: this.props.metadata
        });

        this.addDomainEvent(event);
    }

    /**
     * Reverses the journal entry
     */
    reverse(reversedBy: string, reason?: string): JournalEntryEntity {
        if (this.props.status === JournalEntryStatus.REVERSED) {
            throw new Error('Journal entry is already reversed');
        }

        if (this.props.status !== JournalEntryStatus.POSTED) {
            throw new Error('Only posted journal entries can be reversed');
        }

        // Mark this entry as reversed
        this.props.status = JournalEntryStatus.REVERSED;
        this.props.reversedAt = new Date();
        this.props.reversedBy = reversedBy;
        this.props.updatedAt = new Date();

        // Create reversing entries
        const reversingEntries = this.props.entries.map(entry => 
            entry.createReversingEntry(
                `REV-${this.props.id}`,
                reason || `Reversal of journal entry ${this.props.id}`
            )
        );

        // Publish domain event
        const reversingJournalEntryId = `REV-${this.props.id}`;
        const event = new JournalEntryReversedEvent(this.props.id, {
            userId: this.props.userId,
            originalJournalEntryId: this.props.id,
            reversingJournalEntryId,
            reversedBy,
            reason,
            reversedAt: this.props.reversedAt!,
            originalAmount: {
                amount: this.props.totalAmount.amount,
                currency: this.props.totalAmount.currency
            },
            metadata: {
                ...this.props.metadata,
                reversalReason: reason
            }
        });

        this.addDomainEvent(event);

        // Create reversing journal entry
        return new JournalEntryEntity({
            id: reversingJournalEntryId,
            userId: this.props.userId,
            transactionId: this.props.transactionId,
            description: `Reversal of: ${this.props.description}`,
            reference: this.props.id,
            status: JournalEntryStatus.POSTED,
            entries: reversingEntries,
            totalAmount: this.props.totalAmount,
            postedAt: new Date(),
            metadata: {
                ...this.props.metadata,
                reversalReason: reason,
                originalJournalEntryId: this.props.id
            },
            createdAt: new Date(),
            updatedAt: new Date()
        });
    }

    /**
     * Checks if the journal entry is balanced (debits = credits)
     */
    isBalanced(): boolean {
        if (this.props.entries.length === 0) {
            return false;
        }

        // Group by currency
        const currencyTotals = new Map<string, { debits: number; credits: number }>();

        for (const entry of this.props.entries) {
            const currency = entry.amount.getCurrency();
            const amount = entry.amount.getAmount();

            if (!currencyTotals.has(currency)) {
                currencyTotals.set(currency, { debits: 0, credits: 0 });
            }

            const totals = currencyTotals.get(currency)!;
            
            if (entry.entryType === EntryType.DEBIT) {
                totals.debits += amount;
            } else {
                totals.credits += amount;
            }
        }

        // Check balance for each currency
        for (const [currency, totals] of currencyTotals) {
            if (Math.abs(totals.debits - totals.credits) > 0.01) {
                return false;
            }
        }

        return true;
    }

    /**
     * Gets the total debit amount for a specific currency
     */
    getTotalDebits(currency: string): Money {
        const total = this.props.entries
            .filter(entry => entry.entryType === EntryType.DEBIT && entry.amount.getCurrency() === currency)
            .reduce((sum, entry) => sum + entry.amount.getAmount(), 0);

        return new Money(total, currency);
    }

    /**
     * Gets the total credit amount for a specific currency
     */
    getTotalCredits(currency: string): Money {
        const total = this.props.entries
            .filter(entry => entry.entryType === EntryType.CREDIT && entry.amount.getCurrency() === currency)
            .reduce((sum, entry) => sum + entry.amount.getAmount(), 0);

        return new Money(total, currency);
    }

    /**
     * Gets entries for a specific account type
     */
    getEntriesByAccountType(accountType: AccountType): LedgerEntryEntity[] {
        return this.props.entries.filter(entry => entry.accountType === accountType);
    }

    /**
     * Gets entries for a specific entry type
     */
    getEntriesByType(entryType: EntryType): LedgerEntryEntity[] {
        return this.props.entries.filter(entry => entry.entryType === entryType);
    }

    /**
     * Gets all currencies involved in this journal entry
     */
    getCurrencies(): string[] {
        const currencies = new Set<string>();
        for (const entry of this.props.entries) {
            currencies.add(entry.amount.getCurrency());
        }
        return Array.from(currencies);
    }

    /**
     * Gets the balance summary for this journal entry
     */
    getBalanceSummary(): {
        currency: string;
        debits: Money;
        credits: Money;
        balance: Money;
        isBalanced: boolean;
    }[] {
        const currencies = this.getCurrencies();
        
        return currencies.map(currency => {
            const debits = this.getTotalDebits(currency);
            const credits = this.getTotalCredits(currency);
            const balance = new Money(
                debits.getAmount() - credits.getAmount(),
                currency
            );
            
            return {
                currency,
                debits,
                credits,
                balance,
                isBalanced: Math.abs(balance.getAmount()) < 0.01
            };
        });
    }

    /**
     * Updates the metadata for this journal entry
     */
    updateMetadata(newMetadata: Record<string, any>): void {
        if (this.props.status === JournalEntryStatus.POSTED) {
            throw new Error('Cannot modify metadata of posted journal entry');
        }

        this.props.metadata = { ...this.props.metadata, ...newMetadata };
        this.props.updatedAt = new Date();
    }

    /**
     * Updates the description
     */
    updateDescription(description: string): void {
        if (this.props.status === JournalEntryStatus.POSTED) {
            throw new Error('Cannot modify description of posted journal entry');
        }

        if (!description || description.trim().length === 0) {
            throw new Error('Description is required');
        }

        this.props.description = description.trim();
        this.props.updatedAt = new Date();
    }

    /**
     * Marks the journal entry as having an error
     */
    markAsError(errorMessage?: string): void {
        this.props.status = JournalEntryStatus.ERROR;
        this.props.metadata = {
            ...this.props.metadata,
            errorMessage,
            errorTimestamp: new Date().toISOString()
        };
        this.props.updatedAt = new Date();
    }

    /**
     * Checks if the journal entry can be modified
     */
    canModify(): boolean {
        return this.props.status === JournalEntryStatus.DRAFT || 
               this.props.status === JournalEntryStatus.ERROR;
    }

    /**
     * Checks if the journal entry is posted
     */
    isPosted(): boolean {
        return this.props.status === JournalEntryStatus.POSTED;
    }

    /**
     * Checks if the journal entry is reversed
     */
    isReversed(): boolean {
        return this.props.status === JournalEntryStatus.REVERSED;
    }

    /**
     * Checks if the journal entry has errors
     */
    hasError(): boolean {
        return this.props.status === JournalEntryStatus.ERROR;
    }

    private validate(): void {
        if (!this.props.id || this.props.id.trim().length === 0) {
            throw new Error('Journal entry ID is required');
        }

        if (!this.props.userId || this.props.userId.trim().length === 0) {
            throw new Error('User ID is required');
        }

        if (!this.props.transactionId || this.props.transactionId.trim().length === 0) {
            throw new Error('Transaction ID is required');
        }

        if (!this.props.description || this.props.description.trim().length === 0) {
            throw new Error('Description is required');
        }

        if (!Object.values(JournalEntryStatus).includes(this.props.status)) {
            throw new Error('Valid status is required');
        }

        if (!this.props.totalAmount || this.props.totalAmount.getAmount() < 0) {
            throw new Error('Total amount must be non-negative');
        }

        if (this.props.status === JournalEntryStatus.POSTED && !this.props.postedAt) {
            throw new Error('Posted journal entry must have posted date');
        }

        if (this.props.status === JournalEntryStatus.REVERSED && !this.props.reversedAt) {
            throw new Error('Reversed journal entry must have reversed date');
        }

        if (this.props.reversedAt && !this.props.reversedBy) {
            throw new Error('Reversed journal entry must have reversed by user');
        }
    }

    toJSON(): any {
        return {
            id: this.id,
            userId: this.userId,
            transactionId: this.transactionId,
            description: this.description,
            reference: this.reference,
            status: this.status,
            entries: this.entries.map(entry => entry.toJSON()),
            totalAmount: this.totalAmount.toJSON(),
            postedAt: this.postedAt?.toISOString(),
            reversedAt: this.reversedAt?.toISOString(),
            reversedBy: this.reversedBy,
            metadata: this.metadata,
            createdAt: this.createdAt.toISOString(),
            updatedAt: this.updatedAt.toISOString(),
            balanceSummary: this.getBalanceSummary(),
            isBalanced: this.isBalanced(),
            canModify: this.canModify()
        };
    }
}