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

app.use(express.json()); 

// 2. THE LOOP FIX: v0.18 Compatible Matchmaking Router
app.post('/matchmake/:method/:roomName', async (req, res) => {
  try {
    const { method, roomName } = req.params;
    console.log(`[MatchMake] Frontend requested ${method} for room: ${roomName}`);
    
    const targetRoom = "deadzone"; 
    
    let room;
    if (method === 'joinById') {
      room = await matchMaker.getRoomById(roomName);
    } else {
      room = await matchMaker.createRoom(targetRoom, req.body || {});
    }

    // 1. Get the FULL, unmodified reservation object (contains hidden security tokens!)
    const reservation = await matchMaker.reserveSeatFor(room, req.body || {});
    
    // 2. Safely patch ONLY the name property to prevent the frontend alert box crash
    if (reservation.room) {
      reservation.room.name = targetRoom;
    }
    
    console.log(`[MatchMake] Success! Sending v0.18 payload to frontend.`);
    
    // 3. Send the ENTIRE object, keeping all Colyseus internal tokens intact!
    return res.json(reservation);

  } catch (e) {
    console.error(`[MatchMake FATAL ERROR]:`, e.stack);
    return res.status(500).json({ 
      error: "Backend failed to create room. Check the Node terminal." 
    });
  }
});

app.post('/matchmake/joinOrCreate/:roomName', async (req, res) => {
  try {
    const reservation = await matchMaker.joinOrCreate(req.params.roomName, req.body || {});
    
    res.json({
      room: {
        roomId: reservation.room?.roomId || "",
        name: req.params.roomName,
        processId: reservation.room?.processId || ""
      },
      sessionId: reservation.sessionId
    });
  } catch (e) {
    console.error("[MatchMake JoinOrCreate Error]:", e.message);
    res.status(400).json({ error: e.message });
  }
});

app.post('/matchmake/joinById/:roomId', async (req, res) => {
  try {
    const reservation = await matchMaker.joinById(req.params.roomId, req.body || {});
    
    res.json({
      room: {
        roomId: reservation.room?.roomId || req.params.roomId,
        name: "deadzone", 
        processId: reservation.room?.processId || ""
      },
      sessionId: reservation.sessionId
    });
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