// backend/src/shared/types/common.types.ts

export type Currency = 'BRL' | 'USD' | 'EUR' | 'GBP' | 'JPY';

export type Status = 'active' | 'inactive' | 'suspended' | 'deleted';

export interface PaginationOptions {
    page: number;
    limit: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResult<T> {
    data: T[];
    pagination: {
        total: number;
        page: number;
        limit: number;
        totalPages: number;
        hasNext: boolean;
        hasPrev: boolean;
    };
}

export interface AuditTrail {
    createdBy: string;
    updatedBy: string;
    createdAt: Date;
    updatedAt: Date;
    deletedAt?: Date;
    deletedBy?: string;
}

export interface ApiResponse<T = any> {
    success: boolean;
    data?: T;
    message?: string;
    error?: string;
    meta?: {
        requestId?: string;
        timestamp: string;
        version: string;
    };
}

export interface ErrorResponse {
    success: false;
    error: string;
    message: string;
    details?: any;
    meta?: {
        requestId?: string;
        timestamp: string;
    };
}

export type SortOrder = 'asc' | 'desc';

export interface FilterOptions {
    startDate?: Date;
    endDate?: Date;
    status?: Status;
    userId?: string;
    categoryId?: string;
    searchTerm?: string;
}

export interface IdParams {
    id: string;
}

export interface CreateResult<T> {
    entity: T;
    created: boolean;
    message?: string;
}

export interface UpdateResult<T> {
    entity: T | null;
    updated: boolean;
    message?: string;
}

export interface DeleteResult {
    deleted: boolean;
    id: string;
    message?: string;
}