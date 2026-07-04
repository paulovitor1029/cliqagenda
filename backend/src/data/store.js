const crypto = require("crypto");
require("dotenv").config();
const { Pool } = require("pg");
const { runMigrations } = require("../database/migrate");

const dbConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : undefined
    }
  : {
      host: process.env.DB_HOST || process.env.PGHOST || "localhost",
      port: Number(process.env.DB_PORT || process.env.PGPORT) || 5432,
      database: process.env.DB_NAME || process.env.PGDATABASE || "cliqagenda",
      user: process.env.DB_USER || process.env.PGUSER || "postgres",
      password: process.env.DB_PASS || process.env.PGPASSWORD || "admin",
      ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : undefined
    };

const adminConfig = process.env.DATABASE_URL
  ? dbConfig
  : { ...dbConfig, database: process.env.DB_ADMIN_DATABASE || "postgres" };
const pool = new Pool(dbConfig);
const UPDATE_LOCK_ID = 74190217;

const defaultWorkingHours = [
  "09:00",
  "09:30",
  "10:00",
  "10:30",
  "11:00",
  "13:00",
  "13:30",
  "14:00",
  "14:30",
  "15:00",
  "15:30",
  "16:00",
  "16:30",
  "17:00"
];

const defaultWorkingDays = [1, 2, 3, 4, 5, 6];

const defaultWorkingSchedule = Object.fromEntries(defaultWorkingDays.map(day => [
  String(day),
  {
    enabled: true,
    start: "09:00",
    end: "17:00",
    interval: 30,
    hours: defaultWorkingHours
  }
]));

const defaultTheme = {
  primary: "#16a34a",
  primaryDark: "#15803d",
  background: "#f6f7fb",
  card: "#ffffff",
  text: "#111827",
  muted: "#6b7280",
  line: "#e5e7eb",
  soft: "#f3f4f6",
  danger: "#dc2626",
  warning: "#d97706",
  info: "#0284c7"
};

let readyPromise;

async function ensureDatabaseExists() {
  if (process.env.DATABASE_URL) return;
  const adminPool = new Pool(adminConfig);
  try {
    const exists = await adminPool.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbConfig.database]);
    if (!exists.rowCount) {
      await adminPool.query(`CREATE DATABASE ${quoteIdentifier(dbConfig.database)}`);
    }
  } finally {
    await adminPool.end();
  }
}

