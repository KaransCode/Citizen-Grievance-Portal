import { Router } from 'express';
import { z } from 'zod';
import { query, pool } from '../utils/db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { writeAudit } from '../utils/audit.js';
import { createInAppNotification } from '../services/notifications.js';
const router = Router();
router.use(requireAuth, requireRole('ADMIN'));

router.get('/dashboard', async (req, res) => {
  const [summary, recent, categories, users] = await Promise.all([
    query(`SELECT COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status_code NOT IN ('RESOLVED','REJECTED','CLOSED'))::int AS pending,
      COUNT(*) FILTER (WHERE status_code='RESOLVED')::int AS resolved,
      COUNT(*) FILTER (WHERE status_code='REJECTED')::int AS rejected,
      COUNT(*) FILTER (WHERE status_code='CLOSED')::int AS closed,
      COUNT(*) FILTER (WHERE created_at >= date_trunc('month',NOW()))::int AS this_month
      FROM complaints`),
    query(`SELECT c.id,c.reference_no,c.title,c.status_code,c.priority,c.created_at,cat.name AS category_name,d.name AS department_name
      FROM complaints c JOIN complaint_categories cat ON cat.id=c.category_id LEFT JOIN departments d ON d.id=c.assigned_department_id
      ORDER BY c.created_at DESC LIMIT 8`),
    query(`SELECT cat.name,COUNT(c.id)::int AS count FROM complaint_categories cat LEFT JOIN complaints c ON c.category_id=cat.id GROUP BY cat.id ORDER BY count DESC,cat.name LIMIT 8`),
    query('SELECT COUNT(*) FILTER (WHERE is_active=TRUE)::int AS active_users FROM users')
  ]);
  res.json({ summary: { ...summary.rows[0], active_users: users.rows[0].active_users }, recent: recent.rows, categories: categories.rows });
});

router.get('/analytics', async (req, res) => {
  const months = await query(`SELECT to_char(date_trunc('month',created_at),'YYYY-MM') AS month,COUNT(*)::int AS total,
    COUNT(*) FILTER(WHERE status_code IN ('RESOLVED','CLOSED'))::int AS resolved
    FROM complaints WHERE created_at >= NOW() - INTERVAL '12 months' GROUP BY date_trunc('month',created_at) ORDER BY date_trunc('month',created_at)`);
  const departments = await query(`SELECT COALESCE(d.name,'Unassigned') AS name,COUNT(c.id)::int AS count
    FROM complaints c LEFT JOIN departments d ON d.id=c.assigned_department_id GROUP BY d.name ORDER BY count DESC`);
  const categories = await query(`SELECT cat.name,COUNT(c.id)::int AS count FROM complaint_categories cat
    LEFT JOIN complaints c ON c.category_id=cat.id GROUP BY cat.id ORDER BY count DESC`);
  const wards = await query(`SELECT COALESCE(NULLIF(ward,''),'Unspecified') AS ward,COUNT(*)::int AS count,
    COUNT(*) FILTER(WHERE status_code NOT IN ('RESOLVED','REJECTED','CLOSED'))::int AS open_count
    FROM complaints GROUP BY COALESCE(NULLIF(ward,''),'Unspecified') ORDER BY count DESC LIMIT 20`);
  res.json({ monthlyTrends: months.rows, departmentWise: departments.rows, categoryWise: categories.rows, wardHeatmap: wards.rows });
});

router.get('/users', async (req, res) => {
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit || '50', 10) || 50));
  const params = [];
  const where = [];
  if (req.query.q) { params.push(`%${String(req.query.q).slice(0,100)}%`); where.push(`(u.name ILIKE $${params.length} OR u.email ILIKE $${params.length})`); }
  if (req.query.role && ['CITIZEN','ADMIN','DEPARTMENT'].includes(String(req.query.role).toUpperCase())) { params.push(String(req.query.role).toUpperCase()); where.push(`u.role=$${params.length}`); }
  const condition = where.length ? `WHERE ${where.join(' AND ')}` : '';
  params.push(limit);
  const result = await query(`SELECT u.id,u.name,u.email,u.role,u.phone,u.is_active,u.created_at,d.name AS department_name
    FROM users u LEFT JOIN departments d ON d.id=u.department_id ${condition} ORDER BY u.created_at DESC LIMIT $${params.length}`, params);
  res.json({ data: result.rows });
});

