const crypto = require("crypto");
const path = require("path");
const multer = require("multer");
const { Router } = require("express");
const auth = require("../middlewares/auth");
const {
  defaultPermissions,
  hashPassword,
  id,
  publicBusiness,
  publicProfessional,
  publicService,
  readDb,
  updateDb,
  verifyPassword
} = require("../data/store");
const { buildAppointmentMessage, sendWhatsAppMessage, waMeUrl } = require("../services/whatsapp.service");
const { resolveUploadedImageUrl } = require("../services/image-storage.service");
const { sendPasswordResetEmail } = require("../services/email.service");

const router = Router();
const tokenDays = 7;
const SESSION_COOKIE = "cliqagenda_session";
const SESSION_MAX_AGE_MS = tokenDays * 24 * 60 * 60 * 1000;

function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE_MS,
    path: "/"
  };
}

function setSessionCookie(res, token) {
  res.cookie(SESSION_COOKIE, token, sessionCookieOptions());
  res.set("Cache-Control", "no-store");
}

function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/"
  });
  res.set("Cache-Control", "no-store");
}

const uploadStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.resolve(__dirname, "../../uploads"));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase() || ".jpg";
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${ext}`);
  }
});

const upload = multer({
  storage: uploadStorage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) return cb(null, true);
    cb(new Error("Envie uma imagem JPG, PNG ou WEBP de ate 2 MB."));
  }
});

function tokenHash(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}


function requirePermission(req, permission) {
  if (req.user.role === "owner") return null;
  if (req.permissions && req.permissions[permission]) return null;
  return { status: 403, error: "Usuario sem permissao para esta acao." };
}

function parseWorkingHours(value, fallback = []) {
  const source = Array.isArray(value) ? value.join("\n") : String(value || "");
  const hours = source
    .split(/[\n,; ]+/)
    .map(item => item.trim())
    .filter(Boolean)
    .filter(item => /^\d{2}:\d{2}$/.test(item));
  const result = [...new Set(hours)].sort();
  return result.length ? result : fallback;
}

function parseWorkingDays(value, fallback = [1, 2, 3, 4, 5, 6]) {
  const source = Array.isArray(value) ? value : fallback;
  const days = source
    .map(item => Number(item))
    .filter(item => Number.isInteger(item) && item >= 0 && item <= 6);
  const result = [...new Set(days)].sort((a, b) => a - b);
  return result.length ? result : fallback;
}

function parseWorkingSchedule(schedule, workingDays = [1, 2, 3, 4, 5, 6], fallbackHours = []) {
  const selectedDays = parseWorkingDays(workingDays);
  const source = schedule && typeof schedule === "object" ? schedule : {};
  return Object.fromEntries(selectedDays.map(day => {
    const current = source[String(day)] || source[day] || {};
    const start = String(current.start || (fallbackHours[0] || "09:00"));
    const end = String(current.end || "18:00");
    const interval = Math.max(10, Number(current.interval || 30));
    const hours = parseWorkingHours(current.hours || [], fallbackHours);
    return [String(day), { enabled: current.enabled !== false, start, end, interval, hours }];
  }));
}

function weekdayFromDate(dateValue) {
  const date = new Date(`${dateValue}T12:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return date.getDay();
}

function professionalScheduleForDate(professional, dateValue) {
  const weekday = weekdayFromDate(dateValue);
  if (weekday === null) return null;
  const schedule = professional && professional.workingSchedule ? professional.workingSchedule[String(weekday)] || professional.workingSchedule[weekday] : null;
  if (!schedule || schedule.enabled === false) return null;
  return schedule;
}

function professionalWorksOnDate(professional, dateValue) {
  const weekday = weekdayFromDate(dateValue);
  if (weekday === null) return false;
  if (professional && professional.workingSchedule && professional.workingSchedule[String(weekday)]) {
    return professional.workingSchedule[String(weekday)].enabled !== false;
  }
  return parseWorkingDays(professional && professional.workingDays ? professional.workingDays : [1, 2, 3, 4, 5, 6]).includes(weekday);
}

function professionalWorkingHours(business, professional) {
  return professional && professional.workingHours && professional.workingHours.length
    ? professional.workingHours
    : (business.workingHours || []);
}

function professionalWorkingHoursForDate(business, professional, dateValue) {
  const schedule = professionalScheduleForDate(professional, dateValue);
  if (schedule && Array.isArray(schedule.hours) && schedule.hours.length) return schedule.hours;
  return professionalWorkingHours(business, professional);
}

function pixCopyPaste({ business, appointment, amount }) {
  const key = business.pixKey || business.whatsapp || "chave-pix-a-configurar";
  const label = `${business.slug}-${appointment.code}`.slice(0, 25).replace(/[^a-zA-Z0-9-]/g, "");
  return `PIX|CHAVE:${key}|VALOR:${Number(amount || 0).toFixed(2)}|NOME:${business.name}|REF:${label}`;
}

function dueTomorrow(date) {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return date === tomorrow.toISOString().slice(0, 10);
}

function paymentPayload(payment) {
  return {
    id: payment.id,
    appointmentId: payment.appointmentId || "",
    provider: payment.provider || "local_pix",
    method: payment.method || "pix",
    status: payment.status,
    amount: Number(payment.amount || 0),
    pixKey: payment.pixKey || "",
    pixCopyPaste: payment.pixCopyPaste || "",
    expiresAt: payment.expiresAt || "",
    createdAt: payment.createdAt || ""
  };
}

