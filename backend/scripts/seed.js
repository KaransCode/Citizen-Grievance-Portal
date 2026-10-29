import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { pool } from '../src/utils/db.js';

if (process.env.NODE_ENV === 'production' && (!process.env.SEED_ADMIN_PASSWORD || !process.env.SEED_DEPT_PASSWORD)) {
  console.error('Set explicit SEED_ADMIN_PASSWORD and SEED_DEPT_PASSWORD values before seeding production.');
  process.exit(1);
}

const demoAdminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@civicportal.local';
const demoAdminPassword = process.env.SEED_ADMIN_PASSWORD || 'AdminDemo123!';
const demoDeptEmail = process.env.SEED_DEPT_EMAIL || 'department@civicportal.local';
const demoDeptPassword = process.env.SEED_DEPT_PASSWORD || 'DeptDemo123!';

try {
  const dept = await pool.query("SELECT id FROM departments WHERE code = 'ROADS'");
  if (!dept.rowCount) throw new Error('Roads department missing. Run npm run db:init first.');
  const roadsId = dept.rows[0].id;
  const adminHash = await bcrypt.hash(demoAdminPassword, 12);
  const deptHash = await bcrypt.hash(demoDeptPassword, 12);
  await pool.query(`INSERT INTO users(name,email,password_hash,role,email_verified)
    VALUES ('Portal Administrator',$1,$2,'ADMIN',TRUE)
    ON CONFLICT DO NOTHING`, [demoAdminEmail.toLowerCase(), adminHash]);
  await pool.query(`INSERT INTO users(name,email,password_hash,role,department_id,email_verified)
    VALUES ('Roads Department Officer',$1,$2,'DEPARTMENT',$3,TRUE)
    ON CONFLICT DO NOTHING`, [demoDeptEmail.toLowerCase(), deptHash, roadsId]);
  console.log('Demo accounts ensured:');
  console.log(`Admin: ${demoAdminEmail} / ${demoAdminPassword}`);
  console.log(`Department: ${demoDeptEmail} / ${demoDeptPassword}`);
  console.log('Change or remove demo credentials before public deployment.');
} catch (error) {
  console.error('Seed failed:', error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
