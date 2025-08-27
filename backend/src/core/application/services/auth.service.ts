// backend/src/core/application/services/auth.service.ts
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { logger } from '../../../infrastructure/monitoring/logger.service';
import { ValidationException } from '../../../shared/exceptions/validation.exception';
import { BusinessException } from '../../../shared/exceptions/business.exception';

export interface LoginCredentials {
    email: string;
    password: string;
}

export interface RegisterData {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    confirmPassword?: string;
    acceptTerms: boolean;
}

export interface TokenPair {
    accessToken: string;
    refreshToken: string;
}

export interface AuthUser {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    isActive: boolean;
}

export class AuthService {
    private readonly JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret';
    private readonly JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'fallback-refresh-secret';
    private readonly JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m';
    private readonly JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

    constructor() {
        if (!process.env.JWT_SECRET || !process.env.JWT_REFRESH_SECRET) {
            logger.warn('JWT secrets not properly configured, using fallback values');
        }
    }

    async login(credentials: LoginCredentials): Promise<{ user: AuthUser; tokens: TokenPair }> {
        try {
            // Validar credenciais
            this.validateLoginCredentials(credentials);

            // TODO: Buscar usuário no banco de dados
            // const user = await this.userRepository.findByEmail(credentials.email);
            
            // Mock user para desenvolvimento
            const user: AuthUser = {
                id: '1',
                email: credentials.email,
                name: 'Test User',
                isActive: true
            };

            // TODO: Verificar senha
            // const isPasswordValid = await bcrypt.compare(credentials.password, user.passwordHash);
            // if (!isPasswordValid) {
            //     throw new BusinessException('Invalid credentials', 'INVALID_CREDENTIALS', 401);
            // }

            if (!user.isActive) {
                throw new BusinessException('Account is disabled', 'ACCOUNT_DISABLED', 403);
            }

            // Gerar tokens
            const tokens = this.generateTokens(user);

            logger.info('User logged in successfully', {
                userId: user.id,
                email: user.email
            });

            return { user, tokens };

        } catch (error) {
            logger.error('Login failed', error as Error, {
                email: credentials.email
            });
            throw error;
        }
    }

    async register(userData: RegisterData): Promise<{ user: AuthUser; tokens: TokenPair }> {
        try {
            // Validar dados de registro
            this.validateRegistrationData(userData);

            // TODO: Verificar se email já existe
            // const existingUser = await this.userRepository.findByEmail(userData.email);
            // if (existingUser) {
            //     throw new BusinessException('Email already registered', 'EMAIL_EXISTS', 409);
            // }

            // Hash da senha
            const passwordHash = await bcrypt.hash(userData.password, 12);

            // TODO: Criar usuário no banco
            // const user = await this.userRepository.create({
            //     name: userData.name,
            //     email: userData.email,
            //     passwordHash
            // });

            // Mock user para desenvolvimento
            const user: AuthUser = {
                id: Math.random().toString(36).substr(2, 9),
                email: userData.email,
                firstName: userData.firstName,
                lastName: userData.lastName,
                isActive: true
            };

            // Gerar tokens
            const tokens = this.generateTokens(user);

            logger.info('User registered successfully', {
                userId: user.id,
                email: user.email
            });

            return { user, tokens };

        } catch (error) {
            logger.error('Registration failed', error as Error, {
                email: userData.email
            });
            throw error;
        }
    }

    async refreshTokens(refreshToken: string): Promise<TokenPair> {
        try {
            // Verificar refresh token
            const payload = jwt.verify(refreshToken, this.JWT_REFRESH_SECRET) as any;
            
            // TODO: Buscar usuário
            // const user = await this.userRepository.findById(payload.sub);
            // if (!user || !user.isActive) {
            //     throw new BusinessException('Invalid refresh token', 'INVALID_REFRESH_TOKEN', 401);
            // }

            // Mock user
            const user: AuthUser = {
                id: payload.sub,
                email: payload.email,
                name: payload.name,
                isActive: true
            };

            // Gerar novos tokens
            const tokens = this.generateTokens(user);

            logger.debug('Tokens refreshed successfully', {
                userId: user.id
            });

            return tokens;

        } catch (error) {
            logger.error('Token refresh failed', error as Error);
            throw new BusinessException('Invalid refresh token', 'INVALID_REFRESH_TOKEN', 401);
        }
    }

    async logout(userId: string, refreshToken?: string): Promise<void> {
        try {
            // TODO: Invalidar refresh token no banco/cache
            // if (refreshToken) {
            //     await this.cacheService.del(`refresh_token:${userId}`);
            // }

            logger.info('User logged out successfully', {
                userId
            });

        } catch (error) {
            logger.error('Logout failed', error as Error, {
                userId
            });
            throw error;
        }
    }

    private generateTokens(user: AuthUser): TokenPair {
        const payload = {
            sub: user.id,
            email: user.email,
            name: user.name,
            iat: Math.floor(Date.now() / 1000)
        };

        const accessToken = jwt.sign(payload, this.JWT_SECRET, {
            expiresIn: this.JWT_EXPIRES_IN
        });

        const refreshToken = jwt.sign(payload, this.JWT_REFRESH_SECRET, {
            expiresIn: this.JWT_REFRESH_EXPIRES_IN
        });

        return { accessToken, refreshToken };
    }

    private validateLoginCredentials(credentials: LoginCredentials): void {
        const errors: Array<{ field: string; message: string }> = [];

        if (!credentials.email) {
            errors.push({ field: 'email', message: 'Email is required' });
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(credentials.email)) {
            errors.push({ field: 'email', message: 'Invalid email format' });
        }

        if (!credentials.password) {
            errors.push({ field: 'password', message: 'Password is required' });
        } else if (credentials.password.length < 6) {
            errors.push({ field: 'password', message: 'Password must be at least 6 characters' });
        }

        if (errors.length > 0) {
            throw new ValidationException('Validation failed', errors);
        }
    }

    private validateRegistrationData(userData: RegisterData): void {
        const errors: Array<{ field: string; message: string }> = [];

        if (!userData.firstName) {
            errors.push({ field: 'firstName', message: 'First name is required' });
        } else if (userData.firstName.length < 2) {
            errors.push({ field: 'firstName', message: 'First name must be at least 2 characters' });
        }

        if (!userData.lastName) {
            errors.push({ field: 'lastName', message: 'Last name is required' });
        } else if (userData.lastName.length < 2) {
            errors.push({ field: 'lastName', message: 'Last name must be at least 2 characters' });
        }

        if (!userData.acceptTerms) {
            errors.push({ field: 'acceptTerms', message: 'You must accept the terms and conditions' });
        }

        if (!userData.email) {
            errors.push({ field: 'email', message: 'Email is required' });
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userData.email)) {
            errors.push({ field: 'email', message: 'Invalid email format' });
        }

        if (!userData.password) {
            errors.push({ field: 'password', message: 'Password is required' });
        } else if (userData.password.length < 8) {
            errors.push({ field: 'password', message: 'Password must be at least 8 characters' });
        }

        if (userData.confirmPassword && userData.password !== userData.confirmPassword) {
            errors.push({ field: 'confirmPassword', message: 'Passwords do not match' });
        }

        if (errors.length > 0) {
            throw new ValidationException('Validation failed', errors);
        }
    }

    verifyToken(token: string): any {
        try {
            return jwt.verify(token, this.JWT_SECRET);
        } catch (error) {
            throw new BusinessException('Invalid token', 'INVALID_TOKEN', 401);
        }
    }
}