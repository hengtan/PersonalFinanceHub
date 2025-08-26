#!/bin/bash

# Create Kafka Topics for Personal Finance Hub
# Pateta o DEV - Event-Driven Architecture Setup

KAFKA_CONTAINER="pfh-kafka-1"
TOPICS=(
  "budget.transaction.v1:3:3"
  "budget.updated.v1:3:3"
  "user.registered.v1:1:3"
  "user.updated.v1:1:3"
  "report.requested.v1:3:3"
  "report.completed.v1:3:3"
  "notification.send.v1:3:3"
  "audit.event.v1:3:3"
  "system.health.v1:1:1"
)

echo "Creating Kafka topics..."

for topic_config in "${TOPICS[@]}"; do
  IFS=':' read -r topic_name partitions replication <<< "$topic_config"

  echo "Creating topic: $topic_name (partitions: $partitions, replication: $replication)"

  docker exec $KAFKA_CONTAINER kafka-topics \
    --bootstrap-server localhost:9092 \
    --create \
    --topic "$topic_name" \
    --partitions "$partitions" \
    --replication-factor "$replication" \
    --config cleanup.policy=delete \
    --config retention.ms=604800000 \
    --config max.message.bytes=1048576 \
    --if-not-exists
done

echo "Listing all topics:"
docker exec $KAFKA_CONTAINER kafka-topics \
  --bootstrap-server localhost:9092 \
  --list

echo "Kafka topics created successfully!"
