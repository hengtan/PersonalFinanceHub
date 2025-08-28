// tests/performance/k6/auth-flow.test.js
import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const loginSuccessRate = new Rate('login_success_rate');
const loginDuration = new Trend('login_duration');
const refreshTokenSuccessRate = new Rate('refresh_token_success_rate');

// Test configuration
export const options = {
    stages: [
        { duration: '2m', target: 10 },   // Ramp up to 10 users
        { duration: '5m', target: 10 },   // Stay at 10 users  
        { duration: '2m', target: 20 },   // Ramp up to 20 users
        { duration: '5m', target: 20 },   // Stay at 20 users
        { duration: '2m', target: 0 },    // Ramp down to 0 users
    ],
    thresholds: {
        http_req_duration: ['p(95)<500'], // 95% of requests should be below 500ms
        http_req_failed: ['rate<0.05'],   // Error rate should be less than 5%
        login_success_rate: ['rate>0.95'], // Login success rate should be above 95%
        login_duration: ['p(95)<200'],    // 95% of logins should be below 200ms
        refresh_token_success_rate: ['rate>0.98'], // Refresh token success rate should be above 98%
    },
};

// Test data
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3333';
const TEST_USERS = [
    { email: 'test1@example.com', password: 'password123' },
    { email: 'test2@example.com', password: 'password123' },
    { email: 'test3@example.com', password: 'password123' },
    { email: 'test4@example.com', password: 'password123' },
    { email: 'test5@example.com', password: 'password123' },
];

export function setup() {
    // Setup function runs once before the test
    console.log('🚀 Starting Authentication Flow Performance Test');
    console.log(`📍 Base URL: ${BASE_URL}`);
    console.log(`👥 Test Users: ${TEST_USERS.length}`);
    
    // Verify server is running
    const healthCheck = http.get(`${BASE_URL}/api/health`);
    if (healthCheck.status !== 200) {
        throw new Error(`Server health check failed: ${healthCheck.status}`);
    }
    
    console.log('✅ Server health check passed');
    return { baseUrl: BASE_URL, users: TEST_USERS };
}

export default function(data) {
    const baseUrl = data.baseUrl;
    const users = data.users;
    const user = users[Math.floor(Math.random() * users.length)];
    
    group('Authentication Flow', () => {
        let accessToken = '';
        let refreshToken = '';
        
        // Step 1: User Login
        group('User Login', () => {
            const loginStart = Date.now();
            
            const loginPayload = {
                email: user.email,
                password: user.password,
            };
            
            const params = {
                headers: {
                    'Content-Type': 'application/json',
                },
                timeout: '30s',
            };
            
            const loginResponse = http.post(
                `${baseUrl}/api/auth/login`,
                JSON.stringify(loginPayload),
                params
            );
            
            const loginDurationMs = Date.now() - loginStart;
            loginDuration.add(loginDurationMs);
            
            const loginSuccess = check(loginResponse, {
                'Login status is 200': (r) => r.status === 200,
                'Login response contains token': (r) => {
                    try {
                        const body = JSON.parse(r.body);
                        return body.data && body.data.tokens && body.data.tokens.accessToken;
                    } catch (e) {
                        return false;
                    }
                },
                'Login response time < 500ms': (r) => r.timings.duration < 500,
            });
            
            loginSuccessRate.add(loginSuccess);
            
            if (loginSuccess && loginResponse.status === 200) {
                try {
                    const responseBody = JSON.parse(loginResponse.body);
                    accessToken = responseBody.data.tokens.accessToken;
                    refreshToken = responseBody.data.tokens.refreshToken;
                } catch (e) {
                    console.error('Failed to parse login response:', e);
                }
            }
        });
        
        // Step 2: Access Protected Resource
        if (accessToken) {
            group('Access Protected Resource', () => {
                const params = {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json',
                    },
                };
                
                const profileResponse = http.get(`${baseUrl}/api/auth/profile`, params);
                
                check(profileResponse, {
                    'Profile access status is 200': (r) => r.status === 200,
                    'Profile response contains user data': (r) => {
                        try {
                            const body = JSON.parse(r.body);
                            return body.data && body.data.user;
                        } catch (e) {
                            return false;
                        }
                    },
                    'Profile response time < 300ms': (r) => r.timings.duration < 300,
                });
            });
        }
        
        // Step 3: Refresh Token
        if (refreshToken) {
            group('Token Refresh', () => {
                const refreshPayload = {
                    refreshToken: refreshToken,
                };
                
                const params = {
                    headers: {
                        'Content-Type': 'application/json',
                    },
                };
                
                const refreshResponse = http.post(
                    `${baseUrl}/api/auth/refresh`,
                    JSON.stringify(refreshPayload),
                    params
                );
                
                const refreshSuccess = check(refreshResponse, {
                    'Refresh status is 200': (r) => r.status === 200,
                    'Refresh response contains new token': (r) => {
                        try {
                            const body = JSON.parse(r.body);
                            return body.data && body.data.tokens && body.data.tokens.accessToken;
                        } catch (e) {
                            return false;
                        }
                    },
                    'Refresh response time < 200ms': (r) => r.timings.duration < 200,
                });
                
                refreshTokenSuccessRate.add(refreshSuccess);
                
                if (refreshSuccess && refreshResponse.status === 200) {
                    try {
                        const responseBody = JSON.parse(refreshResponse.body);
                        accessToken = responseBody.data.tokens.accessToken;
                    } catch (e) {
                        console.error('Failed to parse refresh response:', e);
                    }
                }
            });
        }
        
        // Step 4: Logout
        if (accessToken) {
            group('User Logout', () => {
                const params = {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json',
                    },
                };
                
                const logoutResponse = http.post(`${baseUrl}/api/auth/logout`, null, params);
                
                check(logoutResponse, {
                    'Logout status is 200': (r) => r.status === 200,
                    'Logout response time < 100ms': (r) => r.timings.duration < 100,
                });
            });
        }
    });
    
    // Think time between iterations
    sleep(1);
}

export function teardown(data) {
    console.log('🏁 Authentication Flow Performance Test Completed');
    console.log('📊 Check the results above for detailed metrics');
}