function financePayload(db, businessId) {
  const appointments = db.appointments.filter(item => item.businessId === businessId);
  const payments = (db.payments || []).filter(item => item.businessId === businessId);
  const active = appointments.filter(item => item.status !== "cancelled" && item.status !== "noshow");
  const paidPayments = payments.filter(item => item.status === "paid");
  const pendingPayments = payments.filter(item => item.status === "pending");
  return {
    grossRevenue: active.reduce((sum, item) => sum + Number(item.total || item.price || 0), 0),
    paidRevenue: paidPayments.reduce((sum, item) => sum + Number(item.amount || 0), 0),
    pendingPix: pendingPayments.reduce((sum, item) => sum + Number(item.amount || 0), 0),
    appointments: appointments.length,
    activeAppointments: active.length,
    payments: payments.map(paymentPayload)
  };
}

function onlyNumbers(value) {
  return String(value || "").replace(/\D/g, "");
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}

function slugify(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function publicBusinessContext(db, slug) {
  const business = db.businesses.find(item => item.slug === slug);
  if (!business) return null;
  const professionals = db.professionals.filter(item => item.businessId === business.id && item.active);
  return { business, professionals };
}

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

function isHexColor(value) {
  return /^#[0-9a-fA-F]{6}$/.test(String(value || "").trim());
}

function sanitizeTheme(input = {}, fallback = {}) {
  const source = input && typeof input === "object" ? input : {};
  const base = fallback && typeof fallback === "object" ? fallback : {};
  const theme = { ...defaultTheme, ...base };

  for (const key of Object.keys(defaultTheme)) {
    if (isHexColor(source[key])) theme[key] = String(source[key]).trim();
  }

  return theme;
}

function code() {
  return crypto.randomBytes(3).toString("hex").toUpperCase();
}

function appointmentDateTime(appointment) {
  return new Date(`${appointment.date}T${appointment.time}:00`);
}

function hoursUntil(appointment) {
  return (appointmentDateTime(appointment).getTime() - Date.now()) / 36e5;
}

function canChangeAppointment(business, appointment, type) {
  if (appointment.status === "cancelled" || appointment.status === "done") return false;
  const key = type === "cancel" ? "cancellationHours" : "rescheduleHours";
  return hoursUntil(appointment) >= Number(business[key] || 0);
}

function timeToMinutes(value) {
  const [hours, minutes] = String(value || "00:00").split(":").map(Number);
  return (hours * 60) + minutes;
}

function minutesToTime(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60).toString().padStart(2, "0");
  const minutes = (totalMinutes % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

function serviceDurationWithBuffer(service) {
  return Math.max(10, Number(service && service.duration ? service.duration : 30)) + Math.max(0, Number(service && service.buffer ? service.buffer : 0));
}

function findAppointmentService(db, appointment) {
  return db.services.find(service => service.id === appointment.serviceId && service.businessId === appointment.businessId);
}

function rangesOverlap(startA, endA, startB, endB) {
  return startA < endB && endA > startB;
}

function hasBlockConflict(db, businessId, date, time, durationMinutes, professionalId = "") {
  const start = timeToMinutes(time);
  const end = start + Math.max(10, Number(durationMinutes || 30));

  return db.blocks.some(block => {
    if (block.businessId !== businessId || block.date !== date) return false;
    if (block.professionalId && professionalId && block.professionalId !== professionalId) return false;
    if (block.professionalId && !professionalId) return false;
    if (block.allDay) return true;

    const blockStart = timeToMinutes(block.startTime);
    const requestedBlockEnd = timeToMinutes(block.endTime);
    const blockEnd = requestedBlockEnd > blockStart ? requestedBlockEnd : blockStart + 1;
    return rangesOverlap(start, end, blockStart, blockEnd);
  });
}

function isBlocked(db, businessId, date, time, professionalId = "") {
  return hasBlockConflict(db, businessId, date, time, 1, professionalId);
}

function isOccupied(db, businessId, professionalId, date, time, serviceOrDuration = 30, ignoredId) {
  const requestedDuration = typeof serviceOrDuration === "object"
    ? serviceDurationWithBuffer(serviceOrDuration)
    : Math.max(10, Number(serviceOrDuration || 30));
  const requestedStart = timeToMinutes(time);
  const requestedEnd = requestedStart + requestedDuration;

  return db.appointments.some(appointment => {
    if (appointment.businessId !== businessId
      || appointment.professionalId !== professionalId
      || appointment.id === ignoredId
      || appointment.date !== date
      || appointment.status === "cancelled") {
      return false;
    }

    const appointmentService = findAppointmentService(db, appointment);
    const appointmentStart = timeToMinutes(appointment.time);
    const appointmentEnd = appointmentStart + serviceDurationWithBuffer(appointmentService);
    return rangesOverlap(requestedStart, requestedEnd, appointmentStart, appointmentEnd);
  });
}

function canFitInsideWorkingHours(professionalHours, time, durationMinutes) {
  if (!professionalHours.length) return false;
  const start = timeToMinutes(time);
  const end = start + Math.max(10, Number(durationMinutes || 30));
  const sorted = [...professionalHours].sort();
  const first = timeToMinutes(sorted[0]);
  const last = timeToMinutes(sorted[sorted.length - 1]);

  if (sorted.length === 1) return start === first;

  const intervals = sorted
    .slice(1)
    .map((slot, index) => timeToMinutes(slot) - timeToMinutes(sorted[index]))
    .filter(diff => diff > 0);
  const mostCommonInterval = intervals.length
    ? intervals.sort((a, b) => intervals.filter(x => x === b).length - intervals.filter(x => x === a).length)[0]
    : 30;

  return start >= first && end <= last + mostCommonInterval;
}

function appointmentPayload(appointment) {
  return {
    id: appointment.id,
    professionalId: appointment.professionalId || "",
    professionalName: appointment.professionalName || "",
    serviceId: appointment.serviceId,
    service: appointment.service,
    price: appointment.price,
    total: appointment.total,
    date: appointment.date,
    time: appointment.time,
    customer: appointment.customer,
    phone: appointment.phone,
    coupon: appointment.coupon || "",
    recurrence: appointment.recurrence || 0,
    code: appointment.code,
    status: appointment.status,
    createdAt: appointment.createdAt,
    updatedAt: appointment.updatedAt
  };
}

function businessBundle(db, business) {
  return {
    business: publicBusiness(business),
    professionals: db.professionals
      .filter(professional => professional.businessId === business.id)
      .map(publicProfessional),
    services: db.services
      .filter(service => service.businessId === business.id)
      .map(publicService),
    appointments: db.appointments
      .filter(appointment => appointment.businessId === business.id)
      .map(appointmentPayload),
    waitlist: db.waitlist.filter(item => item.businessId === business.id),
    blocks: db.blocks.filter(block => block.businessId === business.id),
    users: db.users
      .filter(user => user.businessId === business.id || business.ownerId === user.id)
      .map(user => ({ id: user.id, name: user.name, email: user.email, role: user.role, permissions: user.permissions || {} })),
    payments: (db.payments || []).filter(payment => payment.businessId === business.id).map(paymentPayload),
    finance: financePayload(db, business.id)
  };
}


router.post("/auth/register", async (req, res) => {
  const name = String(req.body.name || "").trim().slice(0, 100);
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const whatsapp = onlyNumbers(req.body.whatsapp);
  const businessType = String(req.body.businessType || "Outro").trim().slice(0, 60) || "Outro";
  const slug = slugify(req.body.slug || name).slice(0, 60);

  if (!name || !validEmail(email) || password.length < 8 || password.length > 128 || whatsapp.length < 10 || whatsapp.length > 15 || slug.length < 3) {
    return res.status(400).json({ message: "Informe nome, e-mail válido, senha de 8+ caracteres, WhatsApp e identificador do negócio." });
  }

  const result = await updateDb(db => {
    if (db.users.some(user => user.email === email)) return { error: "Email ja cadastrado." };
    if (db.businesses.some(business => business.slug === slug)) return { error: "Identificador do negócio já está em uso." };

    const userId = id("usr");
    const businessId = id("biz");
    const passwordData = hashPassword(password);
    const user = { id: userId, name, email, role: "owner", businessId, permissions: defaultPermissions("owner"), ...passwordData, createdAt: new Date().toISOString() };
    const business = {
      id: businessId,
      ownerId: userId,
      name,
      slug,
      whatsapp,
      businessType,
      address: String(req.body.address || "").trim(),
      description: String(req.body.description || "Agenda online do negocio.").trim().slice(0, 150),
      photoUrl: "",
      theme: sanitizeTheme(req.body.theme),
      deposit: 0,
      pixKey: "",
      cancellationHours: 6,
      rescheduleHours: 6,
      allowClientCancel: true,
      allowClientReschedule: true,
      workingHours: ["09:00", "09:30", "10:00", "10:30", "11:00", "13:00", "13:30", "14:00", "14:30", "15:00", "15:30", "16:00", "16:30", "17:00"]
    };
    db.users.push(user);
    db.businesses.push(business);

    const token = crypto.randomBytes(32).toString("hex");
    db.sessions.push({
      id: id("ses"),
      userId,
      token: tokenHash(token),
      expiresAt: new Date(Date.now() + tokenDays * 864e5).toISOString()
    });

    return { token, user: { id: user.id, name: user.name, email: user.email, role: user.role, permissions: user.permissions || {} }, ...businessBundle(db, business) };
  });

  if (result.error) return res.status(409).json({ message: result.error });
  const { token, ...payload } = result;
  setSessionCookie(res, token);
  return res.status(201).json(payload);
});

router.post("/auth/password/forgot", async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  let resetToken = "";
  let resetUrl = "";

  await updateDb(db => {
    const user = db.users.find(item => item.email === email);
    if (!user) return {};

    resetToken = crypto.randomBytes(32).toString("hex");
    resetUrl = `${process.env.PUBLIC_BASE_URL || "http://localhost:3000"}/login?resetToken=${resetToken}`;
    db.passwordResetTokens = (db.passwordResetTokens || []).filter(item => item.userId !== user.id || item.usedAt);
    db.passwordResetTokens.push({
      id: id("rst"),
      userId: user.id,
      tokenHash: tokenHash(resetToken),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      usedAt: "",
      createdAt: new Date().toISOString()
    });
    return {};
  });

  const emailResult = resetUrl ? await sendPasswordResetEmail(email, resetUrl) : { sent: false, provider: "none" };

  res.json({
    message: "Se este e-mail existir, enviaremos as instrucoes de recuperacao.",
    email: emailResult,
    resetUrl: process.env.NODE_ENV !== "production" ? resetUrl : undefined,
    resetToken: process.env.NODE_ENV !== "production" ? resetToken : undefined
  });
});

router.post("/auth/password/reset", async (req, res) => {
  const token = String(req.body.token || "").trim();
  const password = String(req.body.password || "");
  if (!token || password.length < 8 || password.length > 128) {
    return res.status(400).json({ message: "Informe token e nova senha com no mínimo 8 caracteres." });
  }

  const result = await updateDb(db => {
    const currentHash = tokenHash(token);
    const reset = (db.passwordResetTokens || []).find(item => item.tokenHash === currentHash && !item.usedAt);
    if (!reset) return { status: 400, error: "Token invalido ou ja utilizado." };
    if (new Date(reset.expiresAt).getTime() < Date.now()) return { status: 400, error: "Token expirado." };

    const user = db.users.find(item => item.id === reset.userId);
    if (!user) return { status: 404, error: "Usuario nao encontrado." };

    const passwordData = hashPassword(password);
    user.salt = passwordData.salt;
    user.hash = passwordData.hash;
    reset.usedAt = new Date().toISOString();
    db.sessions = db.sessions.filter(session => session.userId !== user.id);
    return {};
  });

  if (result.error) return res.status(result.status || 400).json({ message: result.error });
  res.json({ message: "Senha atualizada. Faca login novamente." });
});

router.post("/auth/login", async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  if (!validEmail(email) || !password || password.length > 128) {
    return res.status(401).json({ message: "Email ou senha invalidos." });
  }

  const result = await updateDb(db => {
    const user = db.users.find(item => item.email === email);
    if (!user || !verifyPassword(password, user.salt, user.hash)) return { error: "Email ou senha invalidos." };
    const business = db.businesses.find(item => item.id === user.businessId || item.ownerId === user.id);
    if (!business) return { error: "Usuario sem negocio vinculado." };

    const token = crypto.randomBytes(32).toString("hex");
    db.sessions.push({
      id: id("ses"),
      userId: user.id,
      token: tokenHash(token),
      expiresAt: new Date(Date.now() + tokenDays * 864e5).toISOString()
    });

    return { token, user: { id: user.id, name: user.name, email: user.email, role: user.role, permissions: user.permissions || {} }, ...businessBundle(db, business) };
  });

  if (result.error) return res.status(401).json({ message: result.error });
  const { token, ...payload } = result;
  setSessionCookie(res, token);
  res.json(payload);
});

