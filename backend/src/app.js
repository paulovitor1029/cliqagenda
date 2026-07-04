const path = require("path");
require("express-async-errors");
const cors = require("cors");
const express = require("express");
const apiRoutes = require("./routes");
const notFound = require("./middlewares/notFound");
const errorHandler = require("./middlewares/errorHandler");
const { resolveAuthContext } = require("./middlewares/auth");

const app = express();
const frontendPath = path.resolve(__dirname, "../../frontend/dist");
const uploadsPath = path.resolve(__dirname, "../uploads");
const allowedOrigins = String(process.env.CORS_ORIGIN || "")
  .split(",")
  .map(origin => origin.trim())
  .filter(Boolean);

app.disable("x-powered-by");
app.use((req, res, next) => {
  res.set({
    "Content-Security-Policy": "default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; img-src 'self' data: blob: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY"
  });
  if (process.env.NODE_ENV === "production") {
    res.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
});

if (allowedOrigins.length) {
  app.use(cors({
    credentials: true,
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error("Origem nao autorizada."));
    }
  }));
}

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

app.use("/uploads", express.static(uploadsPath));
app.use("/api", apiRoutes);
app.use("/api", notFound);

async function pageAuthContext(req, res, next) {
  try {
    const result = await resolveAuthContext(req);
    req.pageAuth = result.context;
    next();
  } catch (error) {
    next(error);
  }
}

function sendAuthPage() {
  return (req, res) => {
    if (req.pageAuth) return res.redirect(303, "/admin");
    res.set("Cache-Control", "no-store");
    return res.sendFile(path.join(frontendPath, "index.html"));
  };
}

function sendAdminPage(req, res) {
  if (!req.pageAuth) {
    const nextPath = encodeURIComponent(req.originalUrl || "/admin");
    return res.redirect(303, `/login?next=${nextPath}`);
  }
  res.set("Cache-Control", "no-store");
  return res.sendFile(path.join(frontendPath, "index.html"));
}

function sendClientPage(req, res) {
  if (req.pageAuth) return res.redirect(303, "/admin");
  res.set("Cache-Control", "no-store");
  return res.sendFile(path.join(frontendPath, "index.html"));
}

app.get(["/login", "/login.html"], pageAuthContext, sendAuthPage());
app.get(["/cadastro", "/cadastro.html"], pageAuthContext, sendAuthPage());
app.get(["/admin", "/admin/", "/admin/*"], pageAuthContext, sendAdminPage);
app.get(["/", "/index.html", "/cliente", "/p/:slug"], pageAuthContext, sendClientPage);

app.use(express.static(frontendPath, { index: false }));
app.get("*", pageAuthContext, sendClientPage);

app.use(errorHandler);

module.exports = app;
