// backend/src/core/domain/services/ledger.service.ts
import { JournalEntryEntity, JournalEntryStatus } from '../entities/journal-entry.entity';
import { LedgerEntryEntity, AccountType, EntryType, ReferenceType } from '../entities/ledger-entry.entity';
import { Money } from '../value-objects/money.vo';
import { UnitOfWork } from './unit-of-work.service';
import { logger } from '../../../infrastructure/monitoring/logger.service';

export interface CreateJournalEntryCommand {
    userId: string;
    transactionId: string;
    description: string;
    reference?: string;
    entries: CreateLedgerEntryCommand[];
    metadata?: Record<string, any>;
}

export interface CreateLedgerEntryCommand {
    accountId: string;
    accountName: string;
    accountType: AccountType;
    entryType: EntryType;
    amount: Money;
    description: string;
    referenceId?: string;
    referenceType?: ReferenceType;
    metadata?: Record<string, any>;
}

export interface LedgerBalance {
    accountId: string;
    accountName: string;
    accountType: AccountType;
    balance: Money;
    debitTotal: Money;
    creditTotal: Money;
    entryCount: number;
}

export interface TrialBalance {
    currency: string;
    accounts: LedgerBalance[];
    totalDebits: Money;
    totalCredits: Money;
    isBalanced: boolean;
    asOfDate: Date;
}

export class LedgerService {
    constructor(private unitOfWork: UnitOfWork) {}

    /**
     * Creates a double-entry journal entry with automatic validation
     */
    async createJournalEntry(command: CreateJournalEntryCommand): Promise<JournalEntryEntity> {
        try {
            logger.debug('Creating journal entry', {
                transactionId: command.transactionId,
                userId: command.userId,
                entriesCount: command.entries.length
            });

            // Validate entries before creation
            this.validateJournalEntryCommand(command);

            // Create ledger entries
            const ledgerEntries: LedgerEntryEntity[] = [];
            const journalEntryId = `JE-${command.transactionId}-${Date.now()}`;

            for (const entryCommand of command.entries) {
                const ledgerEntry = new LedgerEntryEntity({
                    id: `LE-${journalEntryId}-${ledgerEntries.length + 1}`,
                    transactionId: command.transactionId,
                    accountId: entryCommand.accountId,
                    accountName: entryCommand.accountName,
                    accountType: entryCommand.accountType,
                    entryType: entryCommand.entryType,
                    amount: entryCommand.amount,
                    description: entryCommand.description,
                    referenceId: entryCommand.referenceId,
                    referenceType: entryCommand.referenceType,
                    metadata: entryCommand.metadata,
                    journalEntryId: journalEntryId,
                    postedAt: new Date(),
                    createdAt: new Date(),
                    updatedAt: new Date()
                });

                ledgerEntries.push(ledgerEntry);
            }

            // Calculate total amount (sum of all debits or credits, they should be equal)
            const totalDebitAmount = ledgerEntries
                .filter(entry => entry.entryType === EntryType.DEBIT)
                .reduce((sum, entry) => sum + entry.amount.getAmount(), 0);

            // Use the debit total as the journal entry amount
            const totalAmount = new Money(totalDebitAmount, ledgerEntries[0].amount.getCurrency());

            // Create journal entry
            const journalEntry = new JournalEntryEntity({
                id: journalEntryId,
                userId: command.userId,
                transactionId: command.transactionId,
                description: command.description,
                reference: command.reference,
                status: JournalEntryStatus.DRAFT,
                entries: ledgerEntries,
                totalAmount: totalAmount,
                metadata: command.metadata,
                createdAt: new Date(),
                updatedAt: new Date()
            });

            // Validate balance before posting
            if (!journalEntry.isBalanced()) {
                throw new Error('Journal entry is not balanced - debits must equal credits');
            }

            // Post the journal entry
            journalEntry.post();

            // Capture and publish domain events from the entity
            const domainEvents = journalEntry.getDomainEvents();
            for (const event of domainEvents) {
                this.unitOfWork.addDomainEvent(event);
            }
            journalEntry.clearDomainEvents();

            // Track changes in Unit of Work
            this.unitOfWork.trackChange(journalEntry.id, journalEntry, 'INSERT');
            
            for (const entry of ledgerEntries) {
                this.unitOfWork.trackChange(entry.id, entry, 'INSERT');
            }

            logger.info('Journal entry created successfully', {
                journalEntryId: journalEntry.id,
                transactionId: command.transactionId,
                totalAmount: totalAmount.getAmount(),
                currency: totalAmount.getCurrency(),
                entriesCount: ledgerEntries.length
            });

            return journalEntry;

        } catch (error) {
            logger.error('Failed to create journal entry', error as Error, {
                transactionId: command.transactionId,
                userId: command.userId
            });
            throw error;
        }
    }