async function ensureDatabase() {
  if (!readyPromise) {
    readyPromise = (async () => {
      await runMigrations();
      await pool.query("CREATE EXTENSION IF NOT EXISTS pgcrypto");
      await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          email TEXT NOT NULL UNIQUE,
          role TEXT NOT NULL DEFAULT 'business_admin',
          business_id TEXT,
          permissions JSONB NOT NULL DEFAULT '{"settings": true, "professionals": true, "services": true, "appointments": true, "blocks": true, "clients": true, "finance": true, "users": true}'::jsonb,
          password_hash TEXT NOT NULL,
          password_salt TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS businesses (
          id TEXT PRIMARY KEY,
          owner_id TEXT UNIQUE REFERENCES users(id) ON DELETE SET NULL,
          name TEXT NOT NULL,
          slug TEXT NOT NULL UNIQUE,
          whatsapp TEXT NOT NULL,
          business_type TEXT NOT NULL DEFAULT 'Outro',
          address TEXT NOT NULL DEFAULT '',
          description TEXT NOT NULL DEFAULT '',
          photo_url TEXT NOT NULL DEFAULT '',
          theme JSONB NOT NULL DEFAULT '{}'::jsonb,
          deposit NUMERIC(10,2) NOT NULL DEFAULT 0,
          pix_key TEXT NOT NULL DEFAULT '',
          cancellation_hours INTEGER NOT NULL DEFAULT 6,
          reschedule_hours INTEGER NOT NULL DEFAULT 6,
          allow_client_cancel BOOLEAN NOT NULL DEFAULT TRUE,
          allow_client_reschedule BOOLEAN NOT NULL DEFAULT TRUE,
          active BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS business_working_hours (
          business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
          time_value TIME NOT NULL,
          sort_order INTEGER NOT NULL,
          PRIMARY KEY (business_id, time_value)
        );

        CREATE TABLE IF NOT EXISTS professionals (
          id TEXT PRIMARY KEY,
          business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          specialty TEXT NOT NULL DEFAULT '',
          photo_url TEXT NOT NULL DEFAULT '',
          working_days JSONB NOT NULL DEFAULT '[1,2,3,4,5,6]'::jsonb,
          working_schedule JSONB NOT NULL DEFAULT '{}'::jsonb,
          active BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS professionals_business_idx ON professionals (business_id, active);

        CREATE TABLE IF NOT EXISTS professional_working_hours (
          professional_id TEXT NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
          time_value TIME NOT NULL,
          sort_order INTEGER NOT NULL,
          PRIMARY KEY (professional_id, time_value)
        );

        CREATE TABLE IF NOT EXISTS services (
          id TEXT PRIMARY KEY,
          business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
          professional_id TEXT REFERENCES professionals(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          price NUMERIC(10,2) NOT NULL DEFAULT 0,
          duration INTEGER NOT NULL DEFAULT 30,
          buffer INTEGER NOT NULL DEFAULT 0,
          active BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS appointments (
          id TEXT PRIMARY KEY,
          business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
          professional_id TEXT REFERENCES professionals(id) ON DELETE SET NULL,
          professional_name TEXT NOT NULL DEFAULT '',
          service_id TEXT NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
          service_name TEXT NOT NULL,
          price NUMERIC(10,2) NOT NULL DEFAULT 0,
          total NUMERIC(10,2) NOT NULL DEFAULT 0,
          date_value DATE NOT NULL,
          time_value TIME NOT NULL,
          customer TEXT NOT NULL,
          phone TEXT NOT NULL,
          coupon TEXT NOT NULL DEFAULT '',
          recurrence INTEGER NOT NULL DEFAULT 0,
          code TEXT NOT NULL UNIQUE,
          status TEXT NOT NULL CHECK (status IN ('pending', 'confirmed', 'cancelled', 'done', 'noshow')),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        DROP INDEX IF EXISTS appointments_active_slot_idx;

        CREATE UNIQUE INDEX IF NOT EXISTS appointments_active_professional_slot_idx
          ON appointments (business_id, professional_id, date_value, time_value)
          WHERE status <> 'cancelled';

        CREATE INDEX IF NOT EXISTS appointments_business_date_idx
          ON appointments (business_id, date_value, time_value);

        CREATE TABLE IF NOT EXISTS schedule_blocks (
          id TEXT PRIMARY KEY,
          business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
          date_value DATE NOT NULL,
          all_day BOOLEAN NOT NULL DEFAULT FALSE,
          start_time TIME,
          end_time TIME,
          reason TEXT NOT NULL DEFAULT '',
          professional_id TEXT REFERENCES professionals(id) ON DELETE SET NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          CHECK (all_day = TRUE OR (start_time IS NOT NULL AND end_time IS NOT NULL AND start_time <= end_time))
        );

        CREATE INDEX IF NOT EXISTS schedule_blocks_business_date_idx
          ON schedule_blocks (business_id, date_value);

        CREATE TABLE IF NOT EXISTS payments (
          id TEXT PRIMARY KEY,
          business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
          appointment_id TEXT REFERENCES appointments(id) ON DELETE SET NULL,
          provider TEXT NOT NULL DEFAULT 'local_pix',
          method TEXT NOT NULL DEFAULT 'pix',
          status TEXT NOT NULL CHECK (status IN ('pending', 'paid', 'cancelled', 'expired', 'refunded')) DEFAULT 'pending',
          amount NUMERIC(10,2) NOT NULL DEFAULT 0,
          pix_key TEXT NOT NULL DEFAULT '',
          pix_copy_paste TEXT NOT NULL DEFAULT '',
          external_id TEXT NOT NULL DEFAULT '',
          paid_at TIMESTAMPTZ,
          expires_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS payments_business_status_idx ON payments (business_id, status);

        CREATE TABLE IF NOT EXISTS reminder_logs (
          id TEXT PRIMARY KEY,
          business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
          appointment_id TEXT REFERENCES appointments(id) ON DELETE SET NULL,
          channel TEXT NOT NULL DEFAULT 'whatsapp',
          status TEXT NOT NULL DEFAULT 'queued',
          provider TEXT NOT NULL DEFAULT '',
          message TEXT NOT NULL DEFAULT '',
          sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS waitlist_entries (
          id TEXT PRIMARY KEY,
          business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          phone TEXT NOT NULL,
          date_value DATE NOT NULL,
          period TEXT NOT NULL,
          service TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS password_reset_tokens (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          token_hash TEXT NOT NULL UNIQUE,
          expires_at TIMESTAMPTZ NOT NULL,
          used_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS password_reset_tokens_hash_idx ON password_reset_tokens (token_hash);

        CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          token TEXT NOT NULL UNIQUE,
          expires_at TIMESTAMPTZ NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS sessions_token_idx ON sessions (token);
      `);

    })();
  }
  return readyPromise;
}

async function readDb(queryable = pool) {
  await ensureDatabase();
  const statements = [
    "SELECT * FROM users ORDER BY created_at",
    "SELECT * FROM sessions ORDER BY created_at",
    "SELECT * FROM password_reset_tokens ORDER BY created_at",
    "SELECT * FROM businesses ORDER BY created_at",
    "SELECT business_id, to_char(time_value, 'HH24:MI') AS time_value FROM business_working_hours ORDER BY business_id, sort_order",
    "SELECT professional_id, to_char(time_value, 'HH24:MI') AS time_value FROM professional_working_hours ORDER BY professional_id, sort_order",
    "SELECT * FROM professionals ORDER BY created_at",
    "SELECT * FROM services ORDER BY created_at",
    "SELECT * FROM appointments ORDER BY date_value, time_value",
    "SELECT * FROM payments ORDER BY created_at",
    "SELECT * FROM reminder_logs ORDER BY sent_at",
    "SELECT * FROM waitlist_entries ORDER BY created_at",
    "SELECT * FROM schedule_blocks ORDER BY date_value, start_time"
  ];
  let results;
  if (queryable === pool) {
    results = await Promise.all(statements.map(statement => queryable.query(statement)));
  } else {
    results = [];
    for (const statement of statements) {
      results.push(await queryable.query(statement));
    }
  }
  const [users, sessions, passwordResetTokens, businesses, hours, professionalHours, professionals, services, appointments, payments, reminders, waitlist, blocks] = results;

  const workingHoursByBusiness = groupHours(hours.rows);
  const workingHoursByProfessional = groupProfessionalHours(professionalHours.rows);
  const professionalsById = Object.fromEntries(professionals.rows.map(row => [row.id, row]));

  return {
    users: users.rows.map(row => ({
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
      businessId: row.business_id || "",
      permissions: row.permissions || {},
      hash: row.password_hash,
      salt: row.password_salt,
      createdAt: row.created_at.toISOString()
    })),
    sessions: sessions.rows.map(row => ({
      id: row.id,
      userId: row.user_id,
      token: row.token,
      expiresAt: row.expires_at.toISOString()
    })),
    passwordResetTokens: passwordResetTokens.rows.map(row => ({
      id: row.id,
      userId: row.user_id,
      tokenHash: row.token_hash,
      expiresAt: row.expires_at.toISOString(),
      usedAt: row.used_at ? row.used_at.toISOString() : "",
      createdAt: row.created_at.toISOString()
    })),
    businesses: businesses.rows.map(row => businessFromRow(row, workingHoursByBusiness[row.id] || [])),
    professionals: professionals.rows.map(row => professionalFromRow(row, workingHoursByProfessional[row.id] || [])),
    services: services.rows.map(row => serviceFromRow(row, professionalsById[row.professional_id])),
    appointments: appointments.rows.map(appointmentFromRow),
    payments: payments.rows.map(paymentFromRow),
    reminders: reminders.rows.map(reminderFromRow),
    waitlist: waitlist.rows.map(waitlistFromRow),
    blocks: blocks.rows.map(blockFromRow)
  };
}

async function updateDb(mutator) {
  await ensureDatabase();
  const lockClient = await pool.connect();
  let locked = false;
  try {
    await lockClient.query("SELECT pg_advisory_lock($1)", [UPDATE_LOCK_ID]);
    locked = true;
    const db = await readDb(lockClient);
    const mutationResult = mutator(db);
    await persistDb(db, lockClient);
    return mutationResult;
  } finally {
    if (locked) {
      await lockClient.query("SELECT pg_advisory_unlock($1)", [UPDATE_LOCK_ID]);
    }
    lockClient.release();
  }
}

async function persistDb(db, existingClient = null) {
  const client = existingClient || await pool.connect();
  try {
    await client.query("BEGIN");
    await deleteMissing(client, "sessions", db.sessions.map(item => item.id));
    await deleteMissing(client, "password_reset_tokens", (db.passwordResetTokens || []).map(item => item.id));
    await deleteMissing(client, "reminder_logs", (db.reminders || []).map(item => item.id));
    await deleteMissing(client, "payments", (db.payments || []).map(item => item.id));
    await deleteMissing(client, "waitlist_entries", db.waitlist.map(item => item.id));
    await deleteMissing(client, "schedule_blocks", db.blocks.map(item => item.id));
    await deleteMissing(client, "appointments", db.appointments.map(item => item.id));
    await deleteMissing(client, "services", db.services.map(item => item.id));
    await client.query("DELETE FROM professional_working_hours WHERE professional_id <> ALL($1::text[])", [db.professionals.map(item => item.id)]);
    await deleteMissing(client, "professionals", db.professionals.map(item => item.id));
    await deleteMissing(client, "businesses", db.businesses.map(item => item.id));
    await deleteMissing(client, "users", db.users.map(item => item.id));

    for (const user of db.users) {
      await client.query(
        `INSERT INTO users (id, name, email, role, business_id, permissions, password_hash, password_salt, created_at)
         VALUES ($1, $2, $3, $4, NULL, $5::jsonb, $6, $7, COALESCE($8::timestamptz, NOW()))
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           email = EXCLUDED.email,
           role = EXCLUDED.role,
           password_hash = EXCLUDED.password_hash,
           password_salt = EXCLUDED.password_salt,
           permissions = EXCLUDED.permissions`,
        [user.id, user.name, user.email, user.role || "business_admin", JSON.stringify(user.permissions || defaultPermissions(user.role)), user.hash, user.salt, user.createdAt || null]
      );
    }

    for (const token of (db.passwordResetTokens || [])) {
      await client.query(
        `INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, used_at, created_at)
         VALUES ($1, $2, $3, $4::timestamptz, $5::timestamptz, COALESCE($6::timestamptz, NOW()))
         ON CONFLICT (id) DO UPDATE SET
           user_id = EXCLUDED.user_id,
           token_hash = EXCLUDED.token_hash,
           expires_at = EXCLUDED.expires_at,
           used_at = EXCLUDED.used_at`,
        [token.id, token.userId, token.tokenHash, token.expiresAt, token.usedAt || null, token.createdAt || null]
      );
    }

    for (const business of db.businesses) {
      await client.query(
        `INSERT INTO businesses (
          id, owner_id, name, slug, whatsapp, business_type, address, description, photo_url, theme, deposit, pix_key,
          cancellation_hours, reschedule_hours, allow_client_cancel, allow_client_reschedule, active
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13, $14, $15, $16, $17)
        ON CONFLICT (id) DO UPDATE SET
          owner_id = EXCLUDED.owner_id,
          name = EXCLUDED.name,
          slug = EXCLUDED.slug,
          whatsapp = EXCLUDED.whatsapp,
          business_type = EXCLUDED.business_type,
          address = EXCLUDED.address,
          description = EXCLUDED.description,
          photo_url = EXCLUDED.photo_url,
          theme = EXCLUDED.theme,
          deposit = EXCLUDED.deposit,
          pix_key = EXCLUDED.pix_key,
          cancellation_hours = EXCLUDED.cancellation_hours,
          reschedule_hours = EXCLUDED.reschedule_hours,
          allow_client_cancel = EXCLUDED.allow_client_cancel,
          allow_client_reschedule = EXCLUDED.allow_client_reschedule,
          active = EXCLUDED.active,
          updated_at = NOW()`,
        [
          business.id,
          business.ownerId,
          business.name,
          business.slug,
          business.whatsapp,
          business.businessType || "Outro",
          business.address || "",
          business.description || "",
          business.photoUrl || "",
          JSON.stringify(normalizeTheme(business.theme)),
          business.deposit || 0,
          business.pixKey || "",
          business.cancellationHours || 0,
          business.rescheduleHours || 0,
          Boolean(business.allowClientCancel),
          Boolean(business.allowClientReschedule),
          business.active !== false
        ]
      );
      await client.query("DELETE FROM business_working_hours WHERE business_id = $1", [business.id]);
      await insertWorkingHours(client, business.id, business.workingHours || defaultWorkingHours);
    }

    for (const user of db.users) {
      await client.query(
        "UPDATE users SET business_id = $1 WHERE id = $2",
        [user.businessId || null, user.id]
      );
    }

    for (const professional of db.professionals) {
      await client.query(
        `INSERT INTO professionals (id, business_id, name, specialty, photo_url, working_days, working_schedule, active, created_at)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, COALESCE($9::timestamptz, NOW()))
         ON CONFLICT (id) DO UPDATE SET
           business_id = EXCLUDED.business_id,
           name = EXCLUDED.name,
           specialty = EXCLUDED.specialty,
           photo_url = EXCLUDED.photo_url,
           working_days = EXCLUDED.working_days,
           working_schedule = EXCLUDED.working_schedule,
           active = EXCLUDED.active,
           updated_at = NOW()`,
        [professional.id, professional.businessId, professional.name, professional.specialty || "", professional.photoUrl || "", JSON.stringify(normalizeWorkingDays(professional.workingDays)), JSON.stringify(normalizeWorkingSchedule(professional.workingSchedule, professional.workingDays, professional.workingHours)), Boolean(professional.active), professional.createdAt || null]
      );
      await client.query("DELETE FROM professional_working_hours WHERE professional_id = $1", [professional.id]);
      await insertProfessionalWorkingHours(client, professional.id, professional.workingHours || []);
    }

    for (const service of db.services) {
      await client.query(
        `INSERT INTO services (id, business_id, professional_id, name, price, duration, buffer, active, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9::timestamptz, NOW()))
         ON CONFLICT (id) DO UPDATE SET
           business_id = EXCLUDED.business_id,
           professional_id = EXCLUDED.professional_id,
           name = EXCLUDED.name,
           price = EXCLUDED.price,
           duration = EXCLUDED.duration,
           buffer = EXCLUDED.buffer,
           active = EXCLUDED.active,
           updated_at = NOW()`,
        [service.id, service.businessId, service.professionalId || null, service.name, service.price || 0, service.duration || 30, service.buffer || 0, service.active !== false, service.createdAt || null]
      );
    }

    for (const appointment of db.appointments) {
      await client.query(
        `INSERT INTO appointments (
          id, business_id, professional_id, professional_name, service_id, service_name, price, total, date_value, time_value,
          customer, phone, coupon, recurrence, code, status, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, COALESCE($17::timestamptz, NOW()), COALESCE($18::timestamptz, NOW()))
        ON CONFLICT (id) DO UPDATE SET
          business_id = EXCLUDED.business_id,
          professional_id = EXCLUDED.professional_id,
          professional_name = EXCLUDED.professional_name,
          service_id = EXCLUDED.service_id,
          service_name = EXCLUDED.service_name,
          price = EXCLUDED.price,
          total = EXCLUDED.total,
          date_value = EXCLUDED.date_value,
          time_value = EXCLUDED.time_value,
          customer = EXCLUDED.customer,
          phone = EXCLUDED.phone,
          coupon = EXCLUDED.coupon,
          recurrence = EXCLUDED.recurrence,
          code = EXCLUDED.code,
          status = EXCLUDED.status,
          updated_at = EXCLUDED.updated_at`,
        [
          appointment.id,
          appointment.businessId,
          appointment.professionalId || null,
          appointment.professionalName || "",
          appointment.serviceId,
          appointment.service,
          appointment.price || 0,
          appointment.total || 0,
          appointment.date,
          appointment.time,
          appointment.customer,
          appointment.phone,
          appointment.coupon || "",
          appointment.recurrence || 0,
          appointment.code,
          appointment.status,
          appointment.createdAt || null,
          appointment.updatedAt || null
        ]
      );
    }

    for (const block of db.blocks) {
      await client.query(
        `INSERT INTO schedule_blocks (id, business_id, date_value, all_day, start_time, end_time, reason, professional_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9::timestamptz, NOW()))
         ON CONFLICT (id) DO UPDATE SET
           business_id = EXCLUDED.business_id,
           date_value = EXCLUDED.date_value,
           all_day = EXCLUDED.all_day,
           start_time = EXCLUDED.start_time,
           end_time = EXCLUDED.end_time,
           reason = EXCLUDED.reason,
           professional_id = EXCLUDED.professional_id`,
        [block.id, block.businessId, block.date, Boolean(block.allDay), block.startTime || null, block.endTime || null, block.reason || "", block.professionalId || null, block.createdAt || null]
      );
    }

    for (const payment of (db.payments || [])) {
      await client.query(
        `INSERT INTO payments (id, business_id, appointment_id, provider, method, status, amount, pix_key, pix_copy_paste, external_id, paid_at, expires_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::timestamptz, $12::timestamptz, COALESCE($13::timestamptz, NOW()), COALESCE($14::timestamptz, NOW()))
         ON CONFLICT (id) DO UPDATE SET
           status = EXCLUDED.status,
           amount = EXCLUDED.amount,
           pix_key = EXCLUDED.pix_key,
           pix_copy_paste = EXCLUDED.pix_copy_paste,
           external_id = EXCLUDED.external_id,
           paid_at = EXCLUDED.paid_at,
           updated_at = NOW()`,
        [payment.id, payment.businessId, payment.appointmentId || null, payment.provider || "local_pix", payment.method || "pix", payment.status || "pending", payment.amount || 0, payment.pixKey || "", payment.pixCopyPaste || "", payment.externalId || "", payment.paidAt || null, payment.expiresAt || null, payment.createdAt || null, payment.updatedAt || null]
      );
    }

    for (const reminder of (db.reminders || [])) {
      await client.query(
        `INSERT INTO reminder_logs (id, business_id, appointment_id, channel, status, provider, message, sent_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8::timestamptz, NOW()))
         ON CONFLICT (id) DO UPDATE SET
           status = EXCLUDED.status,
           provider = EXCLUDED.provider,
           message = EXCLUDED.message`,
        [reminder.id, reminder.businessId, reminder.appointmentId || null, reminder.channel || "whatsapp", reminder.status || "queued", reminder.provider || "", reminder.message || "", reminder.sentAt || null]
      );
    }

    for (const item of db.waitlist) {
      await client.query(
        `INSERT INTO waitlist_entries (id, business_id, name, phone, date_value, period, service, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8::timestamptz, NOW()))
         ON CONFLICT (id) DO UPDATE SET
           business_id = EXCLUDED.business_id,
           name = EXCLUDED.name,
           phone = EXCLUDED.phone,
           date_value = EXCLUDED.date_value,
           period = EXCLUDED.period,
           service = EXCLUDED.service`,
        [item.id, item.businessId, item.name, item.phone, item.date, item.period, item.service, item.createdAt || null]
      );
    }

    for (const session of db.sessions) {
      await client.query(
        `INSERT INTO sessions (id, user_id, token, expires_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO UPDATE SET
           user_id = EXCLUDED.user_id,
           token = EXCLUDED.token,
           expires_at = EXCLUDED.expires_at`,
        [session.id, session.userId, session.token, session.expiresAt]
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    if (!existingClient) client.release();
  }
}

async function deleteMissing(client, table, ids) {
  if (!ids.length) {
    await client.query(`DELETE FROM ${table}`);
    return;
  }
  await client.query(`DELETE FROM ${table} WHERE id <> ALL($1::text[])`, [ids]);
}

async function insertWorkingHours(client, businessId, workingHours) {
  let order = 0;
  for (const time of workingHours) {
    await client.query(
      `INSERT INTO business_working_hours (business_id, time_value, sort_order)
       VALUES ($1, $2, $3)
       ON CONFLICT (business_id, time_value) DO UPDATE SET sort_order = EXCLUDED.sort_order`,
      [businessId, time, order]
    );
    order += 1;
  }
}

async function insertProfessionalWorkingHours(client, professionalId, workingHours) {
  let order = 0;
  for (const time of workingHours || []) {
    await client.query(
      `INSERT INTO professional_working_hours (professional_id, time_value, sort_order)
       VALUES ($1, $2, $3)
       ON CONFLICT (professional_id, time_value) DO UPDATE SET sort_order = EXCLUDED.sort_order`,
      [professionalId, time, order]
    );
    order += 1;
  }
}

function groupHours(rows) {
  return rows.reduce((groups, row) => {
    if (!groups[row.business_id]) groups[row.business_id] = [];
    groups[row.business_id].push(row.time_value);
    return groups;
  }, {});
}

function groupProfessionalHours(rows) {
  return rows.reduce((groups, row) => {
    if (!groups[row.professional_id]) groups[row.professional_id] = [];
    groups[row.professional_id].push(row.time_value);
    return groups;
  }, {});
}

function defaultPermissions(role = "business_admin") {
  if (role === "system_admin") return {};
  if (role === "owner") return { settings: true, professionals: true, services: true, appointments: true, blocks: true, clients: true, finance: true, users: true };
  if (role === "finance") return { settings: false, professionals: false, services: false, appointments: false, blocks: false, clients: false, finance: true, users: false };
  if (role === "staff") return { settings: false, professionals: false, services: false, appointments: true, blocks: false, clients: true, finance: false, users: false };
  return { settings: true, professionals: true, services: true, appointments: true, blocks: true, clients: true, finance: false, users: false };
}

function isHexColor(value) {
  return /^#[0-9a-fA-F]{6}$/.test(String(value || "").trim());
}

function normalizeTheme(theme = {}) {
  const source = theme && typeof theme === "object" ? theme : {};
  const normalized = { ...defaultTheme };

  for (const key of Object.keys(defaultTheme)) {
    if (isHexColor(source[key])) normalized[key] = String(source[key]).trim();
  }

  return normalized;
}

function normalizeWorkingDays(days) {
  const source = Array.isArray(days) ? days : defaultWorkingDays;
  const normalized = source
    .map(value => Number(value))
    .filter(value => Number.isInteger(value) && value >= 0 && value <= 6);
  return [...new Set(normalized)].sort((a, b) => a - b);
}

function normalizeWorkingSchedule(schedule, days = defaultWorkingDays, fallbackHours = defaultWorkingHours) {
  const selectedDays = normalizeWorkingDays(days);
  const source = schedule && typeof schedule === "object" ? schedule : {};
  return Object.fromEntries(selectedDays.map(day => {
    const current = source[String(day)] || source[day] || {};
    const start = String(current.start || (fallbackHours[0] || "09:00"));
    const end = String(current.end || "18:00");
    const interval = Math.max(10, Number(current.interval || 30));
    const hours = Array.isArray(current.hours) && current.hours.length ? current.hours : fallbackHours;
    return [String(day), { enabled: current.enabled !== false, start, end, interval, hours }];
  }));
}

function businessFromRow(row, workingHours) {
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    slug: row.slug,
    whatsapp: row.whatsapp,
    businessType: row.business_type || "Outro",
    address: row.address,
    description: row.description,
    photoUrl: row.photo_url,
    theme: normalizeTheme(row.theme || {}),
    deposit: Number(row.deposit || 0),
    pixKey: row.pix_key,
    cancellationHours: Number(row.cancellation_hours || 0),
    rescheduleHours: Number(row.reschedule_hours || 0),
    allowClientCancel: Boolean(row.allow_client_cancel),
    allowClientReschedule: Boolean(row.allow_client_reschedule),
    active: row.active !== false,
    workingHours: workingHours.length ? workingHours : defaultWorkingHours
  };
}

function professionalFromRow(row, workingHours) {
  return {
    id: row.id,
    businessId: row.business_id,
    name: row.name,
    specialty: row.specialty || "",
    photoUrl: row.photo_url || "",
    active: Boolean(row.active),
    workingDays: normalizeWorkingDays(row.working_days || defaultWorkingDays),
    workingSchedule: normalizeWorkingSchedule(row.working_schedule || {}, row.working_days || defaultWorkingDays, workingHours || []),
    workingHours: workingHours || [],
    createdAt: row.created_at.toISOString()
  };
}

function serviceFromRow(row, professional) {
  return {
    id: row.id,
    businessId: row.business_id,
    professionalId: row.professional_id || "",
    professionalName: professional ? professional.name : "",
    name: row.name,
    price: Number(row.price || 0),
    duration: Number(row.duration || 30),
    buffer: Number(row.buffer || 0),
    active: row.active !== false,
    createdAt: row.created_at.toISOString()
  };
}

function appointmentFromRow(row) {
  return {
    id: row.id,
    businessId: row.business_id,
    professionalId: row.professional_id || "",
    professionalName: row.professional_name || "",
    serviceId: row.service_id,
    service: row.service_name,
    price: Number(row.price || 0),
    total: Number(row.total || 0),
    date: row.date_value.toISOString().slice(0, 10),
    time: row.time_value.slice(0, 5),
    customer: row.customer,
    phone: row.phone,
    coupon: row.coupon,
    recurrence: Number(row.recurrence || 0),
    code: row.code,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
}

function blockFromRow(row) {
  return {
    id: row.id,
    businessId: row.business_id,
    date: row.date_value.toISOString().slice(0, 10),
    allDay: Boolean(row.all_day),
    startTime: row.start_time ? row.start_time.slice(0, 5) : "",
    endTime: row.end_time ? row.end_time.slice(0, 5) : "",
    reason: row.reason,
    professionalId: row.professional_id || "",
    createdAt: row.created_at.toISOString()
  };
}

function waitlistFromRow(row) {
  return {
    id: row.id,
    businessId: row.business_id,
    name: row.name,
    phone: row.phone,
    date: row.date_value.toISOString().slice(0, 10),
    period: row.period,
    service: row.service,
    createdAt: row.created_at.toISOString()
  };
}

function paymentFromRow(row) {
  return {
    id: row.id,
    businessId: row.business_id,
    appointmentId: row.appointment_id || "",
    provider: row.provider,
    method: row.method,
    status: row.status,
    amount: Number(row.amount || 0),
    pixKey: row.pix_key || "",
    pixCopyPaste: row.pix_copy_paste || "",
    externalId: row.external_id || "",
    paidAt: row.paid_at ? row.paid_at.toISOString() : "",
    expiresAt: row.expires_at ? row.expires_at.toISOString() : "",
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
}

function reminderFromRow(row) {
  return {
    id: row.id,
    businessId: row.business_id,
    appointmentId: row.appointment_id || "",
    channel: row.channel,
    status: row.status,
    provider: row.provider || "",
    message: row.message || "",
    sentAt: row.sent_at.toISOString()
  };
}

function quoteIdentifier(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function id(prefix) {
  return `${prefix}_${crypto.randomBytes(9).toString("hex")}`;
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.pbkdf2Sync(String(password), salt, 120000, 32, "sha256").toString("hex");
  return { salt, hash };
}

function verifyPassword(password, salt, hash) {
  const candidate = hashPassword(password, salt).hash;
  return crypto.timingSafeEqual(Buffer.from(candidate, "hex"), Buffer.from(hash, "hex"));
}

function publicBusiness(business) {
  return {
    id: business.id,
    name: business.name,
    slug: business.slug,
    whatsapp: business.whatsapp,
    businessType: business.businessType || "Outro",
    address: business.address,
    description: business.description,
    photoUrl: business.photoUrl || "",
    theme: normalizeTheme(business.theme || {}),
    deposit: Number(business.deposit || 0),
    pixKey: business.pixKey || "",
    cancellationHours: Number(business.cancellationHours || 0),
    rescheduleHours: Number(business.rescheduleHours || 0),
    allowClientCancel: Boolean(business.allowClientCancel),
    allowClientReschedule: Boolean(business.allowClientReschedule),
    active: business.active !== false,
    workingHours: business.workingHours || defaultWorkingHours
  };
}

function publicProfessional(professional) {
  return {
    id: professional.id,
    name: professional.name,
    specialty: professional.specialty || "",
    photoUrl: professional.photoUrl || "",
    active: Boolean(professional.active),
    workingDays: normalizeWorkingDays(professional.workingDays || defaultWorkingDays),
    workingSchedule: normalizeWorkingSchedule(professional.workingSchedule || {}, professional.workingDays || defaultWorkingDays, professional.workingHours || []),
    workingHours: professional.workingHours || []
  };
}

function publicService(service) {
  return {
    id: service.id,
    professionalId: service.professionalId || "",
    professionalName: service.professionalName || "",
    name: service.name,
    price: Number(service.price || 0),
    duration: Number(service.duration || 30),
    buffer: Number(service.buffer || 0),
    active: service.active !== false
  };
}

module.exports = {
  defaultPermissions,
  hashPassword,
  id,
  publicBusiness,
  publicProfessional,
  publicService,
  readDb,
  updateDb,
  verifyPassword
};
