import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { query, pool } from '../utils/db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { uploadImages } from '../middleware/upload.js';
import { storeComplaintImage } from '../services/storage.js';
import { createInAppNotification } from '../services/notifications.js';
import { writeAudit } from '../utils/audit.js';
import { canTransition, roleMayChangeStatus } from '../domain/workflow.js';

const router = Router();
const createSchema = z.object({
  title: z.string().trim().min(8).max(160),
  description: z.string().trim().min(20).max(5000),
  categoryId: z.string().uuid(),
  address: z.string().trim().min(5).max(250),
  ward: z.string().trim().max(80).optional().or(z.literal('')),
  latitude: z.coerce.number().min(-90).max(90).optional().nullable(),
  longitude: z.coerce.number().min(-180).max(180).optional().nullable(),
  priority: z.enum(['LOW','NORMAL','HIGH','URGENT']).optional()
});
const statusSchema = z.object({
  status: z.enum(['UNDER_REVIEW','ASSIGNED','IN_PROGRESS','RESOLVED','REJECTED','CLOSED']),
  note: z.string().trim().max(2000).optional().or(z.literal('')),
  rejectionReason: z.string().trim().max(1000).optional().or(z.literal('')),
  resolutionNote: z.string().trim().max(2000).optional().or(z.literal(''))
});

function addFilter(where, params, expression, value) {
  params.push(value);
  where.push(expression.replace('?', `$${params.length}`));
}

async function getComplaint(id) {
  const result = await query(
    `SELECT c.*,cat.name AS category_name,cat.target_resolution_hours,
            d.name AS department_name,u.name AS citizen_name,u.email AS citizen_email
     FROM complaints c
     JOIN complaint_categories cat ON cat.id=c.category_id
     JOIN users u ON u.id=c.citizen_id
     LEFT JOIN departments d ON d.id=c.assigned_department_id
     WHERE c.id=$1`, [id]
  );
  return result.rows[0] || null;
}

function mayAccess(complaint, user) {
  if (user.role === 'ADMIN') return true;
  if (user.role === 'CITIZEN') return complaint.citizen_id === user.id;
  return user.role === 'DEPARTMENT' && user.department_id && complaint.assigned_department_id === user.department_id;
}

async function complaintPayload(complaint) {
  const [attachments, history] = await Promise.all([
    query('SELECT id,mime_type,size_bytes,created_at FROM complaint_attachments WHERE complaint_id=$1 ORDER BY created_at', [complaint.id]).then((result) => ({ rows: result.rows.map((item) => ({ ...item, url: `/api/attachments/${item.id}/file` })) })),
    query(`SELECT h.from_status,h.to_status,h.note,h.created_at,u.name AS actor_name,u.role AS actor_role
           FROM complaint_status_history h LEFT JOIN users u ON u.id=h.changed_by
           WHERE h.complaint_id=$1 ORDER BY h.created_at`, [complaint.id])
  ]);
  return { ...complaint, attachments: attachments.rows, history: history.rows };
}


router.get('/summary', requireAuth, async (req, res) => {
  const params = [];
  let scope = '';
  if (req.user.role === 'CITIZEN') { params.push(req.user.id); scope = 'WHERE citizen_id=$1'; }
  if (req.user.role === 'DEPARTMENT') {
    if (!req.user.department_id) return res.json({ total: 0, pending: 0, resolved: 0, rejected: 0, closed: 0 });
    params.push(req.user.department_id); scope = 'WHERE assigned_department_id=$1';
  }
  const result = await query(`SELECT COUNT(*)::int AS total,
    COUNT(*) FILTER(WHERE status_code NOT IN ('RESOLVED','REJECTED','CLOSED'))::int AS pending,
    COUNT(*) FILTER(WHERE status_code='RESOLVED')::int AS resolved,
    COUNT(*) FILTER(WHERE status_code='REJECTED')::int AS rejected,
    COUNT(*) FILTER(WHERE status_code='CLOSED')::int AS closed
    FROM complaints ${scope}`, params);
  res.json(result.rows[0]);
});

