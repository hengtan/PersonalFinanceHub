// backend/src/shared/utils/date.util.ts
export class DateUtil {
    static isValidPassword(password: string): boolean {
        // At least 8 characters, 1 uppercase, 1 lowercase, 1 number
        const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
        return passwordRegex.test(password);
    }

    static sanitizeInput(input: string): string {
        return input.trim().replace(/[<>]/g, '');
    }

    static isValidPeriod(period: string): boolean {
        const periodRegex = /^\d{4}-\d{2}$/;
        if (!periodRegex.test(period)) return false;

        const [year, month] = period.split('-').map(Number);
        return year >= 2000 && year <= 2100 && month >= 1 && month <= 12;
    }
}