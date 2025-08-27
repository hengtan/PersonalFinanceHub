# Personal Finance Hub - Operations Runbook

## 🚨 Emergency Contacts & Escalation

### **Primary On-Call**
- **Development Team Lead**: [Your contact]
- **DevOps Engineer**: [Your contact]
- **Database Administrator**: [Your contact]

### **Escalation Matrix**
1. **Level 1** (0-15 min): On-call engineer
2. **Level 2** (15-30 min): Team lead + DevOps
3. **Level 3** (30+ min): Management + All hands

## 🏥 Health Checks & Monitoring

### **Service Health Endpoints**
```bash
# Main application health
curl http://localhost:3333/api/health

# Component health checks
curl http://localhost:3333/api/health/detailed
```

### **Critical Metrics Dashboard URLs**
- **Main Dashboard**: http://localhost:3001/d/pfh-overview
- **Database Performance**: http://localhost:3001/d/pfh-database
- **Kafka Metrics**: http://localhost:3001/d/pfh-kafka
- **API Performance**: http://localhost:3001/d/pfh-api
- **Business KPIs**: http://localhost:3001/d/pfh-business

### **Alert Thresholds**
- **API Response Time**: P95 > 2s (Warning), P95 > 5s (Critical)
- **Error Rate**: > 1% (Warning), > 5% (Critical)
- **Database Connections**: > 80% pool usage (Warning)
- **Kafka Consumer Lag**: > 1000 messages (Warning), > 5000 (Critical)
- **Redis Memory**: > 80% usage (Warning), > 95% (Critical)
- **Disk Space**: > 80% usage (Warning), > 95% (Critical)

## 🔥 Common Incident Response Procedures

### **High API Response Time**

**Symptoms**: P95 latency > 2s, user complaints about slow responses

**Investigation Steps**:
```bash
# 1. Check current response times
curl -s http://localhost:3333/api/metrics | grep http_request_duration

# 2. Check database performance
docker exec pfh-postgres-master psql -U pfh_admin -d personal_finance -c "
  SELECT query, mean_time, calls, total_time 
  FROM pg_stat_statements 
  ORDER BY mean_time DESC 
  LIMIT 10;"

# 3. Check Redis hit rate
redis-cli -h localhost -p 6379 -a redis_secure_2024 info stats | grep keyspace

# 4. Check Kafka consumer lag
docker exec pfh-kafka-1 kafka-consumer-groups.sh \
  --bootstrap-server localhost:9092 \
  --list
```

**Immediate Actions**:
1. Scale backend instances horizontally
2. Enable Redis cache warming if disabled
3. Check for long-running database queries
4. Consider enabling read replicas

### **Database Connection Pool Exhaustion**

**Symptoms**: `ECONNREFUSED` errors, connection timeout logs

**Investigation Steps**:
```bash
# Check active connections
docker exec pfh-postgres-master psql -U pfh_admin -d personal_finance -c "
  SELECT state, count(*) 
  FROM pg_stat_activity 
  GROUP BY state;"

# Check pool metrics
curl -s http://localhost:3333/api/metrics | grep db_pool
```

**Immediate Actions**:
```bash
# 1. Increase pool size (temporary fix)
# Edit environment variable and restart
export POSTGRES_POOL_SIZE=50

# 2. Kill long-running queries
docker exec pfh-postgres-master psql -U pfh_admin -d personal_finance -c "
  SELECT pg_terminate_backend(pid) 
  FROM pg_stat_activity 
  WHERE state = 'active' 
  AND query_start < now() - interval '5 minutes';"

# 3. Restart application if critical
docker-compose restart backend
```

### **Kafka Consumer Lag**

**Symptoms**: Delayed dashboard updates, event processing backlog

**Investigation Steps**:
```bash
# Check consumer group lag
docker exec pfh-kafka-1 kafka-consumer-groups.sh \
  --bootstrap-server kafka-1:29092 \
  --describe --group pfh-dashboard-consumer

# Check topic details
docker exec pfh-kafka-1 kafka-topics.sh \
  --bootstrap-server kafka-1:29092 \
  --describe --topic personal_finance.transactions.v1
```

**Immediate Actions**:
```bash
# 1. Scale consumer instances
docker-compose up -d --scale backend=3

# 2. Reset consumer group if corrupted
docker exec pfh-kafka-1 kafka-consumer-groups.sh \
  --bootstrap-server kafka-1:29092 \
  --group pfh-dashboard-consumer \
  --reset-offsets --to-latest \
  --topic personal_finance.transactions.v1 --execute

# 3. Increase consumer parallelism
# Update KAFKA_CONSUMER_THREADS environment variable
```

### **Redis Memory Exhaustion**

