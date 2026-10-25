import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { User } from '../../models/User.js';
import { emailService } from '../../services/emailService.js';

const JWT_SECRET = process.env.JWT_SECRET || 'deadzone_super_secret_jwt_key_2026';
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const signUserToken = (user) => {
  return jwt.sign(
    { id: user._id.toString(), username: user.username, email: user.email },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
};

// Step 1: Register / Request OTP
export const requestAuthOTP = async (req, res, next) => {
  try {
    const { username, email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    let user = await User.findOne({ email: normalizedEmail });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

    if (!user) {
      if (!username) {
        return res.status(400).json({ error: 'Username is required for new accounts' });
      }
      const passwordHash = await bcrypt.hash(password, 10);
      user = await User.create({
        username: username.trim(),
        email: normalizedEmail,
        passwordHash,
        isVerified: false,
        otpCode: otp,
        otpExpiresAt
      });
    } else {
      const validPass = user.passwordHash ? await bcrypt.compare(password, user.passwordHash) : false;
      if (!validPass) {
        return res.status(401).json({ error: 'Invalid password for existing account' });
      }
      if (username) user.username = username.trim();
      user.otpCode = otp;
      user.otpExpiresAt = otpExpiresAt;
      await user.save();
    }

    await emailService.sendOTP(normalizedEmail, otp);
    res.status(200).json({
      success: true,
      message: 'OTP sent to your email (also printed in server console for LAN testing)'
    });
  } catch (err) {
    next(err);
  }
};

// Step 2: Verify OTP & Issue JWT
export const verifyAuthOTP = async (req, res, next) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ error: 'Email and OTP are required' });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user || !user.otpCode) {
      return res.status(400).json({ error: 'Account or OTP request not found' });
    }

    if (user.otpCode !== otp.trim() || new Date() > new Date(user.otpExpiresAt)) {
      return res.status(401).json({ error: 'Invalid or expired OTP' });
    }

    user.isVerified = true;
    user.otpCode = null;
    user.otpExpiresAt = null;
    await user.save();

    const token = signUserToken(user);
    res.status(200).json({
      success: true,
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        preferredCharacter: user.preferredCharacter
      }
    });
  } catch (err) {
    next(err);
  }
};

// Option B: Google OAuth Login
// Replace googleAuthLogin in backend/src/api/controllers/authController.js:
export const googleAuthLogin = async (req, res, next) => {
  try {
    const { accessToken, credential } = req.body;
    let payloadEmail = null;
    let payloadName = null;
    let payloadSub = null;
    let payloadPicture = null;

    if (accessToken) {
      // Verify the OAuth2 access_token from the Google Account Chooser popup directly with Google
      const googleRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      if (!googleRes.ok) {
        return res.status(401).json({ error: 'Invalid Google OAuth access token' });
      }

      const profile = await googleRes.json();
      payloadEmail = profile.email;
      payloadName = profile.name || profile.given_name || profile.email.split('@')[0];
      payloadSub = profile.sub;
      payloadPicture = profile.picture;
    } else if (credential && process.env.GOOGLE_CLIENT_ID) {
      // Fallback if an ID token credential is used
      const ticket = await googleClient.verifyIdToken({
        idToken: credential,
        audience: process.env.GOOGLE_CLIENT_ID
      });
      const payload = ticket.getPayload();
      payloadEmail = payload.email;
      payloadName = payload.name || payload.email.split('@')[0];
      payloadSub = payload.sub;
      payloadPicture = payload.picture;
    } else {
      return res.status(400).json({ error: 'Missing Google OAuth token' });
    }

    if (!payloadEmail) {
      return res.status(400).json({ error: 'Could not retrieve email from Google account' });
    }

    let user = await User.findOne({ email: payloadEmail.toLowerCase() });
    if (!user) {
      user = await User.create({
        username: payloadName,
        email: payloadEmail.toLowerCase(),
        googleId: payloadSub,
        isVerified: true
      });
    } else if (!user.googleId) {
      user.googleId = payloadSub;
      user.isVerified = true;
      await user.save();
    }

    const token = signUserToken(user);
    res.status(200).json({
      success: true,
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        picture: payloadPicture,
        preferredCharacter: user.preferredCharacter
      }
    });
  } catch (err) {
    next(err);
  }
};

export const getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select('-passwordHash -otpCode');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.status(200).json({ user });
  } catch (err) {
    next(err);
  }
};