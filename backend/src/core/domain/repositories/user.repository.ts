// backend/src/core/domain/repositories/user.repository.ts
export interface User {
    id: string;
    name: string;
    email: string;
    isActive: boolean;
    preferences: {
        notifications: {
            email: boolean;
            push: boolean;
        };
    };
    createdAt: Date;
    updatedAt: Date;
}

export interface UserFilter {
    isActive?: boolean;
    email?: string;
}

export interface PaginationOptions {
    page: number;
    limit: number;
}

export interface PaginatedResult<T> {
    data: T[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

export interface UserRepository {
    findById(id: string): Promise<User | null>;
    findByEmail(email: string): Promise<User | null>;
    findMany(filter: UserFilter, pagination: PaginationOptions): Promise<{ users: User[]; total: number }>;
    create(userData: Partial<User>): Promise<User>;
    update(id: string, userData: Partial<User>): Promise<User | null>;
    delete(id: string): Promise<boolean>;
}