// E2E tests for Authentication API endpoints
import request from 'supertest';
import App from '../../../src/app';
import { TestUtils } from '../../helpers/test-utils';

let app: App;

describe('Authentication E2E Tests', () => {
  beforeAll(async () => {
    await TestUtils.setupInMemoryPostgreSQL();
    await TestUtils.setupInMemoryMongoDB();
    
    // Initialize app for testing
    app = new App({
      environment: 'test',
      port: 0 // Use random port for testing
    });
    await app.initialize();
  });

  afterAll(async () => {
    await app.close();
    await TestUtils.cleanup();
  });

  beforeEach(async () => {
    await TestUtils.clearAllDatabases();
    await TestUtils.flushMockRedis();
  });

  describe('POST /api/auth/register', () => {
    const validRegistrationData = {
      firstName: 'John',
      lastName: 'Doe',
      email: 'john.doe@example.com',
      password: 'StrongPassword123!',
      confirmPassword: 'StrongPassword123!',
      acceptTerms: true
    };

    it('should register a new user with valid data', async () => {
      const response = await request(app.getFastifyInstance().server)
        .post('/api/auth/register')
        .send(validRegistrationData)
        .expect(201);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('user');
      expect(response.body.data).toHaveProperty('tokens');
      expect(response.body.data.user.email).toBe(validRegistrationData.email);
      expect(response.body.data.user.firstName).toBe(validRegistrationData.firstName);
      expect(response.body.data.user.lastName).toBe(validRegistrationData.lastName);
      expect(response.body.data.tokens).toHaveProperty('accessToken');
      expect(response.body.data.tokens).toHaveProperty('refreshToken');
    });

    it('should return 400 for missing required fields', async () => {
      const incompleteData = {
        firstName: 'John',
        email: 'john@example.com'
        // Missing lastName, password, confirmPassword, acceptTerms
      };

      const response = await request(app.getFastifyInstance().server)
        .post('/api/auth/register')
        .send(incompleteData)
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('code', 'VALIDATION_ERROR');
      expect(response.body.error).toHaveProperty('validationErrors');
      expect(response.body.error.validationErrors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'lastName' }),
          expect.objectContaining({ field: 'password' }),
          expect.objectContaining({ field: 'confirmPassword' }),
          expect.objectContaining({ field: 'acceptTerms' })
        ])
      );
    });

    it('should return 400 for invalid email format', async () => {
      const invalidEmailData = {
        ...validRegistrationData,
        email: 'invalid-email-format'
      };

      const response = await request(app.getFastifyInstance().server)
        .post('/api/auth/register')
        .send(invalidEmailData)
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.validationErrors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ 
            field: 'email',
            message: expect.stringMatching(/valid email/i)
          })
        ])
      );
    });

    it('should return 400 for weak password', async () => {
      const weakPasswordData = {
        ...validRegistrationData,
        password: '123',
        confirmPassword: '123'
      };

      const response = await request(app.getFastifyInstance().server)
        .post('/api/auth/register')
        .send(weakPasswordData)
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.validationErrors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ 
            field: 'password',
            message: expect.stringMatching(/password.*strong/i)
          })
        ])
      );
    });

    it('should return 400 for password mismatch', async () => {
      const mismatchedPasswordData = {
        ...validRegistrationData,
        confirmPassword: 'DifferentPassword123!'
      };

      const response = await request(app.getFastifyInstance().server)
        .post('/api/auth/register')
        .send(mismatchedPasswordData)
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.validationErrors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ 
            field: 'confirmPassword',
            message: expect.stringMatching(/passwords.*match/i)
          })
        ])
      );
    });

    it('should return 400 when terms are not accepted', async () => {
      const noTermsData = {
        ...validRegistrationData,
        acceptTerms: false
      };

      const response = await request(app.getFastifyInstance().server)
        .post('/api/auth/register')
        .send(noTermsData)
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.validationErrors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ 
            field: 'acceptTerms',
            message: expect.stringMatching(/terms.*accept/i)
          })
        ])
      );
    });

    it('should return 409 for duplicate email registration', async () => {
      // First registration
      await request(app.getFastifyInstance().server)
        .post('/api/auth/register')
        .send(validRegistrationData)
        .expect(201);

      // Second registration with same email
      const response = await request(app.getFastifyInstance().server)
        .post('/api/auth/register')
        .send({
          ...validRegistrationData,
          firstName: 'Jane'
        })
        .expect(409);

      expect(response.body.error.code).toBe('BUSINESS_ERROR');
      expect(response.body.error.message).toMatch(/email.*already.*registered/i);
    });

    it('should set security headers', async () => {
      const response = await request(app.getFastifyInstance().server)
        .post('/api/auth/register')
        .send(validRegistrationData);

      expect(response.headers).toHaveProperty('x-content-type-options', 'nosniff');
      expect(response.headers).toHaveProperty('x-frame-options', 'DENY');
      expect(response.headers).toHaveProperty('x-xss-protection', '1; mode=block');
    });

    it('should include correlation ID in response', async () => {
      const response = await request(app.getFastifyInstance().server)
        .post('/api/auth/register')
        .send(validRegistrationData);

      expect(response.headers).toHaveProperty('x-correlation-id');
      expect(response.headers['x-correlation-id']).toMatch(/^[a-f0-9\-]{36}$/);
    });
  });

  describe('POST /api/auth/login', () => {
    const userCredentials = {
      email: 'john.doe@example.com',
      password: 'StrongPassword123!'
    };

    beforeEach(async () => {
      // Register a user first
      await request(app.getFastifyInstance().server)
        .post('/api/auth/register')
        .send({
          firstName: 'John',
          lastName: 'Doe',
          email: userCredentials.email,
          password: userCredentials.password,
          confirmPassword: userCredentials.password,
          acceptTerms: true
        });
    });

    it('should login successfully with valid credentials', async () => {
      const response = await request(app.getFastifyInstance().server)
        .post('/api/auth/login')
        .send(userCredentials)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('user');
      expect(response.body.data).toHaveProperty('tokens');
      expect(response.body.data.user.email).toBe(userCredentials.email);
      expect(response.body.data.tokens).toHaveProperty('accessToken');
      expect(response.body.data.tokens).toHaveProperty('refreshToken');
    });

    it('should return 400 for missing email', async () => {
      const response = await request(app.getFastifyInstance().server)
        .post('/api/auth/login')
        .send({ password: userCredentials.password })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.validationErrors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'email' })
        ])
      );
    });

    it('should return 400 for missing password', async () => {
      const response = await request(app.getFastifyInstance().server)
        .post('/api/auth/login')
        .send({ email: userCredentials.email })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.validationErrors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'password' })
        ])
      );
    });

    it('should return 401 for invalid email', async () => {
      const response = await request(app.getFastifyInstance().server)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: userCredentials.password
        })
        .expect(401);

      expect(response.body.error.code).toBe('BUSINESS_ERROR');
      expect(response.body.error.message).toMatch(/invalid.*credentials/i);
    });

    it('should return 401 for invalid password', async () => {
      const response = await request(app.getFastifyInstance().server)
        .post('/api/auth/login')
        .send({
          email: userCredentials.email,
          password: 'WrongPassword123!'
        })
        .expect(401);

      expect(response.body.error.code).toBe('BUSINESS_ERROR');
      expect(response.body.error.message).toMatch(/invalid.*credentials/i);
    });

    it('should rate limit login attempts', async () => {
      const loginAttempt = {
        email: userCredentials.email,
        password: 'WrongPassword123!'
      };

      // Make multiple failed attempts
      for (let i = 0; i < 6; i++) {
        await request(app.getFastifyInstance().server)
          .post('/api/auth/login')
          .send(loginAttempt);
      }

      // Next attempt should be rate limited
      const response = await request(app.getFastifyInstance().server)
        .post('/api/auth/login')
        .send(loginAttempt)
        .expect(429);

      expect(response.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(response.body.error.message).toMatch(/too many.*attempts/i);
    });
  });

  describe('POST /api/auth/refresh', () => {
    let refreshToken: string;

    beforeEach(async () => {
      // Register and get refresh token
      const registerResponse = await request(app.getFastifyInstance().server)
        .post('/api/auth/register')
        .send({
          firstName: 'John',
          lastName: 'Doe',
          email: 'john.doe@example.com',
          password: 'StrongPassword123!',
          confirmPassword: 'StrongPassword123!',
          acceptTerms: true
        });

      refreshToken = registerResponse.body.data.tokens.refreshToken;
    });

    it('should refresh tokens with valid refresh token', async () => {
      const response = await request(app.getFastifyInstance().server)
        .post('/api/auth/refresh')
        .send({ refreshToken })
        .expect(200);

      expect(response.body.data).toHaveProperty('accessToken');
      expect(response.body.data).toHaveProperty('refreshToken');
      expect(response.body.data.refreshToken).not.toBe(refreshToken); // Should be new token
    });

    it('should return 400 for missing refresh token', async () => {
      const response = await request(app.getFastifyInstance().server)
        .post('/api/auth/refresh')
        .send({})
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 401 for invalid refresh token', async () => {
      const response = await request(app.getFastifyInstance().server)
        .post('/api/auth/refresh')
        .send({ refreshToken: 'invalid-refresh-token' })
        .expect(401);

      expect(response.body.error.code).toBe('BUSINESS_ERROR');
      expect(response.body.error.message).toMatch(/invalid.*expired.*token/i);
    });

    it('should return 401 for expired refresh token', async () => {
      // This would require manipulating time or using a token with short expiry
      // For now, we'll test with a malformed token
      const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLWlkIiwiZXhwIjoxNjAwMDAwMDAwfQ.invalid';
      
      const response = await request(app.getFastifyInstance().server)
        .post('/api/auth/refresh')
        .send({ refreshToken: expiredToken })
        .expect(401);

      expect(response.body.error.code).toBe('BUSINESS_ERROR');
    });
  });

  describe('POST /api/auth/logout', () => {
    let accessToken: string;

    beforeEach(async () => {
      // Register and get access token
      const registerResponse = await request(app.getFastifyInstance().server)
        .post('/api/auth/register')
        .send({
          firstName: 'John',
          lastName: 'Doe',
          email: 'john.doe@example.com',
          password: 'StrongPassword123!',
          confirmPassword: 'StrongPassword123!',
          acceptTerms: true
        });

      accessToken = registerResponse.body.data.tokens.accessToken;
    });

    it('should logout successfully with valid token', async () => {
      const response = await request(app.getFastifyInstance().server)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message', 'Logged out successfully');
    });

    it('should return 401 for missing authorization header', async () => {
      const response = await request(app.getFastifyInstance().server)
        .post('/api/auth/logout')
        .expect(401);

      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 401 for invalid token format', async () => {
      const response = await request(app.getFastifyInstance().server)
        .post('/api/auth/logout')
        .set('Authorization', 'InvalidTokenFormat')
        .expect(401);

      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 401 for malformed token', async () => {
      const response = await request(app.getFastifyInstance().server)
        .post('/api/auth/logout')
        .set('Authorization', 'Bearer malformed.jwt.token')
        .expect(401);

      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('GET /api/auth/profile', () => {
    let accessToken: string;
    let userId: string;

    beforeEach(async () => {
      const registerResponse = await request(app.getFastifyInstance().server)
        .post('/api/auth/register')
        .send({
          firstName: 'John',
          lastName: 'Doe',
          email: 'john.doe@example.com',
          password: 'StrongPassword123!',
          confirmPassword: 'StrongPassword123!',
          acceptTerms: true
        });

      accessToken = registerResponse.body.data.tokens.accessToken;
      userId = registerResponse.body.data.user.id;
    });

    it('should return user profile with valid token', async () => {
      const response = await request(app.getFastifyInstance().server)
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.data).toHaveProperty('user');
      expect(response.body.data.user).toHaveProperty('id', userId);
      expect(response.body.data.user).toHaveProperty('email', 'john.doe@example.com');
      expect(response.body.data.user).toHaveProperty('firstName', 'John');
      expect(response.body.data.user).toHaveProperty('lastName', 'Doe');
      expect(response.body.data.user).not.toHaveProperty('password');
    });

    it('should return 401 for missing authorization header', async () => {
      const response = await request(app.getFastifyInstance().server)
        .get('/api/auth/profile')
        .expect(401);

      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 401 for invalid token', async () => {
      const response = await request(app.getFastifyInstance().server)
        .get('/api/auth/profile')
        .set('Authorization', 'Bearer invalid.jwt.token')
        .expect(401);

      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('Error handling and middleware integration', () => {
    it('should handle internal server errors gracefully', async () => {
      // Mock a service method to throw an unexpected error
      jest.spyOn(require('../../../src/core/application/services/auth.service').AuthService.prototype, 'register')
        .mockRejectedValueOnce(new Error('Unexpected database error'));

      const response = await request(app.getFastifyInstance().server)
        .post('/api/auth/register')
        .send({
          firstName: 'John',
          lastName: 'Doe',
          email: 'john.doe@example.com',
          password: 'StrongPassword123!',
          confirmPassword: 'StrongPassword123!',
          acceptTerms: true
        })
        .expect(500);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body.error).toHaveProperty('code', 'INTERNAL_SERVER_ERROR');
      expect(response.headers).toHaveProperty('x-correlation-id');

      // Cleanup mock
      jest.restoreAllMocks();
    });

    it('should validate request content-type', async () => {
      const response = await request(app.getFastifyInstance().server)
        .post('/api/auth/register')
        .set('Content-Type', 'text/plain')
        .send('not json data')
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should enforce request size limits', async () => {
      const largePayload = {
        firstName: 'A'.repeat(10000),
        lastName: 'Doe',
        email: 'john.doe@example.com',
        password: 'StrongPassword123!',
        confirmPassword: 'StrongPassword123!',
        acceptTerms: true
      };

      const response = await request(app.getFastifyInstance().server)
        .post('/api/auth/register')
        .send(largePayload)
        .expect(413);

      expect(response.body.error.code).toBe('PAYLOAD_TOO_LARGE');
    });
  });
});