router.post("/auth/logout", auth, async (req, res) => {
  await updateDb(db => {
    db.sessions = db.sessions.filter(session => session.token !== req.sessionToken);
  });
  clearSessionCookie(res);
  res.status(204).end();
});

router.get("/auth/me", auth, async (req, res) => {
  const db = await readDb();
  res.set("Cache-Control", "no-store");
  res.json({
    user: { id: req.user.id, name: req.user.name, email: req.user.email, role: req.user.role, permissions: req.user.permissions || {} },
    ...businessBundle(db, req.business)
  });
});

router.get("/public/:slug", async (req, res) => {
  const db = await readDb();
  const context = publicBusinessContext(db, req.params.slug);
  if (!context) return res.status(404).json({ message: "Negócio não encontrado." });
  const { business, professionals } = context;
  const professionalIds = new Set(professionals.map(item => item.id));

  res.json({
    business: publicBusiness(business),
    professionals: professionals.map(publicProfessional),
    services: db.services
      .filter(service => service.businessId === business.id && professionalIds.has(service.professionalId) && service.active !== false)
      .map(publicService),
    blocks: db.blocks.filter(block => block.businessId === business.id)
  });
});

router.get("/public/:slug/slots", async (req, res) => {
  const db = await readDb();
  const context = publicBusinessContext(db, req.params.slug);
  if (!context) return res.status(404).json({ message: "Negócio não encontrado." });
  const { business, professionals } = context;

  const date = String(req.query.date || "");
  const professionalId = String(req.query.professionalId || "");
  const serviceId = String(req.query.serviceId || "");
  const professional = professionals.find(item => item.id === professionalId);
  if (!professional) return res.status(400).json({ message: "Selecione um profissional válido." });

  const service = db.services.find(item => item.businessId === business.id && item.professionalId === professional.id && item.id === serviceId && item.active !== false);
  if (!serviceId || !service) return res.status(400).json({ message: "Selecione um servico valido para calcular a duracao do atendimento." });

  if (!professionalWorksOnDate(professional, date)) {
    return res.json({
      slots: [],
      duration: Number(service.duration || 30),
      buffer: Number(service.buffer || 0),
      durationWithBuffer: serviceDurationWithBuffer(service),
      message: "Profissional nao atende neste dia."
    });
  }

  const durationWithBuffer = serviceDurationWithBuffer(service);
  const professionalHours = professionalWorkingHoursForDate(business, professional, date);
  const slots = professionalHours.filter(time => {
    return canFitInsideWorkingHours(professionalHours, time, durationWithBuffer)
      && !hasBlockConflict(db, business.id, date, time, durationWithBuffer, professional.id)
      && !isOccupied(db, business.id, professional.id, date, time, service);
  });

  res.json({
    slots,
    duration: Number(service.duration || 30),
    buffer: Number(service.buffer || 0),
    durationWithBuffer
  });
});

