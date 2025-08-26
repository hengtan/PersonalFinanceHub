// MongoDB initialization script
print("Initializing replica set...");

try {
  rs.initiate({
    _id: "rs0",
    members: [
      { _id: 0, host: "mongo-primary:27017" }
    ]
  });
  print("Replica set initialized successfully");
} catch (error) {
  print("Error initializing replica set:", error);
}
