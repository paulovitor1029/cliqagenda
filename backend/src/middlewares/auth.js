const { readDb } = require("../data/store");

async function auth(req, res, next) {
  const header = req.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";

  if (!token) {
    return res.status(401).json({ message: "Login necessario." });
  }

  try {
    const db = await readDb();
    const session = db.sessions.find(item => item.token === token);

    if (!session || new Date(session.expiresAt) <= new Date()) {
      return res.status(401).json({ message: "Sessao expirada. Entre novamente." });
    }

    const user = db.users.find(item => item.id === session.userId);
    const business = user
      ? db.businesses.find(item => item.id === user.businessId || item.ownerId === session.userId)
      : null;

    if (!user || !business) {
      return res.status(401).json({ message: "Usuario sem negocio vinculado." });
    }

    req.user = user;
    req.business = business;
    req.permissions = user.permissions || {};
    req.token = token;
    next();
  } catch (error) {
    next(error);
  }
}

module.exports = auth;
