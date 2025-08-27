// backend/src/core/application/use-cases/auth/login-user.use-case.ts
import { AuthService, LoginCredentials, AuthUser, TokenPair } from '../../services/auth.service';
import { logger } from '../../../../infrastructure/monitoring/logger.service';
import { BusinessException } from '../../../../shared/exceptions/business.exception';

export interface LoginUserRequest {
    email: string;
    password: string;
    ipAddress?: string;
    userAgent?: string;
}

export interface LoginUserResponse {
    user: AuthUser;
    tokens: TokenPair;
    expiresIn: string;
}

export class LoginUserUseCase {
    constructor(
        private readonly authService: AuthService
    ) {}

    async execute(request: LoginUserRequest): Promise<LoginUserResponse> {
        try {
            logger.info('Attempting user login', {
                email: request.email,
                ipAddress: request.ipAddress,
                userAgent: request.userAgent
            });

            // Executar login
            const result = await this.authService.login({
                email: request.email,
                password: request.password
            });

            // TODO: Registrar login no audit log
            // await this.auditLogService.log({
            //     action: 'USER_LOGIN',
            //     userId: result.user.id,
            //     ipAddress: request.ipAddress,
            //     userAgent: request.userAgent,
            //     success: true
            // });

            logger.info('User login successful', {
                userId: result.user.id,
                email: result.user.email
            });

            return {
                user: result.user,
                tokens: result.tokens,
                expiresIn: process.env.JWT_EXPIRES_IN || '15m'
            };

        } catch (error) {
            // TODO: Registrar tentativa de login falhada no audit log
            // await this.auditLogService.log({
            //     action: 'USER_LOGIN_FAILED',
            //     email: request.email,
            //     ipAddress: request.ipAddress,
            //     userAgent: request.userAgent,
            //     success: false,
            //     error: error.message
            // });

            logger.error('User login failed', error as Error, {
                email: request.email,
                ipAddress: request.ipAddress
            });

            throw error;
        }
    }
}