// backend/src/core/application/services/transaction-ledger.application.service.ts
import { TransactionEntity } from '../../domain/entities/transaction.entity';
import { JournalEntryEntity } from '../../domain/entities/journal-entry.entity';
import { LedgerService, CreateJournalEntryCommand } from '../../domain/services/ledger.service';
import { UnitOfWork } from '../../domain/services/unit-of-work.service';
import { JournalEntryRepositoryPostgres } from '../../../infrastructure/database/postgres/repositories/journal-entry.repository';
import { AccountType, EntryType, ReferenceType } from '../../domain/entities/ledger-entry.entity';
import { Money } from '../../domain/value-objects/money.vo';
import { TransactionLedgerProcessedEvent } from '../../domain/events/transaction-ledger-processed.event';
import { logger } from '../../../infrastructure/monitoring/logger.service';

export interface ProcessTransactionCommand {
    transaction: TransactionEntity;
    userId: string;
    accountMappings: {
        sourceAccountId: string;
        sourceAccountName: string;
        sourceAccountType: AccountType;
        targetAccountId: string;
        targetAccountName: string;
        targetAccountType: AccountType;
    };
}

export interface TransactionLedgerSummary {
    transactionId: string;
    journalEntries: JournalEntryEntity[];
    totalAmount: Money;
    isBalanced: boolean;
    entriesCount: number;
}

/**
 * Application service that handles the integration between transactions and the double-entry ledger system
 */
export class TransactionLedgerApplicationService {
    constructor(
        private unitOfWork: UnitOfWork,
        private ledgerService: LedgerService,
        private journalEntryRepository: JournalEntryRepositoryPostgres
    ) {
        // Register repositories with Unit of Work
        this.unitOfWork.registerRepository(this.journalEntryRepository);
    }

    /**
     * Processes a transaction and creates the corresponding journal entries
     */
    async processTransaction(command: ProcessTransactionCommand): Promise<TransactionLedgerSummary> {
        try {
            logger.debug('Processing transaction for ledger', {
                transactionId: command.transaction.id,
                userId: command.userId,
                transactionType: command.transaction.transactionType,
                amount: command.transaction.amount.getAmount()
            });

            const journalEntries: JournalEntryEntity[] = [];

            // Create journal entry based on transaction type
            switch (command.transaction.transactionType) {
                case 'income':
                    const incomeEntry = await this.processIncomeTransaction(command);
                    journalEntries.push(incomeEntry);
                    break;
                    
                case 'expense':
                    const expenseEntry = await this.processExpenseTransaction(command);
                    journalEntries.push(expenseEntry);
                    break;
                    
                case 'transfer':
                    const transferEntry = await this.processTransferTransaction(command);
                    journalEntries.push(transferEntry);
                    break;
                    
                default:
                    throw new Error(`Unsupported transaction type: ${command.transaction.transactionType}`);
            }

            // Calculate totals
            const totalAmount = journalEntries.reduce((sum, je) => {
                return je.totalAmount.hasSameCurrency(sum) 
                    ? new Money(sum.getAmount() + je.totalAmount.getAmount(), sum.getCurrency())
                    : sum;
            }, new Money(0, command.transaction.amount.getCurrency()));

            const isBalanced = journalEntries.every(je => je.isBalanced());
            const entriesCount = journalEntries.reduce((count, je) => count + je.entries.length, 0);

            logger.info('Transaction processed successfully for ledger', {
                transactionId: command.transaction.id,
                journalEntriesCount: journalEntries.length,
                totalAmount: totalAmount.getAmount(),
                isBalanced,
                entriesCount
            });

            // Publish TransactionLedgerProcessed event
            const processedEvent = new TransactionLedgerProcessedEvent(
                command.transaction.id,
                {
                    userId: command.userId,
                    transactionId: command.transaction.id,
                    transactionType: command.transaction.transactionType,
                    amount: {
                        amount: command.transaction.amount.getAmount(),
                        currency: command.transaction.amount.getCurrency()
                    },
                    description: command.transaction.description,
                    journalEntryIds: journalEntries.map(je => je.id),
                    processedAt: new Date(),
                    accountsAffected: this.getAccountsAffectedSummary(journalEntries),
                    metadata: {
                        isBalanced,
                        entriesCount,
                        processedBy: 'TransactionLedgerApplicationService'
                    }
                }
            );

            this.unitOfWork.addDomainEvent(processedEvent);

            return {
                transactionId: command.transaction.id,
                journalEntries,
                totalAmount,
                isBalanced,
                entriesCount
            };

        } catch (error) {
            logger.error('Failed to process transaction for ledger', error as Error, {
                transactionId: command.transaction.id,
                userId: command.userId
            });
            throw error;
        }
    }

