import rateLimit from "express-rate-limit";
import compression from "compression";
import helmet from "helmet";
import { v4 as uuid } from "uuid";
export const httpSecurity = [helmet(), compression()];
export const limiter = rateLimit({ windowMs: 15*60*1000, max: 200 });
export const correlation = (req:any,_res:any,next:any)=>{ req.headers["x-correlation-id"] ||= uuid(); next(); };