**Symptoms**: Cache misses, memory errors, slow response times

**Investigation Steps**:
```bash
# Check Redis memory usage
redis-cli -h localhost -p 6379 -a redis_secure_2024 info memory

# Check key distribution
redis-cli -h localhost -p 6379 -a redis_secure_2024 --bigkeys

# Check eviction policy
redis-cli -h localhost -p 6379 -a redis_secure_2024 config get maxmemory-policy
```

**Immediate Actions**:
```bash
# 1. Clear expired keys
redis-cli -h localhost -p 6379 -a redis_secure_2024 --scan --pattern "expired:*" | xargs redis-cli -h localhost -p 6379 -a redis_secure_2024 del

# 2. Increase memory limit temporarily
redis-cli -h localhost -p 6379 -a redis_secure_2024 config set maxmemory 2gb

# 3. Enable LRU eviction
redis-cli -h localhost -p 6379 -a redis_secure_2024 config set maxmemory-policy allkeys-lru
```

### **MongoDB Replica Set Issues**

**Symptoms**: Read/write failures, replication lag warnings

**Investigation Steps**:
```bash
# Check replica set status
docker exec pfh-mongo-primary mongosh --eval "rs.status()"

# Check replication lag
docker exec pfh-mongo-primary mongosh --eval "rs.printSecondaryReplicationInfo()"

# Check oplog size
docker exec pfh-mongo-primary mongosh --eval "db.oplog.rs.stats()"
```

**Immediate Actions**:
```bash
# 1. Force primary election if needed
docker exec pfh-mongo-primary mongosh --eval "rs.stepDown()"

# 2. Resync secondary if behind
docker exec pfh-mongo-secondary-1 mongosh --eval "
  db.adminCommand({replSetResync: 1})
"

# 3. Increase oplog size if full
docker exec pfh-mongo-primary mongosh --eval "
  db.adminCommand({replSetResizeOplog: 1, size: 2048})
"
```

## 🔄 Maintenance Procedures

### **Rolling Deployment**

```bash
# 1. Health check before deployment
curl http://localhost:3333/api/health

# 2. Deploy to staging first
docker-compose -f docker-compose.staging.yml up -d

# 3. Run smoke tests
npm run test:smoke

# 4. Rolling update production
docker-compose up -d --no-deps --build backend

# 5. Verify deployment
curl http://localhost:3333/api/health
curl http://localhost:3333/api/metrics
```

### **Database Migration**

```bash
# 1. Backup before migration
docker exec pfh-postgres-master pg_dump -U pfh_admin personal_finance > backup_$(date +%Y%m%d_%H%M%S).sql

# 2. Run migration
npm run migrate

# 3. Verify migration
npm run migrate:status

# 4. Rollback if needed (have rollback script ready)
# npm run migrate:rollback
```

### **Cache Warming**

```bash
# Warm critical dashboard data
curl -X POST http://localhost:3333/api/admin/cache/warm \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"patterns": ["dashboard:*", "user:*:summary"]}'
```

### **Log Rotation & Cleanup**

```bash
# Clean old logs (retain 30 days)
find /var/log/pfh -name "*.log" -mtime +30 -delete

# Compress old logs
find /var/log/pfh -name "*.log" -mtime +7 -exec gzip {} \;

# Clean Docker logs
docker system prune -f
```

## 📊 Performance Tuning

### **Database Optimization**

```sql
-- Find slow queries
SELECT query, mean_time, calls, total_time 
FROM pg_stat_statements 
ORDER BY mean_time DESC 
LIMIT 10;

-- Index usage analysis
SELECT schemaname, tablename, indexname, idx_scan, idx_tup_read, idx_tup_fetch
FROM pg_stat_user_indexes
ORDER BY idx_scan ASC;

-- Connection analysis
SELECT state, count(*) 
FROM pg_stat_activity 
GROUP BY state;
```

### **Cache Optimization**

```bash
# Redis performance analysis
redis-cli -h localhost -p 6379 -a redis_secure_2024 info stats
redis-cli -h localhost -p 6379 -a redis_secure_2024 slowlog get 10

# Cache hit rate optimization
redis-cli -h localhost -p 6379 -a redis_secure_2024 info stats | grep keyspace_hits
```

### **Kafka Optimization**

```bash
# Check partition balance
docker exec pfh-kafka-1 kafka-topics.sh \
  --bootstrap-server kafka-1:29092 \
  --describe --topic personal_finance.transactions.v1

# Consumer group rebalancing
docker exec pfh-kafka-1 kafka-consumer-groups.sh \
  --bootstrap-server kafka-1:29092 \
  --describe --group pfh-dashboard-consumer
```

