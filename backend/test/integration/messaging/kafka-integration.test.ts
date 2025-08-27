// Integration tests for Kafka Producer and Consumer
import { KafkaProducerService } from '../../../src/infrastructure/messaging/kafka/producer';
import { KafkaConsumerService } from '../../../src/infrastructure/messaging/kafka/consumer';
import { KAFKA_TOPICS, KAFKA_CONSUMER_GROUPS } from '../../../src/infrastructure/messaging/kafka/topics';
import { TestUtils } from '../../helpers/test-utils';

// Skip if Kafka is not available in CI
const describeKafka = process.env.CI ? describe.skip : describe;

describeKafka('Kafka Integration', () => {
  let producer: KafkaProducerService;
  let consumer: KafkaConsumerService;
  let receivedMessages: any[] = [];

  // Test message handler
  const testMessageHandler = {
    handle: jest.fn(async (payload) => {
      receivedMessages.push({
        topic: payload.topic,
        value: JSON.parse(payload.message.value?.toString() || '{}'),
        headers: payload.message.headers
      });
    })
  };

  beforeAll(async () => {
    // Setup producer and consumer
    producer = new KafkaProducerService();
    consumer = new KafkaConsumerService(KAFKA_CONSUMER_GROUPS.SYNC_SERVICE);

    // Register test handler
    consumer.registerHandler(KAFKA_TOPICS.SYNC_TRANSACTION_TO_MONGO, testMessageHandler);

    // Connect and start
    await producer.connect();
    await consumer.connect();
    await consumer.subscribe([KAFKA_TOPICS.SYNC_TRANSACTION_TO_MONGO]);
    await consumer.start();

    // Give consumer time to start
    await TestUtils.waitFor(2000);
  }, 30000);

  afterAll(async () => {
    await consumer.disconnect();
    await producer.disconnect();
  }, 15000);

  beforeEach(() => {
    receivedMessages = [];
    jest.clearAllMocks();
  });

  describe('Producer-Consumer Integration', () => {
    it('should successfully send and receive transaction sync event', async () => {
      const testTransaction = TestUtils.generateTransaction();
      
      // Publish sync event
      await producer.publishSyncEvent(
        'transaction',
        testTransaction.id,
        testTransaction.userId,
        'create',
        testTransaction
      );

      // Wait for message processing
      await TestUtils.waitForCondition(
        () => receivedMessages.length > 0,
        10000,
        500
      );

      expect(receivedMessages).toHaveLength(1);
      expect(receivedMessages[0].topic).toBe(KAFKA_TOPICS.SYNC_TRANSACTION_TO_MONGO);
      expect(receivedMessages[0].value).toEqual(
        expect.objectContaining({
          entityType: 'transaction',
          entityId: testTransaction.id,
          userId: testTransaction.userId,
          operation: 'create',
          data: testTransaction
        })
      );
    });

    it('should handle multiple concurrent messages', async () => {
      const transactions = [
        TestUtils.generateTransaction({ id: 'tx1' }),
        TestUtils.generateTransaction({ id: 'tx2' }),
        TestUtils.generateTransaction({ id: 'tx3' })
      ];

      // Send multiple messages concurrently
      const promises = transactions.map(tx =>
        producer.publishSyncEvent('transaction', tx.id, tx.userId, 'create', tx)
      );

      await Promise.all(promises);

      // Wait for all messages to be processed
      await TestUtils.waitForCondition(
        () => receivedMessages.length === 3,
        10000,
        500
      );

      expect(receivedMessages).toHaveLength(3);
      expect(testMessageHandler.handle).toHaveBeenCalledTimes(3);

      // Verify all transactions were received
      const receivedIds = receivedMessages.map(msg => msg.value.entityId).sort();
      const expectedIds = ['tx1', 'tx2', 'tx3'].sort();
      expect(receivedIds).toEqual(expectedIds);
    });

    it('should preserve message headers', async () => {
      const testTransaction = TestUtils.generateTransaction();
      
      await producer.publishSyncEvent(
        'transaction',
        testTransaction.id,
        testTransaction.userId,
        'create',
        testTransaction
      );

      await TestUtils.waitForCondition(
        () => receivedMessages.length > 0,
        10000,
        500
      );

      const message = receivedMessages[0];
      expect(message.headers).toHaveProperty('eventType');
      expect(message.headers).toHaveProperty('timestamp');
      expect(message.headers).toHaveProperty('version');
    });

    it('should handle transaction events', async () => {
      const transactionData = TestUtils.generateTransaction();

      await producer.publishTransactionEvent('created', transactionData);

      // Since we're only subscribed to sync events, this shouldn't be received
      await TestUtils.waitFor(2000);

      expect(receivedMessages).toHaveLength(0);
    });

    it('should handle cache invalidation events', async () => {
      const userId = 'test-user-123';
      
      await producer.publishCacheInvalidationEvent('dashboard', userId, 'main', 'Test invalidation');

      // Since we're only subscribed to sync events, this shouldn't be received
      await TestUtils.waitFor(2000);

      expect(receivedMessages).toHaveLength(0);
    });

    it('should maintain message ordering within partition', async () => {
      const userId = 'same-user-id'; // Same key will go to same partition
      const transactions = [
        TestUtils.generateTransaction({ id: 'tx1', userId }),
        TestUtils.generateTransaction({ id: 'tx2', userId }),
        TestUtils.generateTransaction({ id: 'tx3', userId })
      ];

      // Send messages sequentially to ensure ordering
      for (const tx of transactions) {
        await producer.publishSyncEvent('transaction', tx.id, tx.userId, 'create', tx);
      }

      await TestUtils.waitForCondition(
        () => receivedMessages.length === 3,
        10000,
        500
      );

      // Messages should be received in order for the same partition key (userId)
      const receivedIds = receivedMessages.map(msg => msg.value.entityId);
      expect(receivedIds).toEqual(['tx1', 'tx2', 'tx3']);
    });
  });

  describe('Error Handling', () => {
    it('should handle consumer errors gracefully', async () => {
      // Create a handler that throws an error
      const errorHandler = {
        handle: jest.fn().mockRejectedValue(new Error('Processing failed'))
      };

      // Register error handler for a different topic
      const errorTopic = 'test.error.topic';
      consumer.registerHandler(errorTopic, errorHandler);
      await consumer.subscribe([errorTopic]);

      const testTransaction = TestUtils.generateTransaction();

      // This should not crash the consumer
      await producer.publishEventData(errorTopic, {
        transactionId: testTransaction.id,
        userId: testTransaction.userId,
        timestamp: new Date().toISOString()
      });

      await TestUtils.waitFor(2000);

      expect(errorHandler.handle).toHaveBeenCalled();
    });

    it('should reconnect producer after disconnect', async () => {
      await producer.disconnect();
      
      // Should reconnect automatically
      const testTransaction = TestUtils.generateTransaction();
      
      await expect(producer.publishSyncEvent(
        'transaction',
        testTransaction.id,
        testTransaction.userId,
        'create',
        testTransaction
      )).resolves.not.toThrow();

      expect(producer.isHealthy()).toBe(true);
    });
  });

  describe('Message Serialization', () => {
    it('should handle complex objects in message payload', async () => {
      const complexTransaction = {
        ...TestUtils.generateTransaction(),
        metadata: {
          location: { lat: 40.7128, lng: -74.0060 },
          tags: ['restaurant', 'dinner'],
          receipts: [{ url: 'http://example.com/receipt.pdf', type: 'pdf' }]
        },
        customFields: {
          merchantCategory: 'Food & Dining',
          subcategory: 'Restaurants'
        }
      };

      await producer.publishSyncEvent(
        'transaction',
        complexTransaction.id,
        complexTransaction.userId,
        'create',
        complexTransaction
      );

      await TestUtils.waitForCondition(
        () => receivedMessages.length > 0,
        10000,
        500
      );

      const receivedData = receivedMessages[0].value.data;
      expect(receivedData.metadata).toEqual(complexTransaction.metadata);
      expect(receivedData.customFields).toEqual(complexTransaction.customFields);
    });

    it('should handle large messages', async () => {
      const largeTransaction = {
        ...TestUtils.generateTransaction(),
        description: 'A'.repeat(1000), // 1KB description
        metadata: {
          largeField: 'B'.repeat(10000) // 10KB metadata
        }
      };

      await expect(producer.publishSyncEvent(
        'transaction',
        largeTransaction.id,
        largeTransaction.userId,
        'create',
        largeTransaction
      )).resolves.not.toThrow();

      await TestUtils.waitForCondition(
        () => receivedMessages.length > 0,
        10000,
        500
      );

      expect(receivedMessages[0].value.data.description).toBe(largeTransaction.description);
      expect(receivedMessages[0].value.data.metadata.largeField).toBe(largeTransaction.metadata.largeField);
    });
  });

  describe('Performance', () => {
    it('should handle high throughput messages', async () => {
      const messageCount = 50;
      const transactions = Array.from({ length: messageCount }, (_, i) =>
        TestUtils.generateTransaction({ id: `perf-tx-${i}` })
      );

      const startTime = Date.now();

      // Send all messages
      const promises = transactions.map(tx =>
        producer.publishSyncEvent('transaction', tx.id, tx.userId, 'create', tx)
      );

      await Promise.all(promises);
      const sendTime = Date.now() - startTime;

      // Wait for all messages to be received
      await TestUtils.waitForCondition(
        () => receivedMessages.length === messageCount,
        20000,
        1000
      );

      const totalTime = Date.now() - startTime;

      expect(receivedMessages).toHaveLength(messageCount);
      expect(sendTime).toBeLessThan(5000); // Should send within 5 seconds
      expect(totalTime).toBeLessThan(15000); // Should process within 15 seconds

      console.log(`Processed ${messageCount} messages in ${totalTime}ms (avg: ${totalTime/messageCount}ms/msg)`);
    });

    it('should maintain low memory usage during high throughput', async () => {
      const initialMemory = process.memoryUsage().heapUsed;
      
      // Send many messages
      for (let i = 0; i < 100; i++) {
        const tx = TestUtils.generateTransaction({ id: `memory-tx-${i}` });
        await producer.publishSyncEvent('transaction', tx.id, tx.userId, 'create', tx);
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      // Memory increase should be reasonable (less than 50MB)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
    });
  });
});