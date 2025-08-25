import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import { logger } from "./observability/logger";
import { httpSecurity, limiter, correlation } from "./config/http";
import { withMetrics, metricsRoute } from "./observability/metrics";
import { errorHandler, notFound } from "./core/errors";

export const app = express();
app.use(correlation);
app.use(pinoHttp({ logger }));
app.use(httpSecurity);
app.use(cors({ origin: ["http://localhost:5173"], credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
app.use(limiter);
app.use(withMetrics);

// TODO: rotas -> auth, budgets, transactions, reports, client-logs
metricsRoute(app);
app.use(notFound);
app.use(errorHandler);