    /**
     * Creates a simple two-entry journal entry (most common case)
     */
    async createSimpleEntry(
        userId: string,
        transactionId: string,
        description: string,
        debitAccount: { id: string; name: string; type: AccountType },
        creditAccount: { id: string; name: string; type: AccountType },
        amount: Money,
        reference?: string
    ): Promise<JournalEntryEntity> {
        const command: CreateJournalEntryCommand = {
            userId,
            transactionId,
            description,
            reference,
            entries: [
                {
                    accountId: debitAccount.id,
                    accountName: debitAccount.name,
                    accountType: debitAccount.type,
                    entryType: EntryType.DEBIT,
                    amount: amount,
                    description: description
                },
                {
                    accountId: creditAccount.id,
                    accountName: creditAccount.name,
                    accountType: creditAccount.type,
                    entryType: EntryType.CREDIT,
                    amount: amount,
                    description: description
                }
            ]
        };

        return this.createJournalEntry(command);
    }

    /**
     * Creates journal entries for common transaction types
     */
    async recordIncomeTransaction(
        userId: string,
        transactionId: string,
        description: string,
        bankAccountId: string,
        incomeAccountId: string,
        amount: Money
    ): Promise<JournalEntryEntity> {
        // Debit: Bank Account (Asset increases)
        // Credit: Income Account (Revenue increases)
        return this.createSimpleEntry(
            userId,
            transactionId,
            description,
            { id: bankAccountId, name: 'Bank Account', type: AccountType.ASSET },
            { id: incomeAccountId, name: 'Income', type: AccountType.REVENUE },
            amount
        );
    }

    /**
     * Creates journal entries for expense transactions
     */
    async recordExpenseTransaction(
        userId: string,
        transactionId: string,
        description: string,
        expenseAccountId: string,
        bankAccountId: string,
        amount: Money
    ): Promise<JournalEntryEntity> {
        // Debit: Expense Account (Expense increases)
        // Credit: Bank Account (Asset decreases)
        return this.createSimpleEntry(
            userId,
            transactionId,
            description,
            { id: expenseAccountId, name: 'Expense', type: AccountType.EXPENSE },
            { id: bankAccountId, name: 'Bank Account', type: AccountType.ASSET },
            amount
        );
    }

    /**
     * Creates journal entries for transfer transactions
     */
    async recordTransferTransaction(
        userId: string,
        transactionId: string,
        description: string,
        fromAccountId: string,
        toAccountId: string,
        amount: Money
    ): Promise<JournalEntryEntity> {
        // Debit: To Account (Asset increases)
        // Credit: From Account (Asset decreases)
        return this.createSimpleEntry(
            userId,
            transactionId,
            description,
            { id: toAccountId, name: 'To Account', type: AccountType.ASSET },
            { id: fromAccountId, name: 'From Account', type: AccountType.ASSET },
            amount
        );
    }

    /**
     * Validates journal entry command
     */
    private validateJournalEntryCommand(command: CreateJournalEntryCommand): void {
        if (!command.userId || command.userId.trim().length === 0) {
            throw new Error('User ID is required');
        }

        if (!command.transactionId || command.transactionId.trim().length === 0) {
            throw new Error('Transaction ID is required');
        }

        if (!command.description || command.description.trim().length === 0) {
            throw new Error('Description is required');
        }

        if (!command.entries || command.entries.length < 2) {
            throw new Error('At least two ledger entries are required for double-entry accounting');
        }

        // Validate each entry
        for (const entry of command.entries) {
            this.validateLedgerEntryCommand(entry);
        }

        // Validate balance by currency
        const currencyTotals = new Map<string, { debits: number; credits: number }>();

        for (const entry of command.entries) {
            const currency = entry.amount.getCurrency();
            if (!currencyTotals.has(currency)) {
                currencyTotals.set(currency, { debits: 0, credits: 0 });
            }

            const totals = currencyTotals.get(currency)!;
            const amount = entry.amount.getAmount();

            if (entry.entryType === EntryType.DEBIT) {
                totals.debits += amount;
            } else {
                totals.credits += amount;
            }
        }

        // Check balance for each currency
        for (const [currency, totals] of currencyTotals) {
            if (Math.abs(totals.debits - totals.credits) > 0.01) {
                throw new Error(`Journal entry is not balanced for currency ${currency}. Debits: ${totals.debits}, Credits: ${totals.credits}`);
            }
        }
    }

    /**
     * Validates individual ledger entry command
     */
    private validateLedgerEntryCommand(entry: CreateLedgerEntryCommand): void {
        if (!entry.accountId || entry.accountId.trim().length === 0) {
            throw new Error('Account ID is required');
        }

        if (!entry.accountName || entry.accountName.trim().length === 0) {
            throw new Error('Account name is required');
        }

        if (!Object.values(AccountType).includes(entry.accountType)) {
            throw new Error('Valid account type is required');
        }

        if (!Object.values(EntryType).includes(entry.entryType)) {
            throw new Error('Valid entry type is required');
        }

        if (!entry.amount || entry.amount.getAmount() <= 0) {
            throw new Error('Entry amount must be positive');
        }

        if (!entry.description || entry.description.trim().length === 0) {
            throw new Error('Entry description is required');
        }

        if (entry.referenceType && !entry.referenceId) {
            throw new Error('Reference ID is required when reference type is specified');
        }

        if (entry.referenceId && !entry.referenceType) {
            throw new Error('Reference type is required when reference ID is specified');
        }
    }
}