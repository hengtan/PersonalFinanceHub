// Coverage reporting configuration for Jest
const path = require('path');

module.exports = {
  // Coverage collection configuration
  collectCoverage: true,
  collectCoverageFrom: [
    'src/**/*.{ts,js}',
    '!src/**/*.d.ts',
    '!src/**/*.test.{ts,js}',
    '!src/**/*.spec.{ts,js}',
    '!src/**/index.{ts,js}',
    '!src/server.ts', // Server entry point
    '!src/app.ts', // App setup
    '!src/config/**', // Configuration files
    '!src/shared/types/**', // Type definitions
    '!src/**/*.interface.ts', // Interface files
    '!src/**/*.enum.ts', // Enum files
    '!src/**/*.constant.ts', // Constant files
    '!src/infrastructure/database/migrations/**', // Database migrations
    '!src/infrastructure/database/seeds/**', // Database seeds
    '!src/shared/exceptions/index.ts', // Exception exports
  ],

  // Coverage thresholds (90% as requested)
  coverageThreshold: {
    global: {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90
    },
    // Specific thresholds for critical modules
    'src/core/application/services/**/*.ts': {
      branches: 95,
      functions: 95,
      lines: 95,
      statements: 95
    },
    'src/infrastructure/database/**/*.ts': {
      branches: 85,
      functions: 85,
      lines: 85,
      statements: 85
    },
    'src/infrastructure/messaging/**/*.ts': {
      branches: 85,
      functions: 85,
      lines: 85,
      statements: 85
    }
  },

  // Coverage reporting formats
  coverageReporters: [
    'text', // Console output
    'text-summary', // Brief summary
    'html', // HTML report
    'lcov', // LCOV format for CI/CD
    'json', // JSON format for analysis
    'cobertura' // Cobertura XML format
  ],

  // Coverage output directory
  coverageDirectory: 'coverage',

  // Coverage file name patterns
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/build/',
    '/coverage/',
    '/.next/',
    '/test/',
    '/tests/',
    '/__tests__/',
    '/docs/',
    '/scripts/',
    '/migrations/',
    '/seeds/'
  ],

  // Custom coverage provider configuration
  coverageProvider: 'v8', // Use V8 coverage provider (faster and more accurate)

  // Coverage reporter options
  coverageReporterOptions: {
    html: {
      outputDir: 'coverage/html-report',
      skipFull: false,
      skipEmpty: false
    },
    lcov: {
      outputFile: 'coverage/lcov.info'
    },
    cobertura: {
      outputFile: 'coverage/cobertura-coverage.xml'
    },
    json: {
      outputFile: 'coverage/coverage.json'
    },
    text: {
      skipFull: false,
      skipEmpty: false
    }
  },

  // Custom coverage report generation function
  onCoverageGenerated: (coverage) => {
    console.log('\n📊 Coverage Report Generated:');
    console.log(`• HTML Report: coverage/html-report/index.html`);
    console.log(`• LCOV Report: coverage/lcov.info`);
    console.log(`• JSON Report: coverage/coverage.json`);
    
    // Calculate overall coverage
    let totalLines = 0;
    let coveredLines = 0;
    let totalBranches = 0;
    let coveredBranches = 0;
    let totalFunctions = 0;
    let coveredFunctions = 0;
    let totalStatements = 0;
    let coveredStatements = 0;

    Object.values(coverage).forEach(fileCoverage => {
      const { s, f, b, statementMap, fnMap, branchMap } = fileCoverage;
      
      // Count statements
      Object.keys(statementMap).forEach(stmt => {
        totalStatements++;
        if (s[stmt] > 0) coveredStatements++;
      });

      // Count functions
      Object.keys(fnMap).forEach(fn => {
        totalFunctions++;
        if (f[fn] > 0) coveredFunctions++;
      });

      // Count branches
      Object.keys(branchMap).forEach(branch => {
        const branchData = branchMap[branch];
        branchData.locations.forEach((_, index) => {
          totalBranches++;
          if (b[branch][index] > 0) coveredBranches++;
        });
      });

      // Count lines (approximate from statements)
      const lineNumbers = Object.values(statementMap).map(stmt => stmt.start.line);
      const uniqueLines = [...new Set(lineNumbers)];
      totalLines += uniqueLines.length;
      
      const coveredLineNumbers = Object.keys(s)
        .filter(stmt => s[stmt] > 0)
        .map(stmt => statementMap[stmt].start.line);
      const uniqueCoveredLines = [...new Set(coveredLineNumbers)];
      coveredLines += uniqueCoveredLines.length;
    });

    const stmtCoverage = totalStatements > 0 ? (coveredStatements / totalStatements * 100).toFixed(2) : '0.00';
    const branchCoverage = totalBranches > 0 ? (coveredBranches / totalBranches * 100).toFixed(2) : '0.00';
    const funcCoverage = totalFunctions > 0 ? (coveredFunctions / totalFunctions * 100).toFixed(2) : '0.00';
    const lineCoverage = totalLines > 0 ? (coveredLines / totalLines * 100).toFixed(2) : '0.00';

    console.log(`\n📈 Overall Coverage Summary:`);
    console.log(`• Statements: ${stmtCoverage}% (${coveredStatements}/${totalStatements})`);
    console.log(`• Branches: ${branchCoverage}% (${coveredBranches}/${totalBranches})`);
    console.log(`• Functions: ${funcCoverage}% (${coveredFunctions}/${totalFunctions})`);
    console.log(`• Lines: ${lineCoverage}% (${coveredLines}/${totalLines})`);

    // Check if coverage meets thresholds
    const meetsThreshold = {
      statements: parseFloat(stmtCoverage) >= 90,
      branches: parseFloat(branchCoverage) >= 90,
      functions: parseFloat(funcCoverage) >= 90,
      lines: parseFloat(lineCoverage) >= 90
    };

    const allThresholdsMet = Object.values(meetsThreshold).every(met => met);
    
    if (allThresholdsMet) {
      console.log(`\n✅ All coverage thresholds met (90% required)!`);
    } else {
      console.log(`\n⚠️  Some coverage thresholds not met (90% required):`);
      if (!meetsThreshold.statements) console.log(`  - Statements: ${stmtCoverage}% < 90%`);
      if (!meetsThreshold.branches) console.log(`  - Branches: ${branchCoverage}% < 90%`);
      if (!meetsThreshold.functions) console.log(`  - Functions: ${funcCoverage}% < 90%`);
      if (!meetsThreshold.lines) console.log(`  - Lines: ${lineCoverage}% < 90%`);
    }

    console.log(`\n🔗 View detailed report: file://${path.resolve('coverage/html-report/index.html')}\n`);
  }
};