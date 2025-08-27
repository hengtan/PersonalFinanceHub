import { LoggerService } from '../../infrastructure/monitoring/logger.service';

const logger = LoggerService.getInstance();

export class Logger {
  static info(message: string, meta?: any) {
    logger.info(message, meta);
  }

  static error(message: string, error?: any, meta?: any) {
    logger.error(message, error, meta);
  }

  static warn(message: string, meta?: any) {
    logger.warn(message, meta);
  }

  static debug(message: string, meta?: any) {
    logger.debug(message, meta);
  }

  static verbose(message: string, meta?: any) {
    logger.verbose(message, meta);
  }

  static createChildLogger(context: string) {
    return {
      info: (message: string, meta?: any) => logger.info(`[${context}] ${message}`, meta),
      error: (message: string, error?: any, meta?: any) => logger.error(`[${context}] ${message}`, error, meta),
      warn: (message: string, meta?: any) => logger.warn(`[${context}] ${message}`, meta),
      debug: (message: string, meta?: any) => logger.debug(`[${context}] ${message}`, meta),
      verbose: (message: string, meta?: any) => logger.verbose(`[${context}] ${message}`, meta)
    };
  }
}

export const createLogger = (context: string) => Logger.createChildLogger(context);