const express = require("express");
require("dotenv").config();
const cors = require("cors");
const app = express();
const stripe = require("stripe")(process.env.Stripe_Secret);

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const port = process.env.PORT || 5000;

const admin = require("firebase-admin");

// const serviceAccount = require("./etuitionbd-a1c8c-firebase-adminsdk-fbsvc-d84f5ccea7.json");

const decoded = Buffer.from(process.env.FB_SERVICE_KEY, "base64").toString(
  "utf8"
);
const serviceAccount = JSON.parse(decoded);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

app.use(express.json());
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://etuitionbd-a1c8c.web.app",
      "http://localhost:5174",
    ],
    methods: ["GET", "POST", "DELETE", "PATCH", "PUT"],
    credentials: true,
  })
);

const verifyFirebaseToken = async (req, res, next) => {
  const token = req.headers.authorization;
  // console.log(token);

  if (!token) {
    return res.status(401).send({ message: "Unauthorized access" });
  }
  try {
    const tokenId = token.split(" ")[1];
    // console.log(tokenId);

    const decoded = await admin.auth().verifyIdToken(tokenId);
    // console.log(decoded);

    req.decoded_email = decoded.email;
    next();
  } catch (error) {
    // console.log(error);

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
    const applicationsCollection = db.collection("applications");
    const paymentsCollection = db.collection("payments");

    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded_email;
      const query = { email };
      const user = await usersCollection.findOne(query);
      if (!user || user.role !== "Admin") {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    const verifyTutor = async (req, res, next) => {
      const email = req.decoded_email;
      const query = { email };
      const user = await usersCollection.findOne(query);
      if (!user || user.role !== "Tutor") {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    //! for accessing user role
    app.get("/users/:email/role", async (req, res) => {
      const email = req.params.email;
      const query = { email };
      const user = await usersCollection.findOne(query);
      res.send({ role: user?.role });
    });

    app.get("/users", async (req, res) => {
      const { email } = req.query;
      const query = {};
      if (email) {
        query.email = email;
      }
      const cursor = usersCollection.find(query).sort({ created_at: -1 });
      const result = await cursor.toArray();
      res.send(result);
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

    app.patch("/users", verifyFirebaseToken, async (req, res) => {
      const { name, photoURL } = req.body;
      const { email } = req.query;
      const query = {};
      if (email) {
        query.email = email;
      }

      const updatedUserData = {
        $set: {
          displayName: name,
          photoURL: photoURL,
        },
      };

      const result = await usersCollection.updateOne(query, updatedUserData);
      res.send(result);
    });

    // ! Delete User
    app.delete(
      "/users/:id",
      verifyFirebaseToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await usersCollection.deleteOne(query);
        res.send(result);
      }
    );

    // ! user's role change
    app.patch(
      "/users/:id/role",
      verifyFirebaseToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const roleInfo = req.body;
        const query = { _id: new ObjectId(id) };
        const updatedData = {
          $set: {
            role: roleInfo.role,
          },
        };
        const result = await usersCollection.updateOne(query, updatedData);
        res.send(result);
      }
    );

    // ! For all tuitions page (Approved tuitions)
    app.get("/all-tuitions", async (req, res) => {
      const { status, search, limit = 0, skip = 0 } = req.query;
      const query = {};
      if (status) {
        query.status = status;
      }
      if (search) {
        query.$or = [
          { subject: { $regex: search, $options: "i" } },
          { class: { $regex: search, $options: "i" } },
        ];
      }

      const pipeline = [
        { $match: { status: "Approved" } },
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
          },
        },
      ];

      const count = await tuitionsCollection.aggregate(pipeline).toArray();
      const cursor = tuitionsCollection
        .find(query)
        .limit(Number(limit))
        .skip(Number(skip))
        .sort({ created_at: -1 });
      const result = await cursor.toArray();
      res.send({ result, count });
    });

    app.get("/recent-tuitions", async (req, res) => {
      const { status } = req.query;
      const query = {};
      if (status) {
        query.status = status;
      }
      const cursor = tuitionsCollection
        .find(query)
        .sort({ created_at: -1 })
        .limit(6);
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/recent-tutors", async (req, res) => {
      const { role } = req.query;
      const query = {};
      if (role) {
        query.role = role;
      }
      const cursor = usersCollection
        .find(query)
        .sort({ created_at: -1 })
        .limit(6);
      const result = await cursor.toArray();
      res.send(result);
    });

    // ! to show the approved tuitions list to the specific student
    app.get("/tuitions", verifyFirebaseToken, async (req, res) => {
      const { email, status } = req.query;
      const query = {};
      if (email && status) {
        query.studentEmail = email;
        query.status = status;
      }

      if (email !== req.decoded_email) {
        return res.status(403).send({ message: "Forbidden Access" });
      }
      const cursor = tuitionsCollection.find(query).sort({ created_at: -1 });
      const result = await cursor.toArray();
      res.send(result);
    });

    // ! to show the list of pending tuitions to admin
    app.get("/tuitions/Pending", verifyFirebaseToken, async (req, res) => {
      const { email } = req.query;
      const query = {};

      if (email !== req.decoded_email) {
        return res.status(403).send({ message: "Forbidden Access" });
      }
      const cursor = tuitionsCollection.find(query).sort({ created_at: -1 });
      const result = await cursor.toArray();
      res.send(result);
    });

    app.post("/tuitions", verifyFirebaseToken, async (req, res) => {
      const tuition = req.body;

      tuition.status = "Pending";
      tuition.created_at = new Date();
      const tuitionExists = await tuitionsCollection.findOne({
        studentEmail: tuition.studentEmail,
        studentName: tuition.studentName,
        subject: tuition.subject,
        class: tuition.class,
        location: tuition.location,
        budget: tuition.budget,
      });

      if (tuitionExists) {
        return res.send({ message: "tuition exists" });
      }
      const result = await tuitionsCollection.insertOne(tuition);
      res.send(result);
    });

    // ! for showing the applications of the tuition to specific tutor
    app.get(
      "/tuitions/application",
      verifyFirebaseToken,
      verifyTutor,
      async (req, res) => {
        const { email, status } = req.query;
        const query = {};
        if (email) {
          query.tutorEmail = email;
        }
        if (status) {
          query.applicationStatus = status;
        }
        const result = await applicationsCollection
          .find(query)
          .sort({ applied_at: -1 })
          .toArray();
        res.send(result);
      }
    );

    // ! for checking if a specific tutor has already applied for a specific tuition or not
    app.get("/tuitions/:id/tutor", async (req, res) => {
      const id = req.params.id;
      const { email } = req.query;
      const query = { tutorEmail: email, _id: new ObjectId(id) };
      const result = await tuitionsCollection.find(query).toArray();
      res.send(result);
    });

    // ! for showing the applied tutors list to the student
    app.get(
      "/tuitions/:email/applied",
      verifyFirebaseToken,
      async (req, res) => {
        const email = req.params.email;
        const query = { studentEmail: email };
        query.approvalStatus = { $in: ["Pending", "Approved"] };
        const result = await tuitionsCollection.find(query).toArray();
        res.send(result);
      }
    );

    // ! for students to update their tuition information
    app.patch("/tuitions/:id/update", verifyFirebaseToken, async (req, res) => {
      const id = req.params.id;
      const updatedData = req.body;

      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          studentName: updatedData.studentName,
          subject: updatedData.subject,
          class: updatedData.class,
          budget: updatedData.budget,
        },
      };

      const result = await tuitionsCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    // ! for application of tutor for a specific tuition
    app.patch(
      "/tuitions/apply",
      verifyFirebaseToken,
      verifyTutor,
      async (req, res) => {
        const {
          tuition,
          name,
          email,
          qualification,
          experience,
          expectedSalary,
          photoURL,
        } = req.body;

        const query = { _id: new ObjectId(tuition._id) };
        const appliedData = {
          $set: {
            tutorName: name,
            tutorEmail: email,
            tutorQualification: qualification,
            tutorExperience: experience,
            tutorExpectedSalary: expectedSalary,
            approvalStatus: "Pending",
            applied_at: new Date(),
            tutorPhoto: photoURL,
          },
        };

        const applicationData = {
          tutorEmail: email,
          tutorName: name,
          class: tuition.class,
          subject: tuition.subject,
          tutorQualification: qualification,
          tutorExperience: experience,
          tutorExpectedSalary: expectedSalary,
          studentEmail: tuition.studentEmail,
          studentName: tuition.studentName,
          location: tuition.location,
          applicationStatus: "Pending",
          applied_at: new Date(),
        };

        const result = await tuitionsCollection.updateOne(query, appliedData);
        const applicationResult = await applicationsCollection.insertOne(
          applicationData
        );
        res.send(result);
      }
    );

    // ! for rejection of tutor's application by student
    app.patch("/tuitions/reject", verifyFirebaseToken, async (req, res) => {
      const app = req.body;
      const id = app._id;
      const query = { _id: new ObjectId(id) };
      const tuitionUpdatedData = {
        $set: {
          approvalStatus: "Rejected",
        },
      };
      const result = await tuitionsCollection.updateOne(
        query,
        tuitionUpdatedData
      );
      const appQuery = {
        studentEmail: app.studentEmail,
        tutorEmail: app.tutorEmail,
      };
      const tutorUpdatedData = {
        $set: {
          applicationStatus: "Rejected",
        },
      };
      const tutorResult = await applicationsCollection.updateOne(
        appQuery,
        tutorUpdatedData
      );
      res.send(result);
    });

    // ! for approval of specific tuition from admin
    app.patch(
      "/tuitions/:id",
      verifyFirebaseToken,
      verifyAdmin,
      async (req, res) => {
        const status = req.body.status;
        const { email } = req.query;
        const id = req.params.id;

        const query = { _id: new ObjectId(id) };

        if (email !== req.decoded_email) {
          return res.status(403).send({ message: "Forbidden Access" });
        }
        const updatedDoc = {
          $set: {
            status: status,
          },
        };
        const result = await tuitionsCollection.updateOne(query, updatedDoc);
        res.send(result);
      }
    );

    app.delete("/tuitions/:id", verifyFirebaseToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await tuitionsCollection.deleteOne(query);
      res.send(result);
    });

    app.patch(
      "/applications/:id/update",
      verifyFirebaseToken,
      verifyTutor,
      async (req, res) => {
        const id = req.params.id;
        const { qualification, experience, salary } = req.body;
        const query = { _id: new ObjectId(id) };
        const updatedData = {
          $set: {
            tutorQualification: qualification,
            tutorExperience: experience,
            tutorExpectedSalary: salary,
          },
        };
        const result = await applicationsCollection.updateOne(
          query,
          updatedData
        );
        res.send(result);
      }
    );

    app.delete(
      "/applications/:id",
      verifyFirebaseToken,
      verifyTutor,
      async (req, res) => {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await applicationsCollection.deleteOne(query);
        res.send(result);
      }
    );

    // ! for Payment Checkout page
    app.post(
      "/create-checkout-session",
      verifyFirebaseToken,
      async (req, res) => {
        const paymentInfo = req.body;
        const amount = parseInt(paymentInfo.fee) * 100;
        const session = await stripe.checkout.sessions.create({
          line_items: [
            {
              // Provide the exact Price ID (for example, price_1234) of the product you want to sell
              price_data: {
                currency: "bdt",
                unit_amount: amount,
                product_data: {
                  name: `Pay the tuition fee for ${paymentInfo.subject}`,
                },
              },
              quantity: 1,
            },
          ],
          customer_email: paymentInfo.studentEmail,
          mode: "payment",
          metadata: {
            tuitionId: paymentInfo.tuitionId,
            subject: paymentInfo.subject,
            tutorEmail: paymentInfo.tutorEmail,
          },
          success_url: `${process.env.Domain_URL}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${process.env.Domain_URL}/dashboard/payment-cancelled`,
        });
        res.send({ url: session.url });
      }
    );

    app.patch("/payment-success", async (req, res) => {
      const sessionId = req.query.session_id;
      const session = await stripe.checkout.sessions.retrieve(sessionId);

      const transactionId = session.payment_intent;
      const query = { transactionId: transactionId };
      const paymentExist = await paymentsCollection.findOne(query);
      if (paymentExist) {
        return res.send({
          message: "payment already done",
          transactionId,
        });
      }

      if (session.payment_status === "paid") {
        const id = session.metadata.tuitionId;
        const query = { _id: new ObjectId(id) };
        const update = {
          $set: {
            paymentStatus: "Paid",
            approvalStatus: "Approved",
          },
        };
        const result = await tuitionsCollection.updateOne(query, update);
        const paymentHistory = {
          amount: session.amount_total / 100,
          studentEmail: session.customer_email,
          tutorEmail: session.metadata.tutorEmail,
          tuitionId: session.metadata.tuitionId,
          subject: session.metadata.subject,
          transactionId: session.payment_intent,
          paymentStatus: session.payment_status,
          paidAt: new Date(),
          transactionId: session.payment_intent,
        };

        if (session.payment_status === "paid") {
          const resultPayment = await paymentsCollection.insertOne(
            paymentHistory
          );
          const tutorQuery = {
            studentEmail: session.customer_email,
            tutorEmail: session.metadata.tutorEmail,
            subject: session.metadata.subject,
          };
          const tutorUpdatedData = {
            $set: {
              applicationStatus: "Approved",
            },
          };
          const tutorResult = await applicationsCollection.updateOne(
            tutorQuery,
            tutorUpdatedData
          );
          res.send({
            transactionId: session.payment_intent,
            updatedApplication: tutorResult,
          });
        }
      }
    });

    app.get(
      "/all-payments",
      verifyFirebaseToken,
      verifyAdmin,
      async (req, res) => {
        const { email } = req.query;
        const query = {};

        if (email !== req.decoded_email) {
          return res.status(403).send({ message: "Forbidden Access" });
        }
        const cursor = paymentsCollection.find(query).sort({ paidAt: -1 });
        const result = await cursor.toArray();
        res.send(result);
      }
    );

    // ! for showing the payment history to the student
    app.get("/payments", verifyFirebaseToken, async (req, res) => {
      const email = req.query.email;
      const query = {};
      if (email) {
        query.studentEmail = email;
      }
      if (email !== req.decoded_email) {
        return res.status(403).send({ message: "Forbidden Access" });
      }
      const cursor = paymentsCollection.find(query).sort({ paidAt: -1 });
      const result = await cursor.toArray();
      res.send(result);
    });

    // ! for showing the payment history to the tutor
    app.get(
      "/payments/tutor",
      verifyFirebaseToken,
      verifyTutor,
      async (req, res) => {
        const email = req.query.email;
        const query = {};
        if (email) {
          query.tutorEmail = email;
        }
        if (email !== req.decoded_email) {
          return res.status(403).send({ message: "Forbidden Access" });
        }

        const cursor = paymentsCollection.find(query).sort({ paidAt: -1 });
        const result = await cursor.toArray();
        res.send(result);
      }
    );

    app.get(
      "/payments/admin",
      verifyFirebaseToken,
      verifyAdmin,
      async (req, res) => {
        const email = req.query.email;

        if (email !== req.decoded_email) {
          return res.status(403).send({ message: "Forbidden Access" });
        }

        const resultAnalytics = await paymentsCollection
          .aggregate([
            {
              $group: {
                _id: "$paymentStatus",
                totalAmount: { $sum: "$amount" },
                count: { $count: {} },
              },
            },
          ])
          .toArray();
        res.send(resultAnalytics);
      }
    );

    app.get(
      "/payments/total/:email",
      verifyFirebaseToken,
      verifyTutor,
      async (req, res) => {
        const email = req.params.email;

        const result = await paymentsCollection
          .aggregate([
            { $match: { tutorEmail: email } },
            {
              $group: {
                _id: "$tutorEmail",
                totalAmount: { $sum: "$amount" },
                count: { $count: {} },
              },
            },
          ])
          .toArray();

        if (email !== req.decoded_email) {
          return res.status(403).send({ message: "Forbidden Access" });
        }

        res.send(result[0] || { totalAmount: 0, count: 0 });
      }
    );

    app.get(
      "/tuitions/approval-status/stats",
      verifyFirebaseToken,
      verifyAdmin,
      async (req, res) => {
        const { email } = req.query;
        const pipeline = [
          {
            $group: {
              _id: "$approvalStatus",
              count: { $sum: 1 },
            },
          },
        ];

        if (email !== req.decoded_email) {
          return res.status(403).send({ message: "Forbidden Access" });
        }

        const result = await tuitionsCollection.aggregate(pipeline).toArray();
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
