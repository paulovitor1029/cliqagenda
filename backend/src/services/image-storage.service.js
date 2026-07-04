const fs = require("fs/promises");

async function uploadToCloudinary(file) {
  const { v2: cloudinary } = require("cloudinary");

  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });

  const folder = process.env.CLOUDINARY_FOLDER || "cliqagenda";
  const result = await cloudinary.uploader.upload(file.path, {
    folder,
    resource_type: "image",
    overwrite: false
  });

  await fs.unlink(file.path).catch(() => null);
  return result.secure_url;
}

async function resolveUploadedImageUrl(file) {
  if (!file) throw new Error("Arquivo de imagem ausente.");

  if (process.env.STORAGE_PROVIDER === "cloudinary") {
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
      throw new Error("Cloudinary nao configurado. Verifique CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY e CLOUDINARY_API_SECRET.");
    }
    return uploadToCloudinary(file);
  }

  return `/uploads/${file.filename}`;
}

module.exports = { resolveUploadedImageUrl };