router.post("/public/:slug/appointments", async (req, res) => {
  const result = await updateDb(db => {
    const context = publicBusinessContext(db, req.params.slug);
    if (!context) return { status: 404, error: "Negócio não encontrado." };
    const { business, professionals } = context;

    const professional = professionals.find(item => item.id === req.body.professionalId);
    const service = professional
      ? db.services.find(item => item.businessId === business.id && item.professionalId === professional.id && item.id === req.body.serviceId && item.active !== false)
      : null;
    const date = String(req.body.date || "");
    const time = String(req.body.time || "");
    const customer = String(req.body.customer || "").trim();
    const phone = onlyNumbers(req.body.phone);

    if (!professional || !service || !date || !time || !customer || !phone) return { status: 400, error: "Preencha profissional, serviço, data, horário, nome e WhatsApp." };
    if (!professionalWorksOnDate(professional, date)) return { status: 400, error: "Este profissional nao atende neste dia da semana." };
    const professionalHours = professionalWorkingHoursForDate(business, professional, date);
    const durationWithBuffer = serviceDurationWithBuffer(service);
    if (!professionalHours.includes(time) || !canFitInsideWorkingHours(professionalHours, time, durationWithBuffer)) {
      return { status: 400, error: "Horario fora do expediente do profissional para a duracao deste servico." };
    }
    if (hasBlockConflict(db, business.id, date, time, durationWithBuffer, professional.id)) return { status: 409, error: "Horario bloqueado pelo ADM." };
    if (isOccupied(db, business.id, professional.id, date, time, service)) return { status: 409, error: "Horario ja ocupado para este profissional." };

    const coupon = String(req.body.coupon || "").trim().toUpperCase();
    const discount = coupon === "PRIMEIROCORTE" ? 10 : 0;
    const total = Math.max(0, Number(service.price) - discount);
    const appointment = {
      id: id("apt"),
      businessId: business.id,
      professionalId: professional.id,
      professionalName: professional.name,
      serviceId: service.id,
      service: service.name,
      price: Number(service.price),
      total,
      date,
      time,
      customer,
      phone,
      coupon,
      recurrence: Number(req.body.recurrence || 0),
      code: code(),
      status: Number(business.deposit || 0) > 0 ? "pending" : "confirmed",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    db.appointments.push(appointment);

    let payment = null;
    if (Number(business.deposit || 0) > 0) {
      payment = {
        id: id("pay"),
        businessId: business.id,
        appointmentId: appointment.id,
        provider: process.env.PIX_PROVIDER || "local_pix",
        method: "pix",
        status: "pending",
        amount: Number(business.deposit || 0),
        pixKey: business.pixKey || "",
        pixCopyPaste: pixCopyPaste({ business, appointment, amount: business.deposit }),
        externalId: "",
        expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      db.payments = db.payments || [];
      db.payments.push(payment);
    }

    return { appointment: appointmentPayload(appointment), payment: payment ? paymentPayload(payment) : null, business: publicBusiness(business) };
  });

  if (result.error) return res.status(result.status || 400).json({ message: result.error });
  res.status(201).json(result);
});

router.post("/public/:slug/appointments/:id/whatsapp-confirmation", async (req, res) => {
  const db = await readDb();
  const context = publicBusinessContext(db, req.params.slug);
  if (!context) return res.status(404).json({ message: "Negócio não encontrado." });
  const { business } = context;

  const appointment = db.appointments.find(item => item.id === req.params.id && item.businessId === business.id);
  if (!appointment) return res.status(404).json({ message: "Agendamento nao encontrado." });

  const message = buildAppointmentMessage({ business: publicBusiness(business), appointment: appointmentPayload(appointment) });
  const result = await sendWhatsAppMessage({ to: business.whatsapp, message });

  res.json({
    whatsapp: result,
    fallbackUrl: result.url || waMeUrl(business.whatsapp, message),
    message
  });
});

router.get("/appointments/lookup/:code", async (req, res) => {
  const db = await readDb();
  const appointment = db.appointments.find(item => item.code === String(req.params.code || "").toUpperCase());
  if (!appointment) return res.status(404).json({ message: "Codigo nao encontrado." });
  const business = db.businesses.find(item => item.id === appointment.businessId);
  res.json({
    appointment: appointmentPayload(appointment),
    business: publicBusiness(business),
    canCancel: business.allowClientCancel && canChangeAppointment(business, appointment, "cancel"),
    canReschedule: business.allowClientReschedule && canChangeAppointment(business, appointment, "reschedule")
  });
});

router.post("/appointments/:id/cancel", async (req, res) => {
  const result = await updateDb(db => {
    const appointment = db.appointments.find(item => item.id === req.params.id);
    if (!appointment) return { status: 404, error: "Agendamento nao encontrado." };
    const business = db.businesses.find(item => item.id === appointment.businessId);
    if (!business.allowClientCancel || !canChangeAppointment(business, appointment, "cancel")) {
      return { status: 403, error: `Cancelamento permitido ate ${business.cancellationHours}h antes.` };
    }
    appointment.status = "cancelled";
    appointment.updatedAt = new Date().toISOString();
    return { appointment: appointmentPayload(appointment) };
  });
  if (result.error) return res.status(result.status || 400).json({ message: result.error });
  res.json(result);
});

router.post("/appointments/:id/reschedule", async (req, res) => {
  const result = await updateDb(db => {
    const appointment = db.appointments.find(item => item.id === req.params.id);
    if (!appointment) return { status: 404, error: "Agendamento nao encontrado." };
    const business = db.businesses.find(item => item.id === appointment.businessId);
    const date = String(req.body.date || "");
    const time = String(req.body.time || "");

    if (!business.allowClientReschedule || !canChangeAppointment(business, appointment, "reschedule")) {
      return { status: 403, error: `Remarcacao permitida ate ${business.rescheduleHours}h antes.` };
    }
    const professional = db.professionals.find(item => item.id === appointment.professionalId && item.businessId === business.id);
    const service = findAppointmentService(db, appointment);
    if (!professionalWorksOnDate(professional, date)) return { status: 400, error: "Este profissional nao atende neste dia da semana." };
    const professionalHours = professionalWorkingHoursForDate(business, professional, date);
    const durationWithBuffer = serviceDurationWithBuffer(service);
    if (!date || !time || !professional || !professionalHours.includes(time) || !canFitInsideWorkingHours(professionalHours, time, durationWithBuffer)) {
      return { status: 400, error: "Nova data ou horario invalido para a duracao deste servico." };
    }
    if (hasBlockConflict(db, business.id, date, time, durationWithBuffer, appointment.professionalId)) return { status: 409, error: "Novo horario esta bloqueado." };
    if (isOccupied(db, business.id, appointment.professionalId, date, time, service, appointment.id)) return { status: 409, error: "Novo horario ja esta ocupado para este profissional." };

    appointment.date = date;
    appointment.time = time;
    appointment.status = "pending";
    appointment.updatedAt = new Date().toISOString();
    return { appointment: appointmentPayload(appointment) };
  });
  if (result.error) return res.status(result.status || 400).json({ message: result.error });
  res.json(result);
});

router.post("/public/:slug/waitlist", async (req, res) => {
  const result = await updateDb(db => {
    const context = publicBusinessContext(db, req.params.slug);
    if (!context) return { status: 404, error: "Negócio não encontrado." };
    const { business, professionals } = context;
    const professional = professionals.find(item => item.id === req.body.professionalId);
    if (!professional) return { status: 400, error: "Selecione um profissional válido." };
    const service = db.services.find(item => item.businessId === business.id && item.professionalId === professional.id && item.id === req.body.serviceId);
    const item = {
      id: id("wait"),
      businessId: business.id,
      name: String(req.body.name || "").trim(),
      phone: onlyNumbers(req.body.phone),
      date: String(req.body.date || ""),
      period: String(req.body.period || "").trim(),
      service: service ? `${service.name} com ${professional.name}` : `Atendimento com ${professional.name}`,
      createdAt: new Date().toISOString()
    };
    if (!item.name || !item.phone || !item.date || !item.period) return { status: 400, error: "Preencha a lista de espera." };
    db.waitlist.push(item);
    return { item };
  });
  if (result.error) return res.status(result.status || 400).json({ message: result.error });
  res.status(201).json(result);
});

router.get("/admin", auth, async (req, res) => {
  const db = await readDb();
  res.json(businessBundle(db, req.business));
});

router.get("/admin/finance", auth, async (req, res) => {
  const permissionError = requirePermission(req, "finance");
  if (permissionError) return res.status(permissionError.status).json({ message: permissionError.error });
  const db = await readDb();
  res.json(financePayload(db, req.business.id));
});

router.post("/admin/payments/:id/status", auth, async (req, res) => {
  const permissionError = requirePermission(req, "finance");
  if (permissionError) return res.status(permissionError.status).json({ message: permissionError.error });
  const allowed = ["pending", "paid", "cancelled", "expired", "refunded"];
  const result = await updateDb(db => {
    const payment = (db.payments || []).find(item => item.id === req.params.id && item.businessId === req.business.id);
    if (!payment) return { status: 404, error: "Pagamento nao encontrado." };
    if (!allowed.includes(req.body.status)) return { status: 400, error: "Status de pagamento invalido." };
    payment.status = req.body.status;
    payment.paidAt = req.body.status === "paid" ? new Date().toISOString() : payment.paidAt || "";
    payment.updatedAt = new Date().toISOString();
    return { payment: paymentPayload(payment) };
  });
  if (result.error) return res.status(result.status || 400).json({ message: result.error });
  res.json(result);
});

router.post("/admin/reminders/send", auth, async (req, res) => {
  const permissionError = requirePermission(req, "appointments");
  if (permissionError) return res.status(permissionError.status).json({ message: permissionError.error });
  const db = await readDb();
  const appointments = db.appointments.filter(item => item.businessId === req.business.id && ["pending", "confirmed"].includes(item.status) && dueTomorrow(item.date));
  const sent = [];
  await updateDb(mutDb => {
    mutDb.reminders = mutDb.reminders || [];
    for (const appointment of appointments) {
      const message = `Ola, ${appointment.customer}! Lembrete do seu horario em ${req.business.name}: ${appointment.service}, ${appointment.professionalName ? `${appointment.professionalName}, ` : ""}${appointment.date} as ${appointment.time}. Codigo: ${appointment.code}`;
      mutDb.reminders.push({ id: id("rem"), businessId: req.business.id, appointmentId: appointment.id, channel: "whatsapp", status: "queued", provider: process.env.WHATSAPP_PROVIDER || "fallback", message, sentAt: new Date().toISOString() });
      sent.push({ appointmentId: appointment.id, phone: appointment.phone, fallbackUrl: waMeUrl(appointment.phone, message), message });
    }
    return {};
  });
  res.json({ total: sent.length, reminders: sent });
});

router.post("/admin/users", auth, async (req, res) => {
  const permissionError = requirePermission(req, "users");
  if (permissionError) return res.status(permissionError.status).json({ message: permissionError.error });
  if (req.user.role !== "owner") return res.status(403).json({ message: "Apenas o dono do negócio pode criar novos usuários." });
  const email = String(req.body.email || "").trim().toLowerCase();
  const name = String(req.body.name || "").trim().slice(0, 100);
  const password = String(req.body.password || "");
  const role = String(req.body.role || "business_admin").trim();
  const permissions = req.body.permissions || defaultPermissions(role);
  const result = await updateDb(db => {
    if (!validEmail(email) || !name || password.length < 8 || password.length > 128) {
      return { status: 400, error: "Informe nome, e-mail válido e senha com no mínimo 8 caracteres." };
    }
    if (db.users.some(user => user.email === email)) return { status: 409, error: "Email ja cadastrado." };
    const { salt, hash } = hashPassword(password);
    const user = { id: id("usr"), name, email, salt, hash, role, businessId: req.business.id, permissions, createdAt: new Date().toISOString() };
    db.users.push(user);
    return { user: { id: user.id, name: user.name, email: user.email, role: user.role, permissions: user.permissions } };
  });
  if (result.error) return res.status(result.status || 400).json({ message: result.error });
  res.status(201).json(result);
});

router.post("/admin/business/photo", auth, upload.single("photo"), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: "Envie uma imagem valida." });

  const photoUrl = await resolveUploadedImageUrl(req.file);
  const result = await updateDb(db => {
    const business = db.businesses.find(item => item.id === req.business.id);
    business.photoUrl = photoUrl;
    return { business: publicBusiness(business), photoUrl };
  });

  res.status(201).json(result);
});

