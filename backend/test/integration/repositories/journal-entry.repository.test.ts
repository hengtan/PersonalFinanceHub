// test/integration/repositories/journal-entry.repository.test.ts
import { Pool, PoolClient } from 'pg';
import { JournalEntryRepositoryPostgres } from '@/infrastructure/database/postgres/repositories/journal-entry.repository';
import { JournalEntryEntity, JournalEntryStatus } from '@/core/domain/entities/journal-entry.entity';
import { LedgerEntryEntity, AccountType, EntryType, ReferenceType } from '@/core/domain/entities/ledger-entry.entity';
import { Money } from '@/core/domain/value-objects/money.vo';
import { TestUtils } from '@test/helpers/test-utils';

describe('JournalEntryRepositoryPostgres Integration', () => {
    let pool: Pool;
    let client: PoolClient;
    let repository: JournalEntryRepositoryPostgres;

    // Test database setup
    beforeAll(async () => {
        // Use test database configuration
        pool = new Pool({
            host: process.env.DB_TEST_HOST || 'localhost',
            port: parseInt(process.env.DB_TEST_PORT || '5432'),
            database: process.env.DB_TEST_NAME || 'personal_finance_test',
            user: process.env.DB_TEST_USER || 'test',
            password: process.env.DB_TEST_PASSWORD || 'test',
            max: 5,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 2000,
        });

        // Get a client for the test
        client = await pool.connect();
        repository = new JournalEntryRepositoryPostgres();
        repository.setConnection(client);

        // Create test tables (simplified for testing)
        await createTestTables();
    });

    afterAll(async () => {
        if (client) {
            client.release();
        }
        if (pool) {
            await pool.end();
        }
    });

    beforeEach(async () => {
        // Clean test data before each test
        await client.query('DELETE FROM ledger_entries');
        await client.query('DELETE FROM journal_entries');
        
        // Create test users if needed
        await client.query(`
            INSERT INTO users (id, email, first_name, last_name, is_active)
            VALUES ('test-user-1', 'test@example.com', 'Test', 'User', true)
            ON CONFLICT (id) DO NOTHING
        `);
    });

    const createTestTables = async () => {
        // Create simplified test tables
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id VARCHAR(255) PRIMARY KEY,
                email VARCHAR(255) UNIQUE NOT NULL,
                first_name VARCHAR(255),
                last_name VARCHAR(255),
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            );
        `);

        await client.query(`
            CREATE TYPE IF NOT EXISTS journal_entry_status AS ENUM ('DRAFT','POSTED','REVERSED','ERROR');
            
            CREATE TABLE IF NOT EXISTS journal_entries (
                id VARCHAR(255) PRIMARY KEY,
                user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                transaction_id VARCHAR(255) NOT NULL,
                description TEXT NOT NULL,
                reference VARCHAR(255),
                status journal_entry_status DEFAULT 'DRAFT',
                total_amount DECIMAL(15,4) NOT NULL,
                currency CHAR(3) NOT NULL DEFAULT 'BRL',
                posted_at TIMESTAMP,
                reversed_at TIMESTAMP,
                reversed_by VARCHAR(255),
                metadata JSONB DEFAULT '{}',
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            );
        `);

        await client.query(`
            CREATE TYPE IF NOT EXISTS account_type AS ENUM ('ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE');
            CREATE TYPE IF NOT EXISTS entry_type AS ENUM ('DEBIT','CREDIT');
            CREATE TYPE IF NOT EXISTS reference_type AS ENUM ('TRANSACTION','BUDGET','CATEGORY','USER','ACCOUNT');

            CREATE TABLE IF NOT EXISTS ledger_entries (
                id VARCHAR(255) PRIMARY KEY,
                transaction_id VARCHAR(255) NOT NULL,
                account_id VARCHAR(255) NOT NULL,
                account_name VARCHAR(255) NOT NULL,
                account_type account_type NOT NULL,
                entry_type entry_type NOT NULL,
                amount DECIMAL(15,4) NOT NULL,
                currency CHAR(3) NOT NULL DEFAULT 'BRL',
                description TEXT NOT NULL,
                reference_id VARCHAR(255),
                reference_type reference_type,
                metadata JSONB DEFAULT '{}',
                journal_entry_id VARCHAR(255) NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
                posted_at TIMESTAMP NOT NULL,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            );
        `);
    };

    const createLedgerEntry = (overrides: Partial<any> = {}) => {
        return new LedgerEntryEntity({
            id: 'le-001',
            transactionId: 'tx-001',
            accountId: 'acc-001',
            accountName: 'Cash Account',
            accountType: AccountType.ASSET,
            entryType: EntryType.DEBIT,
            amount: new Money(100, 'BRL'),
            description: 'Test entry',
            journalEntryId: 'je-001',
            postedAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
            ...overrides
        });
    };

    const createJournalEntry = (overrides: Partial<any> = {}) => {
        const debitEntry = createLedgerEntry({
            id: 'le-debit',
            entryType: EntryType.DEBIT,
            accountType: AccountType.ASSET
        });

        const creditEntry = createLedgerEntry({
            id: 'le-credit',
            entryType: EntryType.CREDIT,
            accountType: AccountType.REVENUE
        });

        return new JournalEntryEntity({
            id: 'je-001',
            userId: 'test-user-1',
            transactionId: 'tx-001',
            description: 'Test journal entry',
            status: JournalEntryStatus.DRAFT,
            entries: [debitEntry, creditEntry],
            totalAmount: new Money(100, 'BRL'),
            createdAt: new Date(),
            updatedAt: new Date(),
            ...overrides
        });
    };

    describe('save', () => {
        it('should save a new journal entry with ledger entries', async () => {
            const journalEntry = createJournalEntry();

            const result = await repository.save(journalEntry);

            expect(result).toBeInstanceOf(JournalEntryEntity);
            expect(result.id).toBe('je-001');
            expect(result.entries).toHaveLength(2);

            // Verify data was saved to database
            const savedJournal = await client.query(
                'SELECT * FROM journal_entries WHERE id = $1',
                ['je-001']
            );
            expect(savedJournal.rows).toHaveLength(1);
            expect(savedJournal.rows[0].description).toBe('Test journal entry');

            const savedEntries = await client.query(
                'SELECT * FROM ledger_entries WHERE journal_entry_id = $1 ORDER BY id',
                ['je-001']
            );
            expect(savedEntries.rows).toHaveLength(2);
            expect(savedEntries.rows[0].entry_type).toBe('DEBIT');
            expect(savedEntries.rows[1].entry_type).toBe('CREDIT');
        });

        it('should update existing journal entry', async () => {
            // First save
            const originalEntry = createJournalEntry();
            await repository.save(originalEntry);

            // Update and save again
            const updatedEntry = createJournalEntry({
                description: 'Updated description',
                status: JournalEntryStatus.POSTED,
                postedAt: new Date()
            });

            const result = await repository.save(updatedEntry);

            expect(result.description).toBe('Updated description');
            expect(result.status).toBe(JournalEntryStatus.POSTED);

            // Verify in database
            const savedJournal = await client.query(
                'SELECT * FROM journal_entries WHERE id = $1',
                ['je-001']
            );
            expect(savedJournal.rows[0].description).toBe('Updated description');
            expect(savedJournal.rows[0].status).toBe('POSTED');
        });

        it('should handle journal entry with metadata', async () => {
            const journalEntry = createJournalEntry({
                metadata: { source: 'api', version: '1.0' }
            });

            const result = await repository.save(journalEntry);

            expect(result.metadata).toEqual({ source: 'api', version: '1.0' });

            // Verify in database
            const saved = await client.query(
                'SELECT metadata FROM journal_entries WHERE id = $1',
                ['je-001']
            );
            expect(saved.rows[0].metadata).toEqual({ source: 'api', version: '1.0' });
        });

        it('should handle ledger entries with references and metadata', async () => {
            const entryWithRef = createLedgerEntry({
                id: 'le-with-ref',
                referenceId: 'ref-001',
                referenceType: ReferenceType.TRANSACTION,
                metadata: { category: 'food' }
            });

            const journalEntry = createJournalEntry({
                entries: [entryWithRef]
            });

            const result = await repository.save(journalEntry);

            const savedEntry = result.entries[0];
            expect(savedEntry.referenceId).toBe('ref-001');
            expect(savedEntry.referenceType).toBe(ReferenceType.TRANSACTION);
            expect(savedEntry.metadata).toEqual({ category: 'food' });
        });

        it('should replace ledger entries on update', async () => {
            // Save initial entry with 2 ledger entries
            const originalEntry = createJournalEntry();
            await repository.save(originalEntry);

            // Update with different ledger entries
            const newDebitEntry = createLedgerEntry({
                id: 'le-new-debit',
                entryType: EntryType.DEBIT,
                amount: new Money(200, 'BRL')
            });

            const newCreditEntry = createLedgerEntry({
                id: 'le-new-credit',
                entryType: EntryType.CREDIT,
                amount: new Money(200, 'BRL')
            });

            const updatedEntry = createJournalEntry({
                entries: [newDebitEntry, newCreditEntry],
                totalAmount: new Money(200, 'BRL')
            });

            await repository.save(updatedEntry);

            // Verify old entries are gone and new ones exist
            const savedEntries = await client.query(
                'SELECT * FROM ledger_entries WHERE journal_entry_id = $1 ORDER BY id',
                ['je-001']
            );

            expect(savedEntries.rows).toHaveLength(2);
            expect(savedEntries.rows[0].id).toBe('le-new-credit');
            expect(savedEntries.rows[1].id).toBe('le-new-debit');
            expect(parseFloat(savedEntries.rows[0].amount)).toBe(200);
        });

        it('should handle database constraint errors', async () => {
            const journalEntry = createJournalEntry({
                userId: 'non-existent-user' // This should fail FK constraint
            });

            await expect(repository.save(journalEntry)).rejects.toThrow();
        });
    });

    describe('findById', () => {
        beforeEach(async () => {
            // Save a test journal entry
            const journalEntry = createJournalEntry({
                metadata: { test: 'value' }
            });
            await repository.save(journalEntry);
        });

        it('should find journal entry by ID with ledger entries', async () => {
            const result = await repository.findById('je-001');

            expect(result).toBeInstanceOf(JournalEntryEntity);
            expect(result!.id).toBe('je-001');
            expect(result!.userId).toBe('test-user-1');
            expect(result!.description).toBe('Test journal entry');
            expect(result!.entries).toHaveLength(2);
            expect(result!.metadata).toEqual({ test: 'value' });

            // Verify ledger entries are properly loaded
            const debitEntries = result!.getEntriesByType(EntryType.DEBIT);
            const creditEntries = result!.getEntriesByType(EntryType.CREDIT);
            expect(debitEntries).toHaveLength(1);
            expect(creditEntries).toHaveLength(1);
        });

        it('should return null for non-existent journal entry', async () => {
            const result = await repository.findById('non-existent');

            expect(result).toBeNull();
        });

        it('should load ledger entries in correct order', async () => {
            const result = await repository.findById('je-001');

            expect(result!.entries).toHaveLength(2);
            // Entries should be ordered by created_at
            expect(result!.entries[0].createdAt.getTime()).toBeLessThanOrEqual(
                result!.entries[1].createdAt.getTime()
            );
        });

        it('should handle journal entry with complex metadata', async () => {
            const complexMetadata = {
                user: { id: 'user-1', name: 'Test User' },
                tags: ['expense', 'food'],
                amounts: { original: 100, tax: 10 },
                processed: true
            };

            const journalEntry = createJournalEntry({
                id: 'je-complex',
                metadata: complexMetadata
            });
            await repository.save(journalEntry);

            const result = await repository.findById('je-complex');

            expect(result!.metadata).toEqual(complexMetadata);
        });
    });

    describe('findByTransactionId', () => {
        beforeEach(async () => {
            // Create multiple journal entries for the same transaction
            const journalEntry1 = createJournalEntry({
                id: 'je-001',
                transactionId: 'tx-001'
            });

            const journalEntry2 = createJournalEntry({
                id: 'je-002',
                transactionId: 'tx-001'
            });

            const journalEntry3 = createJournalEntry({
                id: 'je-003',
                transactionId: 'tx-002'
            });

            await repository.save(journalEntry1);
            await TestUtils.waitFor(10); // Ensure different timestamps
            await repository.save(journalEntry2);
            await TestUtils.waitFor(10);
            await repository.save(journalEntry3);
        });

        it('should find all journal entries for a transaction', async () => {
            const results = await repository.findByTransactionId('tx-001');

            expect(results).toHaveLength(2);
            expect(results[0].transactionId).toBe('tx-001');
            expect(results[1].transactionId).toBe('tx-001');

            // Should be ordered by created_at DESC (newest first)
            expect(results[0].id).toBe('je-002');
            expect(results[1].id).toBe('je-001');
        });

        it('should return empty array for non-existent transaction', async () => {
            const results = await repository.findByTransactionId('non-existent');

            expect(results).toHaveLength(0);
        });

        it('should load all ledger entries for each journal entry', async () => {
            const results = await repository.findByTransactionId('tx-001');

            expect(results).toHaveLength(2);
            expect(results[0].entries).toHaveLength(2);
            expect(results[1].entries).toHaveLength(2);
        });
    });

    describe('delete', () => {
        beforeEach(async () => {
            const journalEntry = createJournalEntry();
            await repository.save(journalEntry);
        });

        it('should delete journal entry and cascade to ledger entries', async () => {
            await repository.delete('je-001');

            // Verify journal entry is deleted
            const journalResult = await client.query(
                'SELECT * FROM journal_entries WHERE id = $1',
                ['je-001']
            );
            expect(journalResult.rows).toHaveLength(0);

            // Verify ledger entries are deleted due to cascade
            const ledgerResult = await client.query(
                'SELECT * FROM ledger_entries WHERE journal_entry_id = $1',
                ['je-001']
            );
            expect(ledgerResult.rows).toHaveLength(0);
        });

        it('should throw error for non-existent journal entry', async () => {
            await expect(repository.delete('non-existent')).rejects.toThrow(
                'Journal entry non-existent not found'
            );
        });
    });

    describe('error handling and edge cases', () => {
        it('should handle connection errors gracefully', async () => {
            // Create repository without connection
            const noConnectionRepo = new JournalEntryRepositoryPostgres();

            await expect(
                noConnectionRepo.findById('je-001')
            ).rejects.toThrow('No database connection available');
        });

        it('should handle malformed JSON metadata gracefully', async () => {
            // Directly insert malformed JSON to test robustness
            await client.query(`
                INSERT INTO journal_entries (
                    id, user_id, transaction_id, description, status, 
                    total_amount, currency, metadata, created_at, updated_at
                ) VALUES (
                    'je-malformed', 'test-user-1', 'tx-malformed', 'Test', 'DRAFT', 
                    100, 'BRL', '{"invalid": json}', NOW(), NOW()
                )
            `);

            // This should handle the error gracefully
            await expect(
                repository.findById('je-malformed')
            ).rejects.toThrow();
        });

        it('should handle very large amounts correctly', async () => {
            const largeAmount = new Money(999999999.99, 'BRL');
            const journalEntry = createJournalEntry({
                entries: [
                    createLedgerEntry({
                        id: 'le-large-debit',
                        entryType: EntryType.DEBIT,
                        amount: largeAmount
                    }),
                    createLedgerEntry({
                        id: 'le-large-credit',
                        entryType: EntryType.CREDIT,
                        amount: largeAmount
                    })
                ],
                totalAmount: largeAmount
            });

            const result = await repository.save(journalEntry);

            expect(result.totalAmount.getAmount()).toBe(999999999.99);
            expect(result.entries[0].amount.getAmount()).toBe(999999999.99);
        });

        it('should handle different currencies correctly', async () => {
            const journalEntry = createJournalEntry({
                entries: [
                    createLedgerEntry({
                        id: 'le-usd-debit',
                        entryType: EntryType.DEBIT,
                        amount: new Money(100, 'USD')
                    }),
                    createLedgerEntry({
                        id: 'le-usd-credit',
                        entryType: EntryType.CREDIT,
                        amount: new Money(100, 'USD')
                    })
                ],
                totalAmount: new Money(100, 'USD')
            });

            const result = await repository.save(journalEntry);

            expect(result.totalAmount.getCurrency()).toBe('USD');
            expect(result.entries[0].amount.getCurrency()).toBe('USD');
        });
    });

    describe('concurrent access', () => {
        it('should handle concurrent saves to different journal entries', async () => {
            const entry1 = createJournalEntry({ id: 'je-concurrent-1' });
            const entry2 = createJournalEntry({ id: 'je-concurrent-2' });

            const [result1, result2] = await Promise.all([
                repository.save(entry1),
                repository.save(entry2)
            ]);

            expect(result1.id).toBe('je-concurrent-1');
            expect(result2.id).toBe('je-concurrent-2');

            // Both should be saved
            const saved1 = await repository.findById('je-concurrent-1');
            const saved2 = await repository.findById('je-concurrent-2');

            expect(saved1).not.toBeNull();
            expect(saved2).not.toBeNull();
        });

        it('should handle concurrent updates to same journal entry', async () => {
            // Save initial entry
            const initialEntry = createJournalEntry();
            await repository.save(initialEntry);

            // Create two different updates
            const update1 = createJournalEntry({
                description: 'Update 1',
                metadata: { updater: 'user1' }
            });

            const update2 = createJournalEntry({
                description: 'Update 2',
                metadata: { updater: 'user2' }
            });

            // Run concurrent updates
            const [result1, result2] = await Promise.all([
                repository.save(update1),
                repository.save(update2)
            ]);

            // Both should succeed (last one wins)
            expect(result1).toBeDefined();
            expect(result2).toBeDefined();

            // Final state should be from one of the updates
            const final = await repository.findById('je-001');
            expect(['Update 1', 'Update 2']).toContain(final!.description);
        });
    });
});