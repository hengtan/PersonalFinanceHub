// backend/src/shared/utils/validation.util.ts

import { z } from 'zod';
import { ValidationException } from '../exceptions/validation.exception';

export class ValidationUtil {
    /**
     * Valida dados usando schema Zod
     */
    static validate<T>(schema: z.ZodSchema<T>, data: unknown): T {
        try {
            return schema.parse(data);
        } catch (error) {
            if (error instanceof z.ZodError) {
                const validationErrors = error.errors.map(err => ({
                    field: err.path.join('.'),
                    message: err.message,
                    value: err.input
                }));

                throw new ValidationException('Dados de entrada inválidos', validationErrors);
            }
            throw error;
        }
    }

    /**
     * Valida dados de forma assíncrona usando schema Zod
     */
    static async validateAsync<T>(schema: z.ZodSchema<T>, data: unknown): Promise<T> {
        try {
            return await schema.parseAsync(data);
        } catch (error) {
            if (error instanceof z.ZodError) {
                const validationErrors = error.errors.map(err => ({
                    field: err.path.join('.'),
                    message: err.message,
                    value: err.input
                }));

                throw new ValidationException('Dados de entrada inválidos', validationErrors);
            }
            throw error;
        }
    }

    /**
     * Valida CPF brasileiro
     */
    static isValidCPF(cpf: string): boolean {
        // Remove caracteres não numéricos
        cpf = cpf.replace(/[^\d]/g, '');

        // Verifica se tem 11 dígitos
        if (cpf.length !== 11) return false;

        // Verifica se todos os dígitos são iguais
        if (/^(\d)\1{10}$/.test(cpf)) return false;

        // Validação dos dígitos verificadores
        let sum = 0;
        for (let i = 0; i < 9; i++) {
            sum += parseInt(cpf.charAt(i)) * (10 - i);
        }
        let remainder = (sum * 10) % 11;
        if (remainder === 10 || remainder === 11) remainder = 0;
        if (remainder !== parseInt(cpf.charAt(9))) return false;

        sum = 0;
        for (let i = 0; i < 10; i++) {
            sum += parseInt(cpf.charAt(i)) * (11 - i);
        }
        remainder = (sum * 10) % 11;
        if (remainder === 10 || remainder === 11) remainder = 0;
        return remainder === parseInt(cpf.charAt(10));
    }

    /**
     * Valida CNPJ brasileiro
     */
    static isValidCNPJ(cnpj: string): boolean {
        cnpj = cnpj.replace(/[^\d]/g, '');

        if (cnpj.length !== 14) return false;
        if (/^(\d)\1{13}$/.test(cnpj)) return false;

        // Validação primeiro dígito
        let length = cnpj.length - 2;
        let numbers = cnpj.substring(0, length);
        const digits = cnpj.substring(length);
        let sum = 0;
        let pos = length - 7;

        for (let i = length; i >= 1; i--) {
            sum += parseInt(numbers.charAt(length - i)) * pos--;
            if (pos < 2) pos = 9;
        }

        let result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
        if (result !== parseInt(digits.charAt(0))) return false;

        // Validação segundo dígito
        length = length + 1;
        numbers = cnpj.substring(0, length);
        sum = 0;
        pos = length - 7;

        for (let i = length; i >= 1; i--) {
            sum += parseInt(numbers.charAt(length - i)) * pos--;
            if (pos < 2) pos = 9;
        }

        result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
        return result === parseInt(digits.charAt(1));
    }

    /**
     * Valida email
     */
    static isValidEmail(email: string): boolean {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    /**
     * Valida senha forte
     */
    static isStrongPassword(password: string): { isValid: boolean; errors: string[] } {
        const errors: string[] = [];

        if (password.length < 8) {
            errors.push('A senha deve ter no mínimo 8 caracteres');
        }

        if (!/[A-Z]/.test(password)) {
            errors.push('A senha deve conter pelo menos uma letra maiúscula');
        }

        if (!/[a-z]/.test(password)) {
            errors.push('A senha deve conter pelo menos uma letra minúscula');
        }

        if (!/[0-9]/.test(password)) {
            errors.push('A senha deve conter pelo menos um número');
        }

        if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
            errors.push('A senha deve conter pelo menos um caractere especial');
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * Valida telefone brasileiro
     */
    static isValidBrazilianPhone(phone: string): boolean {
        // Remove caracteres não numéricos
        const cleanPhone = phone.replace(/[^\d]/g, '');

        // Verifica se tem 10 ou 11 dígitos (com ou sem 9 no celular)
        if (cleanPhone.length < 10 || cleanPhone.length > 11) {
            return false;
        }

        // Verifica se começa com código de área válido (11-99)
        const areaCode = parseInt(cleanPhone.substring(0, 2));
        if (areaCode < 11 || areaCode > 99) {
            return false;
        }

        return true;
    }

    /**
     * Valida CEP brasileiro
     */
    static isValidCEP(cep: string): boolean {
        const cleanCEP = cep.replace(/[^\d]/g, '');
        return /^[0-9]{8}$/.test(cleanCEP);
    }

    /**
     * Valida valor monetário
     */
    static isValidMoney(value: any): boolean {
        if (typeof value === 'number') {
            return !isNaN(value) && isFinite(value) && value >= 0;
        }

        if (typeof value === 'string') {
            // Remove formatação brasileira
            const cleanValue = value.replace(/[^\d,-]/g, '').replace(',', '.');
            const numValue = parseFloat(cleanValue);
            return !isNaN(numValue) && isFinite(numValue) && numValue >= 0;
        }

        return false;
    }

    /**
     * Sanitiza string removendo caracteres especiais
     */
    static sanitizeString(str: string): string {
        return str
            .trim()
            .replace(/[<>]/g, '') // Remove < e >
            .replace(/script/gi, '') // Remove palavra script
            .replace(/javascript:/gi, ''); // Remove javascript:
    }

    /**
     * Valida data no formato brasileiro (DD/MM/YYYY)
     */
    static isValidBrazilianDate(date: string): boolean {
        const dateRegex = /^(\d{2})\/(\d{2})\/(\d{4})$/;
        const match = date.match(dateRegex);

        if (!match) return false;

        const day = parseInt(match[1]);
        const month = parseInt(match[2]);
        const year = parseInt(match[3]);

        if (month < 1 || month > 12) return false;
        if (day < 1 || day > 31) return false;
        if (year < 1900 || year > new Date().getFullYear() + 10) return false;

        // Validação específica para cada mês
        const daysInMonth = new Date(year, month, 0).getDate();
        return day <= daysInMonth;
    }

    /**
     * Converte data brasileira para ISO
     */
    static brazilianDateToISO(date: string): string {
        const [day, month, year] = date.split('/');
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }

    /**
     * Formata valor monetário para padrão brasileiro
     */
    static formatBrazilianCurrency(value: number): string {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        }).format(value);
    }
}