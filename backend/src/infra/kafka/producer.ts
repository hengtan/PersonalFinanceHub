import { Kafka } from "kafkajs";
const kafka = new Kafka({ clientId: "pfh-api", brokers: [process.env.KAFKA_BROKER||"localhost:9092"] });
export const producer = kafka.producer();
export const ensureProducer = async()=> producer.connect();
export async function publish(topic:string, key:string, value:any){
    await ensureProducer(); await producer.send({ topic, messages:[{ key, value: JSON.stringify(value)}]});
}