router.put("/admin/business", auth, async (req, res) => {
  const permissionError = requirePermission(req, "settings");
  if (permissionError) return res.status(permissionError.status).json({ message: permissionError.error });
  const result = await updateDb(db => {
    const business = db.businesses.find(item => item.id === req.business.id);
    const nextSlug = slugify(req.body.slug || business.slug);
    if (db.businesses.some(item => item.id !== business.id && item.slug === nextSlug)) {
      return { status: 409, error: "Identificador do negócio já está em uso." };
    }
    business.name = String(req.body.name || business.name).trim();
    business.slug = nextSlug;
    business.whatsapp = onlyNumbers(req.body.whatsapp || business.whatsapp);
    business.businessType = String(req.body.businessType || business.businessType || "Outro").trim().slice(0, 60) || "Outro";
    business.address = String(req.body.address || "").trim();
    business.description = String(req.body.description || "").trim().slice(0, 150);
    business.photoUrl = String(req.body.photoUrl || "").trim();
    business.theme = sanitizeTheme(req.body.theme, business.theme);
    business.deposit = Number(req.body.deposit || 0);
    business.pixKey = String(req.body.pixKey || "").trim();
    business.cancellationHours = Number(req.body.cancellationHours || 0);
    business.rescheduleHours = Number(req.body.rescheduleHours || 0);
    business.allowClientCancel = Boolean(req.body.allowClientCancel);
    business.allowClientReschedule = Boolean(req.body.allowClientReschedule);
    return { business: publicBusiness(business) };
  });
  if (result.error) return res.status(result.status || 400).json({ message: result.error });
  res.json(result);
});

