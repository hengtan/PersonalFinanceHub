// Unit tests for AuthService
import { AuthService } from '../../../src/core/application/services/auth.service';
import { ValidationException } from '../../../src/shared/exceptions/validation.exception';
import { BusinessException } from '../../../src/shared/exceptions/business.exception';
import { TestUtils } from '../../helpers/test-utils';

// Mock bcrypt
jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('hashed-password'),
  compare: jest.fn().mockResolvedValue(true)
}));

// Mock jsonwebtoken
jest.mock('jsonwebtoken', () => ({
  sign: jest.fn().mockReturnValue('mock-jwt-token'),
  verify: jest.fn().mockReturnValue({ sub: 'user-id', email: 'test@example.com' })
}));

describe('AuthService', () => {
  let authService: AuthService;
  let mockLogger: any;

  beforeEach(() => {
    authService = new AuthService();
    mockLogger = TestUtils.createMockLogger();
    
    // Mock the logger
    (authService as any).logger = mockLogger;
    
    jest.clearAllMocks();
  });

  describe('register', () => {
    const validRegistrationData = {
      firstName: 'John',
      lastName: 'Doe',
      email: 'john.doe@example.com',
      password: 'StrongPassword123!',
      confirmPassword: 'StrongPassword123!',
      acceptTerms: true
    };

    it('should successfully register a new user with valid data', async () => {
      const result = await authService.register(validRegistrationData);

      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('tokens');
      expect(result.user.email).toBe(validRegistrationData.email);
      expect(result.user.firstName).toBe(validRegistrationData.firstName);
      expect(result.user.lastName).toBe(validRegistrationData.lastName);
      expect(result.user.isActive).toBe(true);
      expect(result.tokens.accessToken).toBe('mock-jwt-token');
      expect(result.tokens.refreshToken).toBe('mock-jwt-token');
    });

    it('should throw ValidationException for missing firstName', async () => {
      const invalidData = { ...validRegistrationData, firstName: '' };

      await expect(authService.register(invalidData))
        .rejects
        .toThrow(ValidationException);

      await expect(authService.register(invalidData))
        .rejects
        .toThrow('Invalid credentials');
    });

    it('should throw ValidationException for missing lastName', async () => {
      const invalidData = { ...validRegistrationData, lastName: '' };

      await expect(authService.register(invalidData))
        .rejects
        .toThrow(ValidationException);
    });

    it('should throw ValidationException for invalid email format', async () => {
      const invalidData = { ...validRegistrationData, email: 'invalid-email' };

      await expect(authService.register(invalidData))
        .rejects
        .toThrow(ValidationException);
    });

    it('should throw ValidationException for weak password', async () => {
      const invalidData = { ...validRegistrationData, password: '123' };

      await expect(authService.register(invalidData))
        .rejects
        .toThrow(ValidationException);
    });

    it('should throw ValidationException for password mismatch', async () => {
      const invalidData = { 
        ...validRegistrationData, 
        confirmPassword: 'DifferentPassword123!' 
      };

      await expect(authService.register(invalidData))
        .rejects
        .toThrow(ValidationException);
    });

    it('should throw ValidationException when terms not accepted', async () => {
      const invalidData = { ...validRegistrationData, acceptTerms: false };

      await expect(authService.register(invalidData))
        .rejects
        .toThrow(ValidationException);
    });

    it('should hash the password before storing', async () => {
      const bcrypt = require('bcryptjs');
      
      await authService.register(validRegistrationData);

      expect(bcrypt.hash).toHaveBeenCalledWith(validRegistrationData.password, 12);
    });

    it('should generate access and refresh tokens', async () => {
      const jwt = require('jsonwebtoken');
      
      const result = await authService.register(validRegistrationData);

      expect(jwt.sign).toHaveBeenCalledTimes(2); // access + refresh token
      expect(result.tokens.accessToken).toBeDefined();
      expect(result.tokens.refreshToken).toBeDefined();
    });

    it('should log successful registration', async () => {
      await authService.register(validRegistrationData);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'User registered successfully',
        expect.objectContaining({
          email: validRegistrationData.email
        })
      );
    });

    it('should handle registration errors gracefully', async () => {
      const bcrypt = require('bcryptjs');
      bcrypt.hash.mockRejectedValueOnce(new Error('Hashing failed'));

      await expect(authService.register(validRegistrationData))
        .rejects
        .toThrow('Registration failed');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Registration failed',
        expect.any(Error),
        expect.objectContaining({
          email: validRegistrationData.email
        })
      );
    });
  });

  describe('login', () => {
    const validCredentials = {
      email: 'john.doe@example.com',
      password: 'StrongPassword123!'
    };

    beforeEach(() => {
      // Mock successful bcrypt comparison
      const bcrypt = require('bcryptjs');
      bcrypt.compare.mockResolvedValue(true);
    });

    it('should successfully login with valid credentials', async () => {
      const result = await authService.login(validCredentials);

      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('tokens');
      expect(result.user.email).toBe(validCredentials.email);
      expect(result.tokens.accessToken).toBe('mock-jwt-token');
      expect(result.tokens.refreshToken).toBe('mock-jwt-token');
    });

    it('should throw ValidationException for missing email', async () => {
      const invalidCredentials = { ...validCredentials, email: '' };

      await expect(authService.login(invalidCredentials))
        .rejects
        .toThrow(ValidationException);
    });

    it('should throw ValidationException for missing password', async () => {
      const invalidCredentials = { ...validCredentials, password: '' };

      await expect(authService.login(invalidCredentials))
        .rejects
        .toThrow(ValidationException);
    });

    it('should throw ValidationException for invalid email format', async () => {
      const invalidCredentials = { ...validCredentials, email: 'invalid-email' };

      await expect(authService.login(invalidCredentials))
        .rejects
        .toThrow(ValidationException);
    });

    it('should throw BusinessException for incorrect password', async () => {
      const bcrypt = require('bcryptjs');
      bcrypt.compare.mockResolvedValue(false);

      await expect(authService.login(validCredentials))
        .rejects
        .toThrow(BusinessException);

      await expect(authService.login(validCredentials))
        .rejects
        .toThrow('Invalid credentials');
    });

    it('should verify password using bcrypt', async () => {
      const bcrypt = require('bcryptjs');
      
      await authService.login(validCredentials);

      expect(bcrypt.compare).toHaveBeenCalledWith(
        validCredentials.password,
        expect.any(String)
      );
    });

    it('should log successful login', async () => {
      await authService.login(validCredentials);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'User logged in successfully',
        expect.objectContaining({
          email: validCredentials.email
        })
      );
    });

    it('should log failed login attempts', async () => {
      const bcrypt = require('bcryptjs');
      bcrypt.compare.mockResolvedValue(false);

      await expect(authService.login(validCredentials))
        .rejects
        .toThrow();

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Login failed',
        expect.any(Error),
        expect.objectContaining({
          email: validCredentials.email
        })
      );
    });
  });

  describe('refreshTokens', () => {
    const validRefreshToken = 'valid-refresh-token';

    beforeEach(() => {
      const jwt = require('jsonwebtoken');
      jwt.verify.mockReturnValue({
        sub: 'user-id',
        email: 'test@example.com',
        type: 'refresh'
      });
    });

    it('should generate new tokens with valid refresh token', async () => {
      const result = await authService.refreshTokens(validRefreshToken);

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result.accessToken).toBe('mock-jwt-token');
      expect(result.refreshToken).toBe('mock-jwt-token');
    });

    it('should verify the refresh token', async () => {
      const jwt = require('jsonwebtoken');
      
      await authService.refreshTokens(validRefreshToken);

      expect(jwt.verify).toHaveBeenCalledWith(
        validRefreshToken,
        expect.any(String) // JWT_REFRESH_SECRET
      );
    });

    it('should throw error for invalid refresh token', async () => {
      const jwt = require('jsonwebtoken');
      jwt.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await expect(authService.refreshTokens('invalid-token'))
        .rejects
        .toThrow('Invalid or expired refresh token');
    });

    it('should generate new access and refresh tokens', async () => {
      const jwt = require('jsonwebtoken');
      
      await authService.refreshTokens(validRefreshToken);

      expect(jwt.sign).toHaveBeenCalledTimes(2);
    });
  });

  describe('generateTokens', () => {
    it('should generate both access and refresh tokens', () => {
      const user = TestUtils.generateUser();
      
      const tokens = (authService as any).generateTokens(user);

      expect(tokens).toHaveProperty('accessToken');
      expect(tokens).toHaveProperty('refreshToken');
      expect(tokens.accessToken).toBe('mock-jwt-token');
      expect(tokens.refreshToken).toBe('mock-jwt-token');
    });

    it('should call jwt.sign twice for access and refresh tokens', () => {
      const jwt = require('jsonwebtoken');
      const user = TestUtils.generateUser();
      
      (authService as any).generateTokens(user);

      expect(jwt.sign).toHaveBeenCalledTimes(2);
    });
  });

  describe('validateLoginCredentials', () => {
    it('should not throw for valid credentials', () => {
      const validCredentials = {
        email: 'test@example.com',
        password: 'ValidPassword123!'
      };

      expect(() => {
        (authService as any).validateLoginCredentials(validCredentials);
      }).not.toThrow();
    });

    it('should throw ValidationException for missing email', () => {
      const invalidCredentials = {
        email: '',
        password: 'ValidPassword123!'
      };

      expect(() => {
        (authService as any).validateLoginCredentials(invalidCredentials);
      }).toThrow(ValidationException);
    });

    it('should throw ValidationException for short password', () => {
      const invalidCredentials = {
        email: 'test@example.com',
        password: '123'
      };

      expect(() => {
        (authService as any).validateLoginCredentials(invalidCredentials);
      }).toThrow(ValidationException);
    });
  });

  describe('validateRegistrationData', () => {
    const validData = TestUtils.generateUser();

    it('should not throw for valid data', () => {
      expect(() => {
        (authService as any).validateRegistrationData(validData);
      }).not.toThrow();
    });

    it('should collect multiple validation errors', () => {
      const invalidData = {
        firstName: '', // Invalid
        lastName: '', // Invalid
        email: 'invalid', // Invalid
        password: '123', // Invalid
        acceptTerms: false // Invalid
      };

      expect(() => {
        (authService as any).validateRegistrationData(invalidData);
      }).toThrow(ValidationException);

      // Should have multiple errors
      try {
        (authService as any).validateRegistrationData(invalidData);
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationException);
        expect((error as ValidationException).validationErrors).toHaveLength(5);
      }
    });
  });
});