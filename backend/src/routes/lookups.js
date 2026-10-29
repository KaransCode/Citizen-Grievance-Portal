import { Router } from 'express';
import { query } from '../utils/db.js';
const router = Router();

router.get('/categories', async (req, res) => {
  const result = await query('SELECT id,name,description,default_priority,target_resolution_hours FROM complaint_categories WHERE is_active=TRUE ORDER BY name');
  res.json({ data: result.rows });
});
router.get('/departments', async (req, res) => {
  const result = await query('SELECT id,name,code,description FROM departments WHERE is_active=TRUE ORDER BY name');
  res.json({ data: result.rows });
});
export default router;
