import { MongoClient, Db } from 'mongodb';
import { Logger } from '../../../shared/utils/logger.util';

const logger = Logger.createChildLogger('MongoDB');

let mongoDb: Db | null = null;
let mongoClient: MongoClient | null = null;

export async function connectMongoDB(): Promise<Db> {
    const uri = process.env.MONGODB_URI || 'mongodb://pfh_admin:mongo_secure_2024@localhost:27017/personal_finance_read?authSource=admin';

    mongoClient = new MongoClient(uri, {
        maxPoolSize: 100,
        minPoolSize: 5,
        maxIdleTimeMS: 30000,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
        retryWrites: true,
        retryReads: true,
        readPreference: 'secondaryPreferred', // Prefer secondary for reads
    });

    try {
        await mongoClient.connect();
        mongoDb = mongoClient.db('personal_finance_read');

        // Test connection
        await mongoDb.admin().ping();
        logger.info('MongoDB connection established');
        return mongoDb;
    } catch (error) {
        logger.error('Failed to connect to MongoDB', error, { uri: uri.replace(/:[^:@]*@/, ':[HIDDEN]@') });
        throw error;
    }
}

export async function getMongoDb(): Promise<Db> {
    if (!mongoDb) {
        mongoDb = await connectMongoDB();
    }
    return mongoDb;
}

export async function disconnectMongoDB(): Promise<void> {
    if (mongoClient) {
        try {
            await mongoClient.close();
            logger.info('MongoDB connection closed gracefully');
        } catch (error) {
            logger.error('Error closing MongoDB connection', error);
        } finally {
            mongoDb = null;
            mongoClient = null;
        }
    }
}

export function isMongoConnected(): boolean {
    return mongoDb !== null && mongoClient !== null;
}