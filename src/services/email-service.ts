import nodemailer from 'nodemailer';
import { getEnv } from '../config/env.js';
import { logger } from '../lib/logger.js';

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (transporter) return transporter;

  const env = getEnv();
  const smtpHost = env.SMTP_HOST;
  const smtpPort = env.SMTP_PORT;
  const smtpUser = env.SMTP_USER;
  const smtpPass = env.SMTP_PASS;

  if (!smtpHost || !smtpUser) {
    logger.warn('[Email] SMTP not configured — emails will be logged only');
    // Fallback: log emails instead of sending
    transporter = nodemailer.createTransport({ jsonTransport: true });
    return transporter;
  }

  transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: { user: smtpUser, pass: smtpPass },
  });

  return transporter;
}

const FROM_ADDRESS = () => {
  try { return getEnv().SMTP_FROM || 'noreply@chronizer.com'; } catch { return 'noreply@chronizer.com'; }
};

export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  try {
    const transport = getTransporter();
    const info = await transport.sendMail({
      from: FROM_ADDRESS(),
      to,
      subject,
      html,
    });

    // If using jsonTransport (no SMTP configured), log the email
    if (info.message) {
      const parsed = JSON.parse(info.message);
      logger.info(`[Email] (logged, not sent) To: ${parsed.to}, Subject: ${parsed.subject}`);
    } else {
      logger.info(`[Email] Sent to ${to}: ${subject}`);
    }
    return true;
  } catch (err: any) {
    logger.error(`[Email] Failed to send to ${to}: ${err.message}`);
    return false;
  }
}

export async function sendPasswordResetEmail(email: string, resetToken: string, brandName: string): Promise<boolean> {
  let frontendUrl: string;
  try { frontendUrl = getEnv().FRONTEND_URL; } catch { frontendUrl = 'http://localhost:3001'; }
  const resetLink = `${frontendUrl}/reset-password?token=${resetToken}`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #3b82f6;">Password Reset — ${brandName || 'Chronizer'}</h2>
      <p>You requested a password reset. Click the link below to set a new password:</p>
      <a href="${resetLink}" style="display: inline-block; padding: 12px 24px; background: #3b82f6; color: white; text-decoration: none; border-radius: 6px; margin: 16px 0;">
        Reset Password
      </a>
      <p style="color: #666; font-size: 14px;">This link expires in 1 hour. If you didn't request this, ignore this email.</p>
      <p style="color: #999; font-size: 12px;">Reset link: ${resetLink}</p>
    </div>
  `;

  return sendEmail(email, `Password Reset — ${brandName || 'Chronizer'}`, html);
}

export async function sendTeamInviteEmail(email: string, inviterName: string, brandName: string, role: string, inviteToken: string): Promise<boolean> {
  let frontendUrl: string;
  try { frontendUrl = getEnv().FRONTEND_URL; } catch { frontendUrl = 'http://localhost:3001'; }
  const inviteLink = `${frontendUrl}/join-team?token=${inviteToken}`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #3b82f6;">Team Invitation — ${brandName}</h2>
      <p><strong>${inviterName}</strong> has invited you to join <strong>${brandName}</strong> as a <strong>${role}</strong>.</p>
      <a href="${inviteLink}" style="display: inline-block; padding: 12px 24px; background: #3b82f6; color: white; text-decoration: none; border-radius: 6px; margin: 16px 0;">
        Accept Invitation
      </a>
      <p style="color: #666; font-size: 14px;">This invitation expires in 7 days.</p>
    </div>
  `;

  return sendEmail(email, `You're invited to ${brandName}`, html);
}

export async function sendNotificationEmail(email: string, title: string, message: string, brandName: string): Promise<boolean> {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #3b82f6;">${title}</h2>
      <p><strong>Brand:</strong> ${brandName}</p>
      <div style="background: #f8fafc; padding: 16px; border-radius: 8px; margin: 16px 0;">
        ${message}
      </div>
      <p style="color: #999; font-size: 12px;">Sent by Chronizer Notification System</p>
    </div>
  `;

  return sendEmail(email, `[${brandName}] ${title}`, html);
}

export async function sendReportEmail(email: string, brandName: string, reportName: string, attachment: Buffer, filename: string): Promise<boolean> {
  try {
    const transport = getTransporter();
    await transport.sendMail({
      from: FROM_ADDRESS(),
      to: email,
      subject: `[${brandName}] Report: ${reportName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #3b82f6;">Scheduled Report — ${brandName}</h2>
          <p>Your report <strong>${reportName}</strong> is attached.</p>
          <p style="color: #999; font-size: 12px;">Generated by Chronizer</p>
        </div>
      `,
      attachments: [{ filename, content: attachment }],
    });
    logger.info(`[Email] Report sent to ${email}: ${reportName}`);
    return true;
  } catch (err: any) {
    logger.error(`[Email] Failed to send report to ${email}: ${err.message}`);
    return false;
  }
}