    /**
     * Creates a summary of accounts affected by the journal entries
     */
    private getAccountsAffectedSummary(journalEntries: JournalEntryEntity[]) {
        const accounts: Array<{
            accountId: string;
            accountType: string;
            entryType: 'DEBIT' | 'CREDIT';
            amount: { amount: number; currency: string };
        }> = [];

        for (const journalEntry of journalEntries) {
            for (const ledgerEntry of journalEntry.entries) {
                accounts.push({
                    accountId: ledgerEntry.accountId,
                    accountType: ledgerEntry.accountType,
                    entryType: ledgerEntry.entryType,
                    amount: {
                        amount: ledgerEntry.amount.getAmount(),
                        currency: ledgerEntry.amount.getCurrency()
                    }
                });
            }
        }

        return accounts;
    }

    /**
     * Processes an income transaction
     */
    private async processIncomeTransaction(command: ProcessTransactionCommand): Promise<JournalEntryEntity> {
        const journalEntryCommand: CreateJournalEntryCommand = {
            userId: command.userId,
            transactionId: command.transaction.id,
            description: `Income: ${command.transaction.description}`,
            reference: command.transaction.referenceNumber,
            entries: [
                {
                    // Debit: Bank Account (Asset increases)
                    accountId: command.accountMappings.targetAccountId,
                    accountName: command.accountMappings.targetAccountName,
                    accountType: command.accountMappings.targetAccountType,
                    entryType: EntryType.DEBIT,
                    amount: command.transaction.amount,
                    description: `Income received: ${command.transaction.description}`,
                    referenceId: command.transaction.id,
                    referenceType: ReferenceType.TRANSACTION,
                    metadata: {
                        categoryId: command.transaction.categoryId,
                        merchantId: command.transaction.merchantId,
                        transactionDate: command.transaction.transactionDate.toISOString()
                    }
                },
                {
                    // Credit: Income Account (Revenue increases)
                    accountId: command.accountMappings.sourceAccountId,
                    accountName: command.accountMappings.sourceAccountName,
                    accountType: command.accountMappings.sourceAccountType,
                    entryType: EntryType.CREDIT,
                    amount: command.transaction.amount,
                    description: `Income earned: ${command.transaction.description}`,
                    referenceId: command.transaction.id,
                    referenceType: ReferenceType.TRANSACTION,
                    metadata: {
                        categoryId: command.transaction.categoryId,
                        merchantId: command.transaction.merchantId,
                        transactionDate: command.transaction.transactionDate.toISOString()
                    }
                }
            ],
            metadata: {
                transactionType: command.transaction.transactionType,
                originalTransactionId: command.transaction.id,
                processedAt: new Date().toISOString()
            }
        };

        return this.ledgerService.createJournalEntry(journalEntryCommand);
    }

    /**
     * Processes an expense transaction
     */
    private async processExpenseTransaction(command: ProcessTransactionCommand): Promise<JournalEntryEntity> {
        const journalEntryCommand: CreateJournalEntryCommand = {
            userId: command.userId,
            transactionId: command.transaction.id,
            description: `Expense: ${command.transaction.description}`,
            reference: command.transaction.referenceNumber,
            entries: [
                {
                    // Debit: Expense Account (Expense increases)
                    accountId: command.accountMappings.targetAccountId,
                    accountName: command.accountMappings.targetAccountName,
                    accountType: command.accountMappings.targetAccountType,
                    entryType: EntryType.DEBIT,
                    amount: command.transaction.amount,
                    description: `Expense incurred: ${command.transaction.description}`,
                    referenceId: command.transaction.id,
                    referenceType: ReferenceType.TRANSACTION,
                    metadata: {
                        categoryId: command.transaction.categoryId,
                        merchantId: command.transaction.merchantId,
                        transactionDate: command.transaction.transactionDate.toISOString()
                    }
                },
                {
                    // Credit: Bank Account (Asset decreases)
                    accountId: command.accountMappings.sourceAccountId,
                    accountName: command.accountMappings.sourceAccountName,
                    accountType: command.accountMappings.sourceAccountType,
                    entryType: EntryType.CREDIT,
                    amount: command.transaction.amount,
                    description: `Payment made: ${command.transaction.description}`,
                    referenceId: command.transaction.id,
                    referenceType: ReferenceType.TRANSACTION,
                    metadata: {
                        categoryId: command.transaction.categoryId,
                        merchantId: command.transaction.merchantId,
                        transactionDate: command.transaction.transactionDate.toISOString()
                    }
                }
            ],
            metadata: {
                transactionType: command.transaction.transactionType,
                originalTransactionId: command.transaction.id,
                processedAt: new Date().toISOString()
            }
        };

        return this.ledgerService.createJournalEntry(journalEntryCommand);
    }

