// backend/src/application/use-cases/auth/register-user.use-case.ts
import bcrypt from 'bcryptjs';
import { UserRepository } from '../../../core/domain/repositories/user.repository';
import { EventDispatcherService } from '../../../core/services/event-dispatcher.service';
import { UserRegisteredEvent } from '../../../core/domain/events/user-registered.event';
import { LoginUserUseCase } from './login-user.use-case';
import { BusinessException } from '../../../shared/exceptions/business.exception';
import { logger } from '../../../shared/utils/logger.util';
import { HTTP_STATUS } from '../../../shared/constants/status-codes';

export interface RegisterUserRequest {
    name: string;
    email: string;
    password: string;
    cpf?: string;
    phone?: string;
    dateOfBirth?: Date;
    acceptTerms: boolean;
    ipAddress?: string;
    userAgent?: string;
}

export interface RegisterUserResponse {
    user: {
        id: string;
        email: string;
        name: string;
        role: string;
        isEmailVerified: boolean;
        createdAt: Date;
    };
    accessToken: string;
    refreshToken: string;
}

export class RegisterUserUseCase {
    constructor(
        private readonly userRepository: UserRepository,
        private readonly eventDispatcher: EventDispatcherService,
        private readonly loginUserUseCase: LoginUserUseCase
    ) {}

    async execute(request: RegisterUserRequest): Promise<RegisterUserResponse> {
        const {
            name,
            email,
            password,
            cpf,
            phone,
            dateOfBirth,
            acceptTerms,
            ipAddress,
            userAgent
        } = request;

        logger.info('Processing user registration', { email, name });

        // Validate terms acceptance
        if (!acceptTerms) {
            throw new BusinessException(
                'Você deve aceitar os termos de uso para continuar',
                HTTP_STATUS.BAD_REQUEST
            );
        }

        // Check if user already exists
        await this.checkUserExists(email, cpf);

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 12);

        // Create user
        const user = await this.userRepository.create({
            name: name.trim(),
            email: email.toLowerCase().trim(),
            password: hashedPassword,
            cpf: cpf?.replace(/[^\d]/g, ''),
            phone: phone?.replace(/[^\d]/g, ''),
            dateOfBirth,
            preferences: {
                language: 'pt-BR',
                currency: 'BRL',
                timezone: 'America/Sao_Paulo',
                dateFormat: 'DD/MM/YYYY',
                theme: 'light',
                notifications: {
                    email: true,
                    push: true,
                    sms: false,
                    budgetAlerts: true,
                    transactionAlerts: true
                }
            }
        });

        // Dispatch registration event
        await this.eventDispatcher.dispatch(
            new UserRegisteredEvent(user.id, {
                email: user.email,
                name: user.name,
                registrationDate: user.createdAt,
                ipAddress,
                userAgent
            })
        );

        logger.info('User registered successfully', {
            userId: user.id,
            email: user.email
        });

        // Auto-login the user
        const loginResult = await this.loginUserUseCase.execute({
            email: user.email,
            password,
            ipAddress,
            userAgent
        });

        return {
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role,
                isEmailVerified: user.isEmailVerified,
                createdAt: user.createdAt
            },
            accessToken: loginResult.accessToken,
            refreshToken: loginResult.refreshToken
        };
    }

    private async checkUserExists(email: string, cpf?: string): Promise<void> {
        // Check email
        const existingUserByEmail = await this.userRepository.findByEmail(email);
        if (existingUserByEmail) {
            throw new BusinessException(
                'Este email já está cadastrado',
                HTTP_STATUS.CONFLICT
            );
        }

        // Check CPF if provided
        if (cpf) {
            const cleanCpf = cpf.replace(/[^\d]/g, '');
            const existingUserByCpf = await this.userRepository.findByCpf(cleanCpf);
            if (existingUserByCpf) {
                throw new BusinessException(
                    'Este CPF já está cadastrado',
                    HTTP_STATUS.CONFLICT
                );
            }
        }
    }
}