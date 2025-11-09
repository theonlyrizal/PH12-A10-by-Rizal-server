const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { MongoClient, ServerApiVersion } = require('mongodb');
const app = express();
const port = process.env.PORT || 5050;

// middleware
app.use(cors());
app.use(express.json());

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
    //Users related APIs
    app.post('/users', async (req, res) => {
      const user = req.body;
      console.log('Received user:', user);

      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    //Reviews Related APIs

    app.post('/reviews', async (req, res) => {
      const review = req.body;
      const result = await reviewsCollection.insertOne(review);
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
