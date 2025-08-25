import jwt from "jsonwebtoken"; import { HttpError } from "./errors";
export const signAccess  = (p:any)=> jwt.sign(p, process.env.JWT_SECRET!, { expiresIn: "15m" });
export const signRefresh = (p:any)=> jwt.sign(p, process.env.JWT_REFRESH_SECRET!, { expiresIn: "7d" });
export const auth = (required=true)=>(req:any,_res:any,next:any)=>{
    const h = req.headers.authorization||""; const t = h.startsWith("Bearer ")? h.slice(7):null;
    if(!t && required) return next(new HttpError(401,"Unauthorized"));
    if(t){ try{ req.user = jwt.verify(t, process.env.JWT_SECRET!); }catch{ if(required) return next(new HttpError(401,"Invalid token")); } }
    next();
};