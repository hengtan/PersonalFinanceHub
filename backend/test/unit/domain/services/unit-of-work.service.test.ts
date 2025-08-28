// test/unit/domain/services/unit-of-work.service.test.ts
import { UnitOfWork, IRepository } from '@/core/domain/services/unit-of-work.service';
import { PoolClient } from 'pg';

// Mock the logger
jest.mock('@/infrastructure/monitoring/logger.service', () => ({
    logger: {
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn()
    }
}));

describe('UnitOfWork', () => {
    let unitOfWork: UnitOfWork;
    let mockConnection: jest.Mocked<PoolClient>;
    let mockRepository: jest.Mocked<IRepository>;

    beforeEach(() => {
        mockConnection = {
            query: jest.fn(),
            processID: 12345,
            release: jest.fn()
        } as any;

        mockRepository = {
            setConnection: jest.fn(),
            clearConnection: jest.fn()
        };

        unitOfWork = new UnitOfWork(mockConnection);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('constructor', () => {
        it('should initialize with provided connection', () => {
            expect(unitOfWork).toBeInstanceOf(UnitOfWork);
            expect(unitOfWork.isActive()).toBe(false);
            expect(unitOfWork.isCommitted()).toBe(false);
            expect(unitOfWork.isRolledBack()).toBe(false);
        });
    });

    describe('repository management', () => {
        describe('registerRepository', () => {
            it('should register a repository', () => {
                unitOfWork.registerRepository(mockRepository);

                expect(mockRepository.setConnection).not.toHaveBeenCalled();
            });

            it('should set connection on repository if transaction is active', async () => {
                await unitOfWork.begin();
                unitOfWork.registerRepository(mockRepository);

                expect(mockRepository.setConnection).toHaveBeenCalledWith(mockConnection);
            });
        });
    });

    describe('transaction management', () => {
        describe('begin', () => {
            it('should begin a transaction successfully', async () => {
                mockConnection.query.mockResolvedValue(undefined);

                await unitOfWork.begin();

                expect(mockConnection.query).toHaveBeenCalledWith('BEGIN');
                expect(unitOfWork.isActive()).toBe(true);
                expect(unitOfWork.isCommitted()).toBe(false);
                expect(unitOfWork.isRolledBack()).toBe(false);
            });

            it('should set connection on registered repositories', async () => {
                mockConnection.query.mockResolvedValue(undefined);
                unitOfWork.registerRepository(mockRepository);

                await unitOfWork.begin();

                expect(mockRepository.setConnection).toHaveBeenCalledWith(mockConnection);
            });

            it('should throw error if transaction is already active', async () => {
                mockConnection.query.mockResolvedValue(undefined);
                await unitOfWork.begin();

                await expect(unitOfWork.begin()).rejects.toThrow('Transaction is already active');
            });

            it('should handle database errors during begin', async () => {
                const dbError = new Error('Database connection failed');
                mockConnection.query.mockRejectedValue(dbError);

                await expect(unitOfWork.begin()).rejects.toThrow('Database connection failed');
                expect(unitOfWork.isActive()).toBe(false);
            });
        });

        describe('commit', () => {
            beforeEach(async () => {
                mockConnection.query.mockResolvedValue(undefined);
                await unitOfWork.begin();
            });

            it('should commit a transaction successfully', async () => {
                await unitOfWork.commit();

                expect(mockConnection.query).toHaveBeenCalledWith('COMMIT');
                expect(unitOfWork.isCommitted()).toBe(true);
                expect(unitOfWork.isActive()).toBe(false);
            });

            it('should clear repository connections after commit', async () => {
                unitOfWork.registerRepository(mockRepository);

                await unitOfWork.commit();

                expect(mockRepository.clearConnection).toHaveBeenCalled();
            });

            it('should publish domain events before commit', async () => {
                const mockEvent = { type: 'TestEvent', data: { id: '1' } };
                unitOfWork.addDomainEvent(mockEvent);

                await unitOfWork.commit();

                expect(mockConnection.query).toHaveBeenCalledWith('COMMIT');
            });

            it('should clear change tracking after successful commit', async () => {
                unitOfWork.trackChange('entity-1', { id: 'entity-1' }, 'INSERT');
                unitOfWork.addDomainEvent({ type: 'TestEvent' });

                await unitOfWork.commit();

                expect(unitOfWork.getTrackedChanges().size).toBe(0);
                expect(unitOfWork.getDomainEvents()).toHaveLength(0);
            });

            it('should throw error if no active transaction', async () => {
                await unitOfWork.commit(); // First commit

                await expect(unitOfWork.commit()).rejects.toThrow('No active transaction to commit');
            });

            it('should throw error if transaction already committed', async () => {
                await unitOfWork.commit();

                await expect(unitOfWork.commit()).rejects.toThrow('No active transaction to commit');
            });

            it('should throw error if transaction is rolled back', async () => {
                await unitOfWork.rollback();

                await expect(unitOfWork.commit()).rejects.toThrow('No active transaction to commit');
            });

            it('should handle database errors during commit', async () => {
                const dbError = new Error('Commit failed');
                mockConnection.query.mockImplementation((query) => {
                    if (query === 'COMMIT') {
                        return Promise.reject(dbError);
                    }
                    return Promise.resolve(undefined);
                });

                await expect(unitOfWork.commit()).rejects.toThrow('Commit failed');
            });

            it('should attempt rollback after commit failure', async () => {
                const commitError = new Error('Commit failed');
                mockConnection.query.mockImplementation((query) => {
                    if (query === 'COMMIT') {
                        return Promise.reject(commitError);
                    }
                    if (query === 'ROLLBACK') {
                        return Promise.resolve(undefined);
                    }
                    return Promise.resolve(undefined);
                });

                await expect(unitOfWork.commit()).rejects.toThrow('Commit failed');
                expect(mockConnection.query).toHaveBeenCalledWith('ROLLBACK');
            });
        });

        describe('rollback', () => {
            beforeEach(async () => {
                mockConnection.query.mockResolvedValue(undefined);
                await unitOfWork.begin();
            });

            it('should rollback a transaction successfully', async () => {
                await unitOfWork.rollback();

                expect(mockConnection.query).toHaveBeenCalledWith('ROLLBACK');
                expect(unitOfWork.isRolledBack()).toBe(true);
                expect(unitOfWork.isActive()).toBe(false);
            });

            it('should clear repository connections after rollback', async () => {
                unitOfWork.registerRepository(mockRepository);

                await unitOfWork.rollback();

                expect(mockRepository.clearConnection).toHaveBeenCalled();
            });

            it('should clear change tracking after rollback', async () => {
                unitOfWork.trackChange('entity-1', { id: 'entity-1' }, 'INSERT');
                unitOfWork.addDomainEvent({ type: 'TestEvent' });

                await unitOfWork.rollback();

                expect(unitOfWork.getTrackedChanges().size).toBe(0);
                expect(unitOfWork.getDomainEvents()).toHaveLength(0);
            });

            it('should throw error if no active transaction', async () => {
                await unitOfWork.rollback(); // First rollback

                await expect(unitOfWork.rollback()).rejects.toThrow('No active transaction to rollback');
            });

            it('should throw error if transaction is committed', async () => {
                await unitOfWork.commit();

                await expect(unitOfWork.rollback()).rejects.toThrow('Cannot rollback a committed transaction');
            });

            it('should handle database errors during rollback', async () => {
                const dbError = new Error('Rollback failed');
                mockConnection.query.mockImplementation((query) => {
                    if (query === 'ROLLBACK') {
                        return Promise.reject(dbError);
                    }
                    return Promise.resolve(undefined);
                });

                await expect(unitOfWork.rollback()).rejects.toThrow('Rollback failed');
            });
        });

        describe('execute', () => {
            it('should execute operation within transaction scope', async () => {
                mockConnection.query.mockResolvedValue(undefined);
                const operation = jest.fn().mockResolvedValue('success');

                const result = await unitOfWork.execute(operation);

                expect(result).toBe('success');
                expect(mockConnection.query).toHaveBeenCalledWith('BEGIN');
                expect(mockConnection.query).toHaveBeenCalledWith('COMMIT');
                expect(operation).toHaveBeenCalled();
            });

            it('should rollback on operation failure', async () => {
                mockConnection.query.mockResolvedValue(undefined);
                const operationError = new Error('Operation failed');
                const operation = jest.fn().mockRejectedValue(operationError);

                await expect(unitOfWork.execute(operation)).rejects.toThrow('Operation failed');

                expect(mockConnection.query).toHaveBeenCalledWith('BEGIN');
                expect(mockConnection.query).toHaveBeenCalledWith('ROLLBACK');
                expect(operation).toHaveBeenCalled();
            });
        });
    });

    describe('savepoint management', () => {
        beforeEach(async () => {
            mockConnection.query.mockResolvedValue(undefined);
            await unitOfWork.begin();
        });

        describe('savepoint', () => {
            it('should create a savepoint successfully', async () => {
                await unitOfWork.savepoint('sp1');

                expect(mockConnection.query).toHaveBeenCalledWith('SAVEPOINT sp1');
            });

            it('should throw error if no active transaction', async () => {
                await unitOfWork.commit();

                await expect(unitOfWork.savepoint('sp1')).rejects.toThrow(
                    'Cannot create savepoint without active transaction'
                );
            });

            it('should handle database errors during savepoint creation', async () => {
                const dbError = new Error('Savepoint failed');
                mockConnection.query.mockImplementation((query) => {
                    if (query === 'SAVEPOINT sp1') {
                        return Promise.reject(dbError);
                    }
                    return Promise.resolve(undefined);
                });

                await expect(unitOfWork.savepoint('sp1')).rejects.toThrow('Savepoint failed');
            });
        });

        describe('releaseSavepoint', () => {
            it('should release a savepoint successfully', async () => {
                await unitOfWork.releaseSavepoint('sp1');

                expect(mockConnection.query).toHaveBeenCalledWith('RELEASE SAVEPOINT sp1');
            });

            it('should throw error if no active transaction', async () => {
                await unitOfWork.commit();

                await expect(unitOfWork.releaseSavepoint('sp1')).rejects.toThrow(
                    'Cannot release savepoint without active transaction'
                );
            });
        });

        describe('rollbackToSavepoint', () => {
            it('should rollback to savepoint successfully', async () => {
                await unitOfWork.rollbackToSavepoint('sp1');

                expect(mockConnection.query).toHaveBeenCalledWith('ROLLBACK TO SAVEPOINT sp1');
            });

            it('should throw error if no active transaction', async () => {
                await unitOfWork.commit();

                await expect(unitOfWork.rollbackToSavepoint('sp1')).rejects.toThrow(
                    'Cannot rollback to savepoint without active transaction'
                );
            });
        });
    });

    describe('change tracking', () => {
        describe('trackChange', () => {
            it('should track entity changes', () => {
                const entity = { id: 'entity-1', name: 'Test Entity' };

                unitOfWork.trackChange('entity-1', entity, 'INSERT');

                const changes = unitOfWork.getTrackedChanges();
                expect(changes.size).toBe(1);
                expect(changes.get('INSERT:entity-1')).toMatchObject({
                    entityId: 'entity-1',
                    entity: entity,
                    changeType: 'INSERT'
                });
            });

            it('should track multiple changes', () => {
                unitOfWork.trackChange('entity-1', { id: 'entity-1' }, 'INSERT');
                unitOfWork.trackChange('entity-2', { id: 'entity-2' }, 'UPDATE');
                unitOfWork.trackChange('entity-3', { id: 'entity-3' }, 'DELETE');

                const changes = unitOfWork.getTrackedChanges();
                expect(changes.size).toBe(3);
                expect(changes.has('INSERT:entity-1')).toBe(true);
                expect(changes.has('UPDATE:entity-2')).toBe(true);
                expect(changes.has('DELETE:entity-3')).toBe(true);
            });

            it('should overwrite changes for same entity and type', () => {
                const entity1 = { id: 'entity-1', version: 1 };
                const entity2 = { id: 'entity-1', version: 2 };

                unitOfWork.trackChange('entity-1', entity1, 'UPDATE');
                unitOfWork.trackChange('entity-1', entity2, 'UPDATE');

                const changes = unitOfWork.getTrackedChanges();
                expect(changes.size).toBe(1);
                expect(changes.get('UPDATE:entity-1')?.entity).toEqual(entity2);
            });
        });

        describe('addDomainEvent', () => {
            it('should add domain events', () => {
                const event1 = { type: 'UserCreated', userId: '1' };
                const event2 = { type: 'UserUpdated', userId: '1' };

                unitOfWork.addDomainEvent(event1);
                unitOfWork.addDomainEvent(event2);

                const events = unitOfWork.getDomainEvents();
                expect(events).toHaveLength(2);
                expect(events[0]).toMatchObject(event1);
                expect(events[1]).toMatchObject(event2);
            });

            it('should add timestamp and transaction ID to events', () => {
                const event = { type: 'TestEvent' };

                unitOfWork.addDomainEvent(event);

                const events = unitOfWork.getDomainEvents();
                expect(events[0].addedAt).toBeInstanceOf(Date);
                expect(events[0].transactionId).toBe(mockConnection.processID);
            });
        });
    });

    describe('connection management', () => {
        describe('getConnection', () => {
            it('should return connection when transaction is active', async () => {
                mockConnection.query.mockResolvedValue(undefined);
                await unitOfWork.begin();

                const connection = unitOfWork.getConnection();

                expect(connection).toBe(mockConnection);
            });

            it('should throw error when no active transaction', () => {
                expect(() => unitOfWork.getConnection()).toThrow('No active transaction');
            });
        });
    });

    describe('disposal and cleanup', () => {
        describe('dispose', () => {
            it('should dispose cleanly when no active transaction', async () => {
                unitOfWork.registerRepository(mockRepository);

                await unitOfWork.dispose();

                expect(mockRepository.clearConnection).toHaveBeenCalled();
            });

            it('should rollback active transaction during disposal', async () => {
                mockConnection.query.mockResolvedValue(undefined);
                await unitOfWork.begin();
                unitOfWork.registerRepository(mockRepository);

                await unitOfWork.dispose();

                expect(mockConnection.query).toHaveBeenCalledWith('ROLLBACK');
                expect(mockRepository.clearConnection).toHaveBeenCalled();
            });

            it('should clear all tracking data during disposal', async () => {
                unitOfWork.trackChange('entity-1', { id: '1' }, 'INSERT');
                unitOfWork.addDomainEvent({ type: 'TestEvent' });

                await unitOfWork.dispose();

                expect(unitOfWork.getTrackedChanges().size).toBe(0);
                expect(unitOfWork.getDomainEvents()).toHaveLength(0);
            });

            it('should handle errors during disposal gracefully', async () => {
                mockConnection.query.mockImplementation((query) => {
                    if (query === 'BEGIN') return Promise.resolve(undefined);
                    if (query === 'ROLLBACK') return Promise.reject(new Error('Rollback failed'));
                    return Promise.resolve(undefined);
                });

                await unitOfWork.begin();

                // Should not throw despite rollback error
                await expect(unitOfWork.dispose()).resolves.toBeUndefined();
            });
        });
    });

    describe('error scenarios', () => {
        it('should handle repository connection errors gracefully', async () => {
            mockConnection.query.mockResolvedValue(undefined);
            mockRepository.setConnection.mockImplementation(() => {
                throw new Error('Connection failed');
            });
            mockRepository.clearConnection.mockImplementation(() => {
                throw new Error('Clear connection failed');
            });

            await unitOfWork.begin();
            unitOfWork.registerRepository(mockRepository);

            // Should handle clearConnection errors during commit
            await expect(unitOfWork.commit()).resolves.toBeUndefined();
        });

        it('should maintain consistent state after errors', async () => {
            mockConnection.query.mockImplementation((query) => {
                if (query === 'BEGIN') return Promise.resolve(undefined);
                if (query === 'COMMIT') return Promise.reject(new Error('Commit failed'));
                if (query === 'ROLLBACK') return Promise.resolve(undefined);
                return Promise.resolve(undefined);
            });

            await unitOfWork.begin();
            
            await expect(unitOfWork.commit()).rejects.toThrow('Commit failed');

            // State should be consistent after failed commit + automatic rollback
            expect(unitOfWork.isActive()).toBe(false);
            expect(unitOfWork.isCommitted()).toBe(false);
            expect(unitOfWork.isRolledBack()).toBe(true);
        });
    });
});