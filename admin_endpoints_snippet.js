// Admin review endpoints - Add these to your index.js after the search endpoint

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
    return res.status(400).send({ message: 'Invalid status. Must be approved, rejected, or pending' });
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