router.post("/admin/professionals", auth, async (req, res) => {
  const permissionError = requirePermission(req, "professionals");
  if (permissionError) return res.status(permissionError.status).json({ message: permissionError.error });
  const result = await updateDb(db => {
    const name = String(req.body.name || "").trim();
    const professional = {
      id: id("pro"),
      businessId: req.business.id,
      name,
      specialty: String(req.body.specialty || "").trim(),
      photoUrl: String(req.body.photoUrl || "").trim(),
      workingHours: parseWorkingHours(req.body.workingHours, req.business.workingHours),
      workingDays: parseWorkingDays(req.body.workingDays),
      workingSchedule: parseWorkingSchedule(req.body.workingSchedule, req.body.workingDays, parseWorkingHours(req.body.workingHours, req.business.workingHours)),
      active: true,
      createdAt: new Date().toISOString()
    };
    if (!professional.name) return { status: 400, error: "Informe o nome do profissional." };
    db.professionals.push(professional);
    return { professional: publicProfessional(professional) };
  });
  if (result.error) return res.status(result.status || 400).json({ message: result.error });
  res.status(201).json(result);
});

router.patch("/admin/professionals/:id", auth, async (req, res) => {
  const permissionError = requirePermission(req, "professionals");
  if (permissionError) return res.status(permissionError.status).json({ message: permissionError.error });
  const result = await updateDb(db => {
    const professional = db.professionals.find(item => item.businessId === req.business.id && item.id === req.params.id);
    if (!professional) return { status: 404, error: "Profissional nao encontrado." };
    const name = String(req.body.name || professional.name).trim();
    if (!name) return { status: 400, error: "Informe o nome do profissional." };
    professional.name = name;
    professional.specialty = String(req.body.specialty ?? professional.specialty ?? "").trim();
    return { professional: publicProfessional(professional) };
  });
  if (result.error) return res.status(result.status || 400).json({ message: result.error });
  res.json(result);
});

