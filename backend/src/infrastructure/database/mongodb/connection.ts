// MongoDB Connection
export async function connectMongoDB(): Promise<Db> {
    const uri = process.env.MONGODB_URI || 'mongodb://pfh_admin:mongo_secure_2024@localhost:27017/personal_finance_read?authSource=admin';

    const client = new MongoClient(uri, {
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
        await client.connect();
        mongoDb = client.db('personal_finance_read');

        // Test connection
        await mongoDb.admin().ping();
        logger.info('MongoDB connection established');
        return mongoDb;
    } catch (error) {
        logger.error({ error, uri: uri.replace(/:[^:@]*@/, ':[HIDDEN]@') }, 'Failed to connect to MongoDB');
        throw error;
    }
}