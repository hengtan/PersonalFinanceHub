// tests/performance/k6/budget-crud.test.js
import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
const budgetCreateSuccessRate = new Rate('budget_create_success_rate');
const budgetReadSuccessRate = new Rate('budget_read_success_rate');
const budgetUpdateSuccessRate = new Rate('budget_update_success_rate');
const budgetDeleteSuccessRate = new Rate('budget_delete_success_rate');
const percentageValidationSuccessRate = new Rate('percentage_validation_success_rate');

const budgetCrudDuration = new Trend('budget_crud_duration');
const budgetValidationDuration = new Trend('budget_validation_duration');
const budgetOperationsCounter = new Counter('budget_operations_total');

// Test configuration
export const options = {
    stages: [
        { duration: '1m', target: 5 },    // Warm up
        { duration: '3m', target: 15 },   // Ramp up to 15 users
        { duration: '5m', target: 15 },   // Stay at 15 users
        { duration: '2m', target: 25 },   // Peak load
        { duration: '3m', target: 25 },   // Sustained peak
        { duration: '2m', target: 0 },    // Ramp down
    ],
    thresholds: {
        http_req_duration: ['p(95)<800'],        // 95% of requests under 800ms
        http_req_failed: ['rate<0.02'],          // Error rate under 2%
        budget_create_success_rate: ['rate>0.98'], // 98% success rate for creates
        budget_read_success_rate: ['rate>0.99'],   // 99% success rate for reads
        budget_update_success_rate: ['rate>0.95'], // 95% success rate for updates
        budget_delete_success_rate: ['rate>0.98'], // 98% success rate for deletes
        percentage_validation_success_rate: ['rate>0.99'], // 99% validation success
        budget_crud_duration: ['p(90)<500'],     // 90% of CRUD ops under 500ms
        budget_validation_duration: ['p(95)<100'], // 95% of validations under 100ms
    },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3333';

// Test data generators
function generateBudgetData(withValidPercentages = true) {
    const categories = [
        { categoryId: 'cat-food', categoryName: 'Food', percentage: withValidPercentages ? 30 : 35 },
        { categoryId: 'cat-transport', categoryName: 'Transport', percentage: withValidPercentages ? 25 : 30 },
        { categoryId: 'cat-housing', categoryName: 'Housing', percentage: withValidPercentages ? 35 : 25 },
        { categoryId: 'cat-utilities', categoryName: 'Utilities', percentage: withValidPercentages ? 10 : 15 },
    ];

    // Adjust last category to ensure 100% total when withValidPercentages is true
    if (withValidPercentages) {
        const total = categories.reduce((sum, cat) => sum + cat.percentage, 0);
        if (total !== 100) {
            categories[categories.length - 1].percentage += (100 - total);
        }
    }

    return {
        name: `Test Budget ${Math.random().toString(36).substr(2, 8)}`,
        description: 'Performance test budget',
        totalAmount: 5000,
        currency: 'BRL',
        budgetType: 'percentage_based',
        isActive: true,
        alertThreshold: 85,
        categories: categories.map(cat => ({
            ...cat,
            allocatedAmount: (5000 * cat.percentage) / 100
        }))
    };
}

function getAuthToken() {
    const loginPayload = {
        email: 'test@example.com',
        password: 'password123'
    };

    const loginResponse = http.post(
        `${BASE_URL}/api/auth/login`,
        JSON.stringify(loginPayload),
        {
            headers: { 'Content-Type': 'application/json' }
        }
    );

    if (loginResponse.status === 200) {
        try {
            const body = JSON.parse(loginResponse.body);
            return body.data.tokens.accessToken;
        } catch (e) {
            return null;
        }
    }
    return null;
}

export function setup() {
    console.log('🚀 Starting Budget CRUD Performance Test');
    console.log(`📍 Base URL: ${BASE_URL}`);
    
    // Verify server health
    const healthCheck = http.get(`${BASE_URL}/api/health`);
    if (healthCheck.status !== 200) {
        throw new Error(`Server health check failed: ${healthCheck.status}`);
    }
    
    // Get auth token for tests
    const token = getAuthToken();
    if (!token) {
        throw new Error('Failed to get authentication token');
    }
    
    console.log('✅ Server health check passed');
    console.log('✅ Authentication token obtained');
    
    return { baseUrl: BASE_URL, token };
}

export default function(data) {
    const { baseUrl, token } = data;
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    };
    
    let budgetId = '';
    
    group('Budget CRUD Operations', () => {
        
        // Test 1: Create Budget with Percentage Validation
        group('Create Budget', () => {
            const createStart = Date.now();
            const budgetData = generateBudgetData(true); // Valid percentages
            
            const createResponse = http.post(
                `${baseUrl}/api/budgets`,
                JSON.stringify(budgetData),
                { headers, timeout: '10s' }
            );
            
            budgetCrudDuration.add(Date.now() - createStart);
            budgetOperationsCounter.add(1);
            
            const createSuccess = check(createResponse, {
                'Create budget status is 201': (r) => r.status === 201,
                'Create budget response has ID': (r) => {
                    try {
                        const body = JSON.parse(r.body);
                        return body.data && body.data.budget && body.data.budget.id;
                    } catch (e) {
                        return false;
                    }
                },
                'Create budget response time < 600ms': (r) => r.timings.duration < 600,
                'Create budget success response': (r) => {
                    try {
                        const body = JSON.parse(r.body);
                        return body.success === true;
                    } catch (e) {
                        return false;
                    }
                }
            });
            
            budgetCreateSuccessRate.add(createSuccess);
            
            if (createSuccess && createResponse.status === 201) {
                try {
                    const body = JSON.parse(createResponse.body);
                    budgetId = body.data.budget.id;
                } catch (e) {
                    console.error('Failed to parse create budget response:', e);
                }
            }
        });
        
        // Test 2: Percentage Validation Endpoint
        group('Percentage Validation', () => {
            const validationStart = Date.now();
            
            // Test valid percentages (should sum to 100%)
            const validCategories = [
                { categoryId: 'cat-food', categoryName: 'Food', percentage: 40, allocatedAmount: 2000 },
                { categoryId: 'cat-transport', categoryName: 'Transport', percentage: 30, allocatedAmount: 1500 },
                { categoryId: 'cat-housing', categoryName: 'Housing', percentage: 30, allocatedAmount: 1500 }
            ];
            
            const validationResponse = http.post(
                `${baseUrl}/api/budgets/validate-percentages`,
                JSON.stringify({ categories: validCategories }),
                { headers, timeout: '5s' }
            );
            
            budgetValidationDuration.add(Date.now() - validationStart);
            budgetOperationsCounter.add(1);
            
            const validationSuccess = check(validationResponse, {
                'Validation status is 200': (r) => r.status === 200,
                'Validation indicates valid percentages': (r) => {
                    try {
                        const body = JSON.parse(r.body);
                        return body.data.isValid === true && Math.abs(body.data.totalPercentage - 100) < 0.001;
                    } catch (e) {
                        return false;
                    }
                },
                'Validation response time < 100ms': (r) => r.timings.duration < 100
            });
            
            percentageValidationSuccessRate.add(validationSuccess);
            
            // Test invalid percentages (should not sum to 100%)
            sleep(0.1);
            
            const invalidCategories = [
                { categoryId: 'cat-food', categoryName: 'Food', percentage: 50, allocatedAmount: 2500 },
                { categoryId: 'cat-transport', categoryName: 'Transport', percentage: 30, allocatedAmount: 1500 },
                { categoryId: 'cat-housing', categoryName: 'Housing', percentage: 30, allocatedAmount: 1500 }
            ];
            
            const invalidValidationResponse = http.post(
                `${baseUrl}/api/budgets/validate-percentages`,
                JSON.stringify({ categories: invalidCategories }),
                { headers, timeout: '5s' }
            );
            
            check(invalidValidationResponse, {
                'Invalid validation status is 200': (r) => r.status === 200,
                'Invalid validation correctly identified': (r) => {
                    try {
                        const body = JSON.parse(r.body);
                        return body.data.isValid === false && body.data.totalPercentage === 110;
                    } catch (e) {
                        return false;
                    }
                }
            });
            
            budgetOperationsCounter.add(1);
        });
        
        // Test 3: Read Budget
        if (budgetId) {
            group('Read Budget', () => {
                const readResponse = http.get(
                    `${baseUrl}/api/budgets/${budgetId}`,
                    { headers, timeout: '5s' }
                );
                
                budgetOperationsCounter.add(1);
                
                const readSuccess = check(readResponse, {
                    'Read budget status is 200': (r) => r.status === 200,
                    'Read budget has correct ID': (r) => {
                        try {
                            const body = JSON.parse(r.body);
                            return body.data && body.data.budget && body.data.budget.id === budgetId;
                        } catch (e) {
                            return false;
                        }
                    },
                    'Read budget response time < 300ms': (r) => r.timings.duration < 300
                });
                
                budgetReadSuccessRate.add(readSuccess);
            });
        }
        
        // Test 4: List Budgets
        group('List Budgets', () => {
            const listResponse = http.get(
                `${baseUrl}/api/budgets?page=1&limit=10`,
                { headers, timeout: '5s' }
            );
            
            budgetOperationsCounter.add(1);
            
            check(listResponse, {
                'List budgets status is 200': (r) => r.status === 200,
                'List budgets has data array': (r) => {
                    try {
                        const body = JSON.parse(r.body);
                        return body.data && Array.isArray(body.data.budgets);
                    } catch (e) {
                        return false;
                    }
                },
                'List budgets response time < 400ms': (r) => r.timings.duration < 400
            });
        });
        
        // Test 5: Update Budget
        if (budgetId) {
            group('Update Budget', () => {
                const updateData = {
                    name: `Updated Budget ${Math.random().toString(36).substr(2, 8)}`,
                    description: 'Updated description',
                    totalAmount: 6000,
                    categories: [
                        { categoryId: 'cat-food', categoryName: 'Food', percentage: 35, allocatedAmount: 2100 },
                        { categoryId: 'cat-transport', categoryName: 'Transport', percentage: 25, allocatedAmount: 1500 },
                        { categoryId: 'cat-housing', categoryName: 'Housing', percentage: 40, allocatedAmount: 2400 }
                    ]
                };
                
                const updateResponse = http.put(
                    `${baseUrl}/api/budgets/${budgetId}`,
                    JSON.stringify(updateData),
                    { headers, timeout: '10s' }
                );
                
                budgetOperationsCounter.add(1);
                
                const updateSuccess = check(updateResponse, {
                    'Update budget status is 200': (r) => r.status === 200,
                    'Update budget success response': (r) => {
                        try {
                            const body = JSON.parse(r.body);
                            return body.success === true;
                        } catch (e) {
                            return false;
                        }
                    },
                    'Update budget response time < 600ms': (r) => r.timings.duration < 600
                });
                
                budgetUpdateSuccessRate.add(updateSuccess);
            });
        }
        
        // Test 6: Delete Budget
        if (budgetId) {
            group('Delete Budget', () => {
                const deleteResponse = http.del(
                    `${baseUrl}/api/budgets/${budgetId}`,
                    null,
                    { headers, timeout: '5s' }
                );
                
                budgetOperationsCounter.add(1);
                
                const deleteSuccess = check(deleteResponse, {
                    'Delete budget status is 200': (r) => r.status === 200,
                    'Delete budget success message': (r) => {
                        try {
                            const body = JSON.parse(r.body);
                            return body.success === true && body.message;
                        } catch (e) {
                            return false;
                        }
                    },
                    'Delete budget response time < 400ms': (r) => r.timings.duration < 400
                });
                
                budgetDeleteSuccessRate.add(deleteSuccess);
            });
        }
    });
    
    // Think time between test iterations
    sleep(Math.random() * 2 + 1); // Random sleep between 1-3 seconds
}

export function teardown(data) {
    console.log('🏁 Budget CRUD Performance Test Completed');
    console.log('📊 Results Summary:');
    console.log('   - Check metrics above for detailed performance data');
    console.log('   - Focus on percentage validation performance (Sprint 2 key feature)');
    console.log('   - Verify CRUD operations meet SLA requirements');
}