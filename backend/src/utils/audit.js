import { query } from './db.js';

export async function writeAudit({ actorId = null, action, entityType, entityId = null, req, metadata = {} }) {
  try {
    await query(
      `INSERT INTO audit_logs(actor_id, action, entity_type, entity_id, ip_address, user_agent, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
      [actorId, action, entityType, entityId, req?.ip || null, req?.get('user-agent') || null, JSON.stringify(metadata)]
    );
  } catch (error) {
    // Audit failure must be visible in logs; do not hide operational issues.
    console.error('Audit log write failed:', error.message);
  }
}
