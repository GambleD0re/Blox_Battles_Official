const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT || '587', 10),
    secure: parseInt(process.env.EMAIL_PORT || '587', 10) === 465, // true for 465, false for other ports
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

const emailFrom = process.env.EMAIL_FROM || '"Blox Battles" <noreply@bloxbattles.com>';
const frontendUrl = process.env.SERVER_URL || 'http://localhost:3000';

const sendVerificationEmail = async (to, token) => {
    const verificationLink = `${frontendUrl}/verify-email?token=${token}`;
    const mailOptions = {
        from: emailFrom,
        to: to,
        subject: 'Verify Your Blox Battles Account',
        html: `
            <div style="font-family: sans-serif; text-align: center; padding: 20px; background-color: #f4f4f4;">
                <div style="max-width: 600px; margin: auto; background: white; padding: 20px; border-radius: 8px;">
                    <h1 style="color: #333;">Welcome to Blox Battles!</h1>
                    <p style="font-size: 16px; color: #555;">Please click the button below to verify your email address and activate your account.</p>
                    <a href="${verificationLink}" style="display: inline-block; padding: 12px 24px; margin: 20px 0; font-size: 16px; color: white; background-color: #28a745; text-decoration: none; border-radius: 5px;">Verify Account</a>
                    <p style="font-size: 14px; color: #777;">If you did not create an account, please ignore this email.</p>
                </div>
            </div>
        `,
    };

    await transporter.sendMail(mailOptions);
};

const sendPasswordResetEmail = async (to, token) => {
    const resetLink = `${frontendUrl}/reset-password?token=${token}`;
    const mailOptions = {
        from: emailFrom,
        to: to,
        subject: 'Blox Battles Password Reset Request',
        html: `
            <div style="font-family: sans-serif; text-align: center; padding: 20px; background-color: #f4f4f4;">
                <div style="max-width: 600px; margin: auto; background: white; padding: 20px; border-radius: 8px;">
                    <h1 style="color: #333;">Password Reset</h1>
                    <p style="font-size: 16px; color: #555;">You are receiving this email because a password reset was requested for your account. Please click the button below to set a new password.</p>
                    <a href="${resetLink}" style="display: inline-block; padding: 12px 24px; margin: 20px 0; font-size: 16px; color: white; background-color: #007bff; text-decoration: none; border-radius: 5px;">Reset Password</a>
                    <p style="font-size: 14px; color: #777;">This link is valid for 1 hour. If you did not request a password reset, you can safely ignore this email.</p>
                </div>
            </div>
        `,
    };

    await transporter.sendMail(mailOptions);
};

module.exports = {
    sendVerificationEmail,
    sendPasswordResetEmail,
};
