// backend/src/core/domain/entities/user.entity.ts
import { BaseEntity } from '../../../shared/types/database.types';
import { ContactInfo, UserPreferences } from '../../../shared/types/common.types';
import { Email } from '../value-objects/email.vo';
import { CPF } from '../value-objects/cpf.vo';

export interface UserEntityProps {
    id: string;
    email: Email;
    name: string;
    password: string;
    cpf?: CPF;
    phone?: string;
    dateOfBirth?: Date;
    isActive: boolean;
    isEmailVerified: boolean;
    role: UserRole;
    lastLoginAt?: Date;
    preferences: UserPreferences;
    contactInfo: ContactInfo;
    createdAt: Date;
    updatedAt: Date;
    deletedAt?: Date;
}

export enum UserRole {
    USER = 'USER',
    ADMIN = 'ADMIN',
    PREMIUM = 'PREMIUM'
}

export class UserEntity implements BaseEntity {
    private readonly props: UserEntityProps;

    constructor(props: UserEntityProps) {
        this.props = props;
        this.validate();
    }

    // Getters
    get id(): string { return this.props.id; }
    get email(): Email { return this.props.email; }
    get name(): string { return this.props.name; }
    get password(): string { return this.props.password; }
    get cpf(): CPF | undefined { return this.props.cpf; }
    get phone(): string | undefined { return this.props.phone; }
    get dateOfBirth(): Date | undefined { return this.props.dateOfBirth; }
    get isActive(): boolean { return this.props.isActive; }
    get isEmailVerified(): boolean { return this.props.isEmailVerified; }
    get role(): UserRole { return this.props.role; }
    get lastLoginAt(): Date | undefined { return this.props.lastLoginAt; }
    get preferences(): UserPreferences { return this.props.preferences; }
    get contactInfo(): ContactInfo { return this.props.contactInfo; }
    get createdAt(): Date { return this.props.createdAt; }
    get updatedAt(): Date { return this.props.updatedAt; }
    get deletedAt(): Date | undefined { return this.props.deletedAt; }

    // Business methods
    activate(): void {
        this.props.isActive = true;
        this.props.updatedAt = new Date();
    }

    deactivate(): void {
        this.props.isActive = false;
        this.props.updatedAt = new Date();
    }

    verifyEmail(): void {
        this.props.isEmailVerified = true;
        this.props.updatedAt = new Date();
    }

    updateLastLogin(): void {
        this.props.lastLoginAt = new Date();
        this.props.updatedAt = new Date();
    }

    updateProfile(data: {
        name?: string;
        phone?: string;
        dateOfBirth?: Date;
        preferences?: Partial<UserPreferences>;
    }): void {
        if (data.name) this.props.name = data.name;
        if (data.phone) this.props.phone = data.phone;
        if (data.dateOfBirth) this.props.dateOfBirth = data.dateOfBirth;
        if (data.preferences) {
            this.props.preferences = { ...this.props.preferences, ...data.preferences };
        }
        this.props.updatedAt = new Date();
    }

    changePassword(newPassword: string): void {
        this.props.password = newPassword;
        this.props.updatedAt = new Date();
    }

    upgradeToRole(role: UserRole): void {
        this.props.role = role;
        this.props.updatedAt = new Date();
    }

    canAccessPremiumFeatures(): boolean {
        return this.props.role === UserRole.PREMIUM || this.props.role === UserRole.ADMIN;
    }

    canPerformAdminActions(): boolean {
        return this.props.role === UserRole.ADMIN;
    }

    private validate(): void {
        if (!this.props.name || this.props.name.trim().length < 2) {
            throw new Error('Nome deve ter pelo menos 2 caracteres');
        }

        if (!this.props.email) {
            throw new Error('Email é obrigatório');
        }

        if (!this.props.password || this.props.password.length < 6) {
            throw new Error('Password deve ter pelo menos 6 caracteres');
        }
    }

    toJSON(): any {
        return {
            id: this.id,
            email: this.email.value,
            name: this.name,
            cpf: this.cpf?.value,
            phone: this.phone,
            dateOfBirth: this.dateOfBirth,
            isActive: this.isActive,
            isEmailVerified: this.isEmailVerified,
            role: this.role,
            lastLoginAt: this.lastLoginAt,
            preferences: this.preferences,
            contactInfo: this.contactInfo,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt
        };
    }
}