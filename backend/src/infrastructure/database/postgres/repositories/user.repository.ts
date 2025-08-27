import { Repository, DataSource } from 'typeorm';
import { UserRepository, User, CreateUserData, UpdateUserData } from '../../../../core/domain/repositories/user.repository';
import { UserPostgresEntity } from '../entities/user.entity';
import { DatabaseException } from '../../../../shared/exceptions/infrastructure.exception';
import { logger } from '../../../../shared/utils/logger.util';

export class UserRepositoryImpl implements UserRepository {
    private readonly repository: Repository<UserPostgresEntity>;

    constructor(private readonly dataSource: DataSource) {
        this.repository = this.dataSource.getRepository(UserPostgresEntity);
    }

    async findById(id: string): Promise<User | null> {
        try {
            const entity = await this.repository.findOne({
                where: { id },
                relations: []
            });

            return entity ? this.toDomain(entity) : null;
        } catch (error) {
            logger.error('Error finding user by id', { id, error: error.message });
            throw new DatabaseException(`Erro ao buscar usuário por ID: ${error.message}`);
        }
    }

    async findByEmail(email: string): Promise<User | null> {
        try {
            const entity = await this.repository.findOne({
                where: { email: email.toLowerCase() },
                relations: []
            });

            return entity ? this.toDomain(entity) : null;
        } catch (error) {
            logger.error('Error finding user by email', { email, error: error.message });
            throw new DatabaseException(`Erro ao buscar usuário por email: ${error.message}`);
        }
    }

    async findByCpf(cpf: string): Promise<User | null> {
        try {
            const entity = await this.repository.findOne({
                where: { cpf },
                relations: []
            });

            return entity ? this.toDomain(entity) : null;
        } catch (error) {
            logger.error('Error finding user by cpf', { cpf, error: error.message });
            throw new DatabaseException(`Erro ao buscar usuário por CPF: ${error.message}`);
        }
    }

    async create(data: CreateUserData): Promise<User> {
        try {
            const entity = this.repository.create({
                email: data.email.toLowerCase(),
                name: data.name,
                password: data.password,
                cpf: data.cpf,
                phone: data.phone,
                dateOfBirth: data.dateOfBirth,
                preferences: data.preferences || {
                    language: 'pt-BR',
                    currency: 'BRL',
                    timezone: 'America/Sao_Paulo',
                    dateFormat: 'DD/MM/YYYY',
                    theme: 'light',
                    notifications: {
                        email: true,
                        push: true,
                        sms: false,
                        budgetAlerts: true,
                        transactionAlerts: true
                    }
                },
                contactInfo: {
                    email: data.email.toLowerCase(),
                    phone: data.phone
                }
            });

            const savedEntity = await this.repository.save(entity);

            logger.info('User created successfully', {
                userId: savedEntity.id,
                email: savedEntity.email
            });

            return this.toDomain(savedEntity);
        } catch (error) {
            logger.error('Error creating user', {
                email: data.email,
                error: error.message
            });

            if (error.code === '23505') { // Unique constraint violation
                if (error.constraint?.includes('email')) {
                    throw new DatabaseException('Email já está em uso');
                }
                if (error.constraint?.includes('cpf')) {
                    throw new DatabaseException('CPF já está em uso');
                }
            }

            throw new DatabaseException(`Erro ao criar usuário: ${error.message}`);
        }
    }

    async update(id: string, data: UpdateUserData): Promise<User> {
        try {
            const existingEntity = await this.repository.findOne({ where: { id } });

            if (!existingEntity) {
                throw new DatabaseException('Usuário não encontrado');
            }

            // Update only provided fields
            if (data.name) existingEntity.name = data.name;
            if (data.phone) existingEntity.phone = data.phone;
            if (data.dateOfBirth) existingEntity.dateOfBirth = data.dateOfBirth;
            if (data.preferences) {
                existingEntity.preferences = { ...existingEntity.preferences, ...data.preferences };
            }
            if (data.contactInfo) {
                existingEntity.contactInfo = { ...existingEntity.contactInfo, ...data.contactInfo };
            }

            const savedEntity = await this.repository.save(existingEntity);

            logger.info('User updated successfully', { userId: id });

            return this.toDomain(savedEntity);
        } catch (error) {
            logger.error('Error updating user', { userId: id, error: error.message });
            throw new DatabaseException(`Erro ao atualizar usuário: ${error.message}`);
        }
    }

