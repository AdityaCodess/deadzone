import { Router } from 'express';
import {
  requestAuthOTP,
  verifyAuthOTP,
  googleAuthLogin,
  getMe
} from '../controllers/authController.js';
import { verifyToken } from '../middlewares/authMiddleware.js';

const router = Router();

router.post('/request-otp', requestAuthOTP);
router.post('/verify-otp', verifyAuthOTP);
router.post('/google', googleAuthLogin);
router.get('/me', verifyToken, getMe);

export default router;