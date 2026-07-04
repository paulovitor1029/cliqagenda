const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
require("dotenv").config();
const { Pool } = require("pg");

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

const pool = new Pool(dbConfig);

async function resolveUploadedImageUrl(file) {
  if (!file) throw new Error("Arquivo de imagem ausente.");

  const id = `img_${crypto.randomBytes(12).toString("hex")}`;
  const data = await fs.readFile(file.path);
  await pool.query(
    `INSERT INTO uploaded_images (id, filename, mime_type, byte_size, data)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, file.originalname || file.filename || "foto.jpg", file.mimetype || "image/jpeg", data.length, data]
  );
  await fs.unlink(file.path).catch(() => null);
  return `/api/images/${id}`;
}

function imageIdFromUrl(url) {
  const match = String(url || "").match(/^\/api\/images\/([a-zA-Z0-9_-]+)$/);
  return match ? match[1] : "";
}

async function deleteStoredImageByUrl(url) {
  const imageId = imageIdFromUrl(url);
  if (imageId) {
    await pool.query("DELETE FROM uploaded_images WHERE id = $1", [imageId]);
    return;
  }

  if (String(url || "").startsWith("/uploads/")) {
    const uploadsDir = path.resolve(__dirname, "../../uploads");
    const filename = path.basename(url);
    await fs.unlink(path.join(uploadsDir, filename)).catch(() => null);
  }
}

async function getStoredImage(id) {
  const result = await pool.query(
    "SELECT id, filename, mime_type, byte_size, data, created_at FROM uploaded_images WHERE id = $1",
    [id]
  );
  return result.rows[0] || null;
}

module.exports = { deleteStoredImageByUrl, getStoredImage, resolveUploadedImageUrl };
