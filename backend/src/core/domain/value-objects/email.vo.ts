// backend/src/core/domain/value-objects/email.vo.ts
export class Email {
    readonly value: string;

    constructor(email: string) {
        this.validateEmail(email);
        this.value = email.toLowerCase().trim();
    }

    private validateEmail(email: string): void {
        if (!email || typeof email !== 'string') {
            throw new Error('Email é obrigatório');
        }

        const trimmedEmail = email.trim();

        if (trimmedEmail.length === 0) {
            throw new Error('Email não pode estar vazio');
        }

        if (trimmedEmail.length > 255) {
            throw new Error('Email muito longo (máximo 255 caracteres)');
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(trimmedEmail)) {
            throw new Error('Formato de email inválido');
        }

        // Validações adicionais
        const [localPart, domain] = trimmedEmail.split('@');

        if (localPart.length > 64) {
            throw new Error('Parte local do email muito longa (máximo 64 caracteres)');
        }

        if (domain.length > 253) {
            throw new Error('Domínio do email muito longo (máximo 253 caracteres)');
        }

        // Verifica caracteres especiais no início ou fim
        if (localPart.startsWith('.') || localPart.endsWith('.')) {
            throw new Error('Email não pode começar ou terminar com ponto');
        }

        // Verifica pontos consecutivos
        if (localPart.includes('..') || domain.includes('..')) {
            throw new Error('Email não pode conter pontos consecutivos');
        }
    }

    getDomain(): string {
        return this.value.split('@')[1];
    }

    getLocalPart(): string {
        return this.value.split('@')[0];
    }

    equals(other: Email): boolean {
        return this.value === other.value;
    }

    toString(): string {
        return this.value;
    }

    toJSON(): string {
        return this.value;
    }
}
