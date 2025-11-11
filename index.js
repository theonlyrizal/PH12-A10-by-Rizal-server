const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { MongoClient, ServerApiVersion } = require('mongodb');
const app = express();
const port = process.env.PORT || 5050;
const admin = require('firebase-admin');

// ADMIN SDK
const serviceAccount = require('./foodiespace-firebase-adminsdk.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// Middlewares -------------------------------------
app.use(cors());
app.use(express.json());

const verifyFireBaseToken = async (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).send({ message: 'unauthorized access' });
  }
  const token = authorization.split(' ')[1];

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    console.log('inside token', decoded);
    req.token_email = decoded.email;
    next();
  } catch (error) {
    return res.status(401).send({ message: 'unauthorized access' });
  }
};

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.636pevp.mongodb.net/?appName=Cluster0`;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

app.get('/', (req, res) => {
  res.send('Smart server is running');
});

async function run() {
  try {
    await client.connect();

    const database = client.db('foodieSpaceDB');
    const usersCollection = database.collection('users');
    const reviewsCollection = database.collection('reviews');

    //Users related APIs ------------------------------

    //       Create
    app.post('/users', async (req, res) => {
      const newUser = req.body;
      const email = req.body.email;
      console.log(email);

      const query = { email: email };
      const userExists = await usersCollection.findOne(query);
      console.log(userExists);

      if (userExists) {
        res.send({ message: 'User already exists' });
      } else {
        const result = await usersCollection.insertOne(newUser);
        res.send(result);
      }
    });

    //       Retrieve
    app.get('/users', async (req, res) => {
      const cursor = usersCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    //Reviews Related APIs -----------------------------------

    //       Create
    app.post('/reviews', async (req, res) => {
      const review = req.body;
      const result = await reviewsCollection.insertOne(review);
      res.send(result);
    });

    //       Retrieve
    app.get('/reviews', async (req, res) => {
      const cursor = reviewsCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    console.log('Pinged your deployment. You successfully connected to MongoDB!');
  } finally {
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`Smart server is running on port: ${port}`);
});
