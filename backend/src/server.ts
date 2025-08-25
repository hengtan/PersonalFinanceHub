import { app } from "./app";
import { connectMongo } from "./infra/mongo/connection";
(async ()=>{
    await connectMongo();
    const port = process.env.PORT || 4000;
    app.listen(port, ()=> console.log("API on :"+port));
})();