// backend/src/infrastructure/database/postgres/entities/user.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, DeleteDateColumn, Index } from 'typeorm';
import { UserRole } from '../../../../core/domain/entities/user.entity';
import { UserPreferences, ContactInfo } from '../../../../shared/types/common.types';

@Entity('users')
@Index(['email', 'isActive'])
@Index(['lastLoginAt'])
@Index(['createdAt'])
export class UserPostgresEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ unique: true, length: 255 })
    @Index()
    email: string;

    @Column({ length: 100 })
    name: string;

    @Column({ length: 255 })
    password: string;

    @Column({ length: 11, nullable: true, unique: true })
    cpf: string;

    @Column({ length: 15, nullable: true })
    phone: string;

    @Column({ type: 'date', nullable: true })
    dateOfBirth: Date;

    @Column({ default: true })
    isActive: boolean;

    @Column({ default: false })
    isEmailVerified: boolean;

    @Column({
        type: 'enum',
        enum: UserRole,
        default: UserRole.USER
    })
    role: UserRole;

    @Column({ type: 'timestamp', nullable: true })
    lastLoginAt: Date;

    @Column({ type: 'jsonb' })
    preferences: UserPreferences;

    @Column({ type: 'jsonb' })
    contactInfo: ContactInfo;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @DeleteDateColumn()
    deletedAt: Date;
}