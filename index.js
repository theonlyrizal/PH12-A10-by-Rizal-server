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

// Admin verification middleware
const verifyAdmin = async (req, res, next) => {
  const email = req.token_email;

  try {
    const database = req.app.locals.database;
    const usersCollection = database.collection('users');
    const user = await usersCollection.findOne({ email: email });

    if (!user || user.role !== 'admin') {
      return res.status(403).send({ message: 'Forbidden: Admin access required' });
    }

    next();
  } catch (error) {
    return res.status(500).send({ message: 'Error verifying admin status' });
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
  res.send('FoodieSpace server is running');
});

async function run() {
  try {
    // await client.connect();

    const database = client.db('foodieSpaceDB');
    const usersCollection = database.collection('users');
    const reviewsCollection = database.collection('reviews');

    // Make database available to middleware
    app.locals.database = database;

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
        // Set default role as 'user' if not provided
        if (!newUser.role) {
          newUser.role = 'user';
        }
        const result = await usersCollection.insertOne(newUser);
        res.send(result);
      }
    });

    //       Get user by email (for fetching role)
    app.get('/users/:email', verifyFireBaseToken, async (req, res) => {
      const email = req.params.email;

      // Users can only fetch their own data unless they're admin
      if (req.token_email !== email) {
        const requestingUser = await usersCollection.findOne({ email: req.token_email });
        if (!requestingUser || requestingUser.role !== 'admin') {
          return res.status(403).send({ message: 'Forbidden' });
        }
      }

      try {
        const user = await usersCollection.findOne({ email: email });
        if (!user) {
          return res.status(404).send({ message: 'User not found' });
        }
        res.send(user);
      } catch (error) {
        res.status(500).send({ message: 'Error fetching user' });
      }
    });

    //       Update user role (admin only)
    app.patch('/users/:email/role', verifyFireBaseToken, verifyAdmin, async (req, res) => {
      const email = req.params.email;
      const { role } = req.body;
      const adminEmail = req.token_email;

      if (!['user', 'admin'].includes(role)) {
        return res.status(400).send({ message: 'Invalid role. Must be user or admin' });
      }

      // Prevent admin from changing their own role
      if (email === adminEmail) {
        return res.status(403).send({ message: 'You cannot change your own role' });
      }

      try {
        // Check if this is the last admin being demoted
        const targetUser = await usersCollection.findOne({ email: email });
        if (!targetUser) {
          return res.status(404).send({ message: 'User not found' });
        }

        if (targetUser.role === 'admin' && role !== 'admin') {
          // Count total admins
          const adminCount = await usersCollection.countDocuments({ role: 'admin' });
          if (adminCount <= 1) {
            return res
              .status(403)
              .send({ message: 'Cannot demote the last admin. At least one admin must remain.' });
          }
        }

        const result = await usersCollection.updateOne(
          { email: email },
          { $set: { role: role, updatedAt: new Date() } }
        );

        res.send({
          message: 'User role updated successfully',
          modifiedCount: result.modifiedCount,
        });
      } catch (error) {
        res.status(500).send({ message: 'Error updating user role' });
      }
    });

    //       Update user profile (display name and photo URL)
    app.patch('/users/profile', verifyFireBaseToken, async (req, res) => {
      const userEmail = req.token_email;
      const { displayName, photoURL } = req.body;

      try {
        // Update Firebase Auth profile
        const userRecord = await admin.auth().getUserByEmail(userEmail);
        await admin.auth().updateUser(userRecord.uid, {
          displayName: displayName,
          photoURL: photoURL,
        });

        // Update MongoDB user record
        const result = await usersCollection.updateOne(
          { email: userEmail },
          {
            $set: {
              name: displayName,
              photoURL: photoURL,
              updatedAt: new Date(),
            },
          }
        );

        res.send({
          message: 'Profile updated successfully',
          modifiedCount: result.modifiedCount,
        });
      } catch (error) {
        console.error('Profile update error:', error);
        res.status(500).send({ message: 'Failed to update profile', error: error.message });
      }
    });

    //       Retrieve all users (Admin only)
    app.get('/users', verifyFireBaseToken, verifyAdmin, async (req, res) => {
      try {
        const cursor = usersCollection.find();
        const result = await cursor.toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: 'Error fetching users' });
      }
    });

    //       Delete user (Admin only)
    app.delete('/users/:id', verifyFireBaseToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const { ObjectId } = require('mongodb');

      try {
        const query = { _id: new ObjectId(id) };
        const user = await usersCollection.findOne(query);

        if (!user) {
          return res.status(404).send({ message: 'User not found' });
        }

        // Prevent admin from deleting themselves
        if (user.email === req.token_email) {
          return res.status(403).send({ message: 'You cannot delete your own account' });
        }

        // Delete from Firebase
        try {
          const userRecord = await admin.auth().getUserByEmail(user.email);
          await admin.auth().deleteUser(userRecord.uid);
          console.log(`Successfully deleted user from Firebase: ${user.email}`);
        } catch (firebaseError) {
          console.error('Error deleting user from Firebase:', firebaseError);
          // Continue to delete from MongoDB even if Firebase deletion fails (e.g., user not found in Firebase)
        }

        // Delete user's reviews
        const deleteReviewsResult = await reviewsCollection.deleteMany({ userEmail: user.email });
        console.log(`Deleted ${deleteReviewsResult.deletedCount} reviews for user ${user.email}`);

        // Delete from MongoDB
        const result = await usersCollection.deleteOne(query);
        
        // Return combined result
        res.send({ 
          ...result, 
          deletedReviews: deleteReviewsResult.deletedCount 
        });
      } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).send({ message: 'Error deleting user' });
      }
    });

    //Reviews Related APIs -----------------------------------

    //       Create
    app.post('/reviews', verifyFireBaseToken, async (req, res) => {
      const userEmail = req.token_email;
      const review = req.body;

      // Validate that submitted email matches token email
      if (review.userEmail !== userEmail) {
        return res.status(403).send({ message: 'Email mismatch with token' });
      }

      // Set status to pending by default
      review.status = 'pending';
      review.createdAt = new Date();

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

    //       Retrieve all reviews (only approved ones for public)
    app.get('/reviews', async (req, res) => {
      // Only show approved reviews to public
      const cursor = reviewsCollection.find({ status: 'approved' });
      const result = await cursor.toArray();
      console.log(result);

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
          status: 'approved', // Only search approved reviews
        });
        const result = await cursor.toArray();
        res.send(result);
      } catch (error) {
        res.status(400).send({ message: 'Search failed' });
      }
    });

    //       Get all pending reviews (Admin only)
    app.get('/reviews/pending', verifyFireBaseToken, verifyAdmin, async (req, res) => {
      try {
        const cursor = reviewsCollection.find({ status: 'pending' });
        const result = await cursor.toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: 'Error fetching pending reviews' });
      }
    });

    //       Get all reviews with any status (Admin only)
    app.get('/reviews/all', verifyFireBaseToken, verifyAdmin, async (req, res) => {
      try {
        const { status } = req.query;
        const filter = status ? { status } : {}; // Filter by status if provided
        const cursor = reviewsCollection.find(filter);
        const result = await cursor.toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: 'Error fetching all reviews' });
      }
    });

    //       Update review status (Admin only - approve/reject)
    app.patch('/reviews/:id/status', verifyFireBaseToken, verifyAdmin, async (req, res) => {
      const { id } = req.params;
      const { status } = req.body;
      const { ObjectId } = require('mongodb');

      if (!['approved', 'rejected', 'pending'].includes(status)) {
        return res
          .status(400)
          .send({ message: 'Invalid status. Must be approved, rejected, or pending' });
      }

      try {
        const result = await reviewsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status: status, updatedAt: new Date() } }
        );

        if (result.matchedCount === 0) {
          return res.status(404).send({ message: 'Review not found' });
        }

        res.send({ message: `Review ${status} successfully`, modifiedCount: result.modifiedCount });
      } catch (error) {
        res.status(400).send({ message: 'Invalid request' });
      }
    });

    //    Get single review by ID
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

    //       Delete review (by owner or admin)
    app.delete('/reviews/:id', verifyFireBaseToken, async (req, res) => {
      const { id } = req.params;
      const { ObjectId } = require('mongodb');
      const userEmail = req.token_email;

      try {
        const review = await reviewsCollection.findOne({ _id: new ObjectId(id) });

        if (!review) {
          return res.status(404).send({ message: 'Review not found' });
        }

        // Check if user is admin
        const user = await usersCollection.findOne({ email: userEmail });
        const isAdmin = user && user.role === 'admin';

        // Allow deletion if user is the owner OR if user is admin
        if (review.userEmail !== userEmail && !isAdmin) {
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
  } finally {
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`Smart server is running on port: ${port}`);
});
