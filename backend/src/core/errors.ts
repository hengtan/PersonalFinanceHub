export class HttpError extends Error { constructor(public status:number, msg:string, public code?:string, public details?:any){ super(msg);} }
export const notFound = (_req:any,res:any)=> res.status(404).json({error:"Not Found"});
export const errorHandler = (err:any,_req:any,res:any,_next:any)=>{
    const status = err instanceof HttpError ? err.status : 500;
    const body:any = { error: err.message, code: err.code };
    if (process.env.NODE_ENV!=="production" && err.stack) body.stack = err.stack;
    res.status(status).json(body);
};