router.patch('/users/:id/active', async (req, res) => {
  const parsed = z.object({ isActive: z.boolean() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'isActive must be true or false.' });
  if (req.params.id === req.user.id && !parsed.data.isActive) return res.status(400).json({ message: 'You cannot deactivate your own account.' });
  const updated = await query('UPDATE users SET is_active=$1,updated_at=NOW() WHERE id=$2 RETURNING id,name,email,role,is_active', [parsed.data.isActive, req.params.id]);
  if (!updated.rowCount) return res.status(404).json({ message: 'User not found.' });
  await writeAudit({ actorId: req.user.id, action: parsed.data.isActive ? 'USER_ACTIVATED' : 'USER_DEACTIVATED', entityType: 'USER', entityId: req.params.id, req });
  res.json({ message: 'User account updated.', user: updated.rows[0] });
});

router.get('/departments', async (req, res) => {
  const result = await query(`SELECT d.id,d.name,d.code,d.description,d.is_active,
    COUNT(c.id)::int AS complaints_count FROM departments d LEFT JOIN complaints c ON c.assigned_department_id=d.id
    GROUP BY d.id ORDER BY d.name`);
  res.json({ data: result.rows });
});

router.post('/departments', async (req, res) => {
  const parsed = z.object({ name: z.string().trim().min(3).max(120), code: z.string().trim().min(2).max(40).regex(/^[A-Z0-9_-]+$/), description: z.string().trim().max(1000).optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message || 'Invalid department.' });
  const result = await query('INSERT INTO departments(name,code,description) VALUES ($1,$2,$3) RETURNING *', [parsed.data.name, parsed.data.code, parsed.data.description || null]);
  await writeAudit({ actorId: req.user.id, action: 'DEPARTMENT_CREATED', entityType: 'DEPARTMENT', entityId: result.rows[0].id, req });
  res.status(201).json({ department: result.rows[0] });
});

router.patch('/departments/:id', async (req, res) => {
  const parsed = z.object({ name: z.string().trim().min(3).max(120).optional(), description: z.string().trim().max(1000).optional(), isActive: z.boolean().optional() }).refine((v) => Object.keys(v).length > 0).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Provide a valid name, description, or isActive value.' });
  const sets = [];
  const params = [];
  if (parsed.data.name !== undefined) { params.push(parsed.data.name); sets.push(`name=$${params.length}`); }
  if (parsed.data.description !== undefined) { params.push(parsed.data.description); sets.push(`description=$${params.length}`); }
  if (parsed.data.isActive !== undefined) { params.push(parsed.data.isActive); sets.push(`is_active=$${params.length}`); }
  sets.push('updated_at=NOW()'); params.push(req.params.id);
  const result = await query(`UPDATE departments SET ${sets.join(',')} WHERE id=$${params.length} RETURNING *`, params);
  if (!result.rowCount) return res.status(404).json({ message: 'Department not found.' });
  res.json({ department: result.rows[0] });
});

