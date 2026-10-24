import express from 'express';
import cors from 'cors';
import configRoutes from './src/api/routes/configRoutes.js';
import { errorHandler } from './src/api/middlewares/errorHandler.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Global Middlewares
app.use(cors());
app.use(express.json());

// Mount API Routes from src/api/routes
app.use('/api', configRoutes);

// Global Error Handler
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`[Deadzone Backend] Listening on http://localhost:${PORT}`);
});