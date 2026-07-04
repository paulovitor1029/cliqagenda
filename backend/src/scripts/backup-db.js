const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
require("dotenv").config();

const backupDir = process.env.BACKUP_DIR || path.resolve(__dirname, "../../backups");
fs.mkdirSync(backupDir, { recursive: true });

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const output = path.join(backupDir, `cliqagenda-${timestamp}.sql`);

const args = [];
if (process.env.DATABASE_URL) {
  args.push(process.env.DATABASE_URL);
} else {
  if (process.env.DB_HOST) args.push("-h", process.env.DB_HOST);
  if (process.env.DB_PORT) args.push("-p", process.env.DB_PORT);
  if (process.env.DB_USER) args.push("-U", process.env.DB_USER);
  args.push(process.env.DB_NAME || "cliqagenda");
}

args.push("-f", output);

const env = { ...process.env };
if (process.env.DB_PASS) env.PGPASSWORD = process.env.DB_PASS;

const result = spawnSync("pg_dump", args, { stdio: "inherit", env });
if (result.error) {
  console.error("Nao foi possivel executar pg_dump. Instale o PostgreSQL client e garanta que pg_dump esteja no PATH.");
  console.error(result.error.message);
  process.exit(1);
}
if (result.status !== 0) process.exit(result.status);

console.log(`Backup criado em: ${output}`);
