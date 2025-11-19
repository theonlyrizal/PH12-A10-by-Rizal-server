# FoodieSpace — Server (API)

This repository contains the Express/MongoDB server for FoodieSpace — the backend API powering the Local Food Lovers Network application.

## Summary

- Express.js API with MongoDB as the data store.
- Firebase Admin SDK for server-side token verification and secure protected routes.
- Provides endpoints for user management, reviews CRUD, favorites toggling, and search.

## Live API URL

Add your deployed server URL here (example):

https://YOUR_SERVER_URL_HERE

## Quick Links

- Service account JSON: `foodiespace-firebase-adminsdk.json`
- Main server file: `index.js`

## Requirements

- Node.js v16+
- A MongoDB connection string (Atlas recommended)
- Firebase project with a service account JSON (placed at root or provided via env)

## Environment Variables

Create a `.env` file in this folder (do NOT commit credentials).

Required variables (examples):

- `DB_USER` — MongoDB username
- `DB_PASS` — MongoDB password
- `PORT` — (optional) server port, default 5050

## Server Endpoints (summary)

All endpoints return JSON. Protected endpoints require an Authorization header: `Authorization: Bearer <firebase-id-token>`.

- `POST /users` — Create/save user record (checks duplicate by email)
- `GET /users` — Retrieve all users

- `POST /reviews` — Create a review (PROTECTED) — server validates token and ensures `review.userEmail === tokenEmail`
- `GET /reviews` — Retrieve all reviews
- `GET /reviews/search?q=...` — Search reviews by `foodName` (MongoDB `$regex`, case-insensitive)
- `GET /reviews/my-reviews` — (PROTECTED) Retrieve reviews for authenticated user
- `GET /reviews/:id` — Get single review by ObjectId
- `PUT /reviews/:id` — (PROTECTED) Update a review (owner only)
- `DELETE /reviews/:id` — (PROTECTED) Delete a review (owner only)
- `PATCH /reviews/:id/favorite` — (PROTECTED) Toggle favorite for the authenticated user (uses `$push` / `$pull` on `isFavoriteBy` array)

## Security & Auth

- Authentication is handled by Firebase on the client. The client sends a Firebase ID token in the `Authorization` header.
- The server uses the Firebase Admin SDK (`admin.auth().verifyIdToken(token)`) to verify tokens in `verifyFireBaseToken` middleware and extracts the user email as `req.token_email`.
- Protected routes use `verifyFireBaseToken` to ensure only authenticated users can perform certain actions and to enforce ownership checks on updates/deletes.

## Database

- Database: `foodieSpaceDB` (configured inside `index.js`)
- Collections used: `users`, `reviews`
- Favorites are stored on review documents as an array `isFavoriteBy` containing user emails.

## Development / Run Locally

1. Install dependencies

```powershell
cd PH12-A10-by-Rizal-server
npm install
```

2. Create `.env` with credentials (DB_USER, DB_PASS, PORT optional)

3. Place your Firebase service account JSON file at the project root (or provide credentials via environment/secret manager). The repository includes `foodiespace-firebase-adminsdk.json` for local testing — do NOT publish this file to a public repo.

4. Start server

```powershell
node index.js
# or, if you use nodemon:
npx nodemon index.js
```

5. Server listens on `process.env.PORT || 5050` by default.

## Deployment Notes

- Vercel can be used to deploy the server (serverless functions). The repository includes a `vercel.json` sample and a `.vercel` folder (optional).
- When deploying, set environment variables in the hosting platform (DB credentials, any secrets), and secure the Firebase service account credentials (do not commit them in public repositories).
- Add the deployed client domain to Firebase Authorized Domains to permit authentication flows.

## Testing the API

- Use Postman or curl to test endpoints. For protected endpoints, obtain an ID token from the client (Firebase `user.getIdToken()`) and add header:

```
Authorization: Bearer <ID_TOKEN>
```

Example: search reviews

```powershell
curl "https://YOUR_SERVER_URL_HERE/reviews/search?q=biryani"
```

## Contributing

- Keep secrets out of the repo.
- Add meaningful commits and clear messages. For the assignment, please ensure at least 8 notable commits on the server side.

## Contact / Notes

If you need help configuring Firebase, MongoDB Atlas, or deployment, I can add detailed steps for each provider.

## License

This project is provided for educational purposes and assignment submission.
