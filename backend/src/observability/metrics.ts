import client from "prom-client";
export const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry });
export const httpHistogram = new client.Histogram({
    name: "http_request_duration_seconds",
    help: "latency",
    labelNames: ["method","route","status"],
    buckets: [0.05,0.1,0.2,0.5,1,2]
});
registry.registerMetric(httpHistogram);
export const withMetrics = (req:any, res:any, next:any) => {
    const end = httpHistogram.startTimer({ method: req.method });
    res.on("finish", () => end({ route: req.route?.path || req.path, status: String(res.statusCode) }));
    next();
};
export const metricsRoute = (app:any) =>
    app.get("/metrics", async (_req:any, res:any) => {
        res.type("text/plain").send(await registry.metrics());
    });