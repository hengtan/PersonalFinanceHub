// backend/src/api/middlewares/correlation-id.middleware.ts
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

export function correlationId(req: Request, res: Response, next: NextFunction): void {
    const correlationId = req.headers['x-correlation-id'] as string || uuidv4();
    res.locals.correlationId = correlationId;
    res.setHeader('X-Correlation-ID', correlationId);
    next();
}