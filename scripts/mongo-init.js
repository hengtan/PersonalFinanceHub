// =============================================
// 📁 ./scripts/mongo-init.js
// MongoDB Initialization Script (CORRIGIDO)
// =============================================

// Initialize Replica Set
rs.initiate({
    _id: "rs0",
    members: [
        {
            _id: 0,
            host: "mongo-primary:27017",
            priority: 10
        },
        {
            _id: 1,
            host: "mongo-secondary-1:27017",
            priority: 5
        },
        {
            _id: 2,
            host: "mongo-secondary-2:27017",
            priority: 1
        }
    ]
});

// Wait for replica set to be ready
sleep(5000);

// Switch to admin database
db = db.getSiblingDB('admin');

// Create application user
db.createUser({
    user: "pfh_app",
    pwd: "app_secure_2024",
    roles: [
        {
            role: "readWrite",
            db: "personal_finance_read"
        }
    ]
});

// Switch to application database
db = db.getSiblingDB('personal_finance_read');

// Create collections with validation
db.createCollection("user_profiles", {
    validator: {
        $jsonSchema: {
            bsonType: "object",
            required: ["userId", "email", "createdAt"],
            properties: {
                userId: {
                    bsonType: "string",
                    description: "User ID is required"
                },
                email: {
                    bsonType: "string",
                    pattern: "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$",
                    description: "Valid email is required"
                },
                createdAt: {
                    bsonType: "date",
                    description: "Creation date is required"
                },
                profile: {
                    bsonType: "object",
                    properties: {
                        firstName: { bsonType: "string" },
                        lastName: { bsonType: "string" },
                        avatar: { bsonType: "string" },
                        timezone: { bsonType: "string" },
                        currency: { bsonType: "string" }
                    }
                }
            }
        }
    }
});

db.createCollection("transactions", {
    validator: {
        $jsonSchema: {
            bsonType: "object",
            required: ["transactionId", "userId", "amount", "type", "createdAt"],
            properties: {
                transactionId: {
                    bsonType: "string"
                },
                userId: {
                    bsonType: "string"
                },
                amount: {
                    bsonType: "number",
                    minimum: 0
                },
                type: {
                    bsonType: "string",
                    enum: ["income", "expense", "transfer"]
                },
                category: {
                    bsonType: "string"
                },
                description: {
                    bsonType: "string"
                },
                createdAt: {
                    bsonType: "date"
                },
                metadata: {
                    bsonType: "object"
                }
            }
        }
    }
});

// Create additional collections
db.createCollection("accounts", {
    validator: {
        $jsonSchema: {
            bsonType: "object",
            required: ["accountId", "userId", "name", "type", "balance"],
            properties: {
                accountId: { bsonType: "string" },
                userId: { bsonType: "string" },
                name: { bsonType: "string" },
                type: { bsonType: "string", enum: ["checking", "savings", "credit", "investment"] },
                balance: { bsonType: "number" },
                currency: { bsonType: "string" }
            }
        }
    }
});

// Create indexes for performance
db.user_profiles.createIndex({ "userId": 1 }, { unique: true });
db.user_profiles.createIndex({ "email": 1 }, { unique: true });

db.transactions.createIndex({ "userId": 1, "createdAt": -1 });
db.transactions.createIndex({ "transactionId": 1 }, { unique: true });
db.transactions.createIndex({ "type": 1, "createdAt": -1 });
db.transactions.createIndex({ "category": 1 });

db.accounts.createIndex({ "accountId": 1 }, { unique: true });
db.accounts.createIndex({ "userId": 1 });
db.accounts.createIndex({ "type": 1 });

print("MongoDB initialization completed successfully!");