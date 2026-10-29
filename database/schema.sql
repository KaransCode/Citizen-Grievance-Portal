CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(120) NOT NULL UNIQUE,
  code VARCHAR(40) NOT NULL UNIQUE,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(120) NOT NULL,
  email VARCHAR(254) NOT NULL,
  password_hash TEXT NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'CITIZEN' CHECK (role IN ('CITIZEN','ADMIN','DEPARTMENT')),
  phone VARCHAR(25),
  sms_opt_in BOOLEAN NOT NULL DEFAULT FALSE,
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS sms_opt_in BOOLEAN NOT NULL DEFAULT FALSE;
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_uq ON users (LOWER(email));
CREATE INDEX IF NOT EXISTS users_role_idx ON users(role);
CREATE INDEX IF NOT EXISTS users_department_idx ON users(department_id);

CREATE TABLE IF NOT EXISTS complaint_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  default_priority VARCHAR(10) NOT NULL DEFAULT 'NORMAL' CHECK (default_priority IN ('LOW','NORMAL','HIGH','URGENT')),
  target_resolution_hours INTEGER NOT NULL DEFAULT 120 CHECK (target_resolution_hours > 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS complaint_statuses (
  code VARCHAR(24) PRIMARY KEY,
  label VARCHAR(50) NOT NULL UNIQUE,
  is_terminal BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order SMALLINT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS complaints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_no VARCHAR(40) NOT NULL UNIQUE,
  citizen_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  category_id UUID NOT NULL REFERENCES complaint_categories(id) ON DELETE RESTRICT,
  status_code VARCHAR(24) NOT NULL DEFAULT 'SUBMITTED' REFERENCES complaint_statuses(code),
  title VARCHAR(160) NOT NULL CHECK (char_length(title) >= 8),
  description TEXT NOT NULL CHECK (char_length(description) >= 20),
  address VARCHAR(250) NOT NULL,
  ward VARCHAR(80),
  latitude NUMERIC(9,6) CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  longitude NUMERIC(9,6) CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
  priority VARCHAR(10) NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('LOW','NORMAL','HIGH','URGENT')),
  assigned_department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  resolution_note TEXT,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS complaints_citizen_created_idx ON complaints(citizen_id, created_at DESC);
CREATE INDEX IF NOT EXISTS complaints_status_created_idx ON complaints(status_code, created_at DESC);
CREATE INDEX IF NOT EXISTS complaints_category_idx ON complaints(category_id);
CREATE INDEX IF NOT EXISTS complaints_department_status_idx ON complaints(assigned_department_id, status_code);
CREATE INDEX IF NOT EXISTS complaints_ward_idx ON complaints(ward);
CREATE INDEX IF NOT EXISTS complaints_search_idx ON complaints USING GIN (to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(description,'')));

CREATE TABLE IF NOT EXISTS complaint_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  complaint_id UUID NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
  department_id UUID NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
  assigned_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
  note TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  unassigned_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS assignments_department_active_idx ON complaint_assignments(department_id, is_active);
CREATE INDEX IF NOT EXISTS assignments_complaint_idx ON complaint_assignments(complaint_id, assigned_at DESC);

CREATE TABLE IF NOT EXISTS complaint_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  complaint_id UUID NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  storage_key TEXT NOT NULL,
  url TEXT NOT NULL,
  mime_type VARCHAR(80) NOT NULL,
  size_bytes BIGINT NOT NULL CHECK (size_bytes > 0),
  sha256 CHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS attachments_complaint_idx ON complaint_attachments(complaint_id, created_at);

CREATE TABLE IF NOT EXISTS complaint_status_history (
  id BIGSERIAL PRIMARY KEY,
  complaint_id UUID NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
  from_status VARCHAR(24) REFERENCES complaint_statuses(code),
  to_status VARCHAR(24) NOT NULL REFERENCES complaint_statuses(code),
  changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS status_history_complaint_idx ON complaint_status_history(complaint_id, created_at);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  complaint_id UUID REFERENCES complaints(id) ON DELETE CASCADE,
  channel VARCHAR(12) NOT NULL DEFAULT 'IN_APP' CHECK (channel IN ('IN_APP','EMAIL','SMS')),
  event_type VARCHAR(60) NOT NULL,
  title VARCHAR(160) NOT NULL,
  message TEXT NOT NULL,
  delivery_status VARCHAR(20) NOT NULL DEFAULT 'QUEUED' CHECK (delivery_status IN ('QUEUED','SENT','FAILED','READ')),
  provider_ref TEXT,
  read_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS notifications_user_created_idx ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_unread_idx ON notifications(user_id, read_at) WHERE read_at IS NULL;

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(80) NOT NULL,
  entity_id UUID,
  ip_address INET,
  user_agent TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS audit_entity_idx ON audit_logs(entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_actor_idx ON audit_logs(actor_id, created_at DESC);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS password_reset_user_idx ON password_reset_tokens(user_id, expires_at DESC);

INSERT INTO complaint_statuses(code, label, is_terminal, sort_order) VALUES
 ('SUBMITTED','Submitted',FALSE,1),
 ('UNDER_REVIEW','Under Review',FALSE,2),
 ('ASSIGNED','Assigned',FALSE,3),
 ('IN_PROGRESS','In Progress',FALSE,4),
 ('RESOLVED','Resolved',FALSE,5),
 ('REJECTED','Rejected',TRUE,6),
 ('CLOSED','Closed',TRUE,7)
ON CONFLICT (code) DO NOTHING;

INSERT INTO complaint_categories(name, description, default_priority, target_resolution_hours) VALUES
 ('Damaged Roads','Potholes, broken roads, unsafe road surfaces','HIGH',120),
 ('Water Supply','Water outages, leaks, irregular supply','HIGH',72),
 ('Drainage','Blocked drains, waterlogging, sewer overflow','HIGH',48),
 ('Garbage Collection','Missed pickups, overflowing bins, litter','NORMAL',72),
 ('Streetlight Failure','Non-working or damaged streetlights','NORMAL',120),
 ('Sanitation','Public hygiene and sanitation concerns','NORMAL',72),
 ('Public Infrastructure','Damaged public facilities and footpaths','NORMAL',168),
 ('Other Civic Issue','Other municipal or civic concerns','NORMAL',168)
ON CONFLICT (name) DO NOTHING;

INSERT INTO departments(name, code, description) VALUES
 ('Roads & Infrastructure','ROADS','Roads, potholes, footpaths and public facilities'),
 ('Water & Sewerage','WATER','Water supply, drainage and sewerage'),
 ('Sanitation & Waste','SANITATION','Waste collection and public sanitation'),
 ('Electrical Services','ELECTRICAL','Streetlights and public electrical infrastructure'),
 ('General Administration','GENERAL','Cross-department and general civic issues')
ON CONFLICT (code) DO NOTHING;
