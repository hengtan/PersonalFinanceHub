// backend/src/shared/utils/validation.util.ts

/**
 * Utilitários de validação para diferentes tipos de dados
 * Implementa validações comuns reutilizáveis em todo o sistema
 */
export class ValidationUtil {
    /**
     * Valida formato de email
     */
    static isValidEmail(email: string): boolean {
        const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
        return emailRegex.test(email.trim());
    }

    /**
     * Valida UUID v4
     */
    static isValidUUID(uuid: string): boolean {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        return uuidRegex.test(uuid);
    }

    /**
     * Valida valores monetários
     */
    static isValidCurrency(amount: number): boolean {
        return Number.isFinite(amount) &&
            Math.abs(amount) <= 999999999.99 &&
            Number(amount.toFixed(2)) === amount;
    }

    /**
     * Valida códigos de moeda ISO 4217
     */
    static isValidCurrencyCode(code: string): boolean {
        const validCurrencies = [
            'USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'CNY', 'SEK', 'NZD',
            'MXN', 'SGD', 'HKD', 'NOK', 'ZAR', 'BRL', 'RUB', 'INR', 'KRW', 'TRY',
            'PLN', 'DKK', 'CZK', 'HUF', 'ILS', 'CLP', 'PHP', 'AED', 'SAR', 'THB',
            'MYR', 'IDR', 'VND', 'EGP', 'TWD', 'KWD', 'QAR', 'OMR', 'BHD', 'JOD'
        ];
        return validCurrencies.includes(code.toUpperCase());
    }

    /**
     * Valida senhas com critérios de segurança
     */
    static validatePassword(password: string): {
        isValid: boolean;
        errors: string[];
        strength: 'weak' | 'medium' | 'strong';
    } {
        const errors: string[] = [];
        let score = 0;

        // Comprimento mínimo
        if (password.length < 8) {
            errors.push('Password must be at least 8 characters long');
        } else {
            score += 1;
        }

        // Letra maiúscula
        if (!/[A-Z]/.test(password)) {
            errors.push('Password must contain at least one uppercase letter');
        } else {
            score += 1;
        }

        // Letra minúscula
        if (!/[a-z]/.test(password)) {
            errors.push('Password must contain at least one lowercase letter');
        } else {
            score += 1;
        }

        // Número
        if (!/\d/.test(password)) {
            errors.push('Password must contain at least one number');
        } else {
            score += 1;
        }

        // Caractere especial
        if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
            errors.push('Password must contain at least one special character');
        } else {
            score += 1;
        }

        // Comprimento extra
        if (password.length >= 12) {
            score += 1;
        }

        // Caracteres variados
        if (new Set(password).size >= password.length * 0.7) {
            score += 1;
        }

        // Não contém sequências comuns
        const commonSequences = ['123', 'abc', 'qwe', 'password', '111'];
        const lowerPassword = password.toLowerCase();
        const hasCommonSequence = commonSequences.some(seq => lowerPassword.includes(seq));
        if (hasCommonSequence) {
            errors.push('Password should not contain common sequences');
            score -= 1;
        }

        const strength: 'weak' | 'medium' | 'strong' =
            score <= 2 ? 'weak' :
                score <= 4 ? 'medium' : 'strong';

