// backend/src/infrastructure/database/postgres/entities/budget.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, DeleteDateColumn, Index } from 'typeorm';
import { BudgetPeriod, BudgetStatus } from '../../../../core/domain/entities/budget.entity';

@Entity('budgets')
@Index(['userId', 'budgetPeriod', 'startDate'])
@Index(['userId', 'categoryId'])
@Index(['userId', 'status'])
@Index(['startDate', 'endDate'])
export class BudgetPostgresEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'uuid' })
    @Index()
    userId: string;

    @Column({ type: 'uuid' })
    @Index()
    categoryId: string;

    @Column({ length: 255 })
    name: string;

    @Column({ type: 'text', nullable: true })
    description: string;

    @Column({ type: 'decimal', precision: 12, scale: 2 })
    allocatedAmount: number;

    @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
    spentAmount: number;

    @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
    remainingAmount: number;

    @Column({ length: 3, default: 'BRL' })
    currency: string;

    @Column({
        type: 'enum',
        enum: BudgetPeriod,
        default: BudgetPeriod.MONTHLY
    })
    budgetPeriod: BudgetPeriod;

    @Column({
        type: 'enum',
        enum: BudgetStatus,
        default: BudgetStatus.ACTIVE
    })
    @Index()
    status: BudgetStatus;

    @Column({ type: 'date' })
    @Index()
    startDate: Date;

    @Column({ type: 'date' })
    @Index()
    endDate: Date;

    @Column({ default: true })
    isActive: boolean;

    @Column({ default: false })
    isRecurring: boolean;

    @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
    warningThreshold: number; // Percentage (e.g., 80.00 for 80%)

    @Column({ type: 'jsonb', nullable: true })
    categoryAllocations: Array<{
        categoryId: string;
        categoryName: string;
        percentage: number;
        allocatedAmount: number;
    }>;

    @Column({ type: 'jsonb', nullable: true })
    metadata: Record<string, any>;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @DeleteDateColumn()
    deletedAt: Date;
}