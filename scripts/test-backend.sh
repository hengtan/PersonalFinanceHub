#!/bin/bash

# Personal Finance Hub - Backend Test Script
# Testa se o backend está rodando e funcionando corretamente

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_status() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[✓]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[!]${NC} $1"; }
print_error() { echo -e "${RED}[✗]${NC} $1"; }

API_BASE_URL="http://localhost:3333"

# Test API health
test_health() {
    print_status "Testing API health endpoint..."

    response=$(curl -s -w "HTTPSTATUS:%{http_code}" "${API_BASE_URL}/api/health")
    http_code=$(echo "$response" | grep -o "HTTPSTATUS:[0-9]*" | cut -d: -f2)
    body=$(echo "$response" | sed 's/HTTPSTATUS:[0-9]*$//')

    if [ "$http_code" -eq 200 ]; then
        print_success "API is healthy"
        return 0
    else
        print_error "API health check failed (HTTP $http_code)"
        echo "$body"
        return 1
    fi
}

# Test user registration
test_registration() {
    print_status "Testing user registration..."

    local email="test-$(date +%s)@example.com"
    local payload='{
        "email": "'$email'",
        "password": "TestPassword123!",
        "confirmPassword": "TestPassword123!",
        "firstName": "Test",
        "lastName": "User",
        "acceptTerms": true
    }'

    response=$(curl -s -w "HTTPSTATUS:%{http_code}" \
        -X POST \
        -H "Content-Type: application/json" \
        -d "$payload" \
        "${API_BASE_URL}/api/auth/register")

    http_code=$(echo "$response" | grep -o "HTTPSTATUS:[0-9]*" | cut -d: -f2)
    body=$(echo "$response" | sed 's/HTTPSTATUS:[0-9]*$//')

    if [ "$http_code" -eq 201 ]; then
        print_success "User registration successful"
        # Extract access token for next tests
        ACCESS_TOKEN=$(echo "$body" | grep -o '"accessToken":"[^"]*' | cut -d'"' -f4)
        TEST_EMAIL="$email"
        return 0
    else
        print_error "User registration failed (HTTP $http_code)"
        echo "$body"
        return 1
    fi
}

# Test user login
test_login() {
    print_status "Testing user login..."

    local payload='{
        "email": "'$TEST_EMAIL'",
        "password": "TestPassword123!"
    }'

    response=$(curl -s -w "HTTPSTATUS:%{http_code}" \
        -X POST \
        -H "Content-Type: application/json" \
        -d "$payload" \
        "${API_BASE_URL}/api/auth/login")

    http_code=$(echo "$response" | grep -o "HTTPSTATUS:[0-9]*" | cut -d: -f2)
    body=$(echo "$response" | sed 's/HTTPSTATUS:[0-9]*$//')

    if [ "$http_code" -eq 200 ]; then
        print_success "User login successful"
        # Update access token
        ACCESS_TOKEN=$(echo "$body" | grep -o '"accessToken":"[^"]*' | cut -d'"' -f4)
        return 0
    else
        print_error "User login failed (HTTP $http_code)"
        echo "$body"
        return 1
    fi
}

# Test protected route (dashboard)
test_dashboard() {
    print_status "Testing dashboard endpoint..."

    if [ -z "$ACCESS_TOKEN" ]; then
        print_error "No access token available"
        return 1
    fi

    response=$(curl -s -w "HTTPSTATUS:%{http_code}" \
        -H "Authorization: Bearer $ACCESS_TOKEN" \
        "${API_BASE_URL}/api/dashboard")

    http_code=$(echo "$response" | grep -o "HTTPSTATUS:[0-9]*" | cut -d: -f2)
    body=$(echo "$response" | sed 's/HTTPSTATUS:[0-9]*$//')

    if [ "$http_code" -eq 200 ]; then
        print_success "Dashboard endpoint working"
        return 0
    else
        print_error "Dashboard endpoint failed (HTTP $http_code)"
        echo "$body"
        return 1
    fi
}

# Test database connectivity
test_database_queries() {
    print_status "Testing database operations..."

    if [ -z "$ACCESS_TOKEN" ]; then
        print_error "No access token available"
        return 1
    fi

    # Test creating a transaction
    local payload='{
        "description": "Test Transaction",
        "amount": 50.00,
        "transactionType": "expense",
        "transactionDate": "'$(date -Iseconds)'",
        "accountId": "00000000-0000-0000-0000-000000000001"
    }'

    response=$(curl -s -w "HTTPSTATUS:%{http_code}" \
        -X POST \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $ACCESS_TOKEN" \
        -d "$payload" \
        "${API_BASE_URL}/api/transactions")

    http_code=$(echo "$response" | grep -o "HTTPSTATUS:[0-9]*" | cut -d: -f2)

    # We expect this to fail with 404 (account not found) but not with 500 (database error)
    if [ "$http_code" -eq 404 ]; then
        print_success "Database operations working (expected 404 for test account)"
        return 0
    elif [ "$http_code" -eq 500 ]; then
        print_error "Database connection issue (HTTP $http_code)"
        return 1
    else
        print_success "Database operations working (HTTP $http_code)"
        return 0
    fi
}

# Check if backend is running
check_backend_running() {
    print_status "Checking if backend is running..."

    if curl -s "${API_BASE_URL}" > /dev/null; then
        print_success "Backend is running on port 3333"
        return 0
    else
        print_error "Backend is not running on port 3333"
        print_status "Please start the backend with: cd backend && npm run dev"
        return 1
    fi
}

# Main test function
main() {
    echo "=============================================="
    echo "Backend API Test Suite"
    echo "Testing Personal Finance Hub Backend"
    echo "=============================================="
    echo

    # Check if backend is running
    if ! check_backend_running; then
        exit 1
    fi

    # Run tests
    local tests_passed=0
    local tests_total=5

    # Test 1: Health check
    if test_health; then
        tests_passed=$((tests_passed + 1))
    fi

    echo

    # Test 2: User registration
    if test_registration; then
        tests_passed=$((tests_passed + 1))
    fi

    echo

    # Test 3: User login
    if test_login; then
        tests_passed=$((tests_passed + 1))
    fi

    echo

    # Test 4: Dashboard (protected route)
    if test_dashboard; then
        tests_passed=$((tests_passed + 1))
    fi

    echo

    # Test 5: Database operations
    if test_database_queries; then
        tests_passed=$((tests_passed + 1))
    fi

    echo
    echo "=============================================="

    if [ $tests_passed -eq $tests_total ]; then
        print_success "All tests passed! ($tests_passed/$tests_total)"
        echo "Backend is working correctly ✨"
        exit 0
    else
        print_warning "Some tests failed ($tests_passed/$tests_total passed)"
        echo "Check the errors above and fix the issues"
        exit 1
    fi
}

# Run main function
main "$@"