router.post("/admin/professionals/:id/photo", auth, upload.single("photo"), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: "Envie uma imagem valida." });

  const photoUrl = await resolveUploadedImageUrl(req.file);
  const result = await updateDb(db => {
    const professional = db.professionals.find(item => item.businessId === req.business.id && item.id === req.params.id);
    if (!professional) return { status: 404, error: "Profissional nao encontrado." };
    professional.photoUrl = photoUrl;
    return { professional: publicProfessional(professional), photoUrl };
  });

  if (result.error) return res.status(result.status || 400).json({ message: result.error });
  res.status(201).json(result);
});

router.delete("/admin/professionals/:id/photo", auth, async (req, res) => {
  const permissionError = requirePermission(req, "professionals");
  if (permissionError) return res.status(permissionError.status).json({ message: permissionError.error });

  const result = await updateDb(db => {
    const professional = db.professionals.find(item => item.businessId === req.business.id && item.id === req.params.id);
    if (!professional) return { status: 404, error: "Profissional nao encontrado." };
    professional.photoUrl = "";
    return { professional: publicProfessional(professional) };
  });

  if (result.error) return res.status(result.status || 400).json({ message: result.error });
  res.json(result);
});

router.put("/admin/professionals/:id/hours", auth, async (req, res) => {
  const permissionError = requirePermission(req, "professionals");
  if (permissionError) return res.status(permissionError.status).json({ message: permissionError.error });
  const result = await updateDb(db => {
    const professional = db.professionals.find(item => item.businessId === req.business.id && item.id === req.params.id);
    if (!professional) return { status: 404, error: "Profissional nao encontrado." };
    professional.workingHours = parseWorkingHours(req.body.workingHours, req.business.workingHours);
    professional.workingDays = parseWorkingDays(req.body.workingDays, professional.workingDays || [1, 2, 3, 4, 5, 6]);
    professional.workingSchedule = parseWorkingSchedule(req.body.workingSchedule, professional.workingDays, professional.workingHours);
    if (!professional.workingDays.length) return { status: 400, error: "Informe ao menos um dia de trabalho." };
    if (!professional.workingHours.length) return { status: 400, error: "Informe ao menos um horario valido no formato HH:MM." };
    return { professional: publicProfessional(professional) };
  });
  if (result.error) return res.status(result.status || 400).json({ message: result.error });
  res.json(result);
});

