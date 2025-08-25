import mongoose from "mongoose"; import { logger } from "../../observability/logger";
export async function connectMongo(){
    const uri = process.env.MONGO_URL!;
    await mongoose.connect(uri); logger.info({msg:"mongo connected", uri});
}