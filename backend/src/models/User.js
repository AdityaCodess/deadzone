import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, default: null },
  googleId: { type: String, default: null },
  isVerified: { type: Boolean, default: false },
  otpCode: { type: String, default: null },
  otpExpiresAt: { type: Date, default: null },
  preferredCharacter: { type: String, default: 'Matt' }
}, { timestamps: true });

export const User = mongoose.model('User', userSchema);