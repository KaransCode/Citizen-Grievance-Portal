export function notFound(req, res, next) {
  if (req.path.startsWith('/api/')) return res.status(404).json({ message: 'API endpoint not found.' });
  next();
}

export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  let status = error.status || error.statusCode || 500;
  // Map common database and upload errors to safe client responses.
  if (error.code === '22P02') status = 400;          // invalid text representation, e.g. malformed UUID
  if (error.code === '23505') status = 409;          // unique constraint
  if (error.code === '23503' || error.code === '23514') status = 400; // FK/check constraint
  if (String(error.code || '').startsWith('LIMIT_FILE')) status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
  if (status >= 500) console.error(error);
  let message = error.message || 'Request failed.';
  if (status >= 500) message = 'An unexpected server error occurred.';
  else if ([400,409].includes(status) && error.code) message = status === 409 ? 'A record with these details already exists.' : 'The submitted value is invalid.';
  res.status(status).json({
    message,
    ...(process.env.NODE_ENV !== 'production' && status >= 500 ? { detail: error.message } : {})
  });
}
