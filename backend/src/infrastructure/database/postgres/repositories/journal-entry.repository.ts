// backend/src/infrastructure/database/postgres/repositories/journal-entry.repository.ts
import { PoolClient } from 'pg';
import { JournalEntryEntity, JournalEntryStatus } from '../../../../core/domain/entities/journal-entry.entity';
import { LedgerEntryEntity } from '../../../../core/domain/entities/ledger-entry.entity';
import { Money } from '../../../../core/domain/value-objects/money.vo';
import { IRepository } from '../../../../core/domain/services/unit-of-work.service';
import { logger } from '../../../monitoring/logger.service';

export interface JournalEntryFilters {
    userId?: string;
    transactionId?: string;
    status?: JournalEntryStatus;
    dateRange?: { start: Date; end: Date };
    amountRange?: { min: number; max: number };
    currency?: string;
    reference?: string;
    limit?: number;
    offset?: number;
}

export class JournalEntryRepositoryPostgres implements IRepository {
    private connection: PoolClient | null = null;

    setConnection(connection: PoolClient): void {
        this.connection = connection;
        logger.debug('Journal entry repository connection set');
    }

    clearConnection(): void {
        this.connection = null;
        logger.debug('Journal entry repository connection cleared');
    }

    private getConnection(): PoolClient {
        if (!this.connection) {
            throw new Error('No database connection available. Repository must be used within a Unit of Work.');
        }
        return this.connection;
    }

    async save(journalEntry: JournalEntryEntity): Promise<JournalEntryEntity> {
        const client = this.getConnection();

        try {
            logger.debug('Saving journal entry', { journalEntryId: journalEntry.id });

            // Insert journal entry
            const journalEntryQuery = `
                INSERT INTO journal_entries (
                    id, user_id, transaction_id, description, reference, status,
                    total_amount, currency, posted_at, reversed_at, reversed_by,
                    metadata, created_at, updated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
                ON CONFLICT (id) DO UPDATE SET
                    description = EXCLUDED.description,
                    reference = EXCLUDED.reference,
                    status = EXCLUDED.status,
                    total_amount = EXCLUDED.total_amount,
                    currency = EXCLUDED.currency,
                    posted_at = EXCLUDED.posted_at,
                    reversed_at = EXCLUDED.reversed_at,
                    reversed_by = EXCLUDED.reversed_by,
                    metadata = EXCLUDED.metadata,
                    updated_at = EXCLUDED.updated_at
                RETURNING *
            `;

            const journalEntryValues = [
                journalEntry.id,
                journalEntry.userId,
                journalEntry.transactionId,
                journalEntry.description,
                journalEntry.reference,
                journalEntry.status,
                journalEntry.totalAmount.getAmount(),
                journalEntry.totalAmount.getCurrency(),
                journalEntry.postedAt,
                journalEntry.reversedAt,
                journalEntry.reversedBy,
                JSON.stringify(journalEntry.metadata || {}),
                journalEntry.createdAt,
                journalEntry.updatedAt
            ];

            await client.query(journalEntryQuery, journalEntryValues);

            // Delete existing ledger entries for this journal entry (in case of update)
            await client.query('DELETE FROM ledger_entries WHERE journal_entry_id = $1', [journalEntry.id]);

            // Insert ledger entries
            for (const entry of journalEntry.entries) {
                const ledgerEntryQuery = `
                    INSERT INTO ledger_entries (
                        id, transaction_id, account_id, account_name, account_type,
                        entry_type, amount, currency, description, reference_id,
                        reference_type, metadata, journal_entry_id, posted_at,
                        created_at, updated_at
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
                `;

                const ledgerEntryValues = [
                    entry.id,
                    entry.transactionId,
                    entry.accountId,
                    entry.accountName,
                    entry.accountType,
                    entry.entryType,
                    entry.amount.getAmount(),
                    entry.amount.getCurrency(),
                    entry.description,
                    entry.referenceId,
                    entry.referenceType,
                    JSON.stringify(entry.metadata || {}),
                    entry.journalEntryId,
                    entry.postedAt,
                    entry.createdAt,
                    entry.updatedAt
                ];

                await client.query(ledgerEntryQuery, ledgerEntryValues);
            }

            logger.info('Journal entry saved successfully', {
                journalEntryId: journalEntry.id,
                entriesCount: journalEntry.entries.length
            });

            return journalEntry;

        } catch (error) {
            logger.error('Failed to save journal entry', error as Error, {
                journalEntryId: journalEntry.id
            });
            throw error;
        }
    }

    async findById(id: string): Promise<JournalEntryEntity | null> {
        const client = this.getConnection();

        try {
            logger.debug('Finding journal entry by ID', { journalEntryId: id });

            const journalQuery = `SELECT * FROM journal_entries WHERE id = $1`;
            const journalResult = await client.query(journalQuery, [id]);

            if (journalResult.rows.length === 0) {
                return null;
            }

            const journalRow = journalResult.rows[0];

            const ledgerQuery = `
                SELECT * FROM ledger_entries 
                WHERE journal_entry_id = $1 
                ORDER BY created_at ASC
            `;
            const ledgerResult = await client.query(ledgerQuery, [id]);

            const ledgerEntries = ledgerResult.rows.map(row => new LedgerEntryEntity({
                id: row.id,
                transactionId: row.transaction_id,
                accountId: row.account_id,
                accountName: row.account_name,
                accountType: row.account_type,
                entryType: row.entry_type,
                amount: new Money(parseFloat(row.amount), row.currency),
                description: row.description,
                referenceId: row.reference_id,
                referenceType: row.reference_type,
                metadata: row.metadata,
                journalEntryId: row.journal_entry_id,
                postedAt: row.posted_at,
                createdAt: row.created_at,
                updatedAt: row.updated_at
            }));

            return new JournalEntryEntity({
                id: journalRow.id,
                userId: journalRow.user_id,
                transactionId: journalRow.transaction_id,
                description: journalRow.description,
                reference: journalRow.reference,
                status: journalRow.status as JournalEntryStatus,
                entries: ledgerEntries,
                totalAmount: new Money(parseFloat(journalRow.total_amount), journalRow.currency),
                postedAt: journalRow.posted_at,
                reversedAt: journalRow.reversed_at,
                reversedBy: journalRow.reversed_by,
                metadata: journalRow.metadata,
                createdAt: journalRow.created_at,
                updatedAt: journalRow.updated_at
            });

        } catch (error) {
            logger.error('Failed to find journal entry by ID', error as Error, { journalEntryId: id });
            throw error;
        }
    }

    async delete(id: string): Promise<void> {
        const client = this.getConnection();

        try {
            logger.debug('Deleting journal entry', { journalEntryId: id });

            await client.query('DELETE FROM ledger_entries WHERE journal_entry_id = $1', [id]);
            const result = await client.query('DELETE FROM journal_entries WHERE id = $1', [id]);

            if (result.rowCount === 0) {
                throw new Error(`Journal entry ${id} not found`);
            }

            logger.info('Journal entry deleted successfully', { journalEntryId: id });

        } catch (error) {
            logger.error('Failed to delete journal entry', error as Error, { journalEntryId: id });
            throw error;
        }
    }
}