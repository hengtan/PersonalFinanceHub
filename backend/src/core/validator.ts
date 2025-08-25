import { ZodSchema } from "zod"; import { HttpError } from "./errors";
export const validate = (schemas:{body?:ZodSchema, params?:ZodSchema, query?:ZodSchema}) => (req:any,_res:any,next:any)=>{
    try{ if(schemas.body) req.body=schemas.body.parse(req.body);
        if(schemas.params) req.params=schemas.params.parse(req.params);
        if(schemas.query) req.query=schemas.query.parse(req.query);
        next();
    }catch(e:any){ next(new HttpError(400,"Validation error","VALIDATION_ERROR", e.errors||e));}
};