        return {
            isValid: errors.length === 0 && score >= 4,
            errors,
            strength
        };
    }

    /**
     * Valida CPF brasileiro
     */
    static isValidCPF(cpf: string): boolean {
        // Remove caracteres não numéricos
        const cleanCPF = cpf.replace(/[^\d]/g, '');

        // Verifica se tem 11 dígitos
        if (cleanCPF.length !== 11) return false;

        // Verifica se não é uma sequência igual
        if (/^(\d)\1+$/.test(cleanCPF)) return false;

        // Valida primeiro dígito verificador
        let sum = 0;
        for (let i = 0; i < 9; i++) {
            sum += parseInt(cleanCPF.charAt(i)) * (10 - i);
        }
        let remainder = sum % 11;
        let digit1 = remainder < 2 ? 0 : 11 - remainder;

        if (parseInt(cleanCPF.charAt(9)) !== digit1) return false;

        // Valida segundo dígito verificador
        sum = 0;
        for (let i = 0; i < 10; i++) {
            sum += parseInt(cleanCPF.charAt(i)) * (11 - i);
        }
        remainder = sum % 11;
        let digit2 = remainder < 2 ? 0 : 11 - remainder;

        return parseInt(cleanCPF.charAt(10)) === digit2;
    }

    /**
     * Valida CNPJ brasileiro
     */
    static isValidCNPJ(cnpj: string): boolean {
        // Remove caracteres não numéricos
        const cleanCNPJ = cnpj.replace(/[^\d]/g, '');

        // Verifica se tem 14 dígitos
        if (cleanCNPJ.length !== 14) return false;

        // Verifica se não é uma sequência igual
        if (/^(\d)\1+$/.test(cleanCNPJ)) return false;

        // Valida primeiro dígito verificador
        const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
        let sum = 0;
        for (let i = 0; i < 12; i++) {
            sum += parseInt(cleanCNPJ.charAt(i)) * weights1[i];
        }
        let remainder = sum % 11;
        let digit1 = remainder < 2 ? 0 : 11 - remainder;

        if (parseInt(cleanCNPJ.charAt(12)) !== digit1) return false;

        // Valida segundo dígito verificador
        const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
        sum = 0;
        for (let i = 0; i < 13; i++) {
            sum += parseInt(cleanCNPJ.charAt(i)) * weights2[i];
        }
        remainder = sum % 11;
        let digit2 = remainder < 2 ? 0 : 11 - remainder;

        return parseInt(cleanCNPJ.charAt(13)) === digit2;
    }

    /**
     * Valida números de telefone brasileiros
     */
    static isValidBrazilianPhone(phone: string): boolean {
        // Remove caracteres não numéricos
        const cleanPhone = phone.replace(/[^\d]/g, '');

        // Verifica formatos válidos
        // Celular: 11 dígitos (11987654321)
        // Fixo: 10 dígitos (1133334444)
        // Com código do país: +55 (5511987654321 ou 551133334444)

        if (cleanPhone.length === 11) {
            // Celular: deve começar com DDD válido e nono dígito 9
            const ddd = cleanPhone.substring(0, 2);
            const ninthDigit = cleanPhone.charAt(2);
            return this.isValidDDD(ddd) && ninthDigit === '9';
        } else if (cleanPhone.length === 10) {
            // Fixo: deve começar com DDD válido
            const ddd = cleanPhone.substring(0, 2);
            return this.isValidDDD(ddd);
        } else if (cleanPhone.length === 13 && cleanPhone.startsWith('55')) {
            // Com código do país +55
            const phoneWithoutCountry = cleanPhone.substring(2);
            return this.isValidBrazilianPhone(phoneWithoutCountry);
        }

        return false;
    }

    /**
     * Valida códigos de DDD brasileiros
     */
    private static isValidDDD(ddd: string): boolean {
        const validDDDs = [
            '11', '12', '13', '14', '15', '16', '17', '18', '19', // SP
            '21', '22', '24', // RJ
            '27', '28', // ES
            '31', '32', '33', '34', '35', '37', '38', // MG
            '41', '42', '43', '44', '45', '46', // PR
            '47', '48', '49', // SC
            '51', '53', '54', '55', // RS
            '61', // DF
            '62', '64', // GO
            '63', // TO
            '65', '66', // MT
            '67', // MS
            '68', // AC
            '69', // RO
            '71', '73', '74', '75', '77', // BA
            '79', // SE
            '81', '87', // PE
            '82', // AL
            '83', // PB
            '84', // RN
            '85', '88', // CE
            '86', '89', // PI
            '91', '93', '94', // PA
            '92', '97', // AM
            '95', // RR
            '96', // AP
            '98', '99' // MA
        ];
        return validDDDs.includes(ddd);
    }

    /**
     * Valida CEP brasileiro
     */
    static isValidCEP(cep: string): boolean {
        const cleanCEP = cep.replace(/[^\d]/g, '');
        return /^\d{8}$/.test(cleanCEP);
    }

    /**
     * Valida datas em diferentes formatos
     */
    static isValidDate(date: string | Date): boolean {
        if (date instanceof Date) {
            return !isNaN(date.getTime());
        }

        const parsedDate = new Date(date);
        return !isNaN(parsedDate.getTime());
    }

    /**
     * Valida se uma data está dentro de um range válido
     */
    static isDateInRange(
        date: string | Date,
        minDate?: string | Date,
        maxDate?: string | Date
    ): boolean {
        const targetDate = new Date(date);
        if (!this.isValidDate(targetDate)) return false;

        if (minDate) {
            const min = new Date(minDate);
            if (targetDate < min) return false;
        }

        if (maxDate) {
            const max = new Date(maxDate);
            if (targetDate > max) return false;
        }

        return true;
    }

    /**
     * Valida URLs
     */
    static isValidURL(url: string): boolean {
        try {
            new URL(url);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Valida códigos hexadecimais de cores
     */
    static isValidHexColor(color: string): boolean {
        return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color);
    }

    /**
     * Valida nomes (sem números ou caracteres especiais)
     */
    static isValidName(name: string): boolean {
        return /^[a-zA-ZÀ-ÿ\s'-]{2,50}$/.test(name.trim());
    }

    /**
     * Valida usernames/slugs
     */
    static isValidUsername(username: string): boolean {
        return /^[a-zA-Z0-9_-]{3,30}$/.test(username);
    }

    /**
     * Valida números de cartão de crédito usando algoritmo de Luhn
     */
    static isValidCreditCard(cardNumber: string): boolean {
        const cleanNumber = cardNumber.replace(/[^\d]/g, '');

        // Verifica comprimento
        if (cleanNumber.length < 13 || cleanNumber.length > 19) return false;

        // Algoritmo de Luhn
        let sum = 0;
        let isEven = false;

        for (let i = cleanNumber.length - 1; i >= 0; i--) {
            let digit = parseInt(cleanNumber.charAt(i));

            if (isEven) {
                digit *= 2;
                if (digit > 9) digit -= 9;
            }

            sum += digit;
            isEven = !isEven;
        }

        return sum % 10 === 0;
    }

    /**
     * Identifica bandeira do cartão de crédito
     */
    static getCreditCardBrand(cardNumber: string): string | null {
        const cleanNumber = cardNumber.replace(/[^\d]/g, '');

        if (/^4/.test(cleanNumber)) return 'Visa';
        if (/^5[1-5]/.test(cleanNumber)) return 'Mastercard';
        if (/^3[47]/.test(cleanNumber)) return 'American Express';
        if (/^6(?:011|5)/.test(cleanNumber)) return 'Discover';
        if (/^(?:2131|1800|35\d{3})\d{11}$/.test(cleanNumber)) return 'JCB';
        if (/^3[0689]/.test(cleanNumber)) return 'Diners Club';
        if (/^(606282|3841|6041|6505|6516)/.test(cleanNumber)) return 'Hipercard';
        if (/^636/.test(cleanNumber)) return 'Elo';

        return null;
    }

    /**
     * Sanitiza strings removendo caracteres perigosos
     */
    static sanitizeString(input: string): string {
        return input
            .replace(/[<>]/g, '') // Remove < e >
            .replace(/javascript:/gi, '') // Remove javascript:
            .replace(/on\w+=/gi, '') // Remove event handlers
            .trim();
    }

    /**
     * Valida se um valor está em uma lista de opções válidas
     */
    static isValidOption<T>(value: T, validOptions: T[]): boolean {
        return validOptions.includes(value);
    }

    /**
     * Valida ranges numéricos
     */
    static isInRange(value: number, min?: number, max?: number): boolean {
        if (!Number.isFinite(value)) return false;
        if (min !== undefined && value < min) return false;
        if (max !== undefined && value > max) return false;
        return true;
    }

    /**
     * Valida formato de período YYYY-MM
     */
    static isValidPeriod(period: string): boolean {
        if (!/^\d{4}-\d{2}$/.test(period)) return false;

        const [year, month] = period.split('-').map(Number);
        const currentYear = new Date().getFullYear();

        return year >= 1900 &&
            year <= currentYear + 10 &&
            month >= 1 &&
            month <= 12;
    }

    /**
     * Valida códigos de barras brasileiros
     */
    static isValidBrazilianBarcode(barcode: string): boolean {
        const cleanBarcode = barcode.replace(/[^\d]/g, '');

        // Boleto bancário: 47 dígitos
        if (cleanBarcode.length === 47) {
            return this.validateBoletoBarcode(cleanBarcode);
        }

        // Linha digitável: 44 dígitos
        if (cleanBarcode.length === 44) {
            return this.validateBoletoDigitableLine(cleanBarcode);
        }

        return false;
    }

    private static validateBoletoBarcode(barcode: string): boolean {
        // Implementação simplificada - em produção use biblioteca especializada
        return /^\d{47}$/.test(barcode);
    }

    private static validateBoletoDigitableLine(line: string): boolean {
        // Implementação simplificada - em produção use biblioteca especializada
        return /^\d{44}$/.test(line);
    }

    /**
     * Formata valores monetários para display
     */
    static formatCurrency(amount: number, currency: string = 'BRL'): string {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: currency,
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(amount);
    }

    /**
     * Utilitário para obter período atual no formato YYYY-MM
     */
    static getCurrentPeriod(): string {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        return `${year}-${month}`;
    }

    /**
     * Calcula próximo período
     */
    static getNextPeriod(period: string): string {
        const [year, month] = period.split('-').map(Number);
        const date = new Date(year, month, 1); // Próximo mês
        return `${date.getFullYear()}-${String(date.getMonth()).padStart(2, '0')}`;
    }

    /**
     * Calcula período anterior
     */
    static getPreviousPeriod(period: string): string {
        const [year, month] = period.split('-').map(Number);
        const date = new Date(year, month - 2, 1); // Mês anterior
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    }

    /**
     * Utilitários de data
     */
    static getStartOfMonth(date: Date = new Date()): Date {
        return new Date(date.getFullYear(), date.getMonth(), 1);
    }

    static getEndOfMonth(date: Date = new Date()): Date {
        return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
    }

    static getStartOfWeek(date: Date = new Date()): Date {
        const day = date.getDay();
        const diff = date.getDate() - day + (day === 0 ? -6 : 1); // Ajuste para começar na segunda
        return new Date(date.setDate(diff));
    }

    static getEndOfWeek(date: Date = new Date()): Date {
        const day = date.getDay();
        const diff = date.getDate() + (7 - day);
        return new Date(date.setDate(diff));
    }

    /**
     * Valida se um objeto tem propriedades obrigatórias
     */
    static hasRequiredProperties<T extends object>(
        obj: T,
        requiredProps: (keyof T)[]
    ): boolean {
        return requiredProps.every(prop =>
            obj[prop] !== undefined && obj[prop] !== null && obj[prop] !== ''
        );
    }

    /**
     * Remove propriedades undefined/null de um objeto
     */
    static cleanObject<T extends Record<string, any>>(obj: T): Partial<T> {
        const cleaned: Partial<T> = {};
        for (const [key, value] of Object.entries(obj)) {
            if (value !== undefined && value !== null) {
                cleaned[key as keyof T] = value;
            }
        }
        return cleaned;
    }
}