    async delete(id: string): Promise<void> {
        try {
            const result = await this.repository.softDelete(id);

            if (result.affected === 0) {
                throw new DatabaseException('Usuário não encontrado');
            }

            logger.info('User deleted successfully', { userId: id });
        } catch (error) {
            logger.error('Error deleting user', { userId: id, error: error.message });
            throw new DatabaseException(`Erro ao deletar usuário: ${error.message}`);
        }
    }

    async activate(id: string): Promise<void> {
        try {
            const result = await this.repository.update(id, { isActive: true });

            if (result.affected === 0) {
                throw new DatabaseException('Usuário não encontrado');
            }

            logger.info('User activated successfully', { userId: id });
        } catch (error) {
            logger.error('Error activating user', { userId: id, error: error.message });
            throw new DatabaseException(`Erro ao ativar usuário: ${error.message}`);
        }
    }

    async deactivate(id: string): Promise<void> {
        try {
            const result = await this.repository.update(id, { isActive: false });

            if (result.affected === 0) {
                throw new DatabaseException('Usuário não encontrado');
            }

            logger.info('User deactivated successfully', { userId: id });
        } catch (error) {
            logger.error('Error deactivating user', { userId: id, error: error.message });
            throw new DatabaseException(`Erro ao desativar usuário: ${error.message}`);
        }
    }

    async updateLastLogin(id: string): Promise<void> {
        try {
            const result = await this.repository.update(id, { lastLoginAt: new Date() });

            if (result.affected === 0) {
                throw new DatabaseException('Usuário não encontrado');
            }

            logger.debug('User last login updated', { userId: id });
        } catch (error) {
            logger.error('Error updating user last login', { userId: id, error: error.message });
            throw new DatabaseException(`Erro ao atualizar último login: ${error.message}`);
        }
    }

    async findMany(
        filters?: any,
        pagination?: { page: number; limit: number; sortBy?: string; sortOrder?: 'ASC' | 'DESC' }
    ): Promise<{ users: User[]; total: number }> {
        try {
            const queryBuilder = this.repository.createQueryBuilder('user');

            // Apply filters
            if (filters?.search) {
                queryBuilder.andWhere(
                    '(user.name ILIKE :search OR user.email ILIKE :search)',
                    { search: `%${filters.search}%` }
                );
            }

            if (filters?.isActive !== undefined) {
                queryBuilder.andWhere('user.isActive = :isActive', { isActive: filters.isActive });
            }

            if (filters?.role) {
                queryBuilder.andWhere('user.role = :role', { role: filters.role });
            }

            if (filters?.isEmailVerified !== undefined) {
                queryBuilder.andWhere('user.isEmailVerified = :isEmailVerified', {
                    isEmailVerified: filters.isEmailVerified
                });
            }

            // Apply sorting
            if (pagination?.sortBy) {
                queryBuilder.orderBy(
                    `user.${pagination.sortBy}`,
                    pagination.sortOrder || 'DESC'
                );
            } else {
                queryBuilder.orderBy('user.createdAt', 'DESC');
            }

            // Apply pagination
            if (pagination) {
                const skip = (pagination.page - 1) * pagination.limit;
                queryBuilder.skip(skip).take(pagination.limit);
            }

            const [entities, total] = await queryBuilder.getManyAndCount();

            return {
                users: entities.map(entity => this.toDomain(entity)),
                total
            };
        } catch (error) {
            logger.error('Error finding many users', { filters, pagination, error: error.message });
            throw new DatabaseException(`Erro ao buscar usuários: ${error.message}`);
        }
    }

    private toDomain(entity: UserPostgresEntity): User {
        return {
            id: entity.id,
            email: entity.email,
            name: entity.name,
            password: entity.password,
            cpf: entity.cpf,
            phone: entity.phone,
            dateOfBirth: entity.dateOfBirth,
            isActive: entity.isActive,
            isEmailVerified: entity.isEmailVerified,
            role: entity.role,
            lastLoginAt: entity.lastLoginAt,
            preferences: entity.preferences,
            contactInfo: entity.contactInfo,
            createdAt: entity.createdAt,
            updatedAt: entity.updatedAt,
            deletedAt: entity.deletedAt
        };
    }
}