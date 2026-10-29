import { Router } from 'express';
import { query } from '../utils/db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
const router = Router();
router.use(requireAuth, requireRole('DEPARTMENT'));

router.get('/dashboard', async (req, res) => {
  if (!req.user.department_id) return res.status(403).json({ message: 'No department is assigned to this account.' });
  const summary = await query(`SELECT COUNT(*)::int AS total,
    COUNT(*) FILTER (WHERE status_code='ASSIGNED')::int AS assigned,
    COUNT(*) FILTER (WHERE status_code='IN_PROGRESS')::int AS in_progress,
    COUNT(*) FILTER (WHERE status_code='RESOLVED')::int AS resolved
    FROM complaints WHERE assigned_department_id=$1`, [req.user.department_id]);
  const recent = await query(`SELECT c.id,c.reference_no,c.title,c.address,c.priority,c.status_code,c.created_at,cat.name AS category_name
    FROM complaints c JOIN complaint_categories cat ON cat.id=c.category_id
    WHERE c.assigned_department_id=$1 ORDER BY c.created_at DESC LIMIT 10`, [req.user.department_id]);
  res.json({ summary: summary.rows[0], complaints: recent.rows });
});
export default router;
