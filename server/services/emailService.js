// Email service for OTP delivery via Nodemailer
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

/**
 * Send a 6-digit OTP to the user's email
 * @param {string} email - recipient email address
 * @param {string} otp - 6-digit OTP code
 */
async function sendOTP(email, otp) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    throw new Error('SMTP credentials not configured, skipped live email delivery.');
  }

  const mailOptions = {
    from: `"Crowwws" <${process.env.SMTP_USER}>`,
    to: email,
    subject: 'Your Verification Code',
    html: `
      <div style="font-family: 'Inter', sans-serif; max-width: 400px; margin: 0 auto; padding: 32px; background: #0a0a0a; color: #ffffff; border-radius: 12px;">
        <h2 style="color: #00ff88; margin-bottom: 8px;">Crowwws</h2>
        <p style="color: #aaa; margin-bottom: 24px;">Your verification code is:</p>
        <div style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #00ff88; text-align: center; padding: 16px; background: #111; border-radius: 8px; margin-bottom: 24px;">
          ${otp}
        </div>
        <p style="color: #666; font-size: 12px;">This code expires in 10 minutes. If you didn't request this, ignore this email.</p>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
}

module.exports = { sendOTP };
