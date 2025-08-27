// backend/src/infrastructure/database/postgres/entities/transaction.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, DeleteDateColumn, Index } from 'typeorm';
import { TransactionType, TransactionStatus, PaymentMethod, RecurringConfig } from '../../../../core/domain/entities/transaction.entity';

@Entity('transactions')
@Index(['userId', 'transactionDate'])
@Index(['userId', 'categoryId'])
@Index(['userId', 'type'])
@Index(['transactionDate'])
export class TransactionPostgresEntity {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'uuid' })
    @Index()
    userId: string;

    @Column({ type: 'uuid' })
    accountId: string;

    @Column({ type: 'uuid', nullable: true })
    destinationAccountId: string;

    @Column({ type: 'uuid' })
    categoryId: string;

    @Column({ length: 500 })
    description: string;

    @Column({ type: 'decimal', precision: 12, scale: 2 })
    amount: number;

    @Column({ length: 3, default: 'BRL' })
    currency: string;

    @Column({
        type: 'enum',
        enum: TransactionType
    })
    type: TransactionType;

    @Column({
        type: 'enum',
        enum: TransactionStatus,
        default: TransactionStatus.PENDING
    })
    status: TransactionStatus;

    @Column({
        type: 'enum',
        enum: PaymentMethod
    })
    paymentMethod: PaymentMethod;

    @Column({ type: 'date' })
    @Index()
    transactionDate: Date;

    @Column({ type: 'date', nullable: true })
    dueDate: Date;

    @Column({ default: false })
    isPaid: boolean;

    @Column({ default: false })
    isRecurring: boolean;

    @Column({ type: 'jsonb', nullable: true })
    recurringConfig: RecurringConfig;

    @Column({ type: 'text', array: true, default: [] })
    tags: string[];

    @Column({ type: 'text', nullable: true })
    notes: string;

    @Column({ type: 'text', array: true, default: [] })
    attachments: string[];

    @Column({ type: 'jsonb', nullable: true })
    metadata: Record<string, any>;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @DeleteDateColumn()
    deletedAt: Date;
}