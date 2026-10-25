import nodemailer from 'nodemailer';

class EmailService {
  constructor() {
    this.transporter = null;
    if (process.env.SMTP_EMAIL && process.env.SMTP_PASSWORD) {
      this.transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.SMTP_EMAIL,
          pass: process.env.SMTP_PASSWORD
        }
      });
    }
  }

  async sendOTP(email, otp) {
    console.log(`\n========================================`);
    console.log(`[DEADZONE AUTH] OTP for ${email}: ${otp}`);
    console.log(`========================================\n`);

    if (!this.transporter) return true;

    try {
      await this.transporter.sendMail({
        from: `"Deadzone Command" <${process.env.SMTP_EMAIL}>`,
        to: email,
        subject: 'Deadzone - Your 6-Digit Verification OTP',
        html: `
          <div style="font-family: monospace; background: #1a1818; color: #fff; padding: 24px; border-radius: 8px;">
            <h2 style="color: #ffaa44;">DEADZONE VERIFICATION</h2>
            <p>Use the following 6-digit OTP to verify your account:</p>
            <h1 style="letter-spacing: 6px; color: #33ff66;">${otp}</h1>
            <p style="color: #888;">This code expires in 10 minutes.</p>
          </div>
        `
      });
      return true;
    } catch (err) {
      console.error('[EmailService] Failed to send email, use console OTP above:', err.message);
      return false;
    }
  }
}

export const emailService = new EmailService();