router.get('/', requireAuth, async (req, res) => {
  const params = [];
  const where = [];
  if (req.user.role === 'CITIZEN') addFilter(where, params, 'c.citizen_id = ?', req.user.id);
  if (req.user.role === 'DEPARTMENT') {
    if (!req.user.department_id) return res.json({ data: [], pagination: { page: 1, limit: 20, total: 0 } });
    addFilter(where, params, 'c.assigned_department_id = ?', req.user.department_id);
  }
  if (req.query.status) {
    const allowed = ['SUBMITTED','UNDER_REVIEW','ASSIGNED','IN_PROGRESS','RESOLVED','REJECTED','CLOSED'];
    if (!allowed.includes(String(req.query.status).toUpperCase())) return res.status(400).json({ message: 'Unknown complaint status filter.' });
    addFilter(where, params, 'c.status_code = ?', String(req.query.status).toUpperCase());
  }
  if (req.query.categoryId) {
    if (!z.string().uuid().safeParse(String(req.query.categoryId)).success) return res.status(400).json({ message: 'Invalid category ID.' });
    addFilter(where, params, 'c.category_id = ?', String(req.query.categoryId));
  }
  if (req.query.priority) {
    const p = String(req.query.priority).toUpperCase();
    if (!['LOW','NORMAL','HIGH','URGENT'].includes(p)) return res.status(400).json({ message: 'Unknown priority filter.' });
    addFilter(where, params, 'c.priority = ?', p);
  }
  if (req.query.q) addFilter(where, params, `(c.reference_no ILIKE ? OR c.title ILIKE ? OR c.description ILIKE ? OR c.address ILIKE ?)`, `%${String(req.query.q).slice(0,120)}%`);
  // Expand the single q placeholder above into four bound parameters.
  if (req.query.q) {
    const q = params.pop();
    const start = params.length + 1;
    params.push(q, q, q, q);
    where[where.length - 1] = `(c.reference_no ILIKE $${start} OR c.title ILIKE $${start + 1} OR c.description ILIKE $${start + 2} OR c.address ILIKE $${start + 3})`;
  }
  const page = Math.max(1, Number.parseInt(req.query.page || '1', 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit || '20', 10) || 20));
  const condition = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const count = await query(`SELECT COUNT(*)::int AS total FROM complaints c ${condition}`, params);
  const offset = (page - 1) * limit;
  const dataParams = [...params, limit, offset];
  const rows = await query(
    `SELECT c.id,c.reference_no,c.title,c.description,c.address,c.ward,c.priority,c.status_code,c.created_at,c.updated_at,c.resolved_at,
            cat.name AS category_name,d.name AS department_name
     FROM complaints c JOIN complaint_categories cat ON cat.id=c.category_id
     LEFT JOIN departments d ON d.id=c.assigned_department_id
     ${condition} ORDER BY c.created_at DESC LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
    dataParams
  );
  res.json({ data: rows.rows, pagination: { page, limit, total: count.rows[0].total, totalPages: Math.ceil(count.rows[0].total / limit) } });
});

router.post('/', requireAuth, requireRole('CITIZEN'), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message || 'Complaint details are invalid.' });
  const values = parsed.data;
  const category = await query('SELECT id,default_priority FROM complaint_categories WHERE id=$1 AND is_active=TRUE', [values.categoryId]);
  if (!category.rowCount) return res.status(400).json({ message: 'Select an active complaint category.' });
  const referenceNo = `CGR-${new Date().toISOString().slice(0,10).replaceAll('-','')}-${Math.random().toString(36).slice(2,8).toUpperCase()}`;
  const client = await pool.connect();
  let complaint;
  try {
    await client.query('BEGIN');
    const inserted = await client.query(
      `INSERT INTO complaints(reference_no,citizen_id,category_id,title,description,address,ward,latitude,longitude,priority)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [referenceNo, req.user.id, values.categoryId, values.title, values.description, values.address, values.ward || null,
       values.latitude ?? null, values.longitude ?? null, values.priority || category.rows[0].default_priority]
    );
    complaint = inserted.rows[0];
    await client.query(
      'INSERT INTO complaint_status_history(complaint_id,from_status,to_status,changed_by,note) VALUES ($1,NULL,\'SUBMITTED\',$2,\'Complaint submitted by citizen\')',
      [complaint.id, req.user.id]
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
  await createInAppNotification({ userId: req.user.id, complaintId: complaint.id, eventType: 'COMPLAINT_SUBMITTED', title: 'Complaint submitted', message: `Your complaint ${referenceNo} was received and is awaiting review.` });
  await writeAudit({ actorId: req.user.id, action: 'COMPLAINT_CREATED', entityType: 'COMPLAINT', entityId: complaint.id, req, metadata: { referenceNo } });
  res.status(201).json({ message: 'Complaint submitted successfully.', complaint });
});

router.get('/:id', requireAuth, async (req, res) => {
  const complaint = await getComplaint(req.params.id);
  if (!complaint) return res.status(404).json({ message: 'Complaint not found.' });
  if (!mayAccess(complaint, req.user)) return res.status(403).json({ message: 'You cannot view this complaint.' });
  res.json({ complaint: await complaintPayload(complaint) });
});

