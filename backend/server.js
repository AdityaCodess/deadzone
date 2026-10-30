import http from 'http';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Server, matchMaker } from 'colyseus';
import configRoutes from './src/api/routes/configRoutes.js';
import authRoutes from './src/api/routes/authRoutes.js';
import { errorHandler } from './src/api/middlewares/errorHandler.js';
import { DeadzoneRoom } from './src/network/DeadzoneRoom.js';

dotenv.config();
dotenv.config({ path: './src/.env' });

const app = express();
const httpServer = http.createServer(app);
const PORT = process.env.PORT || 3001;

// 1. Strict CORS for LAN and WebSockets
app.use(cors({
  origin: true, 
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
}));

// We absolutely need this to read the incoming character & guestName payloads
app.use(express.json()); 

// 2. THE LOOP FIX: Correct Matchmaking API Methods
app.post('/matchmake/create/:roomName', async (req, res) => {
  try {
    // The frontend calls "create", but the backend API specifically requires 
    // creating the room FIRST, and then explicitly reserving a seat.
    const room = await matchMaker.createRoom(req.params.roomName, req.body || {});
    const reservation = await matchMaker.reserveSeatFor(room, req.body || {});
    res.json(reservation);
  } catch (e) {
    console.error("[MatchMake Create Error]:", e.message);
    res.status(400).json({ error: e.message });
  }
});

app.post('/matchmake/joinOrCreate/:roomName', async (req, res) => {
  try {
    const reservation = await matchMaker.joinOrCreate(req.params.roomName, req.body || {});
    res.json(reservation);
  } catch (e) {
    console.error("[MatchMake JoinOrCreate Error]:", e.message);
    res.status(400).json({ error: e.message });
  }
});

app.post('/matchmake/joinById/:roomId', async (req, res) => {
  try {
    const reservation = await matchMaker.joinById(req.params.roomId, req.body || {});
    res.json(reservation);
  } catch (e) {
    console.error("[MatchMake JoinById Error]:", e.message);
    res.status(400).json({ error: e.message });
  }
});

// 3. Connect to MongoDB Atlas
if (process.env.MONGO_URI) {
  mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('[MongoDB Atlas] Connected successfully'))
    .catch((err) => console.error('[MongoDB Atlas] Connection error:', err.message));
}

// 4. Mount API Routes
app.use('/api/auth', authRoutes);
app.use('/api', configRoutes);
app.use(errorHandler);

// 5. Initialize Colyseus Game Server
const gameServer = new Server({
  server: httpServer
});

// Register the Room
gameServer.define("deadzone", DeadzoneRoom);

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`[Deadzone Colyseus Server] Listening on http://0.0.0.0:${PORT}`);
});