// backend/src/core/application/services/csv-import.service.ts
import { TransactionEntity } from '../../domain/entities/transaction.entity';
import { Money } from '../../domain/value-objects/money.vo';
import { logger } from '../../../infrastructure/monitoring/logger.service';
import { ValidationException } from '../../../shared/exceptions/validation.exception';

export interface CSVImportParams {
    userId: string;
    csvData: string;
    mapping: CSVFieldMapping;
    options?: CSVImportOptions;
}

export interface CSVFieldMapping {
    dateField: string;
    amountField: string;
    descriptionField: string;
    categoryField?: string;
    accountField?: string;
    typeField?: string;
    referenceField?: string;
    notesField?: string;
    tagsField?: string;
    merchantField?: string;
    locationField?: string;
}

export interface CSVImportOptions {
    delimiter?: string;
    hasHeaders?: boolean;
    skipRows?: number;
    dateFormat?: string;
    currency?: string;
    defaultAccount?: string;
    defaultCategory?: string;
    duplicateHandling?: 'skip' | 'overwrite' | 'create_new';
    validationMode?: 'strict' | 'lenient';
    batchSize?: number;
    dryRun?: boolean;
}

export interface CSVImportResult {
    success: boolean;
    importId: string;
    totalRows: number;
    successfulImports: number;
    failedImports: number;
    skippedImports: number;
    duplicatesFound: number;
    errors: CSVImportError[];
    warnings: CSVImportWarning[];
    transactions: TransactionEntity[];
    summary: ImportSummary;
    executionTimeMs: number;
}

export interface CSVImportError {
    row: number;
    field?: string;
    message: string;
    value?: any;
    severity: 'error' | 'warning';
}

export interface CSVImportWarning {
    row: number;
    field?: string;
    message: string;
    value?: any;
}

export interface ImportSummary {
    totalAmount: number;
    totalIncome: number;
    totalExpenses: number;
    categoriesFound: string[];
    accountsFound: string[];
    dateRange: {
        earliest: Date;
        latest: Date;
    };
    currencies: string[];
    merchantsFound: string[];
}

export interface CSVValidationRules {
    requiredFields: string[];
    dateFormats: string[];
    amountValidation: {
        allowNegative: boolean;
        maxValue?: number;
        minValue?: number;
    };
    categoryValidation: {
        allowNew: boolean;
        validCategories?: string[];
    };
    duplicateDetection: {
        enabled: boolean;
        fields: string[];
        toleranceDays?: number;
    };
}

export interface CSVPreviewResult {
    headers: string[];
    sampleRows: any[][];
    rowCount: number;
    detectedDelimiter: string;
    detectedDateFormat?: string;
    detectedCurrency?: string;
    columnAnalysis: ColumnAnalysis[];
    suggestedMapping: Partial<CSVFieldMapping>;
}

export interface ColumnAnalysis {
    column: string;
    index: number;
    dataType: 'string' | 'number' | 'date' | 'boolean' | 'mixed';
    sampleValues: any[];
    uniqueValues: number;
    nullCount: number;
    suggestedField?: keyof CSVFieldMapping;
    confidence: number;
}

export class CSVImportService {
    private readonly DEFAULT_OPTIONS: Required<CSVImportOptions> = {
        delimiter: ',',
        hasHeaders: true,
        skipRows: 0,
        dateFormat: 'YYYY-MM-DD',
        currency: 'BRL',
        defaultAccount: '',
        defaultCategory: 'Uncategorized',
        duplicateHandling: 'skip',
        validationMode: 'strict',
        batchSize: 100,
        dryRun: false
    };

