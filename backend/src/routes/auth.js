import { Router } from 'express';
import { randomBytes, createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { query, pool } from '../utils/db.js';
import { requireAuth } from '../middleware/auth.js';
import { writeAudit } from '../utils/audit.js';
import { sendEmail } from '../services/notifications.js';

const router = Router();
const sessionMs = 8 * 60 * 60 * 1000;
const cookieBase = { path: '/', sameSite: 'lax', secure: process.env.COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production' };

function issueSession(res, user) {
  const token = jwt.sign(
    { sub: user.id, role: user.role },
    process.env.JWT_SECRET,
    { algorithm: 'HS256', expiresIn: process.env.JWT_EXPIRES_IN || '8h', issuer: 'citizen-grievance-portal', audience: 'cgrp-web' }
  );
  res.cookie('access_token', token, { ...cookieBase, httpOnly: true, maxAge: sessionMs });
}

const emailSchema = z.string().trim().email().max(254).transform((v) => v.toLowerCase());
const registerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: emailSchema,
  password: z.string().min(10).max(128),
  phone: z.string().trim().max(25).optional().or(z.literal('')),
  smsOptIn: z.boolean().optional().default(false)
});

router.get('/csrf', (req, res) => {
  const token = randomBytes(32).toString('hex');
  res.cookie('csrf_token', token, { ...cookieBase, httpOnly: false, maxAge: sessionMs });
  res.json({ csrfToken: token });
});

router.post('/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message || 'Please check the registration fields.' });
  const { name, email, password, phone, smsOptIn } = parsed.data;
  const existing = await query('SELECT id FROM users WHERE LOWER(email) = $1', [email]);
  if (existing.rowCount) return res.status(409).json({ message: 'An account with this email already exists.' });

  const passwordHash = await bcrypt.hash(password, 12);
  const result = await query(
    `INSERT INTO users(name, email, password_hash, phone, sms_opt_in, role)
     VALUES ($1,$2,$3,$4,$5,'CITIZEN')
     RETURNING id, name, email, role, phone, department_id, created_at`,
    [name, email, passwordHash, phone || null, Boolean(smsOptIn && phone)]
  );
  const user = result.rows[0];
  issueSession(res, user);
  await writeAudit({ actorId: user.id, action: 'USER_REGISTERED', entityType: 'USER', entityId: user.id, req });
  res.status(201).json({ message: 'Your account has been created.', user });
});

router.post('/login', async (req, res) => {
  const parsed = z.object({ email: emailSchema, password: z.string().min(1).max(128) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Enter a valid email and password.' });
  const { email, password } = parsed.data;
  const result = await query(
    `SELECT id, name, email, password_hash, role, phone, sms_opt_in, department_id, is_active
     FROM users WHERE LOWER(email) = $1`, [email]
  );
  const user = result.rows[0];
  if (!user || !user.is_active || !(await bcrypt.compare(password, user.password_hash))) {
    await writeAudit({ action: 'LOGIN_FAILED', entityType: 'AUTH', req, metadata: { email } });
    return res.status(401).json({ message: 'Email or password is incorrect.' });
  }
  issueSession(res, user);
  await writeAudit({ actorId: user.id, action: 'LOGIN_SUCCEEDED', entityType: 'AUTH', entityId: user.id, req });
  delete user.password_hash;
  delete user.is_active;
  res.json({ message: 'Signed in successfully.', user });
});

router.post('/logout', async (req, res) => {
  const id = req.user?.id || null;
  res.clearCookie('access_token', { ...cookieBase, httpOnly: true });
  res.clearCookie('csrf_token', { ...cookieBase, httpOnly: false });
  if (id) await writeAudit({ actorId: id, action: 'LOGOUT', entityType: 'AUTH', entityId: id, req });
  res.json({ message: 'You have been signed out.' });
});

router.get('/me', requireAuth, async (req, res) => {
  const result = await query(
    `SELECT u.id,u.name,u.email,u.role,u.phone,u.sms_opt_in,u.department_id,d.name AS department_name,u.created_at
     FROM users u LEFT JOIN departments d ON d.id=u.department_id WHERE u.id=$1`, [req.user.id]
  );
  res.json({ user: result.rows[0] });
});

router.post('/forgot-password', async (req, res) => {
  const parsed = z.object({ email: emailSchema }).safeParse(req.body);
  if (!parsed.success) return res.status(200).json({ message: 'If the account exists, password reset instructions will be sent.' });
  const userResult = await query('SELECT id, email, name FROM users WHERE LOWER(email)=$1 AND is_active=TRUE', [parsed.data.email]);
  // Always use a generic public message to avoid account enumeration.
  if (userResult.rowCount) {
    const user = userResult.rows[0];
    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    await query('DELETE FROM password_reset_tokens WHERE user_id=$1 OR expires_at < NOW()', [user.id]);
    await query('INSERT INTO password_reset_tokens(user_id,token_hash,expires_at) VALUES ($1,$2,NOW() + INTERVAL \'30 minutes\')', [user.id, tokenHash]);
    const baseUrl = process.env.PUBLIC_APP_URL || 'http://localhost:5173';
    const resetUrl = `${baseUrl}/reset-password?token=${encodeURIComponent(rawToken)}`;
    const mailResult = await sendEmail(user.email, 'Reset your CivicConnect password', `Hello ${user.name},\n\nUse this link within 30 minutes to reset your password:\n${resetUrl}\n\nIf you did not request this, you can ignore this email.`);
    if (!mailResult.sent && process.env.NODE_ENV !== 'production') {
      return res.json({ message: 'Development reset token generated (email provider is not configured).', devResetToken: rawToken, devResetUrl: resetUrl });
    }
  }
  res.json({ message: 'If the account exists, password reset instructions will be sent.' });
});

router.post('/reset-password', async (req, res) => {
  const parsed = z.object({ token: z.string().min(40).max(200), password: z.string().min(10).max(128) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'The reset token or new password is invalid.' });
  const tokenHash = createHash('sha256').update(parsed.data.token).digest('hex');
  const tokenResult = await query(
    'SELECT id,user_id FROM password_reset_tokens WHERE token_hash=$1 AND used_at IS NULL AND expires_at > NOW()', [tokenHash]
  );
  if (!tokenResult.rowCount) return res.status(400).json({ message: 'This reset link is invalid or has expired.' });
  const token = tokenResult.rows[0];
  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE users SET password_hash=$1,updated_at=NOW() WHERE id=$2', [passwordHash, token.user_id]);
    await client.query('UPDATE password_reset_tokens SET used_at=NOW() WHERE user_id=$1 AND used_at IS NULL', [token.user_id]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
  await writeAudit({ actorId: token.user_id, action: 'PASSWORD_RESET', entityType: 'USER', entityId: token.user_id, req });
  res.json({ message: 'Password updated. You can now sign in.' });
});

export default router;
