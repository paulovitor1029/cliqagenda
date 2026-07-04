const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");
require("dotenv").config();

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
  : {
      ...dbConfig,
      database: process.env.DB_ADMIN_DATABASE || "postgres"
    };

function quoteIdentifier(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

async function ensureDatabaseExists() {
  if (process.env.DATABASE_URL) return;
  const adminPool = new Pool(adminConfig);
  try {
    const exists = await adminPool.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbConfig.database]);
    if (!exists.rowCount) {
      await adminPool.query(`CREATE DATABASE ${quoteIdentifier(dbConfig.database)}`);
      console.log(`Banco ${dbConfig.database} criado.`);
    }
  } finally {
    await adminPool.end();
  }
}

async function runMigrations() {
  await ensureDatabaseExists();

  const pool = new Pool(dbConfig);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const migrationsDir = path.resolve(__dirname, "../../migrations");
    const files = fs.existsSync(migrationsDir)
      ? fs.readdirSync(migrationsDir).filter(file => file.endsWith(".sql")).sort()
      : [];

    for (const file of files) {
      const alreadyExecuted = await client.query("SELECT 1 FROM schema_migrations WHERE name = $1", [file]);
      if (alreadyExecuted.rowCount) continue;

      const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
      console.log(`Migration executada: ${file}`);
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  runMigrations()
    .then(() => {
      console.log("Migrations finalizadas.");
      process.exit(0);
    })
    .catch(error => {
      console.error("Erro ao executar migrations:", error.message);
      process.exit(1);
    });
}

module.exports = { runMigrations };
