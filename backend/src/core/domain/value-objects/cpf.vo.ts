// backend/src/core/domain/value-objects/cpf.vo.ts
export class CPF {
    readonly value: string;
    private readonly cleanValue: string;

    constructor(cpf: string) {
        this.cleanValue = this.cleanCpf(cpf);
        this.validateCpf(this.cleanValue);
        this.value = this.formatCpf(this.cleanValue);
    }

    private cleanCpf(cpf: string): string {
        if (!cpf || typeof cpf !== 'string') {
            throw new Error('CPF é obrigatório');
        }
        return cpf.replace(/[^\d]/g, '');
    }

    private validateCpf(cpf: string): void {
        if (cpf.length !== 11) {
            throw new Error('CPF deve ter 11 dígitos');
        }

        // Verifica se todos os dígitos são iguais
        if (/^(\d)\1{10}$/.test(cpf)) {
            throw new Error('CPF inválido');
        }

        // Validação dos dígitos verificadores
        let sum = 0;
        for (let i = 0; i < 9; i++) {
            sum += parseInt(cpf.charAt(i)) * (10 - i);
        }
        let remainder = (sum * 10) % 11;
        if (remainder === 10 || remainder === 11) remainder = 0;
        if (remainder !== parseInt(cpf.charAt(9))) {
            throw new Error('CPF inválido');
        }

        sum = 0;
        for (let i = 0; i < 10; i++) {
            sum += parseInt(cpf.charAt(i)) * (11 - i);
        }
        remainder = (sum * 10) % 11;
        if (remainder === 10 || remainder === 11) remainder = 0;
        if (remainder !== parseInt(cpf.charAt(10))) {
            throw new Error('CPF inválido');
        }
    }

    private formatCpf(cpf: string): string {
        return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    }

    getCleanValue(): string {
        return this.cleanValue;
    }

    equals(other: CPF): boolean {
        return this.cleanValue === other.cleanValue;
    }

    toString(): string {
        return this.value;
    }

    toJSON(): string {
        return this.value;
    }
}