router.put('/complaints/:id/assign-department', async (req, res) => {
  const parsed = z.object({ departmentId: z.string().uuid(), assignedTo: z.string().uuid().optional(), note: z.string().trim().max(1000).optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'A valid departmentId is required.' });
  const complaintRes = await query('SELECT * FROM complaints WHERE id=$1', [req.params.id]);
  if (!complaintRes.rowCount) return res.status(404).json({ message: 'Complaint not found.' });
  const complaint = complaintRes.rows[0];
  const deptRes = await query('SELECT id,name FROM departments WHERE id=$1 AND is_active=TRUE', [parsed.data.departmentId]);
  if (!deptRes.rowCount) return res.status(400).json({ message: 'Selected department is unavailable.' });
  if (parsed.data.assignedTo) {
    const member = await query('SELECT id FROM users WHERE id=$1 AND role=\'DEPARTMENT\' AND department_id=$2 AND is_active=TRUE', [parsed.data.assignedTo, parsed.data.departmentId]);
    if (!member.rowCount) return res.status(400).json({ message: 'Officer does not belong to selected department.' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE complaint_assignments SET is_active=FALSE,unassigned_at=NOW() WHERE complaint_id=$1 AND is_active=TRUE', [complaint.id]);
    await client.query('INSERT INTO complaint_assignments(complaint_id,department_id,assigned_by,assigned_to,note) VALUES ($1,$2,$3,$4,$5)', [complaint.id, parsed.data.departmentId, req.user.id, parsed.data.assignedTo || null, parsed.data.note || null]);
    let current = complaint.status_code;
    if (current === 'SUBMITTED') {
      await client.query("INSERT INTO complaint_status_history(complaint_id,from_status,to_status,changed_by,note) VALUES ($1,'SUBMITTED','UNDER_REVIEW',$2,'Automatically reviewed before assignment')", [complaint.id, req.user.id]);
      current = 'UNDER_REVIEW';
    }
    if (!['UNDER_REVIEW','ASSIGNED'].includes(current)) throw Object.assign(new Error('Only complaints under review or already assigned can be assigned.'), { status: 409 });
    if (current === 'UNDER_REVIEW') await client.query("INSERT INTO complaint_status_history(complaint_id,from_status,to_status,changed_by,note) VALUES ($1,'UNDER_REVIEW','ASSIGNED',$2,'Assigned to department')", [complaint.id, req.user.id]);
    await client.query("UPDATE complaints SET assigned_department_id=$1,status_code='ASSIGNED',updated_at=NOW() WHERE id=$2", [parsed.data.departmentId, complaint.id]);
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  await createInAppNotification({ userId: complaint.citizen_id, complaintId: complaint.id, eventType: 'COMPLAINT_ASSIGNED', title: 'Complaint assigned', message: `Complaint ${complaint.reference_no} was assigned to ${deptRes.rows[0].name}.` });
  await writeAudit({ actorId: req.user.id, action: 'COMPLAINT_ASSIGNED', entityType: 'COMPLAINT', entityId: complaint.id, req, metadata: { departmentId: parsed.data.departmentId } });
  res.json({ message: 'Complaint assigned.', complaintId: complaint.id, department: deptRes.rows[0] });
});

router.put('/complaints/:id/update-status', async (req, res) => {
  const parsed = z.object({ status: z.enum(['UNDER_REVIEW','ASSIGNED','IN_PROGRESS','RESOLVED','REJECTED','CLOSED']), note: z.string().trim().max(2000).optional(), rejectionReason: z.string().trim().max(1000).optional(), resolutionNote: z.string().trim().max(2000).optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid status payload.' });
  // Admins may use the same validated workflow endpoint as department officers.
  const current = await query('SELECT id,citizen_id,reference_no,status_code FROM complaints WHERE id=$1', [req.params.id]);
  if (!current.rowCount) return res.status(404).json({ message: 'Complaint not found.' });
  const c = current.rows[0];
  const { status, note, rejectionReason, resolutionNote } = parsed.data;
  if (status === 'ASSIGNED') return res.status(409).json({ message: 'Use the department assignment workflow to mark a complaint assigned.' });
  const transitions = { SUBMITTED:['UNDER_REVIEW','REJECTED'], UNDER_REVIEW:['ASSIGNED','REJECTED'], ASSIGNED:['IN_PROGRESS','REJECTED'], IN_PROGRESS:['RESOLVED','REJECTED'], RESOLVED:['IN_PROGRESS','CLOSED'], REJECTED:[], CLOSED:[] };
  if (!transitions[c.status_code]?.includes(status)) return res.status(409).json({ message: `Invalid status transition: ${c.status_code} to ${status}.` });
  if (status === 'REJECTED' && !rejectionReason?.trim()) return res.status(400).json({ message: 'A rejection reason is required.' });
  if (status === 'RESOLVED' && !resolutionNote?.trim() && !note?.trim()) return res.status(400).json({ message: 'A resolution note is required.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`UPDATE complaints SET status_code=$1,updated_at=NOW(),resolved_at=CASE WHEN $1='RESOLVED' THEN NOW() WHEN $1='IN_PROGRESS' THEN NULL ELSE resolved_at END,closed_at=CASE WHEN $1='CLOSED' THEN NOW() ELSE closed_at END,rejection_reason=CASE WHEN $1='REJECTED' THEN $2 ELSE rejection_reason END,resolution_note=CASE WHEN $1='RESOLVED' THEN $3 ELSE resolution_note END WHERE id=$4`, [status, rejectionReason || null, resolutionNote || note || null, c.id]);
    await client.query('INSERT INTO complaint_status_history(complaint_id,from_status,to_status,changed_by,note) VALUES ($1,$2,$3,$4,$5)', [c.id, c.status_code, status, req.user.id, note || rejectionReason || resolutionNote || null]);
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  await createInAppNotification({ userId: c.citizen_id, complaintId: c.id, eventType: 'STATUS_UPDATED', title: 'Complaint status updated', message: `Complaint ${c.reference_no} is now ${status.replaceAll('_',' ').toLowerCase()}.` });
  await writeAudit({ actorId: req.user.id, action: 'COMPLAINT_STATUS_CHANGED', entityType: 'COMPLAINT', entityId: c.id, req, metadata: { from: c.status_code, to: status } });
  res.json({ message: 'Status updated.', complaintId: c.id, status });
});

export default router;
