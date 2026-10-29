import { Router } from 'express';
import { query } from '../utils/db.js';
import { requireAuth } from '../middleware/auth.js';
const router = Router();
router.use(requireAuth);
router.get('/', async (req, res) => {
  const result = await query('SELECT id,complaint_id,channel,event_type,title,message,delivery_status,read_at,created_at FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100', [req.user.id]);
  res.json({ data: result.rows, unread: result.rows.filter((item) => !item.read_at).length });
});
router.patch('/:id/read', async (req, res) => {
  const result = await query("UPDATE notifications SET read_at=COALESCE(read_at,NOW()),delivery_status=CASE WHEN channel='IN_APP' THEN 'READ' ELSE delivery_status END WHERE id=$1 AND user_id=$2 RETURNING id,read_at,delivery_status", [req.params.id, req.user.id]);
  if (!result.rowCount) return res.status(404).json({ message: 'Notification not found.' });
  res.json({ notification: result.rows[0] });
});
router.patch('/read-all', async (req, res) => {
  await query("UPDATE notifications SET read_at=COALESCE(read_at,NOW()),delivery_status=CASE WHEN channel='IN_APP' THEN 'READ' ELSE delivery_status END WHERE user_id=$1 AND read_at IS NULL", [req.user.id]);
  res.json({ message: 'Notifications marked as read.' });
});
export default router;