router.put('/:id', requireAuth, requireRole('CITIZEN'), async (req, res) => {
  const current = await getComplaint(req.params.id);
  if (!current) return res.status(404).json({ message: 'Complaint not found.' });
  if (current.citizen_id !== req.user.id) return res.status(403).json({ message: 'You cannot edit this complaint.' });
  if (current.status_code !== 'SUBMITTED') return res.status(409).json({ message: 'Only newly submitted complaints can be edited.' });
  const schema = z.object({ title: z.string().trim().min(8).max(160), description: z.string().trim().min(20).max(5000), address: z.string().trim().min(5).max(250), ward: z.string().trim().max(80).optional().or(z.literal('')) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message || 'Invalid complaint details.' });
  const updated = await query(
    'UPDATE complaints SET title=$1,description=$2,address=$3,ward=$4,updated_at=NOW() WHERE id=$5 RETURNING *',
    [parsed.data.title, parsed.data.description, parsed.data.address, parsed.data.ward || null, current.id]
  );
  await writeAudit({ actorId: req.user.id, action: 'COMPLAINT_UPDATED', entityType: 'COMPLAINT', entityId: current.id, req });
  res.json({ message: 'Complaint updated.', complaint: updated.rows[0] });
});

router.post('/:id/attachments', requireAuth, uploadImages.array('images', 5), async (req, res) => {
  const complaint = await getComplaint(req.params.id);
  if (!complaint) return res.status(404).json({ message: 'Complaint not found.' });
  if (!mayAccess(complaint, req.user)) return res.status(403).json({ message: 'You cannot add files to this complaint.' });
  if (!req.files?.length) return res.status(400).json({ message: 'Choose at least one image.' });
  const saved = [];
  for (const file of req.files) {
    const image = await storeComplaintImage(file);
    const attachmentId = randomUUID();
    const protectedUrl = `/api/attachments/${attachmentId}/file`;
    const result = await query(
      `INSERT INTO complaint_attachments(id,complaint_id,uploaded_by,storage_key,url,mime_type,size_bytes,sha256)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id,url,mime_type,size_bytes,created_at`,
      [attachmentId, complaint.id, req.user.id, image.storageKey, protectedUrl, image.mimeType, image.sizeBytes, image.sha256]
    );
    saved.push(result.rows[0]);
  }
  await writeAudit({ actorId: req.user.id, action: 'COMPLAINT_ATTACHMENTS_UPLOADED', entityType: 'COMPLAINT', entityId: complaint.id, req, metadata: { count: saved.length } });
  res.status(201).json({ message: 'Images uploaded and optimized.', attachments: saved });
});

