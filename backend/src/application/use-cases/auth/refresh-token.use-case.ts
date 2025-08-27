// backend/src/application/use-cases/auth/refresh-token.use-case.ts
import jwt from 'jsonwebtoken';
import { UserRepository } from '../../../core/domain/repositories/user.repository';
import { CacheService } from '../../../infrastructure/database/redis/cache.service';
import { BusinessException } from '../../../shared/exceptions/business.exception';
import { logger } from '../../../shared/utils/logger.util';
import { HTTP_STATUS } from '../../../shared/constants/status-codes';
import { BUSINESS_RULES } from '../../../shared/constants/business-rules';

export interface RefreshTokenRequest {
    refreshToken: string;
}

export interface RefreshTokenResponse {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
}

interface RefreshTokenPayload {
    userId: string;
    type: string;
    iat: number;
    exp: number;
}

export class RefreshTokenUseCase {
    constructor(
        private readonly userRepository: UserRepository,
        private readonly cacheService: CacheService
    ) {}

    async execute(request: RefreshTokenRequest): Promise<RefreshTokenResponse> {
        const { refreshToken } = request;

        try {
            // Verify refresh token
            const decoded = jwt.verify(
                refreshToken,
                process.env.JWT_REFRESH_SECRET!
            ) as RefreshTokenPayload;

            if (decoded.type !== 'refresh') {
                throw new BusinessException(
                    'Token inválido',
                    HTTP_STATUS.UNAUTHORIZED
                );
            }

            // Check if refresh token exists in cache
            const storedRefreshToken = await this.cacheService.get(`refresh_token:${decoded.userId}`);
            if (storedRefreshToken !== refreshToken) {
                logger.warn('Invalid refresh token attempt', { userId: decoded.userId });
                throw new BusinessException(
                    'Token inválido ou expirado',
                    HTTP_STATUS.UNAUTHORIZED
                );
            }

            // Get user details
            const user = await this.userRepository.findById(decoded.userId);
            if (!user || !user.isActive) {
                throw new BusinessException(
                    'Usuário não encontrado ou inativo',
                    HTTP_STATUS.UNAUTHORIZED
                );
            }

            // Generate new tokens
            const newAccessToken = jwt.sign(
                {
                    userId: user.id,
                    email: user.email,
                    role: user.role,
                    type: 'access'
                },
                process.env.JWT_SECRET!,
                {
                    expiresIn: '1h',
                    issuer: 'personal-finance-hub',
                    audience: 'pfh-users'
                }
            );

            const newRefreshToken = jwt.sign(
                {
                    userId: user.id,
                    type: 'refresh'
                },
                process.env.JWT_REFRESH_SECRET!,
                {
                    expiresIn: '7d',
                    issuer: 'personal-finance-hub',
                    audience: 'pfh-users'
                }
            );

            // Update refresh token in cache
            await this.cacheService.set(
                `refresh_token:${user.id}`,
                newRefreshToken,
                BUSINESS_RULES.USER.REFRESH_TOKEN_DURATION
            );

            // Update user session cache
            await this.cacheService.set(
                `user_session:${user.id}`,
                {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    role: user.role
                },
                BUSINESS_RULES.USER.SESSION_DURATION
            );

            logger.info('Token refreshed successfully', { userId: user.id });

            return {
                accessToken: newAccessToken,
                refreshToken: newRefreshToken,
                expiresIn: BUSINESS_RULES.USER.SESSION_DURATION
            };

        } catch (error) {
            if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError) {
                throw new BusinessException(
                    'Token inválido ou expirado',
                    HTTP_STATUS.UNAUTHORIZED
                );
            }

            throw error;
        }
    }
}