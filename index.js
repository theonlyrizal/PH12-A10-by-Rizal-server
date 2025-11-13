const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { MongoClient, ServerApiVersion } = require('mongodb');
const app = express();
const port = process.env.PORT || 5050;
const admin = require('firebase-admin');

// ADMIN SDK
const decoded = Buffer.from(process.env.FIREBASE_SERVICE_KEY, 'base64').toString('utf8');
const serviceAccount = JSON.parse(decoded);
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
let client;
let isConnected = false;

async function connectToDatabase() {
  if (isConnected) {
    return;
  }
  
  try {
    client = new MongoClient(uri, {
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
      },
    });
    await client.connect();
    isConnected = true;
    console.log('Connected to MongoDB');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    throw error;
  }
}

app.get('/', (req, res) => {
  res.send('FoodieSpace server is running');
});

async function setupRoutes() {
  try {
    await connectToDatabase();

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
    // app.get('/users', async (req, res) => {
    //   const cursor = usersCollection.find();
    //   const result = await cursor.toArray();
    //   res.send(result);
    // });

    //Reviews Related APIs -----------------------------------

    //       Create
    app.post('/reviews', verifyFireBaseToken, async (req, res) => {
      const userEmail = req.token_email;
      const review = req.body;

      // Validate that submitted email matches token email
      if (review.userEmail !== userEmail) {
        return res.status(403).send({ message: 'Email mismatch with token' });
      }

      const result = await reviewsCollection.insertOne(review);
      res.send(result);
    });

    //       Retrieve user's own reviews (MUST come before generic /reviews route)
    app.get('/reviews/my-reviews', verifyFireBaseToken, async (req, res) => {
      const userEmail = req.token_email;
      const query = { userEmail: userEmail };
      const cursor = reviewsCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });

    //       Retrieve all reviews
    app.get('/reviews', async (req, res) => {
      const cursor = reviewsCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    //       Search reviews by food name (MUST come before /reviews/:id)
    app.get('/reviews/search', async (req, res) => {
      const { q } = req.query;

      if (!q) {
        return res.status(400).send({ message: 'Search query required' });
      }

      try {
        const cursor = reviewsCollection.find({
          foodName: { $regex: q, $options: 'i' },
        });
        const result = await cursor.toArray();
        res.send(result);
      } catch (error) {
        res.status(400).send({ message: 'Search failed' });
      }
    });

    //       Get single review by ID
    app.get('/reviews/:id', async (req, res) => {
      const { id } = req.params;
      const { ObjectId } = require('mongodb');
      try {
        const review = await reviewsCollection.findOne({ _id: new ObjectId(id) });
        if (!review) {
          return res.status(404).send({ message: 'Review not found' });
        }
        res.send(review);
      } catch (error) {
        res.status(400).send({ message: 'Invalid review ID' });
      }
    });

    //       Update review (only by owner)
    app.put('/reviews/:id', verifyFireBaseToken, async (req, res) => {
      const { id } = req.params;
      const { ObjectId } = require('mongodb');
      const userEmail = req.token_email;

      try {
        const review = await reviewsCollection.findOne({ _id: new ObjectId(id) });

        if (!review) {
          return res.status(404).send({ message: 'Review not found' });
        }

        if (review.userEmail !== userEmail) {
          return res.status(403).send({ message: 'You can only edit your own reviews' });
        }

        const updatedReview = req.body;
        const result = await reviewsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updatedReview }
        );

        res.send(result);
      } catch (error) {
        res.status(400).send({ message: 'Invalid request' });
      }
    });

    //       Delete review (only by owner)
    app.delete('/reviews/:id', verifyFireBaseToken, async (req, res) => {
      const { id } = req.params;
      const { ObjectId } = require('mongodb');
      const userEmail = req.token_email;

      try {
        const review = await reviewsCollection.findOne({ _id: new ObjectId(id) });

        if (!review) {
          return res.status(404).send({ message: 'Review not found' });
        }

        if (review.userEmail !== userEmail) {
          return res.status(403).send({ message: 'You can only delete your own reviews' });
        }

        const result = await reviewsCollection.deleteOne({ _id: new ObjectId(id) });
        res.send(result);
      } catch (error) {
        res.status(400).send({ message: 'Invalid request' });
      }
    });

    //       Toggle favorite (add/remove user from isFavoriteBy array)
    //       Also update user's `favorites` array with the review _id
    app.patch('/reviews/:id/favorite', verifyFireBaseToken, async (req, res) => {
      const { id } = req.params;
      const { ObjectId } = require('mongodb');
      const userEmail = req.token_email;

      try {
        const reviewId = new ObjectId(id);
        const review = await reviewsCollection.findOne({ _id: reviewId });

        if (!review) {
          return res.status(404).send({ message: 'Review not found' });
        }

        const isFavorite = review.isFavoriteBy?.includes(userEmail);

        let reviewResult;
        let userResult;

        if (isFavorite) {
          // Remove from review's favorites and from user's favorites
          reviewResult = await reviewsCollection.updateOne(
            { _id: reviewId },
            { $pull: { isFavoriteBy: userEmail } }
          );

          userResult = await usersCollection.updateOne(
            { email: userEmail },
            { $pull: { favorites: reviewId } }
          );
        } else {
          // Add to review's favorites and to user's favorites
          reviewResult = await reviewsCollection.updateOne(
            { _id: reviewId },
            { $addToSet: { isFavoriteBy: userEmail } }
          );

          userResult = await usersCollection.updateOne(
            { email: userEmail },
            { $addToSet: { favorites: reviewId } },
            { upsert: false }
          );
        }

        res.send({ reviewResult, userResult });
      } catch (error) {
        console.error('Favorite toggle error:', error);
        res.status(400).send({ message: 'Invalid request' });
      }
    });

    console.log('Pinged your deployment. You successfully connected to MongoDB!');
  } catch (error) {
    console.error('Error setting up routes:', error);
  }
}

// Initialize routes on first request for Vercel
let routesInitialized = false;
app.use(async (req, res, next) => {
  if (!routesInitialized) {
    await setupRoutes();
    routesInitialized = true;
  }
  next();
});

// Only listen locally, not on Vercel
if (process.env.NODE_ENV !== 'production') {
  app.listen(port, () => {
    console.log(`Smart server is running on port: ${port}`);
  });
}

module.exports = app;
