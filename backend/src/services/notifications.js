import nodemailer from 'nodemailer';
import twilio from 'twilio';
import { query } from '../utils/db.js';

let mailer;
function getMailer() {
  if (mailer) return mailer;
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) return null;
  mailer = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE).toLowerCase() === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
  return mailer;
}

export async function createInAppNotification({ userId, complaintId = null, eventType, title, message }) {
  if (!userId) return null;
  const result = await query(
    `INSERT INTO notifications(user_id, complaint_id, channel, event_type, title, message, delivery_status)
     VALUES ($1,$2,'IN_APP',$3,$4,$5,'SENT') RETURNING *`,
    [userId, complaintId, eventType, title, message]
  );
  // External channels are optional. In-app delivery succeeds independently of provider health.
  if (process.env.SMTP_HOST) {
    try {
      const userResult = await query('SELECT email FROM users WHERE id=$1', [userId]);
      if (userResult.rows[0]?.email) {
        const sent = await sendEmail(userResult.rows[0].email, title, message);
        await logExternalNotification({ userId, complaintId, channel: 'EMAIL', eventType, title, message, sent });
      }
    } catch (error) {
      console.error('Email notification failed:', error.message);
      await logExternalNotification({ userId, complaintId, channel: 'EMAIL', eventType, title, message, sent: { sent: false } }).catch(() => {});
    }
  }
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER) {
    try {
      const userResult = await query('SELECT phone,sms_opt_in FROM users WHERE id=$1', [userId]);
      if (userResult.rows[0]?.phone && userResult.rows[0]?.sms_opt_in) {
        const sent = await sendSms(userResult.rows[0].phone, `${title}: ${message}`);
        await logExternalNotification({ userId, complaintId, channel: 'SMS', eventType, title, message, sent });
      }
    } catch (error) {
      console.error('SMS notification failed:', error.message);
      await logExternalNotification({ userId, complaintId, channel: 'SMS', eventType, title, message, sent: { sent: false } }).catch(() => {});
    }
  }
  return result.rows[0];
}

export async function sendEmail(to, subject, text) {
  const transport = getMailer();
  if (!transport || !to) return { sent: false, reason: 'SMTP not configured' };
  await transport.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to, subject, text });
  return { sent: true };
}

export async function sendSms(to, body) {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER } = process.env;
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM_NUMBER || !to) {
    return { sent: false, reason: 'Twilio is not configured' };
  }
  const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  const message = await client.messages.create({ from: TWILIO_FROM_NUMBER, to, body });
  return { sent: true, providerRef: message.sid };
}

export async function logExternalNotification({ userId, complaintId = null, channel, eventType, title, message, sent }) {
  return query(
    `INSERT INTO notifications(user_id, complaint_id, channel, event_type, title, message, delivery_status, sent_at, provider_ref)
     VALUES ($1,$2,$3,$4,$5,$6,$7,CASE WHEN $7='SENT' THEN NOW() ELSE NULL END,$8) RETURNING *`,
    [userId, complaintId, channel, eventType, title, message, sent?.sent ? 'SENT' : 'FAILED', sent?.providerRef || null]
  );
}
