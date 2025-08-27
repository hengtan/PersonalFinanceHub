// backend/src/core/domain/value-objects/money.vo.ts
import { Currency } from '../../../shared/types/common.types';

export class Money {
    readonly amount: number;
    readonly currency: Currency;

    constructor(amount: number, currency: Currency = 'BRL') {
        this.validateAmount(amount);
        this.validateCurrency(currency);

        this.amount = this.roundToTwoDecimals(amount);
        this.currency = currency;
    }

    private validateAmount(amount: number): void {
        if (typeof amount !== 'number') {
            throw new Error('Valor deve ser um número');
        }

        if (!Number.isFinite(amount)) {
            throw new Error('Valor deve ser um número finito');
        }

        if (amount < 0) {
            throw new Error('Valor não pode ser negativo');
        }
    }

    private validateCurrency(currency: Currency): void {
        const validCurrencies: Currency[] = ['BRL', 'USD', 'EUR'];
        if (!validCurrencies.includes(currency)) {
            throw new Error(`Moeda inválida: ${currency}`);
        }
    }

    private roundToTwoDecimals(amount: number): number {
        return Math.round((amount + Number.EPSILON) * 100) / 100;
    }

    add(other: Money): Money {
        this.ensureSameCurrency(other);
        return new Money(this.amount + other.amount, this.currency);
    }

    subtract(other: Money): Money {
        this.ensureSameCurrency(other);
        const result = this.amount - other.amount;
        if (result < 0) {
            throw new Error('Operação resulta em valor negativo');
        }
        return new Money(result, this.currency);
    }

    multiply(multiplier: number): Money {
        if (typeof multiplier !== 'number' || !Number.isFinite(multiplier)) {
            throw new Error('Multiplicador deve ser um número finito');
        }
        if (multiplier < 0) {
            throw new Error('Multiplicador não pode ser negativo');
        }
        return new Money(this.amount * multiplier, this.currency);
    }

    divide(divisor: number): Money {
        if (typeof divisor !== 'number' || !Number.isFinite(divisor)) {
            throw new Error('Divisor deve ser um número finito');
        }
        if (divisor <= 0) {
            throw new Error('Divisor deve ser maior que zero');
        }
        return new Money(this.amount / divisor, this.currency);
    }

    isGreaterThan(other: Money): boolean {
        this.ensureSameCurrency(other);
        return this.amount > other.amount;
    }

    isLessThan(other: Money): boolean {
        this.ensureSameCurrency(other);
        return this.amount < other.amount;
    }

    equals(other: Money): boolean {
        return this.amount === other.amount && this.currency === other.currency;
    }

    isZero(): boolean {
        return this.amount === 0;
    }

    private ensureSameCurrency(other: Money): void {
        if (this.currency !== other.currency) {
            throw new Error(`Moedas diferentes: ${this.currency} vs ${other.currency}`);
        }
    }

    format(locale: string = 'pt-BR'): string {
        return new Intl.NumberFormat(locale, {
            style: 'currency',
            currency: this.currency,
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(this.amount);
    }

    toJSON(): any {
        return {
            amount: this.amount,
            currency: this.currency,
            formatted: this.format()
        };
    }

    toString(): string {
        return `${this.format()} (${this.currency})`;
    }
}