## 🔐 Security Incident Response

### **Suspicious Authentication Activity**

```bash
# Check failed login attempts
grep "AUTH_FAILED" /var/log/pfh/app.log | tail -100

# Block suspicious IPs (temporarily)
iptables -A INPUT -s $SUSPICIOUS_IP -j DROP

# Invalidate all sessions for user
redis-cli -h localhost -p 6379 -a redis_secure_2024 del "session:user:$USER_ID:*"
```

### **Data Breach Response**

1. **Immediate**: Isolate affected systems
2. **Document**: Preserve evidence and logs
3. **Notify**: Security team and management
4. **Investigate**: Determine scope and impact
5. **Remediate**: Patch vulnerabilities
6. **Monitor**: Enhanced monitoring post-incident

## 📋 Backup & Recovery

### **Database Backup**

```bash
# PostgreSQL backup
docker exec pfh-postgres-master pg_dump -U pfh_admin personal_finance | gzip > backup_pg_$(date +%Y%m%d_%H%M%S).sql.gz

# MongoDB backup
docker exec pfh-mongo-primary mongodump --out /backup/mongo_$(date +%Y%m%d_%H%M%S)

# Redis backup
redis-cli -h localhost -p 6379 -a redis_secure_2024 --rdb dump.rdb
```

### **Recovery Procedures**

```bash
# PostgreSQL restore
gunzip -c backup_pg_YYYYMMDD_HHMMSS.sql.gz | docker exec -i pfh-postgres-master psql -U pfh_admin personal_finance

# MongoDB restore
docker exec pfh-mongo-primary mongorestore /backup/mongo_YYYYMMDD_HHMMSS/

# Redis restore
redis-cli -h localhost -p 6379 -a redis_secure_2024 --pipe < dump.rdb
```

## 📱 Monitoring Commands Quick Reference

### **System Health**
```bash
# Application status
docker-compose ps
docker stats

# Service logs
docker-compose logs -f backend
docker-compose logs -f postgres-master
docker-compose logs -f redis-master
docker-compose logs -f kafka-1

# Resource usage
df -h                    # Disk space
free -m                  # Memory usage  
top                      # CPU usage
netstat -tulpn           # Network connections
```

### **Database Queries**
```sql
-- PostgreSQL active queries
SELECT pid, now() - pg_stat_activity.query_start AS duration, query 
FROM pg_stat_activity 
WHERE (now() - pg_stat_activity.query_start) > interval '1 minutes';

-- MongoDB slow operations
db.currentOp({"active": true, "secs_running": {"$gt": 5}})
```

### **Kafka Monitoring**
```bash
# Topic list
docker exec pfh-kafka-1 kafka-topics.sh --bootstrap-server kafka-1:29092 --list

# Consumer groups
docker exec pfh-kafka-1 kafka-consumer-groups.sh --bootstrap-server kafka-1:29092 --list

# Broker status
docker exec pfh-kafka-1 kafka-broker-api-versions.sh --bootstrap-server kafka-1:29092
```

## 🚀 Scaling Procedures

### **Horizontal Scaling**
```bash
# Scale backend instances
docker-compose up -d --scale backend=3

# Scale Kafka consumers
export KAFKA_CONSUMER_INSTANCES=3
docker-compose up -d --scale consumer=3

# Scale MongoDB read replicas
docker-compose up -d --scale mongo-secondary=3
```

### **Vertical Scaling**
```bash
# Increase database resources
docker-compose up -d --scale postgres-master=0
docker run -d --name pfh-postgres-master-large \
  --memory=4g --cpus=2 \
  postgres:16-alpine

# Increase Redis memory
redis-cli -h localhost -p 6379 -a redis_secure_2024 config set maxmemory 4gb
```

## 📞 External Dependencies

### **Third-party Services**
- **SendGrid**: Email delivery service
- **OpenAI**: AI/ML API services  
- **MinIO/S3**: Object storage
- **External APIs**: Rate limits and failover

### **Dependency Health Checks**
```bash
# Check external API status
curl -I https://api.sendgrid.com/v3/
curl -I https://api.openai.com/v1/

# Test object storage
mc admin info minio/pfh-bucket
```

---

## 📚 Additional Resources

- **Architecture Documentation**: `./docs/architecture.md`
- **API Documentation**: `http://localhost:3333/api/docs`
- **Monitoring Dashboards**: `http://localhost:3001`
- **Log Aggregation**: `http://localhost:3100`
- **Tracing**: `http://localhost:16686`

---

**Remember**: When in doubt, check the logs first! Correlation IDs are your friend for tracing requests across services.

**Emergency Contact**: In case of critical production issues, contact the on-call engineer immediately and follow the escalation matrix.