    /**
     * Processes a transfer transaction
     */
    private async processTransferTransaction(command: ProcessTransactionCommand): Promise<JournalEntryEntity> {
        const journalEntryCommand: CreateJournalEntryCommand = {
            userId: command.userId,
            transactionId: command.transaction.id,
            description: `Transfer: ${command.transaction.description}`,
            reference: command.transaction.referenceNumber,
            entries: [
                {
                    // Debit: Destination Account (Asset increases)
                    accountId: command.accountMappings.targetAccountId,
                    accountName: command.accountMappings.targetAccountName,
                    accountType: command.accountMappings.targetAccountType,
                    entryType: EntryType.DEBIT,
                    amount: command.transaction.amount,
                    description: `Transfer received: ${command.transaction.description}`,
                    referenceId: command.transaction.id,
                    referenceType: ReferenceType.TRANSACTION,
                    metadata: {
                        transferType: 'inbound',
                        transactionDate: command.transaction.transactionDate.toISOString()
                    }
                },
                {
                    // Credit: Source Account (Asset decreases)
                    accountId: command.accountMappings.sourceAccountId,
                    accountName: command.accountMappings.sourceAccountName,
                    accountType: command.accountMappings.sourceAccountType,
                    entryType: EntryType.CREDIT,
                    amount: command.transaction.amount,
                    description: `Transfer sent: ${command.transaction.description}`,
                    referenceId: command.transaction.id,
                    referenceType: ReferenceType.TRANSACTION,
                    metadata: {
                        transferType: 'outbound',
                        transactionDate: command.transaction.transactionDate.toISOString()
                    }
                }
            ],
            metadata: {
                transactionType: command.transaction.transactionType,
                originalTransactionId: command.transaction.id,
                processedAt: new Date().toISOString()
            }
        };

        return this.ledgerService.createJournalEntry(journalEntryCommand);
    }

    /**
     * Gets journal entries for a transaction
     */
    async getTransactionJournalEntries(transactionId: string): Promise<JournalEntryEntity[]> {
        try {
            logger.debug('Getting journal entries for transaction', { transactionId });

            return await this.journalEntryRepository.findByTransactionId(transactionId);

        } catch (error) {
            logger.error('Failed to get journal entries for transaction', error as Error, { transactionId });
            throw error;
        }
    }

    /**
     * Reverses all journal entries for a transaction
     */
    async reverseTransactionEntries(transactionId: string, reversedBy: string, reason?: string): Promise<JournalEntryEntity[]> {
        try {
            logger.debug('Reversing journal entries for transaction', { transactionId, reversedBy });

            const journalEntries = await this.journalEntryRepository.findByTransactionId(transactionId);
            const reversingEntries: JournalEntryEntity[] = [];

            for (const journalEntry of journalEntries) {
                if (journalEntry.isPosted() && !journalEntry.isReversed()) {
                    const reversingEntry = journalEntry.reverse(reversedBy, reason);
                    await this.journalEntryRepository.save(reversingEntry);
                    reversingEntries.push(reversingEntry);
                }
            }

            logger.info('Transaction journal entries reversed successfully', {
                transactionId,
                reversedBy,
                reversingEntriesCount: reversingEntries.length
            });

            return reversingEntries;

        } catch (error) {
            logger.error('Failed to reverse journal entries for transaction', error as Error, { 
                transactionId, 
                reversedBy 
            });
            throw error;
        }
    }

    /**
     * Validates that all journal entries for a transaction are balanced
     */
    async validateTransactionBalance(transactionId: string): Promise<{
        isBalanced: boolean;
        details: Array<{
            journalEntryId: string;
            isBalanced: boolean;
            balanceSummary: any;
        }>;
    }> {
        try {
            logger.debug('Validating transaction balance', { transactionId });

            const journalEntries = await this.journalEntryRepository.findByTransactionId(transactionId);
            const details = journalEntries.map(je => ({
                journalEntryId: je.id,
                isBalanced: je.isBalanced(),
                balanceSummary: je.getBalanceSummary()
            }));

            const isBalanced = details.every(detail => detail.isBalanced);

            return { isBalanced, details };

        } catch (error) {
            logger.error('Failed to validate transaction balance', error as Error, { transactionId });
            throw error;
        }
    }
}