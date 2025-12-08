const express = require("express");
require("dotenv").config();
const cors = require("cors");
const app = express();

const { MongoClient, ServerApiVersion } = require("mongodb");
const port = process.env.PORT || 5000;


const admin = require("firebase-admin");

// const serviceAccount = require("./etuitionbd-a1c8c-firebase-adminsdk-fbsvc-d84f5ccea7.json");

const decoded = Buffer.from(process.env.FB_SERVICE_KEY, "base64").toString(
  "utf8"
);
const serviceAccount = JSON.parse(decoded);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

app.use(express.json());
app.use(
  cors({
    origin: ["http://localhost:5173", "https://etuitionbd-a1c8c.web.app"],
    methods: ["GET", "POST", "DELETE", "PATCH", "PUT"],
    credentials: true,
  })
);

const verifyFirebaseToken = async (req, res, next) => {
  const token = req.headers.authorization;
  if (!token) {
    return res.status(401).send({ message: "Unauthorized access" });
  }
  try {
    const tokenId = token.split(" ")[1];
    const decoded = await admin.auth().verifyIdToken(tokenId);
    req.decoded_email = decoded.email;
    next();
  } catch (error) {
    return res.status(401).send({ message: "Unauthorized Access" });
  }
};

const uri = `mongodb+srv://${process.env.DB_User}:${process.env.DB_Password}@users.xgs9b3y.mongodb.net/?appName=Users`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    const db = client.db("eTuitionBd-db");
    const usersCollection = db.collection("users");
    const tuitionsCollection = db.collection("tuitions");

    //! for accessing user role 
     app.get("/users/:email/role", async (req, res) => {
      const email = req.params.email;
      const query = { email };
      const user = await usersCollection.findOne(query);
      res.send({ role: user?.role });
    });

    app.post("/users", async (req, res) => {
      const user = req.body;
      user.created_at = new Date();
      const email = user.email;
      const userExists = await usersCollection.findOne({ email });

      if (userExists) {
        return res.send({ message: "User exists" });
      }
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    app.get("/tuitions", verifyFirebaseToken, async (req, res) => {
      const query = {};
      const { email } = req.query;
      if (email) {
        query.StudentEmail = email;
      }

      // if (email !== req.decoded_email) {
      //   return res.status(403).send({ message: "Forbidden Access" });
      // }

      const cursor = tuitionsCollection.find(query).sort({ created_at: -1 });
      const result = await cursor.toArray();
      res.send(result);
    });

    app.post("/tuitions", async (req, res) => {
      const tuition = req.body;
      tuition.status = "Pending";
      tuition.created_at = new Date();
      const result = await tuitionsCollection.insertOne(tuition);
      res.send(result);
    });

    app.patch(
      "/riders/:id",
      verifyFirebaseToken,
      async (req, res) => {
        const status = req.body.status;
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const updatedDoc = {
          $set: {
            status: status,
          },
        };

        const result = await tuitionsCollection.updateOne(query, updatedDoc);
        res.send(result);
      }
    );

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
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
