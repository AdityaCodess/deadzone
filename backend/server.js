import http from 'http';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import configRoutes from './src/api/routes/configRoutes.js';
import authRoutes from './src/api/routes/authRoutes.js';
import { errorHandler } from './src/api/middlewares/errorHandler.js';
import { SocketServer } from './src/network/SocketServer.js';

dotenv.config();
dotenv.config({ path: './src/.env' });

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Connect to MongoDB Atlas
if (process.env.MONGO_URI) {
  mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('[MongoDB Atlas] Connected successfully'))
    .catch((err) => console.error('[MongoDB Atlas] Connection error:', err.message));
} else {
  console.warn('[MongoDB Atlas] MONGO_URI not set in .env! Auth endpoints require MongoDB.');
}

// Mount Routes
app.use('/api/auth', authRoutes);
app.use('/api', configRoutes);
app.use(errorHandler);

// Initialize Multiplayer Socket.io Server
new SocketServer(server);

// Listen on 0.0.0.0 so LAN / Port-Sharing friends can connect
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[Deadzone Server + Socket.io] Listening on http://0.0.0.0:${PORT}`);
});