    private readonly VALIDATION_RULES: CSVValidationRules = {
        requiredFields: ['date', 'amount', 'description'],
        dateFormats: [
            'YYYY-MM-DD',
            'DD/MM/YYYY',
            'MM/DD/YYYY',
            'DD-MM-YYYY',
            'MM-DD-YYYY',
            'YYYY/MM/DD'
        ],
        amountValidation: {
            allowNegative: true,
            maxValue: 1000000,
            minValue: -1000000
        },
        categoryValidation: {
            allowNew: true
        },
        duplicateDetection: {
            enabled: true,
            fields: ['date', 'amount', 'description'],
            toleranceDays: 1
        }
    };

    /**
     * Previews CSV data and suggests field mappings
     */
    async previewCSV(csvData: string, options?: Partial<CSVImportOptions>): Promise<CSVPreviewResult> {
        const startTime = Date.now();
        
        try {
            logger.debug('Starting CSV preview', {
                dataLength: csvData.length,
                options
            });

            const mergedOptions = { ...this.DEFAULT_OPTIONS, ...options };
            
            // Parse CSV data
            const parsedData = this.parseCSV(csvData, mergedOptions);
            
            if (parsedData.length === 0) {
                throw new ValidationException('CSV file is empty or contains no valid data');
            }

            const headers = mergedOptions.hasHeaders ? parsedData[0] : this.generateHeaders(parsedData[0].length);
            const dataRows = mergedOptions.hasHeaders ? parsedData.slice(1) : parsedData;
            
            // Analyze columns
            const columnAnalysis = this.analyzeColumns(headers, dataRows);
            
            // Detect patterns
            const detectedDelimiter = this.detectDelimiter(csvData);
            const detectedDateFormat = this.detectDateFormat(dataRows, columnAnalysis);
            const detectedCurrency = this.detectCurrency(dataRows, columnAnalysis);
            
            // Suggest field mapping
            const suggestedMapping = this.suggestFieldMapping(columnAnalysis);
            
            const result: CSVPreviewResult = {
                headers,
                sampleRows: dataRows.slice(0, 5), // First 5 rows as sample
                rowCount: dataRows.length,
                detectedDelimiter,
                detectedDateFormat,
                detectedCurrency,
                columnAnalysis,
                suggestedMapping
            };

            logger.debug('CSV preview completed', {
                rowCount: result.rowCount,
                headers: result.headers,
                executionTimeMs: Date.now() - startTime
            });

            return result;

        } catch (error) {
            logger.error('CSV preview failed', error as Error, {
                dataLength: csvData.length
            });
            throw error;
        }
    }

