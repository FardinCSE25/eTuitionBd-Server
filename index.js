const express = require("express");
require("dotenv").config();
const cors = require("cors");
const app = express();

const { MongoClient, ServerApiVersion } = require('mongodb');
const port = process.env.PORT || 5000;

app.use(express.json());
app.use(
  cors({
    origin: ["http://localhost:5173"],
    methods: ["GET", "POST", "DELETE", "PATCH", "PUT"],
    credentials: true,
  })
);

const uri = `mongodb+srv://${process.env.DB_User}:${process.env.DB_Password}@users.xgs9b3y.mongodb.net/?appName=Users`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    const db = client.db("eTuitionBd-db")
    const tuitionsCollection = db.collection("tuitions")


    app.get("/tuitions", async(req, res)=>{

    })

    app.post("/tuitions", async(req, res)=>{
        const tuition = req.body;
        const result = await tuitionsCollection.insertOne(tuition);
        res.send(result)
    })

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);



app.get("/", (req, res) => {
  res.send("eTuitionBd is running!");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});