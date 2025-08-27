// backend/src/core/domain/value-objects/date-range.vo.ts
export class DateRange {
    readonly startDate: Date;
    readonly endDate: Date;

    constructor(startDate: Date, endDate: Date) {
        this.validateDates(startDate, endDate);
        this.startDate = new Date(startDate);
        this.endDate = new Date(endDate);
    }

    private validateDates(startDate: Date, endDate: Date): void {
        if (!(startDate instanceof Date) || isNaN(startDate.getTime())) {
            throw new Error('Data inicial inválida');
        }

        if (!(endDate instanceof Date) || isNaN(endDate.getTime())) {
            throw new Error('Data final inválida');
        }

        if (startDate >= endDate) {
            throw new Error('Data inicial deve ser anterior à data final');
        }
    }

    contains(date: Date): boolean {
        if (!(date instanceof Date) || isNaN(date.getTime())) {
            return false;
        }
        return date >= this.startDate && date <= this.endDate;
    }

    overlaps(other: DateRange): boolean {
        return this.startDate <= other.endDate && this.endDate >= other.startDate;
    }

    getDurationInDays(): number {
        const diffTime = Math.abs(this.endDate.getTime() - this.startDate.getTime());
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }

    getDurationInMonths(): number {
        const yearDiff = this.endDate.getFullYear() - this.startDate.getFullYear();
        const monthDiff = this.endDate.getMonth() - this.startDate.getMonth();
        return yearDiff * 12 + monthDiff;
    }

    extend(days: number): DateRange {
        const newEndDate = new Date(this.endDate);
        newEndDate.setDate(newEndDate.getDate() + days);
        return new DateRange(this.startDate, newEndDate);
    }

    shrink(days: number): DateRange {
        const newEndDate = new Date(this.endDate);
        newEndDate.setDate(newEndDate.getDate() - days);

        if (newEndDate <= this.startDate) {
            throw new Error('Não é possível reduzir o período - data final seria anterior ou igual à inicial');
        }

        return new DateRange(this.startDate, newEndDate);
    }

    split(numberOfParts: number): DateRange[] {
        if (numberOfParts <= 0) {
            throw new Error('Número de partes deve ser maior que zero');
        }

        const totalDays = this.getDurationInDays();
        const daysPerPart = Math.ceil(totalDays / numberOfParts);
        const ranges: DateRange[] = [];

        let currentStart = new Date(this.startDate);

        for (let i = 0; i < numberOfParts; i++) {
            const currentEnd = new Date(currentStart);
            currentEnd.setDate(currentEnd.getDate() + daysPerPart - 1);

            // Adjust the last part to end exactly at the end date
            if (i === numberOfParts - 1 || currentEnd > this.endDate) {
                currentEnd.setTime(this.endDate.getTime());
            }

            ranges.push(new DateRange(currentStart, currentEnd));

            // Prepare next start date
            currentStart = new Date(currentEnd);
            currentStart.setDate(currentStart.getDate() + 1);

            // Break if we've reached the end
            if (currentStart >= this.endDate) {
                break;
            }
        }

        return ranges;
    }

    isCurrentMonth(): boolean {
        const now = new Date();
        const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

        return this.startDate.getTime() === currentMonthStart.getTime() &&
            this.endDate.getTime() === currentMonthEnd.getTime();
    }

    isCurrentYear(): boolean {
        const now = new Date();
        const currentYearStart = new Date(now.getFullYear(), 0, 1);
        const currentYearEnd = new Date(now.getFullYear(), 11, 31);

        return this.startDate.getTime() === currentYearStart.getTime() &&
            this.endDate.getTime() === currentYearEnd.getTime();
    }

    format(locale: string = 'pt-BR'): string {
        const options: Intl.DateTimeFormatOptions = {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        };

        return `${this.startDate.toLocaleDateString(locale, options)} - ${this.endDate.toLocaleDateString(locale, options)}`;
    }

    equals(other: DateRange): boolean {
        return this.startDate.getTime() === other.startDate.getTime() &&
            this.endDate.getTime() === other.endDate.getTime();
    }

    toString(): string {
        return this.format();
    }

    toJSON(): any {
        return {
            startDate: this.startDate.toISOString(),
            endDate: this.endDate.toISOString(),
            durationInDays: this.getDurationInDays(),
            formatted: this.format()
        };
    }

    // Factory methods
    static createCurrentMonth(): DateRange {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        return new DateRange(start, end);
    }

    static createCurrentYear(): DateRange {
        const now = new Date();
        const start = new Date(now.getFullYear(), 0, 1);
        const end = new Date(now.getFullYear(), 11, 31);
        return new DateRange(start, end);
    }

    static createLastNDays(days: number): DateRange {
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - days + 1);
        return new DateRange(start, end);
    }

    static createNextNDays(days: number): DateRange {
        const start = new Date();
        const end = new Date();
        end.setDate(end.getDate() + days - 1);
        return new DateRange(start, end);
    }
}