router.patch("/admin/professionals/:id/active", auth, async (req, res) => {
  const permissionError = requirePermission(req, "professionals");
  if (permissionError) return res.status(permissionError.status).json({ message: permissionError.error });
  const result = await updateDb(db => {
    const professional = db.professionals.find(item => item.businessId === req.business.id && item.id === req.params.id);
    if (!professional) return { status: 404, error: "Profissional nao encontrado." };
    professional.active = Boolean(req.body.active);
    db.services.forEach(service => {
      if (service.businessId === req.business.id && service.professionalId === professional.id && !professional.active) service.active = false;
    });
    return { professional: publicProfessional(professional) };
  });
  if (result.error) return res.status(result.status || 400).json({ message: result.error });
  res.json(result);
});

router.delete("/admin/professionals/:id", auth, async (req, res) => {
  const result = await updateDb(db => {
    const hasAppointment = db.appointments.some(item => item.businessId === req.business.id && item.professionalId === req.params.id);
    if (hasAppointment) return { status: 409, error: "Profissional possui historico de agendamentos e nao pode ser excluido. Desative futuramente em vez de excluir." };
    db.services = db.services.filter(item => item.professionalId !== req.params.id || item.businessId !== req.business.id);
    db.professionals = db.professionals.filter(item => item.id !== req.params.id || item.businessId !== req.business.id);
    return {};
  });
  if (result.error) return res.status(result.status || 400).json({ message: result.error });
  res.status(204).end();
});

router.post("/admin/services", auth, async (req, res) => {
  const permissionError = requirePermission(req, "services");
  if (permissionError) return res.status(permissionError.status).json({ message: permissionError.error });
  const service = await updateDb(db => {
    const professional = db.professionals.find(item => item.businessId === req.business.id && item.id === req.body.professionalId && item.active);
    if (!professional) return { error: "Selecione um profissional valido." };

    const item = {
      id: id("svc"),
      businessId: req.business.id,
      professionalId: professional.id,
      professionalName: professional.name,
      name: String(req.body.name || "").trim(),
      price: Number(req.body.price || 0),
      duration: Number(req.body.duration || 30),
      buffer: Number(req.body.buffer || 0),
      active: true,
      createdAt: new Date().toISOString()
    };
    if (!item.name || item.price < 0 || item.duration < 10) return { error: "Servico invalido." };
    db.services.push(item);
    return publicService(item);
  });
  if (service.error) return res.status(service.status || 400).json({ message: service.error });
  res.status(201).json({ service });
});

router.patch("/admin/services/:id/active", auth, async (req, res) => {
  const permissionError = requirePermission(req, "services");
  if (permissionError) return res.status(permissionError.status).json({ message: permissionError.error });
  const result = await updateDb(db => {
    const service = db.services.find(item => item.businessId === req.business.id && item.id === req.params.id);
    if (!service) return { status: 404, error: "Servico nao encontrado." };
    service.active = Boolean(req.body.active);
    return { service: publicService(service) };
  });
  if (result.error) return res.status(result.status || 400).json({ message: result.error });
  res.json(result);
});

router.delete("/admin/services/:id", auth, async (req, res) => {
  const result = await updateDb(db => {
    const hasAppointment = db.appointments.some(item => item.businessId === req.business.id && item.serviceId === req.params.id);
    if (hasAppointment) return { status: 409, error: "Servico possui historico de agendamentos e nao pode ser excluido." };
    db.services = db.services.filter(item => item.id !== req.params.id || item.businessId !== req.business.id);
    return {};
  });
  if (result.error) return res.status(result.status || 400).json({ message: result.error });
  res.status(204).end();
});

router.patch("/admin/appointments/:id", auth, async (req, res) => {
  const permissionError = requirePermission(req, "appointments");
  if (permissionError) return res.status(permissionError.status).json({ message: permissionError.error });
  const result = await updateDb(db => {
    const appointment = db.appointments.find(item => item.id === req.params.id && item.businessId === req.business.id);
    if (!appointment) return { status: 404, error: "Agendamento nao encontrado." };
    const allowed = ["pending", "confirmed", "cancelled", "done", "noshow"];
    if (!allowed.includes(req.body.status)) return { status: 400, error: "Status invalido." };
    appointment.status = req.body.status;
    appointment.updatedAt = new Date().toISOString();
    return { appointment: appointmentPayload(appointment) };
  });
  if (result.error) return res.status(result.status || 400).json({ message: result.error });
  res.json(result);
});

router.post("/admin/blocks", auth, async (req, res) => {
  const permissionError = requirePermission(req, "blocks");
  if (permissionError) return res.status(permissionError.status).json({ message: permissionError.error });
  const result = await updateDb(db => {
    const block = {
      id: id("blk"),
      businessId: req.business.id,
      date: String(req.body.date || ""),
      allDay: Boolean(req.body.allDay),
      startTime: String(req.body.startTime || ""),
      endTime: String(req.body.endTime || ""),
      reason: String(req.body.reason || "Bloqueio do ADM").trim(),
      professionalId: String(req.body.professionalId || "").trim(),
      createdAt: new Date().toISOString()
    };
    if (!block.date || (!block.allDay && (!block.startTime || !block.endTime || block.startTime > block.endTime))) {
      return { status: 400, error: "Informe data e faixa de horario validas." };
    }
    db.blocks.push(block);
    return { block };
  });
  if (result.error) return res.status(result.status || 400).json({ message: result.error });
  res.status(201).json(result);
});

router.delete("/admin/blocks/:id", auth, async (req, res) => {
  await updateDb(db => {
    db.blocks = db.blocks.filter(item => item.id !== req.params.id || item.businessId !== req.business.id);
  });
  res.status(204).end();
});

router.delete("/admin/waitlist/:id", auth, async (req, res) => {
  await updateDb(db => {
    db.waitlist = db.waitlist.filter(item => item.id !== req.params.id || item.businessId !== req.business.id);
  });
  res.status(204).end();
});

module.exports = router;