router.patch('/:id/status', requireAuth, requireRole('ADMIN','DEPARTMENT'), async (req, res) => {
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message || 'Invalid status update.' });
  const input = parsed.data;
  const complaint = await getComplaint(req.params.id);
  if (!complaint) return res.status(404).json({ message: 'Complaint not found.' });
  const assignedToDepartment = req.user.role === 'DEPARTMENT' && req.user.department_id === complaint.assigned_department_id;
  if (req.user.role === 'DEPARTMENT' && !assignedToDepartment) return res.status(403).json({ message: 'This complaint is not assigned to your department.' });
  if (input.status === 'ASSIGNED') return res.status(409).json({ message: 'Use the department assignment workflow to mark a complaint assigned.' });
  if (!canTransition(complaint.status_code, input.status)) return res.status(409).json({ message: `Status cannot change from ${complaint.status_code} to ${input.status}.` });
  if (!roleMayChangeStatus(req.user.role, complaint.status_code, input.status, assignedToDepartment)) return res.status(403).json({ message: 'Your role cannot apply this status transition.' });
  if (input.status === 'REJECTED' && !input.rejectionReason?.trim()) return res.status(400).json({ message: 'A rejection reason is required.' });
  if (input.status === 'RESOLVED' && !input.resolutionNote?.trim() && !input.note?.trim()) return res.status(400).json({ message: 'Add a resolution note before marking a complaint resolved.' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE complaints SET status_code=$1,updated_at=NOW(),
       resolved_at=CASE WHEN $1='RESOLVED' THEN NOW() WHEN $1='IN_PROGRESS' THEN NULL ELSE resolved_at END,
       closed_at=CASE WHEN $1='CLOSED' THEN NOW() ELSE closed_at END,
       rejection_reason=CASE WHEN $1='REJECTED' THEN $2 ELSE rejection_reason END,
       resolution_note=CASE WHEN $1='RESOLVED' THEN $3 ELSE resolution_note END
       WHERE id=$4`,
      [input.status, input.rejectionReason || null, input.resolutionNote || input.note || null, complaint.id]
    );
    await client.query(
      'INSERT INTO complaint_status_history(complaint_id,from_status,to_status,changed_by,note) VALUES ($1,$2,$3,$4,$5)',
      [complaint.id, complaint.status_code, input.status, req.user.id, input.note || input.rejectionReason || input.resolutionNote || null]
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
  await createInAppNotification({ userId: complaint.citizen_id, complaintId: complaint.id, eventType: 'STATUS_UPDATED', title: `Complaint ${input.status.replaceAll('_',' ').toLowerCase()}`, message: `Your complaint ${complaint.reference_no} is now ${input.status.replaceAll('_',' ').toLowerCase()}.` });
  await writeAudit({ actorId: req.user.id, action: 'COMPLAINT_STATUS_CHANGED', entityType: 'COMPLAINT', entityId: complaint.id, req, metadata: { from: complaint.status_code, to: input.status } });
  res.json({ message: 'Complaint status updated.', complaint: await getComplaint(complaint.id) });
});

router.post('/:id/assign', requireAuth, requireRole('ADMIN'), async (req, res) => {
  const parsed = z.object({ departmentId: z.string().uuid(), assignedTo: z.string().uuid().optional(), note: z.string().trim().max(1000).optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'A valid department is required.' });
  const complaint = await getComplaint(req.params.id);
  if (!complaint) return res.status(404).json({ message: 'Complaint not found.' });
  const department = await query('SELECT id,name FROM departments WHERE id=$1 AND is_active=TRUE', [parsed.data.departmentId]);
  if (!department.rowCount) return res.status(400).json({ message: 'Selected department is unavailable.' });
  if (parsed.data.assignedTo) {
    const member = await query('SELECT id FROM users WHERE id=$1 AND role=\'DEPARTMENT\' AND department_id=$2 AND is_active=TRUE', [parsed.data.assignedTo, parsed.data.departmentId]);
    if (!member.rowCount) return res.status(400).json({ message: 'Assigned officer does not belong to this department.' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE complaint_assignments SET is_active=FALSE,unassigned_at=NOW() WHERE complaint_id=$1 AND is_active=TRUE', [complaint.id]);
    await client.query(
      `INSERT INTO complaint_assignments(complaint_id,department_id,assigned_by,assigned_to,note)
       VALUES ($1,$2,$3,$4,$5)`,
      [complaint.id, parsed.data.departmentId, req.user.id, parsed.data.assignedTo || null, parsed.data.note || null]
    );
    // Assignment can move a submitted complaint through review into the assigned state in a single admin action.
    let current = complaint.status_code;
    if (current === 'SUBMITTED') {
      await client.query("INSERT INTO complaint_status_history(complaint_id,from_status,to_status,changed_by,note) VALUES ($1,'SUBMITTED','UNDER_REVIEW',$2,'Automatically reviewed before assignment')", [complaint.id, req.user.id]);
      current = 'UNDER_REVIEW';
    }
    if (current !== 'UNDER_REVIEW' && current !== 'ASSIGNED') throw Object.assign(new Error('Only complaints under review or already assigned can be assigned.'), { status: 409 });
    if (current === 'UNDER_REVIEW') {
      await client.query("INSERT INTO complaint_status_history(complaint_id,from_status,to_status,changed_by,note) VALUES ($1,'UNDER_REVIEW','ASSIGNED',$2,'Assigned to department')", [complaint.id, req.user.id]);
    }
    await client.query('UPDATE complaints SET assigned_department_id=$1,status_code=\'ASSIGNED\',updated_at=NOW() WHERE id=$2', [parsed.data.departmentId, complaint.id]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
  await createInAppNotification({ userId: complaint.citizen_id, complaintId: complaint.id, eventType: 'COMPLAINT_ASSIGNED', title: 'Complaint assigned', message: `Your complaint ${complaint.reference_no} has been assigned to ${department.rows[0].name}.` });
  const deptUsers = await query('SELECT id FROM users WHERE role=\'DEPARTMENT\' AND department_id=$1 AND is_active=TRUE', [parsed.data.departmentId]);
  for (const member of deptUsers.rows) {
    await createInAppNotification({ userId: member.id, complaintId: complaint.id, eventType: 'NEW_ASSIGNMENT', title: 'New complaint assigned', message: `Complaint ${complaint.reference_no}: ${complaint.title}` });
  }
  await writeAudit({ actorId: req.user.id, action: 'COMPLAINT_ASSIGNED', entityType: 'COMPLAINT', entityId: complaint.id, req, metadata: { departmentId: parsed.data.departmentId, assignedTo: parsed.data.assignedTo || null } });
  res.json({ message: 'Complaint assigned successfully.', complaint: await getComplaint(complaint.id) });
});

export default router;
