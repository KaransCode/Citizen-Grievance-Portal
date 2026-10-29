import jwt from 'jsonwebtoken';
import { query } from '../utils/db.js';

export async function requireAuth(req, res, next) {
  try {
    const token = req.cookies?.access_token || req.get('authorization')?.replace(/^Bearer\s+/i, '');
    if (!token) return res.status(401).json({ message: 'Please sign in to continue.' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'], issuer: 'citizen-grievance-portal', audience: 'cgrp-web' });
    const result = await query(
      `SELECT id, name, email, role, phone, department_id, is_active
       FROM users WHERE id = $1`, [decoded.sub]
    );
    if (!result.rowCount || !result.rows[0].is_active) {
      return res.status(401).json({ message: 'Your account is inactive or no longer exists.' });
    }
    req.user = result.rows[0];
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Your session is invalid or expired. Please sign in again.' });
    }
    next(error);
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'You do not have permission to perform this action.' });
    }
    next();
  };
}

export function csrfProtection(req, res, next) {
  const unsafe = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
  // Bearer clients do not send ambient cookies. For browser cookie sessions, require double-submit CSRF.
  const hasCookieSession = Boolean(req.cookies?.access_token);
  if (!unsafe || !hasCookieSession) return next();
  const cookieToken = req.cookies?.csrf_token;
  const headerToken = req.get('x-csrf-token');
  if (!cookieToken || !headerToken || cookieToken.length !== headerToken.length) {
    return res.status(403).json({ message: 'CSRF token missing or invalid. Refresh the page and try again.' });
  }
  let same = true;
  for (let i = 0; i < cookieToken.length; i++) same = same && cookieToken.charCodeAt(i) === headerToken.charCodeAt(i);
  if (!same) return res.status(403).json({ message: 'CSRF token missing or invalid. Refresh the page and try again.' });
  next();
}
