const crypto = require("crypto");
const { readDb } = require("../data/store");

const SESSION_COOKIE = "cliqagenda_session";

function cookieValue(req, name) {
  const cookieHeader = req.get("cookie") || "";
  const cookie = cookieHeader
    .split(";")
    .map(part => part.trim())
    .find(part => part.startsWith(`${name}=`));
  if (!cookie) return "";
  try {
    return decodeURIComponent(cookie.slice(name.length + 1));
  } catch {
    return "";
  }
}

function sessionHash(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

function requestToken(req) {
  const header = req.get("authorization") || "";
  const bearerToken = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  return cookieValue(req, SESSION_COOKIE) || bearerToken;
}

async function resolveAuthContext(req) {
  const token = requestToken(req);
  if (!token) return { context: null, reason: "missing" };

  const db = await readDb();
  const hashedToken = sessionHash(token);
  const session = db.sessions.find(item => item.token === hashedToken);
  if (!session || new Date(session.expiresAt) <= new Date()) {
    return { context: null, reason: "expired" };
  }

  const user = db.users.find(item => item.id === session.userId);
  if (user && user.role === "system_admin") {
    return {
      context: {
        user,
        business: null,
        permissions: {},
        token,
        sessionToken: session.token
      },
      reason: ""
    };
  }

  const business = user
    ? db.businesses.find(item => item.id === user.businessId || item.ownerId === session.userId)
    : null;
  if (!user || !business) return { context: null, reason: "unlinked" };
  if (business.active === false) return { context: null, reason: "blocked" };

  return {
    context: {
      user,
      business,
      permissions: user.permissions || {},
      token,
      sessionToken: session.token
    },
    reason: ""
  };
}

async function auth(req, res, next) {
  try {
    const { context, reason } = await resolveAuthContext(req);
    if (!context) {
      const message = reason === "missing"
        ? "Login necessario."
        : reason === "blocked"
          ? "Negócio bloqueado. Entre em contato com o suporte."
          : reason === "unlinked"
          ? "Usuario sem negocio vinculado."
          : "Sessao expirada. Entre novamente.";
      return res.status(401).json({ message });
    }

    req.user = context.user;
    req.business = context.business;
    req.permissions = context.permissions;
    req.token = context.token;
    req.sessionToken = context.sessionToken;
    next();
  } catch (error) {
    next(error);
  }
}

module.exports = auth;
module.exports.resolveAuthContext = resolveAuthContext;