    /**
     * Imports transactions from CSV data
     */
    async importCSV(params: CSVImportParams): Promise<CSVImportResult> {
        const startTime = Date.now();
        const importId = `CSV_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        try {
            logger.info('Starting CSV import', {
                importId,
                userId: params.userId,
                dataLength: params.csvData.length,
                mapping: params.mapping,
                options: params.options
            });

            const options = { ...this.DEFAULT_OPTIONS, ...params.options };
            
            // Parse CSV data
            const parsedData = this.parseCSV(params.csvData, options);
            
            if (parsedData.length === 0) {
                throw new ValidationException('CSV file is empty or contains no valid data');
            }

            const headers = options.hasHeaders ? parsedData[0] : this.generateHeaders(parsedData[0].length);
            const dataRows = options.hasHeaders ? parsedData.slice(1) : parsedData;

            // Validate mapping
            this.validateMapping(params.mapping, headers);

            // Initialize result
            const result: CSVImportResult = {
                success: false,
                importId,
                totalRows: dataRows.length,
                successfulImports: 0,
                failedImports: 0,
                skippedImports: 0,
                duplicatesFound: 0,
                errors: [],
                warnings: [],
                transactions: [],
                summary: {
                    totalAmount: 0,
                    totalIncome: 0,
                    totalExpenses: 0,
                    categoriesFound: [],
                    accountsFound: [],
                    dateRange: {
                        earliest: new Date(),
                        latest: new Date()
                    },
                    currencies: [],
                    merchantsFound: []
                },
                executionTimeMs: 0
            };

            // Process rows in batches
            const batchSize = options.batchSize;
            const totalBatches = Math.ceil(dataRows.length / batchSize);

            for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
                const batchStart = batchIndex * batchSize;
                const batchEnd = Math.min(batchStart + batchSize, dataRows.length);
                const batchRows = dataRows.slice(batchStart, batchEnd);

                logger.debug('Processing batch', {
                    importId,
                    batchIndex: batchIndex + 1,
                    totalBatches,
                    batchSize: batchRows.length
                });

                await this.processBatch(
                    batchRows,
                    headers,
                    params.mapping,
                    options,
                    params.userId,
                    result,
                    batchStart
                );
            }

            // Calculate final summary
            this.calculateSummary(result);
            
            result.success = result.errors.length === 0 || result.successfulImports > 0;
            result.executionTimeMs = Date.now() - startTime;

            logger.info('CSV import completed', {
                importId,
                success: result.success,
                totalRows: result.totalRows,
                successfulImports: result.successfulImports,
                failedImports: result.failedImports,
                executionTimeMs: result.executionTimeMs
            });

            return result;

        } catch (error) {
            logger.error('CSV import failed', error as Error, {
                importId,
                userId: params.userId
            });

            return {
                success: false,
                importId,
                totalRows: 0,
                successfulImports: 0,
                failedImports: 1,
                skippedImports: 0,
                duplicatesFound: 0,
                errors: [{
                    row: 0,
                    message: `Import failed: ${(error as Error).message}`,
                    severity: 'error'
                }],
                warnings: [],
                transactions: [],
                summary: {
                    totalAmount: 0,
                    totalIncome: 0,
                    totalExpenses: 0,
                    categoriesFound: [],
                    accountsFound: [],
                    dateRange: {
                        earliest: new Date(),
                        latest: new Date()
                    },
                    currencies: [],
                    merchantsFound: []
                },
                executionTimeMs: Date.now() - startTime
            };
        }
    }

    /**
     * Processes a batch of CSV rows
     */
    private async processBatch(
        rows: any[][],
        headers: string[],
        mapping: CSVFieldMapping,
        options: Required<CSVImportOptions>,
        userId: string,
        result: CSVImportResult,
        rowOffset: number
    ): Promise<void> {
        for (let i = 0; i < rows.length; i++) {
            const rowIndex = rowOffset + i + 1; // +1 for 1-based row numbers
            const row = rows[i];

            try {
                // Convert row to object
                const rowData = this.rowToObject(row, headers);

                // Validate required fields
                const validation = this.validateRow(rowData, mapping, options, rowIndex);
                
                if (validation.errors.length > 0) {
                    result.errors.push(...validation.errors);
                    result.failedImports++;
                    continue;
                }

                if (validation.warnings.length > 0) {
                    result.warnings.push(...validation.warnings);
                }

                // Create transaction entity
                const transaction = await this.createTransactionFromRow(
                    rowData,
                    mapping,
                    options,
                    userId
                );

                // Check for duplicates
                if (this.VALIDATION_RULES.duplicateDetection.enabled) {
                    const isDuplicate = await this.checkDuplicate(transaction, result.transactions);
                    
                    if (isDuplicate) {
                        result.duplicatesFound++;
                        
                        if (options.duplicateHandling === 'skip') {
                            result.skippedImports++;
                            continue;
                        }
                    }
                }

                // Add to results (in dry run mode, we don't actually save)
                if (!options.dryRun) {
                    // Here you would normally save to database
                    // For now, we just add to the result array
                }

                result.transactions.push(transaction);
                result.successfulImports++;

                // Update summary data
                this.updateSummaryData(result.summary, transaction, rowData);

            } catch (error) {
                logger.warn('Failed to process row', {
                    rowIndex,
                    error: (error as Error).message,
                    rowData: row
                });

                result.errors.push({
                    row: rowIndex,
                    message: `Row processing failed: ${(error as Error).message}`,
                    severity: 'error'
                });

                result.failedImports++;
            }
        }
    }

    /**
     * Parses CSV string into array of arrays
     */
    private parseCSV(csvData: string, options: Required<CSVImportOptions>): any[][] {
        const delimiter = options.delimiter;
        const lines = csvData.split('\n').filter(line => line.trim());
        
        const result: any[][] = [];
        
        for (let i = options.skipRows; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            // Simple CSV parsing (for production, use a proper CSV parser like csv-parse)
            const row = line.split(delimiter).map(cell => cell.trim().replace(/^"(.*)"$/, '$1'));
            result.push(row);
        }
        
        return result;
    }

    /**
     * Converts row array to object using headers
     */
    private rowToObject(row: any[], headers: string[]): Record<string, any> {
        const obj: Record<string, any> = {};
        
        for (let i = 0; i < headers.length && i < row.length; i++) {
            obj[headers[i]] = row[i];
        }
        
        return obj;
    }

    /**
     * Validates a single row of data
     */
    private validateRow(
        rowData: Record<string, any>,
        mapping: CSVFieldMapping,
        options: Required<CSVImportOptions>,
        rowIndex: number
    ): { errors: CSVImportError[]; warnings: CSVImportWarning[] } {
        const errors: CSVImportError[] = [];
        const warnings: CSVImportWarning[] = [];

        // Validate required fields
        if (!rowData[mapping.dateField]) {
            errors.push({
                row: rowIndex,
                field: mapping.dateField,
                message: 'Date field is required',
                severity: 'error'
            });
        }

        if (!rowData[mapping.amountField]) {
            errors.push({
                row: rowIndex,
                field: mapping.amountField,
                message: 'Amount field is required',
                severity: 'error'
            });
        }

        if (!rowData[mapping.descriptionField]) {
            errors.push({
                row: rowIndex,
                field: mapping.descriptionField,
                message: 'Description field is required',
                severity: 'error'
            });
        }

        // Validate date format
        if (rowData[mapping.dateField]) {
            const date = this.parseDate(rowData[mapping.dateField], options.dateFormat);
            if (!date) {
                errors.push({
                    row: rowIndex,
                    field: mapping.dateField,
                    message: `Invalid date format. Expected: ${options.dateFormat}`,
                    value: rowData[mapping.dateField],
                    severity: 'error'
                });
            }
        }

        // Validate amount
        if (rowData[mapping.amountField]) {
            const amount = this.parseAmount(rowData[mapping.amountField]);
            if (isNaN(amount)) {
                errors.push({
                    row: rowIndex,
                    field: mapping.amountField,
                    message: 'Invalid amount format',
                    value: rowData[mapping.amountField],
                    severity: 'error'
                });
            } else {
                // Check amount bounds
                if (amount > this.VALIDATION_RULES.amountValidation.maxValue!) {
                    warnings.push({
                        row: rowIndex,
                        field: mapping.amountField,
                        message: 'Amount exceeds maximum allowed value',
                        value: amount
                    });
                }
                
                if (amount < this.VALIDATION_RULES.amountValidation.minValue!) {
                    warnings.push({
                        row: rowIndex,
                        field: mapping.amountField,
                        message: 'Amount below minimum allowed value',
                        value: amount
                    });
                }
            }
        }

        return { errors, warnings };
    }

    /**
     * Creates a transaction entity from row data
     */
    private async createTransactionFromRow(
        rowData: Record<string, any>,
        mapping: CSVFieldMapping,
        options: Required<CSVImportOptions>,
        userId: string
    ): Promise<TransactionEntity> {
        const date = this.parseDate(rowData[mapping.dateField], options.dateFormat);
        const amount = this.parseAmount(rowData[mapping.amountField]);
        const description = rowData[mapping.descriptionField];
        
        // Determine transaction type
        let transactionType: 'income' | 'expense' | 'transfer' = 'expense';
        if (mapping.typeField && rowData[mapping.typeField]) {
            const typeValue = rowData[mapping.typeField].toLowerCase();
            if (typeValue.includes('income') || typeValue.includes('credit') || amount > 0) {
                transactionType = 'income';
            } else if (typeValue.includes('transfer')) {
                transactionType = 'transfer';
            }
        } else {
            transactionType = amount > 0 ? 'income' : 'expense';
        }

        // Create Money object
        const money = new Money(Math.abs(amount), options.currency);

        // Create transaction entity (simplified - in real implementation, you'd create proper entities)
        const transaction = {
            id: `TXN_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            userId,
            amount: money,
            description,
            date: date!,
            type: transactionType,
            category: mapping.categoryField ? rowData[mapping.categoryField] : options.defaultCategory,
            account: mapping.accountField ? rowData[mapping.accountField] : options.defaultAccount,
            reference: mapping.referenceField ? rowData[mapping.referenceField] : undefined,
            notes: mapping.notesField ? rowData[mapping.notesField] : undefined,
            tags: mapping.tagsField ? rowData[mapping.tagsField]?.split(',').map((t: string) => t.trim()) : [],
            merchant: mapping.merchantField ? rowData[mapping.merchantField] : undefined,
            location: mapping.locationField ? rowData[mapping.locationField] : undefined,
            createdAt: new Date(),
            updatedAt: new Date()
        } as any; // Type assertion for simplified example

