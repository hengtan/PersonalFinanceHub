// backend/src/api/validators/dashboard.validator.ts
import { z } from 'zod';

export const dashboardQuerySchema = z.object({
    period: z.string()
        .regex(/^\d{4}-\d{2}$/, 'Period must be in YYYY-MM format')
        .optional(),
});
