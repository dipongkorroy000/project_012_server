const {MongoClient, ServerApiVersion, ObjectId} = require("mongodb");
const admin = require("firebase-admin");
const express = require("express");

const cors = require("cors");
require("dotenv").config();
const app = express();

const port = process.env.PORT || 5000;

// Middleware
app.use(cors({origin: process.env.CLIENT_SIDE, credentials: true}));
app.use(express.json());

// stripe publishable key
const stripe = require("stripe")(process.env.PAYMENT_SECRET_GATEWAY_KEY);

// mongodb
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.azvkhy2.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
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

    const db = client.db("assignment_12");
    const usersCollection = db.collection("users");
    const taskCollection = db.collection("tasks");
    const paymentCollection = db.collection("payments");
    const submissionCollection = db.collection("submission");
    const withDrawCollection = db.collection("withdraw");

    // firebase token related task
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      }),
    });

    // necessary apis
    async function verifyFBToken(req, res, next) {
      const authHeaders = req.headers.authorization;
      // console.log("header in middleware", req.headers.authorization);
      if (!authHeaders) {
        return res.status(401).send({message: "unauthorized access"});
      }

      const token = authHeaders.split(" ")[1];
      if (!token) {
        return res.status(401).send({message: "unauthorized access token not matched"});
      }

      // verify the token
      try {
        const decoded = await admin.auth().verifyIdToken(token);
        req.decoded = decoded;
        next();
      } catch (error) {
        return res.status(403).send({message: "forbidden access"});
      }
    }

    async function verifyAdmin(req, res, next) {
      const email = req.decoded.email;

      const user = await usersCollection.findOne({email: email});

      if (!user || user.role !== "admin") {
        return res.status(401).send({message: "forbidden access admin"});
      }

      next();
    }

    async function verifyBuyer(req, res, next) {
      const email = req.decoded.email;
      const user = await usersCollection.findOne({email: email});

      if (!user || user.role !== "buyer") {
        return res.status(401).send({message: "forbidden access rider"});
      }
      next();
    }

    async function verifyWorker(req, res, next) {
      const email = req.decoded.email;
      const user = await usersCollection.findOne({email: email});

      if (!user || user.role !== "worker") {
        return res.status(401).send({message: "forbidden access rider"});
      }
      next();
    }

    // user get by query email
    app.get("/userFind", verifyFBToken, async (req, res) => {
      const email = req.query.email;
      if (!email) {
        return res.status(400).send({message: "Email is required"});
      }

      try {
        const user = await usersCollection.findOne({email});
        if (!user) {
          return res.status(404).send({message: "User not found"});
        }

        res.status(200).send(user);
        // res.status(200).send({ role: user.role || "user" });
      } catch (error) {
        console.error("Error fetching user role:", error);
        res.status(500).send({message: "Failed to fetch user role"});
      }
    });

    // user create
    app.post("/userCreate", async (req, res) => {
      const {email, role, number, coin, image} = req.body;

      if (!email) {
        return res.status(400).send({message: "Email and name are required"});
      }
      try {
        const existingUser = await usersCollection.findOne({email});
        if (existingUser) {
          return res.status(400).send({
            message: "User already exists",
            user: existingUser,
            inserted: false,
          });
        }

        const newUser = {
          image,
          coin,
          number,
          email,
          role: role,
          created_at: new Date().toISOString(),
          last_log_in: new Date().toISOString(),
        };

        const result = await usersCollection.insertOne(newUser);
        res.status(201).send(result);
      } catch (error) {
        console.error("Error handling user creation:", error);
        res.status(500).send({message: "Server error while creating user"});
      }
    });

    // user create or update by social login
    app.patch("/socialLogin", async (req, res) => {
      const {email, role, coin} = req.body;
      if (!email) {
        return res.status(400).send({message: "Email and name are required"});
      }

      try {
        const existingUser = await usersCollection.findOne({email});
        if (existingUser) {
          await usersCollection.updateOne(
            {email: email},
            {
              $set: {
                last_log_in: new Date().toISOString(),
              },
            }
          );
          // await usersCollection.insertOne(newUser);
          res.status(200).send({message: "Login time updated"});
          return;
        } else {
          const newUser = await {
            coin,
            email,
            role: role,
            created_at: new Date().toISOString(),
            last_log_in: new Date().toISOString(),
          };
          await usersCollection.insertOne(newUser);
          res.status(201).send({message: "successfully create account"});
        }
      } catch (error) {
        console.error("Error handling user creation:", error);

        res.status(500).send({message: "Server error while creating user"});
      }
    });

    app.patch("/userCoinUpdate", verifyFBToken, verifyBuyer, async (req, res) => {
      const email = req.query.email;
      const {coin, sumOrSub} = req.body;

      try {
        const user = await usersCollection.findOne({email});

        if (!user) {
          return res.status(404).json({error: "User not found."});
        }

        // ✅ Calculate new coin value
        const updatedCoin = sumOrSub ? user.coin + coin : user.coin - coin;

        // ✅ Prevent negative coin balance
        if (updatedCoin < 0) {
          return res.status(400).json({error: "Insufficient coin balance."});
        }

        // ✅ Update user coin
        const updateResult = await usersCollection.updateOne({email}, {$set: {coin: updatedCoin}});

        if (updateResult.modifiedCount === 0) {
          return res.status(500).json({error: "Failed to update coin."});
        }

        return res.status(200).json({
          message: `Coin ${sumOrSub ? "added" : "deducted"} successfully.`,
          newCoinBalance: updatedCoin,
        });
      } catch (error) {
        console.error("Error updating coin:", error);
        return res.status(500).json({error: "Internal server error"});
      }
    });

    // user role & last sign_in update by body email
    app.patch("/userUpdate", async (req, res) => {
      const {email, role, image} = req.body;

      try {
        const user = await usersCollection.findOne({email: email});
        if (!user) {
          return res.status(404).send({message: "User not found"});
        }

        let userUpdateDoc = {};
        if (!role) {
          userUpdateDoc = {
            $set: {
              last_log_in: new Date().toISOString(),
            },
          };
        } else {
          // ✅ Update role
          userUpdateDoc = {
            $set: {
              role: role,
              image,
              role_updated_at: new Date().toISOString(),
            },
          };
        }

        const result = await usersCollection.updateOne({email: email}, userUpdateDoc);
        res.status(201).send(result);
      } catch (error) {
        res.status(500).send("User update failed");
      }
    });

    // user delete by query email
    app.delete("/userDelete", verifyFBToken, async (req, res) => {
      const email = req.query.email;

      const existingUser = await usersCollection.findOne({email});
      if (!existingUser) {
        res.status(500).send({message: "User not find"});
      }

      try {
        const result = await usersCollection.deleteOne(existingUser._id);
        res.status(200).send({message: "Successfully delete your account"});
      } catch (error) {
        res.status(500).send({message: "Failed to Delete rider"});
      }
    });

    // works

    // POST /addTask
    app.post("/addTask", verifyFBToken, async (req, res) => {
      try {
        const {
          buyer_email,
          task_title,
          task_detail,
          required_workers,
          payable_amount,
          completion_date,
          submission_info,
          task_image_url,
          total_payable,
          created_at,
        } = req.body;

        // Validate required fields
        if (!buyer_email) {
          return res.status(400).json({error: "Missing required fields"});
        }

        // Check user role
        const user = await usersCollection.findOne({email: buyer_email});
        if (!user || user.role !== "buyer") {
          return res.status(403).json({error: "Access denied. Only buyers can add tasks."});
        }

        // Create task object
        const newTask = {
          task_title,
          task_detail,
          required_workers,
          payable_amount,
          total_payable,
          completion_date,
          submission_info,
          task_image_url,
          buyer_email,
          created_at,
          status: "active", // optional default status
          payment_status: "Not Paid",
        };

        // Insert into tasks collection
        const result = await taskCollection.insertOne(newTask);

        res.status(201).json({
          message: "Task added successfully",
          taskId: result.insertedId,
        });
      } catch (error) {
        console.error("Error adding task:", error);
        res.status(500).json({error: "Internal server error"});
      }
    });

    app.get("/taskFind/:taskId", verifyFBToken, async (req, res) => {
      try {
        const {taskId} = req.params;

        // Validate ObjectId format
        if (!ObjectId.isValid(taskId)) {
          return res.status(400).json({error: "Invalid task ID format."});
        }

        const task = await taskCollection.findOne({_id: new ObjectId(taskId)});

        if (!task) {
          return res.status(404).send({error: "Task not found."});
        }

        res.status(200).send(task);
      } catch (error) {
        console.error("Error fetching task:", error);
        res.status(500).send({error: "Internal server error."});
      }
    });

    // payment post
    app.post("/payment", async (req, res) => {
      const {taskId, email, coin, transactionId, paymentMethod} = req.body;
      const paymentInfo = {
        taskId: taskId,
        email,
        coin,
        transactionId,
        paymentMethod,
        payment_at: new Date().toISOString(),
      };

      try {
        const user = await usersCollection.findOne({email: email});
        if (!user) {
          return res.status(404).send({message: "User not found"});
        }

        const updateCoin = parseInt(user.coin) - parseInt(coin);

        await usersCollection.updateOne({email: email}, {$set: {coin: updateCoin}});

        await taskCollection.updateOne({_id: new ObjectId(taskId)}, {$set: {payment_status: "paid", paid_at: new Date().toISOString()}});

        const insertResult = await paymentCollection.insertOne(paymentInfo);
        res.status(201).send(insertResult);
      } catch (error) {
        res.status(500).send({message: "Internal server error"});
      }
    });

    app.get("/topWorkers", async (req, res) => {
      try {
        const topWorkers = await usersCollection
          .find({role: "worker"}) // Filter only workers
          .project({image: 1, coin: 1, _id: 0}) // Only return image and coin, exclude _id
          .sort({coin: -1}) // Sort by coin descending
          .limit(6) // Limit to top 6
          .toArray(); // Convert cursor to array

        res.status(200).send(topWorkers);
      } catch (error) {
        console.error("Error fetching top workers:", error);
        res.status(500).send({message: "Internal server error"});
      }
    });

    // payment for coin purchase
    app.post("/coinPurchase", verifyFBToken, async (req, res) => {
      const data = req.body;

      try {
        const result = await paymentCollection.insertOne(data);
        res.status(200).send(result);
      } catch (error) {
        res.status(500).send({message: "Internal server error"});
      }
    });

    // payment
    app.post("/create-payment-intent", verifyFBToken, async (req, res) => {
      const {amountInSens} = await req.body;
      try {
        const paymentIntent = await stripe.paymentIntents.create({
          amount: amountInSens, // amount in cents
          currency: "usd",
          payment_method_types: ["card"],
        });

        res.json({clientSecret: paymentIntent.client_secret});
      } catch (error) {
        res.status(500).json({error: error.message});
      }
    });

    app.delete("/taskDelete/:taskId", verifyFBToken, verifyBuyer, async (req, res) => {
      const taskId = req.params.taskId;

      const task = await taskCollection.deleteOne({_id: new ObjectId(taskId)});

      res.status(200).send({message: "sucessfuly delete the task"});
    });

    // get task by query buyer tasks
    app.get("/allTasks", verifyFBToken, verifyBuyer, async (req, res) => {
      const buyerEmail = req.query.email;

      if (req.decoded.email !== buyerEmail) {
        return res.status(403).send({message: "forbidden access"});
      }

      const user = await usersCollection.findOne({email: buyerEmail});
      if (!user) {
        res.status(500).send({message: "User not find"});
      }
      if (user.role !== "buyer") {
        res.status(501).send({message: "role is not matching"});
      }

      try {
        const result = await taskCollection.find({buyer_email: user.email}).toArray();
        res.status(200).send(result);
      } catch (error) {
        console.error("Error adding task:", error);
        res.status(500).json({error: "Internal server error"});
      }
    });

    // task update by taskId
    app.patch("/taskUpdate/:taskId", verifyFBToken, verifyBuyer, async (req, res) => {
      const taskId = req.params.taskId;
      // Validate ObjectId
      if (!ObjectId.isValid(taskId)) {
        return res.status(400).json({error: "Invalid task ID format"});
      }

      const {task_title, task_detail, submission_info} = req.body;

      // Validate required fields
      if (!task_title || !task_detail || !submission_info) {
        return res.status(400).json({error: "Missing required fields"});
      }

      try {
        const task = await taskCollection.findOne({_id: new ObjectId(taskId)});
        if (!task) {
          return res.status(404).json({error: "Task not found"});
        }
        const updateDoc = {
          $set: {
            task_title,
            task_detail,
            submission_info,
          },
        };

        const result = await taskCollection.updateOne({_id: new ObjectId(taskId)}, updateDoc);
        if (result.modifiedCount === 0) {
          return res.status(304).json({message: "No changes made to the task"});
        }

        res.status(200).json({message: "Task updated successfully"});
      } catch (error) {
        console.error("Error updating task:", error);
        res.status(500).json({error: "Internal server error"});
      }
    });

    // total task , worker , paid coin by buyer email params
    app.get("/buyerHome", async (req, res) => {
      const email = req.query.email;

      try {
        // ✅ Task count by buyer_email
        const taskCount = await taskCollection.countDocuments({buyer_email: email});

        // 👷‍♂️ Total required workers for pending tasks
        const workerAgg = await taskCollection
          .aggregate([{$match: {buyer_email: email, status: "active"}}, {$group: {_id: null, totalWorkers: {$sum: "$required_workers"}}}])
          .toArray();
        const totalWorkers = workerAgg[0]?.totalWorkers || 0;

        // 💰 Total coins from payments
        const coinAgg = await paymentCollection.aggregate([{$match: {email}}, {$group: {_id: null, totalCoin: {$sum: "$coin"}}}]).toArray();
        const totalCoin = coinAgg[0]?.totalCoin || 0;

        const submission = await submissionCollection
          .find({
            buyer_email: email,
            status: "pending",
          })
          .sort({submission_at: -1})
          .toArray();

        // 🧾 Final response
        res.json({
          email,
          taskCount,
          totalWorkersPending: totalWorkers,
          totalCoin,
          submission,
        });
      } catch (error) {
        res.status(500).json({error: "Failed to fetch summary data"});
      }
    });

    app.patch("/submissionStatusUpdate/:submissionId", async (req, res) => {
      const subId = req.params.submissionId;
      const {status, worker_email, amount, taskId} = req.body;

      if (!status || !worker_email || !amount || !taskId) {
        return res.status(400).send({success: false, message: "Missing required fields"});
      }

      const payable_amount = amount * 20;

      try {
        // ✅ Update submission status
        const statusUpdate = await submissionCollection.updateOne({_id: new ObjectId(subId)}, {$set: {status}});

        if (statusUpdate.modifiedCount !== 1) {
          return res.status(404).send({success: false, message: "Submission not found or already updated"});
        }

        // ✅ If approved, add coins to worker
        if (status === "approved") {
          await usersCollection.updateOne({email: worker_email}, {$inc: {coin: payable_amount}});
        }

        // ✅ If rejected, increase required_workers in task
        if (status === "rejected") {
          await taskCollection.updateOne({_id: new ObjectId(taskId)}, {$inc: {required_workers: 1}});
        }

        res.status(200).send({
          success: true,
          message: `Submission status updated to ${status}`,
        });
      } catch (error) {
        console.error("Error updating submission status:", error);
        res.status(500).send({success: false, message: "Server error"});
      }
    });

    // buyer payments
    app.get("/payments-buyer", verifyFBToken, verifyBuyer, async (req, res) => {
      const email = req.query.email;
      if (!email) {
        res.status(400).send({message: "email is require"});
      }

      try {
        const result = await paymentCollection.find({email: email}).toArray();
        res.status(200).send(result);
      } catch (error) {
        res.status(500).send({message: "server error"});
      }
    });

    // admin apis ------->
    app.get("/totalWorkerBuyerPayments", verifyFBToken, verifyAdmin, async (req, res) => {
      try {
        // 👷‍♂️ Worker count
        const workerCount = await usersCollection.countDocuments({role: "worker"});

        // 🧑‍💼 Buyer count
        const buyerCount = await usersCollection.countDocuments({role: "buyer"});

        // 💰 Total coin across all users
        const coinAgg = await usersCollection
          .aggregate([
            {
              $group: {
                _id: null,
                totalCoin: {$sum: "$coin"},
              },
            },
          ])
          .toArray();
        const totalCoin = coinAgg[0]?.totalCoin || 0;

        // 💳 Total payments count
        const paymentCount = await paymentCollection.countDocuments();

        // 🧾 All pending withdrawals, sorted by withdraw_date (newest first)
        const pendingWithdrawals = await withDrawCollection.find({status: "pending"}).sort({withdraw_date: -1}).toArray();

        // 📦 Final response
        res.json({
          workerCount,
          buyerCount,
          totalCoin,
          paymentCount,
          pendingWithdrawals,
        });
      } catch (error) {
        console.error("Error fetching summary data:", error);
        res.status(500).json({error: "Failed to fetch summary data"});
      }
    });

    app.get("/allUser", verifyFBToken, verifyAdmin, async (req, res) => {
      try {
        const users = await usersCollection.find().toArray();
        res.send(users);
      } catch (error) {
        res.status(500).send({message: "Failed to fetch users."});
      }
    });

    app.delete("/deleteUser/:userId", verifyFBToken, verifyAdmin, async (req, res) => {
      const userId = req.params.userId;

      const result = await usersCollection.deleteOne({_id: new ObjectId(userId)});

      res.status(200).send(result);
    });

    app.patch("/updateUserRole/:userId", verifyFBToken, verifyAdmin, async (req, res) => {
      const userId = req.params.userId;
      const role = req.body.role;

      if (!userId || !role) {
        return res.status(400).send({message: "missing userId or role"});
      }

      const result = await usersCollection.updateOne({_id: new ObjectId(userId)}, {$set: {role: role}});

      res.status(200).send(result);
    });

    app.get("/allTask", verifyFBToken, verifyAdmin, async (req, res) => {
      try {
        const tasks = await taskCollection.find().toArray();
        res.status(200).send(tasks);
      } catch (error) {
        res.status(500).send({message: "server error all tasks"});
      }
    });

    app.delete("/taskRemove/:taskId", verifyFBToken, verifyAdmin, async (req, res) => {
      const taskId = req.params.taskId;

      try {
        const result = await taskCollection.deleteOne({_id: new ObjectId(taskId)});
        res.status(200).send(result);
      } catch (error) {
        res.status(500).send({message: "server error deleteTask"});
      }
    });

    app.patch("/updateWorkerCoin", verifyFBToken, async (req, res) => {
      const email = req.query.email;
      const withdrawalCoin = Number(req.body.withdrawal_coin); // ensure it's a number

      if (!email || isNaN(withdrawalCoin)) {
        return res.status(400).send({success: false, message: "Invalid email or withdrawal amount"});
      }

      try {
        const user = await usersCollection.findOne({email});

        if (!user) {
          return res.status(404).send({success: false, message: "User not found"});
        }

        const currentCoin = user.coin || 0;

        if (currentCoin < withdrawalCoin) {
          return res.status(400).send({success: false, message: "Insufficient coin balance"});
        }

        const updatedCoin = currentCoin - withdrawalCoin;

        const result = await usersCollection.updateOne({email}, {$set: {coin: updatedCoin}});

        res.status(200).send(result);
      } catch (error) {
        console.error("Error updating coin:", error);
        res.status(500).send({success: false, message: "Server error"});
      }
    });

    app.patch("/updateWithdrawStatus/:withdrawId", verifyFBToken, verifyAdmin, async (req, res) => {
      const id = req.params.withdrawId;

      try {
        const result = await withDrawCollection.updateOne(
          {_id: new ObjectId(id)},
          {
            $set: {
              status: "approved",
              approved_at: new Date().toISOString(),
            },
          }
        );

        if (result.modifiedCount === 1) {
          res.status(200).send({
            success: true,
            message: "Withdrawal status updated to approved",
          });
        } else {
          res.status(404).send({
            success: false,
            message: "Withdrawal not found or already approved",
          });
        }
      } catch (error) {
        console.error("Error updating withdrawal status:", error);
        res.status(500).send({success: false, message: "Server error"});
      }
    });

    // worker apis ------>
    app.get("/tasks", verifyFBToken, async (req, res) => {
      try {
        const result = await taskCollection
          .find({
            required_workers: {$gt: 0}, // Only tasks with required_workers greater than 0
          })
          .toArray();

        res.status(200).send(result);
      } catch (error) {
        console.error("Error fetching tasks:", error);
        res.status(500).send({message: "Server error"});
      }
    });

    app.post("/taskSubmission", verifyFBToken, verifyWorker, async (req, res) => {
      const data = req.body;

      try {
        // Check if the worker already submitted this task
        const existingSubmission = await submissionCollection.findOne({
          taskId: data.taskId,
        });

        if (existingSubmission) {
          return res.status(400).send({message: "You have already submitted this task."});
        }

        // Insert new submission
        const result = await submissionCollection.insertOne(data);
        res.status(200).send(result);
      } catch (error) {
        console.error("Error submitting task:", error);
        res.status(500).send({message: "Server error"});
      }
    });

    app.get("/submissions", verifyFBToken, async (req, res) => {
      const email = req.query.email;
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;

      if (!email) {
        return res.status(400).send({message: "Email is required"});
      }

      try {
        const query = {worker_email: email};
        const skip = (page - 1) * limit;

        const submissions = await submissionCollection
          .find(query)
          .sort({submission_at: -1}) // 🔽 Sort by newest first
          .skip(skip)
          .limit(limit)
          .toArray();

        const total = await submissionCollection.countDocuments(query);

        res.status(200).send({
          submissions,
          total,
          page,
          totalPages: Math.ceil(total / limit),
        });
      } catch (error) {
        console.error("Error fetching submissions:", error);
        res.status(500).send({message: "Server error"});
      }
    });

    app.post("/withdrawPost", verifyFBToken, verifyWorker, async (req, res) => {
      const data = req.body;

      try {
        // Check for exact match on all 4 fields
        const duplicate = await withDrawCollection.findOne({
          worker_email: data.worker_email,
          withdrawal_coin: data.withdrawal_coin,
          withdrawal_amount: data.withdrawal_amount,
          status: data.status,
        });

        if (duplicate) {
          return res.status(200).send({
            success: false,
            message: "Withdrawal request already submitted.",
          });
        }

        // Insert if not duplicate
        const result = await withDrawCollection.insertOne(data);
        res.status(200).send({
          success: true,
          message: "Withdrawal request submitted successfully.",
          insertedId: result.insertedId,
        });
      } catch (error) {
        console.error("Error submitting withdrawal:", error);
        res.status(500).send({success: false, message: "Server error"});
      }
    });

    app.get("/countableSubmissions", verifyFBToken, verifyWorker, async (req, res) => {
      const {email} = req.query;

      if (!email) {
        return res.status(400).send({success: false, message: "Email is required"});
      }

      try {
        const totalSubmissions = await submissionCollection.countDocuments({worker_email: email});
        const totalPending = await submissionCollection.countDocuments({status: "pending"});

        const approvedSubmissions = await submissionCollection
          .find({worker_email: email, status: "approved"})
          .sort({submission_at: -1}) // optional: latest first
          .toArray();

        const rejectedSubmissions = await submissionCollection
          .find({worker_email: email, status: "rejected"})
          .sort({submission_at: -1}) // optional: latest first
          .toArray();

        res.status(200).send({
          success: true,
          total_submissions: totalSubmissions,
          totalPending,
          approvedSubmissions,
          rejectedSubmissions,
        });
      } catch (error) {
        console.error("Error fetching submission stats:", error);
        res.status(500).send({success: false, message: "Server error"});
      }
    });

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

// Routes
app.get("/", (req, res) => {
  res.send("Freelance server is running!");
});

// Start server
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