        return transaction;
    }

    /**
     * Checks if transaction is a duplicate
     */
    private async checkDuplicate(transaction: any, existingTransactions: any[]): Promise<boolean> {
        const tolerance = this.VALIDATION_RULES.duplicateDetection.toleranceDays! * 24 * 60 * 60 * 1000;

        return existingTransactions.some(existing => {
            const dateDiff = Math.abs(new Date(transaction.date).getTime() - new Date(existing.date).getTime());
            return dateDiff <= tolerance &&
                   Math.abs(transaction.amount.getAmount() - existing.amount.getAmount()) < 0.01 &&
                   transaction.description.toLowerCase() === existing.description.toLowerCase();
        });
    }

    /**
     * Parses date string to Date object
     */
    private parseDate(dateString: string, format: string): Date | null {
        // Simple date parsing - in production, use a proper date parsing library
        try {
            return new Date(dateString);
        } catch {
            return null;
        }
    }

    /**
     * Parses amount string to number
     */
    private parseAmount(amountString: string): number {
        // Remove currency symbols and commas
        const cleaned = amountString.replace(/[^\d.-]/g, '');
        return parseFloat(cleaned) || 0;
    }

    /**
     * Analyzes CSV columns to suggest field mappings
     */
    private analyzeColumns(headers: string[], rows: any[][]): ColumnAnalysis[] {
        return headers.map((header, index) => {
            const columnData = rows.map(row => row[index]).filter(val => val !== undefined && val !== '');
            const uniqueValues = new Set(columnData).size;
            const nullCount = rows.length - columnData.length;
            
            // Detect data type and suggest field
            const dataType = this.detectColumnDataType(columnData);
            const { suggestedField, confidence } = this.suggestFieldForColumn(header, columnData, dataType);

            return {
                column: header,
                index,
                dataType,
                sampleValues: columnData.slice(0, 3),
                uniqueValues,
                nullCount,
                suggestedField,
                confidence
            };
        });
    }

    /**
     * Detects data type of column
     */
    private detectColumnDataType(columnData: any[]): 'string' | 'number' | 'date' | 'boolean' | 'mixed' {
        if (columnData.length === 0) return 'string';

        const sample = columnData.slice(0, 10);
        let numberCount = 0;
        let dateCount = 0;
        let booleanCount = 0;

        for (const value of sample) {
            const str = String(value).trim();
            
            if (!isNaN(Number(str)) && str !== '') {
                numberCount++;
            }
            if (Date.parse(str) && !isNaN(Date.parse(str))) {
                dateCount++;
            }
            if (['true', 'false', '1', '0', 'yes', 'no'].includes(str.toLowerCase())) {
                booleanCount++;
            }
        }

        const total = sample.length;
        if (numberCount / total > 0.8) return 'number';
        if (dateCount / total > 0.8) return 'date';
        if (booleanCount / total > 0.8) return 'boolean';
        if (numberCount / total > 0.3 || dateCount / total > 0.3) return 'mixed';
        
        return 'string';
    }

    /**
     * Suggests field mapping for column
     */
    private suggestFieldForColumn(
        header: string, 
        columnData: any[], 
        dataType: string
    ): { suggestedField?: keyof CSVFieldMapping; confidence: number } {
        const headerLower = header.toLowerCase();

        // Date field suggestions
        if (dataType === 'date' || headerLower.includes('date') || headerLower.includes('time')) {
            return { suggestedField: 'dateField', confidence: 0.9 };
        }

        // Amount field suggestions
        if (dataType === 'number' && (headerLower.includes('amount') || headerLower.includes('value') || headerLower.includes('price'))) {
            return { suggestedField: 'amountField', confidence: 0.9 };
        }

        // Description field suggestions
        if (headerLower.includes('description') || headerLower.includes('memo') || headerLower.includes('detail')) {
            return { suggestedField: 'descriptionField', confidence: 0.8 };
        }

        // Category field suggestions
        if (headerLower.includes('category') || headerLower.includes('type') || headerLower.includes('class')) {
            return { suggestedField: 'categoryField', confidence: 0.7 };
        }

        // Account field suggestions
        if (headerLower.includes('account') || headerLower.includes('bank')) {
            return { suggestedField: 'accountField', confidence: 0.7 };
        }

        // Reference field suggestions
        if (headerLower.includes('reference') || headerLower.includes('ref') || headerLower.includes('id')) {
            return { suggestedField: 'referenceField', confidence: 0.6 };
        }

        return { confidence: 0 };
    }

    /**
     * Suggests complete field mapping based on column analysis
     */
    private suggestFieldMapping(columnAnalysis: ColumnAnalysis[]): Partial<CSVFieldMapping> {
        const mapping: Partial<CSVFieldMapping> = {};

        // Find best matches for each field type
        const findBestMatch = (fieldType: keyof CSVFieldMapping) => {
            return columnAnalysis
                .filter(col => col.suggestedField === fieldType)
                .sort((a, b) => b.confidence - a.confidence)[0];
        };

        const dateMatch = findBestMatch('dateField');
        if (dateMatch) mapping.dateField = dateMatch.column;

        const amountMatch = findBestMatch('amountField');
        if (amountMatch) mapping.amountField = amountMatch.column;

        const descMatch = findBestMatch('descriptionField');
        if (descMatch) mapping.descriptionField = descMatch.column;

        const categoryMatch = findBestMatch('categoryField');
        if (categoryMatch) mapping.categoryField = categoryMatch.column;

        const accountMatch = findBestMatch('accountField');
        if (accountMatch) mapping.accountField = accountMatch.column;

        const refMatch = findBestMatch('referenceField');
        if (refMatch) mapping.referenceField = refMatch.column;

        return mapping;
    }

    /**
     * Validates field mapping against headers
     */
    private validateMapping(mapping: CSVFieldMapping, headers: string[]): void {
        const errors: string[] = [];

        if (!headers.includes(mapping.dateField)) {
            errors.push(`Date field '${mapping.dateField}' not found in CSV headers`);
        }

        if (!headers.includes(mapping.amountField)) {
            errors.push(`Amount field '${mapping.amountField}' not found in CSV headers`);
        }

        if (!headers.includes(mapping.descriptionField)) {
            errors.push(`Description field '${mapping.descriptionField}' not found in CSV headers`);
        }

        if (errors.length > 0) {
            throw new ValidationException(`Invalid field mapping: ${errors.join(', ')}`);
        }
    }

    /**
     * Detects CSV delimiter
     */
    private detectDelimiter(csvData: string): string {
        const delimiters = [',', ';', '\t', '|'];
        const firstLine = csvData.split('\n')[0];
        
        let bestDelimiter = ',';
        let maxCount = 0;

        for (const delimiter of delimiters) {
            const count = (firstLine.match(new RegExp(`\\${delimiter}`, 'g')) || []).length;
            if (count > maxCount) {
                maxCount = count;
                bestDelimiter = delimiter;
            }
        }

        return bestDelimiter;
    }

    /**
     * Detects date format from sample data
     */
    private detectDateFormat(rows: any[][], columnAnalysis: ColumnAnalysis[]): string | undefined {
        const dateColumn = columnAnalysis.find(col => col.dataType === 'date');
        if (!dateColumn) return undefined;

        const sampleDates = rows.slice(0, 5).map(row => row[dateColumn.index]).filter(Boolean);
        
        // Simple date format detection
        if (sampleDates.some(date => /^\d{4}-\d{2}-\d{2}/.test(date))) {
            return 'YYYY-MM-DD';
        }
        if (sampleDates.some(date => /^\d{2}\/\d{2}\/\d{4}/.test(date))) {
            return 'DD/MM/YYYY';
        }
        
        return 'YYYY-MM-DD';
    }

    /**
     * Detects currency from sample data
     */
    private detectCurrency(rows: any[][], columnAnalysis: ColumnAnalysis[]): string | undefined {
        const amountColumn = columnAnalysis.find(col => col.dataType === 'number');
        if (!amountColumn) return undefined;

        const sampleAmounts = rows.slice(0, 10).map(row => row[amountColumn.index]).filter(Boolean);
        
        for (const amount of sampleAmounts) {
            const str = String(amount);
            if (str.includes('$')) return 'USD';
            if (str.includes('€')) return 'EUR';
            if (str.includes('R$') || str.includes('BRL')) return 'BRL';
            if (str.includes('£')) return 'GBP';
        }

        return 'BRL'; // Default
    }

    /**
     * Generates headers for CSV without headers
     */
    private generateHeaders(columnCount: number): string[] {
        return Array.from({ length: columnCount }, (_, i) => `Column${i + 1}`);
    }

    /**
     * Updates summary data with transaction information
     */
    private updateSummaryData(summary: ImportSummary, transaction: any, rowData: Record<string, any>): void {
        const amount = transaction.amount.getAmount();
        
        summary.totalAmount += Math.abs(amount);
        
        if (transaction.type === 'income') {
            summary.totalIncome += amount;
        } else if (transaction.type === 'expense') {
            summary.totalExpenses += Math.abs(amount);
        }

        // Update categories
        if (transaction.category && !summary.categoriesFound.includes(transaction.category)) {
            summary.categoriesFound.push(transaction.category);
        }

        // Update accounts
        if (transaction.account && !summary.accountsFound.includes(transaction.account)) {
            summary.accountsFound.push(transaction.account);
        }

        // Update date range
        const transactionDate = new Date(transaction.date);
        if (transactionDate < summary.dateRange.earliest) {
            summary.dateRange.earliest = transactionDate;
        }
        if (transactionDate > summary.dateRange.latest) {
            summary.dateRange.latest = transactionDate;
        }

        // Update currencies
        const currency = transaction.amount.getCurrency();
        if (!summary.currencies.includes(currency)) {
            summary.currencies.push(currency);
        }

        // Update merchants
        if (transaction.merchant && !summary.merchantsFound.includes(transaction.merchant)) {
            summary.merchantsFound.push(transaction.merchant);
        }
    }

    /**
     * Calculates final summary statistics
     */
    private calculateSummary(result: CSVImportResult): void {
        // Summary is already being updated in updateSummaryData
        // This method can be used for final calculations if needed
    }
}