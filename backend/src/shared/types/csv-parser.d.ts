// src/types/csv-parser.d.ts
declare module 'csv-parser' {
    import { Transform } from 'stream';

    interface CsvParserOptions {
        separator?: string;
        headers?: boolean | string[];
        skipLines?: number;
        mapHeaders?: (args: { header: string; index: number }) => string | null;
        mapValues?: (args: { header: string; index: number; value: string }) => any;
        strict?: boolean;
    }

    function csvParser(options?: CsvParserOptions): Transform;
    export = csvParser;
}