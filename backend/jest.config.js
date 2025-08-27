// backend/jest.config.js
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    roots: ['<rootDir>/src', '<rootDir>/test'],
    testMatch: [
        '**/__tests__/**/*.ts',
        '**/?(*.)+(spec|test).ts',
        '**/test/**/*.test.ts'
    ],
    transform: {
        '^.+\\.ts$': 'ts-jest',
    },
    moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
    transformIgnorePatterns: [
        'node_modules/(?!(.*\\.mjs$))'
    ],
    collectCoverageFrom: [
        'src/**/*.ts',
        '!src/**/*.d.ts',
        '!src/**/__tests__/**',
        '!src/**/tests/**',
        '!src/**/test/**',
        '!src/server.ts', // Entry point
        '!src/config/**', // Configuration files
        '!src/shared/constants/**', // Constants
        '!src/**/*.interface.ts', // Interfaces
        '!src/**/*.types.ts', // Type definitions
    ],
    coverageDirectory: 'coverage',
    coverageReporters: ['text', 'lcov', 'html', 'json'],
    coverageThreshold: {
        global: {
            branches: 90,
            functions: 90,
            lines: 90,
            statements: 90
        }
    },
    moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
        '^@test/(.*)$': '<rootDir>/test/$1'
    },
    setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
    testTimeout: 15000,
    maxWorkers: '50%',
    // Separate test types
    projects: [
        {
            displayName: 'unit',
            preset: 'ts-jest',
            testEnvironment: 'node',
            testMatch: ['<rootDir>/test/unit/**/*.test.ts'],
            transform: {
                '^.+\\.ts$': 'ts-jest',
            },
            moduleNameMapper: {
                '^@/(.*)$': '<rootDir>/src/$1',
                '^@test/(.*)$': '<rootDir>/test/$1'
            }
        },
        {
            displayName: 'integration', 
            preset: 'ts-jest',
            testEnvironment: 'node',
            testMatch: ['<rootDir>/test/integration/**/*.test.ts'],
            transform: {
                '^.+\\.ts$': 'ts-jest',
            },
            moduleNameMapper: {
                '^@/(.*)$': '<rootDir>/src/$1',
                '^@test/(.*)$': '<rootDir>/test/$1'
            }
        },
        {
            displayName: 'e2e',
            preset: 'ts-jest',
            testEnvironment: 'node',
            testMatch: ['<rootDir>/test/e2e/**/*.test.ts'],
            transform: {
                '^.+\\.ts$': 'ts-jest',
            },
            moduleNameMapper: {
                '^@/(.*)$': '<rootDir>/src/$1',
                '^@test/(.*)$': '<rootDir>/test/$1'
            }
        }
    ]
};
