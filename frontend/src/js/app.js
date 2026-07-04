const TOKEN_KEY = "cliqagenda_admin_token";
const API = "/api";

const DEFAULT_THEME = {
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

const THEME_FIELDS = [
  { key: "primary", picker: "themePrimaryPicker", hex: "themePrimaryHex", cssVar: "--green" },
  { key: "primaryDark", picker: "themePrimaryDarkPicker", hex: "themePrimaryDarkHex", cssVar: "--green-dark" },
  { key: "background", picker: "themeBackgroundPicker", hex: "themeBackgroundHex", cssVar: "--bg" },
  { key: "card", picker: "themeCardPicker", hex: "themeCardHex", cssVar: "--card" },
  { key: "text", picker: "themeTextPicker", hex: "themeTextHex", cssVar: "--text" },
  { key: "muted", picker: "themeMutedPicker", hex: "themeMutedHex", cssVar: "--muted" },
  { key: "line", picker: "themeLinePicker", hex: "themeLineHex", cssVar: "--line" },
  { key: "soft", picker: "themeSoftPicker", hex: "themeSoftHex", cssVar: "--soft" },
  { key: "danger", picker: "themeDangerPicker", hex: "themeDangerHex", cssVar: "--red" },
  { key: "warning", picker: "themeWarningPicker", hex: "themeWarningHex", cssVar: "--yellow" },
  { key: "info", picker: "themeInfoPicker", hex: "themeInfoHex", cssVar: "--blue" }
];

let state = {
  user: null,
  token: localStorage.getItem(TOKEN_KEY),
  business: null,
  professionals: [],
  services: [],
  appointments: [],
  waitlist: [],
  blocks: [],
  payments: [],
  finance: null,
  users: []
};
let appointmentFilter = "all";
let currentPublicSlug = "";
let professionalFormPhotoObjectUrl = "";
let businessLogoObjectUrl = "";
let editingScheduleProfessionalId = "";

function publicSlugFromLocation() {
  const parts = window.location.pathname.split("/").filter(Boolean);
  if (!parts.length) return "";
  if (parts[0] === "p" && parts[1]) return parts[1];
  if (["admin", "cliente", "pitch", "api", "uploads"].includes(parts[0])) return "";
  return parts[0];
}

function publicUrl(slug = currentPublicSlug) {
  return slug ? `${window.location.origin}/p/${slug}` : window.location.origin;
}

function $(id) {
  return document.getElementById(id);
}

async function request(path, options = {}) {
  const isFormData = options.body instanceof FormData;
  const headers = isFormData ? { ...(options.headers || {}) } : { "Content-Type": "application/json", ...(options.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;

  const response = await fetch(`${API}${path}`, { ...options, headers });
  if (response.status === 204) return null;

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "Erro na requisicao.");
  return data;
}

function money(value) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function onlyNumbers(value) {
  return String(value || "").replace(/\D/g, "");
}

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatDate(date) {
  if (!date) return "-";
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
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

function isHexColor(value) {
  return /^#[0-9a-fA-F]{6}$/.test(String(value || "").trim());
}

function normalizeHex(value, fallback = "#000000") {
  const raw = String(value || "").trim();
  const withHash = raw.startsWith("#") ? raw : `#${raw}`;
  return isHexColor(withHash) ? withHash.toLowerCase() : fallback;
}

function normalizeTheme(theme = {}) {
  const source = theme && typeof theme === "object" ? theme : {};
  return THEME_FIELDS.reduce((result, field) => {
    result[field.key] = normalizeHex(source[field.key], DEFAULT_THEME[field.key]);
    return result;
  }, {});
}

function getThemeFromInputs() {
  return THEME_FIELDS.reduce((theme, field) => {
    const hexInput = $(field.hex);
    const picker = $(field.picker);
    const fallback = DEFAULT_THEME[field.key];
    theme[field.key] = normalizeHex(hexInput ? hexInput.value : picker && picker.value, fallback);
    return theme;
  }, {});
}

function applyTheme(theme = {}) {
  const normalized = normalizeTheme(theme);
  const root = document.documentElement;

  THEME_FIELDS.forEach(field => {
    root.style.setProperty(field.cssVar, normalized[field.key]);
  });

  if ($("themePreviewTitle")) $("themePreviewTitle").textContent = state.business ? state.business.name : "Agenda do negocio";
  return normalized;
}

function syncThemeInputs(theme = {}) {
  const normalized = normalizeTheme(theme);

  THEME_FIELDS.forEach(field => {
    const picker = $(field.picker);
    const hexInput = $(field.hex);

    if (picker) picker.value = normalized[field.key];
    if (hexInput) hexInput.value = normalized[field.key];
  });

  applyTheme(normalized);
}

function setThemeField(field, value) {
  const color = normalizeHex(value, DEFAULT_THEME[field.key]);
  const picker = $(field.picker);
  const hexInput = $(field.hex);

  if (picker) picker.value = color;
  if (hexInput) hexInput.value = color;

  applyTheme(getThemeFromInputs());
}

function resetThemeToDefault() {
  syncThemeInputs(DEFAULT_THEME);
}


const WEEK_DAYS = [
  { value: 0, short: "Dom", label: "Domingo" },
  { value: 1, short: "Seg", label: "Segunda" },
  { value: 2, short: "Ter", label: "Terca" },
  { value: 3, short: "Qua", label: "Quarta" },
  { value: 4, short: "Qui", label: "Quinta" },
  { value: 5, short: "Sex", label: "Sexta" },
  { value: 6, short: "Sab", label: "Sabado" }
];

const DEFAULT_WORKING_DAYS = [1, 2, 3, 4, 5, 6];

const SERVICE_PRESETS = [
  { name: "Corte masculino", duration: 30, buffer: 5 },
  { name: "Barba", duration: 30, buffer: 5 },
  { name: "Corte + barba", duration: 60, buffer: 10 },
  { name: "Progressiva", duration: 180, buffer: 0 },
  { name: "Design de sobrancelha", duration: 40, buffer: 5 },
  { name: "Manicure", duration: 60, buffer: 10 },
  { name: "Cílios", duration: 120, buffer: 10 },
  { name: "Limpeza de pele", duration: 90, buffer: 10 },
  { name: "Maquiagem", duration: 90, buffer: 15 }
];

function formatMinutes(totalMinutes, emptyLabel = "0 min") {
  const minutes = Math.max(0, Number(totalMinutes || 0));
  if (!minutes) return emptyLabel;
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  if (!rest) return `${hours}h`;
  return `${hours}h ${rest}min`;
}

function timeOptions(startMinutes = 6 * 60, endMinutes = 22 * 60, step = 15) {
  const options = [];
  for (let minutes = startMinutes; minutes <= endMinutes; minutes += step) {
    const hours = Math.floor(minutes / 60).toString().padStart(2, "0");
    const mins = (minutes % 60).toString().padStart(2, "0");
    options.push(`${hours}:${mins}`);
  }
  return options;
}

function timeToMinutes(value) {
  const [hours, minutes] = String(value || "00:00").split(":").map(Number);
  return (hours * 60) + minutes;
}

function weekdayFromDate(dateValue) {
  if (!dateValue) return null;
  const date = new Date(`${dateValue}T12:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return date.getDay();
}

function normalizeWorkingDays(days = DEFAULT_WORKING_DAYS) {
  const values = Array.isArray(days) ? days : DEFAULT_WORKING_DAYS;
  const normalized = values
    .map(value => Number(value))
    .filter(value => Number.isInteger(value) && value >= 0 && value <= 6);
  return [...new Set(normalized)].sort((a, b) => a - b);
}

function formatWorkingDays(days = DEFAULT_WORKING_DAYS) {
  const normalized = normalizeWorkingDays(days);
  if (!normalized.length) return "nenhum dia selecionado";
  if (normalized.length === 7) return "todos os dias";

  const mondayToFriday = [1, 2, 3, 4, 5];
  const mondayToSaturday = [1, 2, 3, 4, 5, 6];

  if (JSON.stringify(normalized) === JSON.stringify(mondayToFriday)) return "segunda a sexta";
  if (JSON.stringify(normalized) === JSON.stringify(mondayToSaturday)) return "segunda a sabado";

  return normalized
    .map(day => WEEK_DAYS.find(item => item.value === day)?.short || "")
    .filter(Boolean)
    .join(", ");
}

function renderWeekDayControls(prefix, selectedDays = DEFAULT_WORKING_DAYS) {
  const container = document.querySelector(`[data-week-days="${prefix}"]`);
  if (!container) return;

  const selected = normalizeWorkingDays(selectedDays);
  container.innerHTML = WEEK_DAYS.map(day => `
    <label class="week-day-chip" title="${day.label}">
      <input type="checkbox" value="${day.value}" ${selected.includes(day.value) ? "checked" : ""} />
      <span>${day.short}</span>
    </label>
  `).join("");
}

function getSelectedWorkingDays(prefix) {
  const container = document.querySelector(`[data-week-days="${prefix}"]`);
  if (!container) return DEFAULT_WORKING_DAYS;
  return normalizeWorkingDays(
    [...container.querySelectorAll("input:checked")].map(input => Number(input.value))
  );
}

function setWorkingDaysControls(prefix, selectedDays = DEFAULT_WORKING_DAYS) {
  renderWeekDayControls(prefix, selectedDays);
}

function defaultScheduleForDays(days = DEFAULT_WORKING_DAYS, hours = []) {
  const base = inferScheduleFromHours(hours);
  return Object.fromEntries(normalizeWorkingDays(days).map(day => [
    String(day),
    {
      enabled: true,
      start: base.start,
      end: base.end,
      interval: base.interval,
      hours: generateWorkingHours(base.start, base.end, base.interval)
    }
  ]));
}

function normalizeWeeklySchedule(schedule = {}, fallbackDays = DEFAULT_WORKING_DAYS, fallbackHours = []) {
  if (!schedule || typeof schedule !== "object") return defaultScheduleForDays(fallbackDays, fallbackHours);
  const fallback = inferScheduleFromHours(fallbackHours);
  const result = {};

  normalizeWorkingDays(fallbackDays).forEach(day => {
    const current = schedule[String(day)] || schedule[day] || {};
    const start = current.start || fallback.start;
    const end = current.end || fallback.end;
    const interval = Number(current.interval || fallback.interval || 30);
    result[String(day)] = {
      enabled: current.enabled !== false,
      start,
      end,
      interval,
      hours: generateWorkingHours(start, end, interval)
    };
  });

  return result;
}

function renderDayScheduleControls(prefix, schedule = {}, days = DEFAULT_WORKING_DAYS, hours = []) {
  const container = $(`${prefix}DaySchedule`);
  if (!container) return;

  const selectedDays = normalizeWorkingDays(days);
  if (!selectedDays.length) {
    container.innerHTML = '<div class="empty">Selecione ao menos um dia de atendimento.</div>';
    return;
  }

  const weekly = normalizeWeeklySchedule(schedule, selectedDays, hours);

  container.innerHTML = selectedDays.map(day => {
    const info = WEEK_DAYS.find(item => item.value === day);
    const current = weekly[String(day)] || {};
    return `
      <div class="day-schedule-row" data-day-schedule-row="${prefix}-${day}">
        <div class="day-schedule-name">
          ${info ? info.label : day}
          <span>Personalizado</span>
        </div>
        <label>Início<select data-day-start="${prefix}-${day}"></select></label>
        <label>Fim<select data-day-end="${prefix}-${day}"></select></label>
        <label>Intervalo<select data-day-interval="${prefix}-${day}"></select></label>
      </div>
    `;
  }).join("");

  selectedDays.forEach(day => {
    const current = weekly[String(day)] || {};
    const startSelect = document.querySelector(`[data-day-start="${prefix}-${day}"]`);
    const endSelect = document.querySelector(`[data-day-end="${prefix}-${day}"]`);
    const intervalSelect = document.querySelector(`[data-day-interval="${prefix}-${day}"]`);

    if (startSelect) {
      startSelect.innerHTML = timeOptions().map(time => `<option value="${time}">${time}</option>`).join("");
      startSelect.value = current.start || "09:00";
    }

    if (endSelect) {
      endSelect.innerHTML = timeOptions().map(time => `<option value="${time}">${time}</option>`).join("");
      endSelect.value = current.end || "18:00";
    }

    if (intervalSelect) {
      const options = [10, 15, 20, 30, 45, 60, 90, 120];
      intervalSelect.innerHTML = options.map(value => `<option value="${value}">${formatMinutes(value)}</option>`).join("");
      intervalSelect.value = String(current.interval || 30);
    }
  });
}

function getWeeklyScheduleFromControls(prefix) {
  const days = getSelectedWorkingDays(prefix);
  return Object.fromEntries(days.map(day => {
    const start = document.querySelector(`[data-day-start="${prefix}-${day}"]`)?.value || $(`${prefix}Start`)?.value || "09:00";
    const end = document.querySelector(`[data-day-end="${prefix}-${day}"]`)?.value || $(`${prefix}End`)?.value || "18:00";
    const interval = Number(document.querySelector(`[data-day-interval="${prefix}-${day}"]`)?.value || $(`${prefix}Interval`)?.value || 30);
    return [String(day), {
      enabled: true,
      start,
      end,
      interval,
      hours: generateWorkingHours(start, end, interval)
    }];
  }));
}

function summarizeWeeklySchedule(schedule = {}, days = DEFAULT_WORKING_DAYS, hours = []) {
  const normalizedDays = normalizeWorkingDays(days);
  if (!normalizedDays.length) return "nenhum dia selecionado";

  const weekly = normalizeWeeklySchedule(schedule, normalizedDays, hours);
  const parts = normalizedDays.map(day => {
    const info = WEEK_DAYS.find(item => item.value === day);
    const current = weekly[String(day)] || {};
    const generated = generateWorkingHours(current.start, current.end, current.interval);
    if (!generated.length) return `${info ? info.short : day}: fechado`;
    return `${info ? info.short : day}: ${current.start} às ${current.end} • ${formatMinutes(current.interval)}`;
  });

  return parts.join(" | ");
}

function isProfessionalWorkingOnDate(professional, dateValue) {
  const weekday = weekdayFromDate(dateValue);
  if (weekday === null) return true;
  return normalizeWorkingDays(professional && professional.workingDays ? professional.workingDays : DEFAULT_WORKING_DAYS).includes(weekday);
}

function fillTimeSelect(id, selected = "09:00") {
  const select = $(id);
  if (!select) return;
  select.innerHTML = timeOptions().map(time => `<option value="${time}">${time}</option>`).join("");
  select.value = selected;
}

function fillIntervalSelect(id, selected = 30) {
  const select = $(id);
  if (!select) return;
  const options = [10, 15, 20, 30, 45, 60, 90, 120];
  select.innerHTML = options.map(value => `<option value="${value}">${formatMinutes(value)}</option>`).join("");
  select.value = String(selected);
}

function fillDurationSelect(id, selected = 30) {
  const select = $(id);
  if (!select) return;
  const options = [10, 15, 20, 30, 45, 60, 75, 90, 120, 150, 180, 210, 240, 300, 360];
  select.innerHTML = options.map(value => `<option value="${value}">${formatMinutes(value)}</option>`).join("");
  select.value = String(selected);
}

function fillBufferSelect(id, selected = 0) {
  const select = $(id);
  if (!select) return;
  const options = [0, 5, 10, 15, 20, 30, 45, 60, 90, 120];
  select.innerHTML = options.map(value => `<option value="${value}">${value === 0 ? "Sem intervalo" : formatMinutes(value)}</option>`).join("");
  select.value = String(selected);
}

function generateWorkingHours(start, end, interval) {
  const startMinutes = timeToMinutes(start);
  const endMinutes = timeToMinutes(end);
  const step = Number(interval || 30);
  const hours = [];

  if (!start || !end || endMinutes <= startMinutes || step <= 0) return hours;

  for (let minutes = startMinutes; minutes < endMinutes; minutes += step) {
    const h = Math.floor(minutes / 60).toString().padStart(2, "0");
    const m = (minutes % 60).toString().padStart(2, "0");
    hours.push(`${h}:${m}`);
  }

  return hours;
}

function inferScheduleFromHours(hours = []) {
  const sorted = [...hours].filter(Boolean).sort();
  if (!sorted.length) return { start: "09:00", end: "18:00", interval: 30 };

  const diffs = sorted
    .slice(1)
    .map((time, index) => timeToMinutes(time) - timeToMinutes(sorted[index]))
    .filter(diff => diff > 0);
  const interval = diffs.length
    ? diffs.sort((a, b) => diffs.filter(x => x === b).length - diffs.filter(x => x === a).length)[0]
    : 30;
  const endMinutes = timeToMinutes(sorted[sorted.length - 1]) + interval;
  const end = timeOptions(0, 24 * 60, 15).find(time => timeToMinutes(time) === endMinutes) || "18:00";

  return { start: sorted[0], end, interval };
}

function summarizeWorkingHours(hours = [], workingDays = DEFAULT_WORKING_DAYS) {
  const sorted = [...hours].filter(Boolean).sort();
  const dayText = formatWorkingDays(workingDays);
  if (!sorted.length) return `${dayText} • sem horarios definidos`;
  const schedule = inferScheduleFromHours(sorted);
  return `${dayText} • ${schedule.start} as ${schedule.end} • encaixes a cada ${formatMinutes(schedule.interval)}`;
}

function weekDayTagsHtml(days = DEFAULT_WORKING_DAYS) {
  return normalizeWorkingDays(days).map(day => {
    const info = WEEK_DAYS.find(item => item.value === day);
    return `<span class="week-day-tag">${info ? info.short : day}</span>`;
  }).join("");
}

function setScheduleControls(prefix, hours = [], workingDays = DEFAULT_WORKING_DAYS, weeklySchedule = {}) {
  const schedule = inferScheduleFromHours(hours);
  fillTimeSelect(`${prefix}Start`, schedule.start);
  fillTimeSelect(`${prefix}End`, schedule.end);
  fillIntervalSelect(`${prefix}Interval`, schedule.interval);
  setWorkingDaysControls(prefix, workingDays);
  renderDayScheduleControls(prefix, weeklySchedule, workingDays, hours);
  updateSchedulePreview(prefix);
}

function getScheduleFromControls(prefix) {
  return generateWorkingHours($(`${prefix}Start`).value, $(`${prefix}End`).value, $(`${prefix}Interval`).value);
}

function updateSchedulePreview(prefix) {
  const preview = prefix === "schedule" ? $("schedulePreview") : null;
  if (!preview) return;
  const hours = getScheduleFromControls(prefix);
  const days = getSelectedWorkingDays(prefix);
  const weeklySchedule = getWeeklyScheduleFromControls(prefix);
  preview.textContent = hours.length && days.length
    ? summarizeWeeklySchedule(weeklySchedule, days, hours)
    : "Selecione ao menos um dia e escolha um fim maior que o inicio.";
}

function prepareScheduleControls() {
  const defaultHours = ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "12:00", "12:30", "13:00", "13:30", "14:00", "14:30", "15:00", "15:30", "16:00", "16:30", "17:00", "17:30"];
  setScheduleControls("professional", defaultHours, DEFAULT_WORKING_DAYS);
  setScheduleControls("schedule", defaultHours, DEFAULT_WORKING_DAYS);
  fillDurationSelect("serviceDuration", 30);
  fillBufferSelect("serviceBuffer", 0);
}

function initials(name) {
  return String(name || "CA")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0])
    .join("")
    .toUpperCase();
}

function avatarHtml(entity, className = "avatar", id = "") {
  const idAttr = id ? ` id="${id}"` : "";
  if (entity && entity.photoUrl) {
    return `<img${idAttr} class="${className} avatar-img" src="${entity.photoUrl}" alt="${entity.name}" />`;
  }
  return `<div${idAttr} class="${className}">${initials(entity && entity.name)}</div>`;
}

function cameraIconHtml() {
  return `
    <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
      <path d="M9 4.5 7.7 6H5.5A2.5 2.5 0 0 0 3 8.5v8A2.5 2.5 0 0 0 5.5 19h13a2.5 2.5 0 0 0 2.5-2.5v-8A2.5 2.5 0 0 0 18.5 6h-2.2L15 4.5H9Zm3 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0-1.7a2.3 2.3 0 1 1 0-4.6 2.3 2.3 0 0 1 0 4.6Z"></path>
    </svg>
  `;
}

function revokeObjectUrl(url) {
  if (!url) return;
  try {
    URL.revokeObjectURL(url);
  } catch {
    // ignora URLs nao geradas por createObjectURL
  }
}

function closeProfessionalFormPhotoMenu() {
  const menu = $("professionalPhotoMenu");
  if (menu) menu.classList.add("hidden");
}

function closeProfessionalCardPhotoMenus(exceptId = "") {
  document.querySelectorAll(".js-professional-photo-menu").forEach(menu => {
    if (!exceptId || menu.dataset.professionalId !== exceptId) menu.classList.add("hidden");
  });
}

function closeBusinessLogoMenu() {
  const menu = $("businessLogoMenu");
  if (menu) menu.classList.add("hidden");
}

function closeAllPhotoMenus() {
  closeBusinessLogoMenu();
  closeProfessionalFormPhotoMenu();
  closeProfessionalCardPhotoMenus();
}

function renderBusinessLogo(previewSrc = "") {
  const preview = $("businessLogoPreview");
  const placeholder = $("businessLogoPlaceholder");
  const trigger = $("businessLogoTrigger");
  if (!preview || !placeholder || !trigger) return;

  const badge = trigger.querySelector(".photo-circle-edit-badge");
  const hasLogo = Boolean(previewSrc);

  if (hasLogo) {
    preview.src = previewSrc;
    preview.dataset.src = previewSrc;
  } else {
    preview.removeAttribute("src");
    delete preview.dataset.src;
  }

  preview.classList.toggle("hidden", !hasLogo);
  placeholder.classList.toggle("hidden", hasLogo);
  if (badge) badge.textContent = hasLogo ? "Editar" : "Adicionar";
}

function resetBusinessLogo(options = {}) {
  const { clearFile = true } = options;
  revokeObjectUrl(businessLogoObjectUrl);
  businessLogoObjectUrl = "";
  if (clearFile && $("businessPhotoFile")) $("businessPhotoFile").value = "";
  if ($("businessPhotoUrl")) $("businessPhotoUrl").value = "";
  renderBusinessLogo("");
  closeBusinessLogoMenu();
}

async function setBusinessLogoFromFile(file) {
  if (!file) return;
  revokeObjectUrl(businessLogoObjectUrl);
  businessLogoObjectUrl = URL.createObjectURL(file);
  if ($("businessPhotoUrl")) $("businessPhotoUrl").value = "";
  renderBusinessLogo(businessLogoObjectUrl);
}

function setBusinessLogoFromUrl(value) {
  const url = String(value || "").trim();
  revokeObjectUrl(businessLogoObjectUrl);
  businessLogoObjectUrl = "";
  renderBusinessLogo(url);
}

function toggleBusinessLogoMenu() {
  const fileInput = $("businessPhotoFile");
  const preview = $("businessLogoPreview");
  const hasLogo = Boolean(preview && preview.dataset.src);
  closeProfessionalFormPhotoMenu();
  closeProfessionalCardPhotoMenus();

  if (!hasLogo) {
    if (fileInput) fileInput.click();
    return;
  }

  const menu = $("businessLogoMenu");
  if (menu) menu.classList.toggle("hidden");
}

function handleBusinessLogoAction(action) {
  if (action === "upload" && $("businessPhotoFile")) {
    $("businessPhotoFile").click();
  }
  if (action === "remove") {
    resetBusinessLogo();
  }
}

function renderProfessionalFormPhoto(previewSrc = "") {
  const preview = $("professionalPhotoPreview");
  const placeholder = $("professionalPhotoPlaceholder");
  const trigger = $("professionalPhotoTrigger");
  if (!preview || !placeholder || !trigger) return;

  const badge = trigger.querySelector(".photo-circle-edit-badge");
  const hasPhoto = Boolean(previewSrc);

  if (hasPhoto) {
    preview.src = previewSrc;
    preview.dataset.src = previewSrc;
  } else {
    preview.removeAttribute("src");
    delete preview.dataset.src;
  }

  preview.classList.toggle("hidden", !hasPhoto);
  placeholder.classList.toggle("hidden", hasPhoto);
  if (badge) badge.textContent = hasPhoto ? "Editar" : "Adicionar";
}

function resetProfessionalFormPhoto(options = {}) {
  const { clearFile = true } = options;
  revokeObjectUrl(professionalFormPhotoObjectUrl);
  professionalFormPhotoObjectUrl = "";
  if (clearFile && $("professionalPhotoFile")) $("professionalPhotoFile").value = "";
  if ($("professionalPhotoUrl")) $("professionalPhotoUrl").value = "";
  renderProfessionalFormPhoto("");
  closeProfessionalFormPhotoMenu();
}

async function setProfessionalFormPhotoFromFile(file) {
  if (!file) return;
  revokeObjectUrl(professionalFormPhotoObjectUrl);
  professionalFormPhotoObjectUrl = URL.createObjectURL(file);
  if ($("professionalPhotoUrl")) $("professionalPhotoUrl").value = "";
  renderProfessionalFormPhoto(professionalFormPhotoObjectUrl);
}

function toggleProfessionalFormPhotoMenu() {
  const fileInput = $("professionalPhotoFile");
  const preview = $("professionalPhotoPreview");
  const hasPhoto = Boolean(preview && preview.dataset.src);
  closeProfessionalCardPhotoMenus();
  if (!hasPhoto) {
    if (fileInput) fileInput.click();
    return;
  }
  const menu = $("professionalPhotoMenu");
  if (menu) menu.classList.toggle("hidden");
}

function handleProfessionalFormPhotoAction(action) {
  if (action === "upload" && $("professionalPhotoFile")) {
    $("professionalPhotoFile").click();
  }
  if (action === "remove") {
    resetProfessionalFormPhoto();
  }
}

async function uploadProfessionalPhoto(professionalId, file) {
  const formData = new FormData();
  formData.append("photo", file);
  await request(`/admin/professionals/${professionalId}/photo`, {
    method: "POST",
    body: formData
  });
}

async function removeProfessionalPhoto(professionalId) {
  await request(`/admin/professionals/${professionalId}/photo`, {
    method: "DELETE"
  });
  await refreshAdmin();
}

function toggleProfessionalPhotoMenu(professionalId) {
  const menu = document.querySelector(`.js-professional-photo-menu[data-professional-id="${professionalId}"]`);
  if (!menu) return;
  const isHidden = menu.classList.contains("hidden");
  closeProfessionalFormPhotoMenu();
  closeProfessionalCardPhotoMenus(professionalId);
  menu.classList.toggle("hidden", !isHidden ? true : false);
}

function professionalServices(professionalId, includeInactive = false) {

  return state.services.filter(service => service.professionalId === professionalId && (includeInactive || service.active !== false));
}

function selectedProfessionalId() {
  return $("bookingProfessional") ? $("bookingProfessional").value : "";
}

function selectedServicesForBooking() {
  return professionalServices(selectedProfessionalId());
}

function statusLabel(status) {
  return {
    pending: "Aguardando aprovacao",
    confirmed: "Confirmado",
    cancelled: "Cancelado",
    done: "Compareceu",
    noshow: "No-show"
  }[status] || status;
}

function statusClass(status) {
  if (status === "pending") return "pending";
  if (status === "cancelled" || status === "noshow") return "cancelled";
  return "";
}

function whatsappUrl(phone, message) {
  let n = onlyNumbers(phone);
  if (!n.startsWith("55")) n = `55${n}`;
  return `https://wa.me/${n}?text=${encodeURIComponent(message)}`;
}

async function sendWhatsAppConfirmation(appointmentId) {
  const data = await request(`/public/${currentPublicSlug}/appointments/${appointmentId}/whatsapp-confirmation`, {
    method: "POST"
  });

  if (data.whatsapp && data.whatsapp.sent) {
    return `<div class="alert"><strong>WhatsApp enviado pela API.</strong><br>Provedor: ${data.whatsapp.provider}</div>`;
  }

  return `
    <div class="alert warning">
      API de WhatsApp nao configurada ou indisponivel. Use o link manual como fallback.
    </div>
    <a class="btn primary full" target="_blank" rel="noopener noreferrer" href="${data.fallbackUrl}">Abrir WhatsApp manual</a>
  `;
}

function showMessage(containerId, message, type = "") {
  $(containerId).innerHTML = `<div class="alert ${type}">${message}</div>`;
}

function showView(viewId) {
  document.querySelectorAll(".view").forEach(view => view.classList.toggle("active", view.id === viewId));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showAdminView(viewId) {
  const requiresLogin = viewId !== "auth";
  if (requiresLogin && !state.user) {
    $("adminAuthNotice").textContent = "Faça login com uma conta do negócio para acessar essa área.";
    viewId = "auth";
  }
  document.querySelectorAll(".admin-tab").forEach(button => button.classList.toggle("active", button.dataset.admin === viewId));
  document.querySelectorAll(".admin-view").forEach(view => view.classList.toggle("active", view.id === `admin-${viewId}`));
}

function setBundle(data) {
  state.user = data.user || state.user;
  state.business = data.business;
  state.professionals = data.professionals || [];
  state.services = data.services || [];
  state.appointments = data.appointments || state.appointments || [];
  state.waitlist = data.waitlist || state.waitlist || [];
  state.blocks = data.blocks || state.blocks || [];
  state.payments = data.payments || state.payments || [];
  state.finance = data.finance || state.finance || null;
  state.users = data.users || state.users || [];
  currentPublicSlug = state.business.slug;
}

async function loadPublic(slug = currentPublicSlug) {
  const data = await request(`/public/${slug || ""}`);
  state.business = data.business;
  state.professionals = data.professionals || [];
  state.services = data.services;
  state.blocks = data.blocks || [];
  currentPublicSlug = data.business.slug;
  renderAll();
}

async function loadAdmin() {
  if (!state.token) return;
  try {
    const data = await request("/auth/me");
    setBundle(data);
  } catch {
    localStorage.removeItem(TOKEN_KEY);
    state.token = null;
    state.user = null;
  }
}

async function refreshAdmin() {
  if (!state.user) return;
  const data = await request("/admin");
  setBundle({ ...data, user: state.user });
  renderAll();
}


function updateSlugPreviews() {
  const registerSlug = $("registerSlug");
  const registerPreview = $("registerSlugPreview");
  if (registerSlug && registerPreview) {
    const slug = slugify(registerSlug.value || $("registerName")?.value || "seu-negocio");
    registerPreview.textContent = `/p/${slug || "seu-negocio"}`;
  }

  const businessSlug = $("businessSlug");
  const businessPreview = $("businessSlugPreview");
  if (businessSlug && businessPreview) {
    const slug = slugify(businessSlug.value || "seu-negocio");
    businessPreview.textContent = publicUrl(slug);
  }
}

function renderServicePresets() {
  const list = $("servicePresetList");
  if (!list) return;

  list.innerHTML = SERVICE_PRESETS.map(preset => `
    <button type="button" class="preset-card" data-service-preset="${preset.name}">
      <strong>${preset.name}</strong>
      <span>Duração: ${formatMinutes(preset.duration)} • Intervalo: ${preset.buffer ? formatMinutes(preset.buffer) : "sem intervalo"}</span>
    </button>
  `).join("");
}

function applyServicePreset(name) {
  const preset = SERVICE_PRESETS.find(item => item.name === name);
  if (!preset) return;

  $("serviceName").value = preset.name;
  fillDurationSelect("serviceDuration", preset.duration);
  fillBufferSelect("serviceBuffer", preset.buffer);
}

function businessPublicHighlights() {
  return state.services
    .filter(service => service.active !== false)
    .slice(0, 5)
    .map(service => `
      <div class="public-service-chip">
        <span>${service.name}</span>
        <strong>${money(service.price)} • ${formatMinutes(service.duration)}</strong>
      </div>
    `).join("");
}

function financeInsights() {
  const appointments = state.appointments || [];
  const active = appointments.filter(item => item.status !== "cancelled" && item.status !== "noshow");
  const cancelled = appointments.filter(item => item.status === "cancelled").length;

  const countBy = (items, key) => items.reduce((acc, item) => {
    const value = item[key] || "-";
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});

  const topFrom = counts => Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || "-";

  return {
    cancelled,
    topService: topFrom(countBy(active, "service")),
    topProfessional: topFrom(countBy(active, "professionalName"))
  };
}

function permissionsByRole(role) {
  if (role === "finance") return { settings: false, professionals: false, services: false, appointments: false, blocks: false, clients: false, finance: true, users: false };
  if (role === "staff") return { settings: false, professionals: false, services: false, appointments: true, blocks: false, clients: true, finance: false, users: false };
  return { settings: true, professionals: true, services: true, appointments: true, blocks: true, clients: true, finance: false, users: false };
}

function syncPermissionCheckboxes(role = "business_admin") {
  const defaults = permissionsByRole(role);
  document.querySelectorAll("[data-permission]").forEach(input => {
    input.checked = Boolean(defaults[input.dataset.permission]);
  });
}

function selectedPermissions() {
  return [...document.querySelectorAll("[data-permission]")].reduce((acc, input) => {
    acc[input.dataset.permission] = Boolean(input.checked);
    return acc;
  }, {});
}

async function forgotPassword(event) {
  event.preventDefault();
  try {
    const data = await request("/auth/password/forgot", {
      method: "POST",
      body: JSON.stringify({ email: $("forgotEmail").value })
    });
    const extra = data.resetUrl ? `<br><strong>Modo desenvolvimento:</strong> <a href="${data.resetUrl}">${data.resetUrl}</a>` : "";
    showMessage("passwordRecoveryResult", `${data.message}${extra}`);
    if (data.resetToken && $("resetToken")) {
      $("resetToken").value = data.resetToken;
      $("resetPasswordForm").classList.remove("hidden");
    }
  } catch (error) {
    showMessage("passwordRecoveryResult", error.message, "danger");
  }
}

async function resetPassword(event) {
  event.preventDefault();
  try {
    const data = await request("/auth/password/reset", {
      method: "POST",
      body: JSON.stringify({ token: $("resetToken").value, password: $("resetPassword").value })
    });
    showMessage("passwordRecoveryResult", data.message);
    event.target.reset();
  } catch (error) {
    showMessage("passwordRecoveryResult", error.message, "danger");
  }
}

function renderPitch() {
  const businessName = state.business.name || "CliqAgenda";
  const description = state.business.description || "Escolha um profissional, selecione o servico, veja os horarios disponiveis e agende de forma simples.";
  const activeProfessionals = state.professionals.filter(professional => professional.active !== false);
  const activeServices = state.services.filter(service => service.active !== false);

  const brandMark = document.querySelector(".brand-mark");
  const brandName = document.querySelector(".brand strong");
  const brandSubtitle = document.querySelector(".brand span");

  if (brandMark) {
    brandMark.classList.toggle("brand-mark-image", Boolean(state.business.photoUrl));
    brandMark.innerHTML = state.business.photoUrl
      ? `<img src="${state.business.photoUrl}" alt="Logo de ${businessName}" />`
      : initials(businessName);
  }

  if (brandName) brandName.textContent = businessName;
  if (brandSubtitle) brandSubtitle.textContent = state.business.businessType || "Agenda online";

  if ($("welcomeBusinessName")) $("welcomeBusinessName").textContent = businessName;
  if ($("welcomeDescription")) $("welcomeDescription").textContent = description;
  if ($("welcomeBusinessType")) $("welcomeBusinessType").textContent = state.business.businessType || "Beleza e estetica";
  if ($("welcomeLogo")) $("welcomeLogo").outerHTML = avatarHtml(state.business, "welcome-logo", "welcomeLogo");
  if ($("welcomeProfessionals")) $("welcomeProfessionals").textContent = activeProfessionals.length;
  if ($("welcomeServices")) $("welcomeServices").textContent = activeServices.length;
  if ($("welcomeWhatsapp")) $("welcomeWhatsapp").textContent = state.business.whatsapp || "WhatsApp";
  if ($("publicLinkText")) $("publicLinkText").textContent = publicUrl(state.business.slug);
}

function renderPublic() {
  $("publicName").textContent = state.business.name;
  $("publicDesc").textContent = state.business.description;
  $("publicAvatar").outerHTML = avatarHtml(state.business, "avatar big", "publicAvatar");
  $("publicBusinessType").textContent = state.business.businessType || "Outro";
  $("publicWhatsapp").textContent = state.business.whatsapp;
  $("publicAddress").textContent = state.business.address || "-";
  $("publicPolicy").textContent = `Cancelar ate ${state.business.cancellationHours}h antes. Remarcar ate ${state.business.rescheduleHours}h antes.`;
  $("publicProfessionals").innerHTML = state.professionals.length
    ? state.professionals.map(professional => `
      <div class="professional-public-card">
        ${avatarHtml(professional, "avatar")}
        <div>
          <strong>${professional.name}</strong>
          <span>${professional.specialty || "Profissional"}</span>
        </div>
      </div>
    `).join("")
    : '<div class="empty">Nenhum profissional disponivel.</div>';
  $("pixNotice").textContent = state.business.deposit > 0
    ? `Reserva com sinal Pix de ${money(state.business.deposit)}. Chave: ${state.business.pixKey || "a combinar"}.`
    : "Este profissional nao exige sinal Pix.";

  const professionalSelect = $("bookingProfessional");
  const currentProfessional = professionalSelect.value;
  professionalSelect.innerHTML = state.professionals.length
    ? state.professionals.map(professional => `<option value="${professional.id}">${professional.name}${professional.specialty ? ` - ${professional.specialty}` : ""}</option>`).join("")
    : '<option value="">Nenhum profissional cadastrado</option>';
  if (currentProfessional && state.professionals.some(professional => professional.id === currentProfessional)) professionalSelect.value = currentProfessional;

  const availableServices = selectedServicesForBooking();
  const currentService = $("bookingService").value;
  $("bookingService").innerHTML = availableServices.length
    ? availableServices.map(service => `<option value="${service.id}">${service.name} - ${money(service.price)}</option>`).join("")
    : '<option value="">Nenhum servico para este profissional</option>';
  if (currentService && availableServices.some(service => service.id === currentService)) $("bookingService").value = currentService;

  $("waitService").innerHTML = state.services.length
    ? state.services.map(service => `<option value="${service.id}">${service.professionalName ? `${service.professionalName} - ` : ""}${service.name} - ${money(service.price)}</option>`).join("")
    : '<option value="">Nenhum servico cadastrado</option>';

  const bookingDate = $("bookingDate");
  if (!bookingDate.value) bookingDate.value = todayString();
  bookingDate.min = todayString();
  bookingDate.max = addDays(60);

  const waitDate = $("waitDate");
  if (!waitDate.value) waitDate.value = todayString();
  waitDate.min = todayString();
}

async function renderTimes() {
  const date = $("bookingDate").value;
  const select = $("bookingTime");

  if (!date || !currentPublicSlug) {
    select.innerHTML = '<option value="">Selecione data</option>';
    return;
  }

  try {
    const professionalId = selectedProfessionalId();
    const serviceId = $("bookingService") ? $("bookingService").value : "";
    if (!professionalId) {
      select.innerHTML = '<option value="">Selecione profissional</option>';
      return;
    }
    if (!serviceId) {
      select.innerHTML = '<option value="">Selecione servico</option>';
      return;
    }

    const professional = state.professionals.find(item => item.id === professionalId);
    if (professional && !isProfessionalWorkingOnDate(professional, date)) {
      select.innerHTML = `<option value="">${professional.name} nao atende neste dia</option>`;
      return;
    }

    const data = await request(`/public/${currentPublicSlug}/slots?date=${encodeURIComponent(date)}&professionalId=${encodeURIComponent(professionalId)}&serviceId=${encodeURIComponent(serviceId)}`);
    select.innerHTML = data.slots.length
      ? data.slots.map(slot => `<option value="${slot}">${slot}</option>`).join("")
      : '<option value="">Sem horarios livres para a duracao deste servico</option>';
  } catch (error) {
    select.innerHTML = `<option value="">${error.message}</option>`;
  }
}

function renderAuth() {
  $("authBadge").textContent = state.user ? `Logado: ${state.user.email}` : "Sem login";
  $("logoutBtn").style.display = state.user ? "inline-flex" : "none";
  $("adminAuthNotice").textContent = state.user
    ? "Conta autenticada. Use as abas do painel para gerenciar sua agenda."
    : "Entre com uma conta do negócio para acessar o painel.";
  document.querySelectorAll("[data-protected='true']").forEach(button => {
    const adminKey = button.dataset.admin;
    const permissionMap = { dashboard: null, settings: "settings", professionals: "professionals", services: "services", appointments: "appointments", blocks: "blocks", finance: "finance", users: "users", clients: "clients" };
    const permission = permissionMap[adminKey];
    const allowed = state.user && (!permission || state.user.role === "owner" || (state.user.permissions && state.user.permissions[permission]));
    button.disabled = !allowed;
    button.title = allowed ? "" : state.user ? "Sem permissão para esta área" : "Login do negócio necessário";
  });
}

function renderSettings() {
  if (!state.business) return;
  $("businessName").value = state.business.name;
  $("businessSlug").value = state.business.slug;
  if ($("businessType")) $("businessType").value = state.business.businessType || "Outro";
  $("businessWhatsapp").value = state.business.whatsapp;
  $("businessAddress").value = state.business.address || "";
  $("businessDesc").value = state.business.description || "";
  $("businessPhotoUrl").value = state.business.photoUrl || "";
  renderBusinessLogo(state.business.photoUrl || "");
  syncThemeInputs(state.business.theme || DEFAULT_THEME);
  $("defaultDeposit").value = state.business.deposit || 0;
  $("pixKey").value = state.business.pixKey || "";
  $("cancellationHours").value = state.business.cancellationHours || 0;
  $("rescheduleHours").value = state.business.rescheduleHours || 0;
  $("allowClientCancel").checked = Boolean(state.business.allowClientCancel);
  $("allowClientReschedule").checked = Boolean(state.business.allowClientReschedule);
  updateSlugPreviews();
}

function renderProfessionals() {
  $("professionalList").innerHTML = state.professionals.length
    ? state.professionals.map(professional => `
      <div class="item professional-item">
        <div class="item-head">
          <div class="profile-row">
            <div class="avatar-actions-stack photo-menu-anchor">
              <button type="button" class="avatar-editor-trigger" data-professional-photo-trigger="${professional.id}" aria-label="Alterar foto de ${professional.name}">
                ${avatarHtml(professional, "avatar")}
                <span class="avatar-camera-badge">${cameraIconHtml()}</span>
                <span class="avatar-editor-overlay">Editar foto</span>
              </button>
              <div class="photo-circle-menu js-professional-photo-menu hidden" data-professional-id="${professional.id}">
                <button type="button" data-professional-photo-action="upload" data-professional-id="${professional.id}">Trocar foto</button>
                <button type="button" data-professional-photo-action="remove" data-professional-id="${professional.id}">Remover foto</button>
              </div>
              <input type="file" class="hidden" accept="image/png,image/jpeg,image/webp" data-professional-file-input="${professional.id}" />
            </div>
            <div class="schedule-summary-card">
              <div class="item-title">${professional.name}</div>
              <div class="item-meta">${professional.specialty || "Sem especialidade informada"} - ${professional.active ? "Ativo" : "Inativo"}</div>
              <div class="item-meta">Atendimento: ${summarizeWeeklySchedule(professional.workingSchedule || {}, professional.workingDays || DEFAULT_WORKING_DAYS, professional.workingHours || [])}</div>
              <div class="week-day-tags">${weekDayTagsHtml(professional.workingDays || DEFAULT_WORKING_DAYS)}</div>
            </div>
          </div>
          <div class="item-actions">
            <button class="btn" data-toggle-professional="${professional.id}:${professional.active ? "false" : "true"}">${professional.active ? "Desativar" : "Ativar"}</button>
            <button class="btn" data-edit-hours="${professional.id}">Dias e horarios</button>
            <button class="btn danger" data-delete-professional="${professional.id}">Excluir</button>
          </div>
        </div>
      </div>
    `).join("")
    : '<div class="empty">Nenhum profissional cadastrado.</div>';
}

function renderServices() {
  const serviceProfessional = $("serviceProfessional");
  const current = serviceProfessional.value;
  serviceProfessional.innerHTML = state.professionals.length
    ? state.professionals.map(professional => `<option value="${professional.id}">${professional.name}${professional.specialty ? ` - ${professional.specialty}` : ""}</option>`).join("")
    : '<option value="">Cadastre um profissional primeiro</option>';
  if (current && state.professionals.some(professional => professional.id === current)) serviceProfessional.value = current;

  $("serviceList").innerHTML = state.professionals.length
    ? state.professionals.map(professional => {
      const services = professionalServices(professional.id, true);
      return `
        <div class="professional-group">
          <h3>${professional.name}</h3>
          ${services.length ? services.map(service => `
            <div class="item">
              <div class="item-head">
                <div>
                  <div class="item-title">${service.name}</div>
                  <div class="item-meta">
                    ${money(service.price)}
                    <span class="duration-pill">Duração: ${formatMinutes(service.duration)}</span>
                    <span class="duration-pill">Intervalo: ${Number(service.buffer || 0) ? formatMinutes(service.buffer) : "sem intervalo"}</span>
                    ${service.active === false ? " - Inativo" : " - Ativo"}
                  </div>
                </div>
                <button class="btn" data-toggle-service="${service.id}:${service.active === false ? "true" : "false"}">${service.active === false ? "Ativar" : "Desativar"}</button>
                <button class="btn danger" data-delete-service="${service.id}">Excluir</button>
              </div>
            </div>
          `).join("") : '<div class="empty">Nenhum servico para este profissional.</div>'}
        </div>
      `;
    }).join("")
    : '<div class="empty">Cadastre profissionais antes de cadastrar servicos.</div>';
}

function renderAdminDashboard() {
  const today = todayString();
  const activeAppointments = state.appointments.filter(a => a.status !== "cancelled");
  const revenue = activeAppointments.reduce((sum, item) => sum + Number(item.total || item.price), 0);

  $("metricToday").textContent = activeAppointments.filter(a => a.date === today).length;
  $("metricPending").textContent = state.appointments.filter(a => a.status === "pending").length;
  $("metricRevenue").textContent = money(revenue);
  if ($("metricPixPending")) $("metricPixPending").textContent = money(state.finance ? state.finance.pendingPix : 0);

  const next = activeAppointments
    .slice()
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))
    .slice(0, 6);

  $("nextAppointments").innerHTML = next.length
    ? next.map(renderAppointmentItem).join("")
    : '<div class="empty">Nenhum proximo agendamento.</div>';
}

function renderFinance() {
  const finance = state.finance || { grossRevenue: 0, paidRevenue: 0, pendingPix: 0, payments: [] };
  if ($("financeGross")) $("financeGross").textContent = money(finance.grossRevenue);
  if ($("financePaid")) $("financePaid").textContent = money(finance.paidRevenue);
  if ($("financePending")) $("financePending").textContent = money(finance.pendingPix);
  const insights = financeInsights();
  if ($("financeCancelled")) $("financeCancelled").textContent = insights.cancelled;
  if ($("financeTopService")) $("financeTopService").textContent = insights.topService;
  if ($("financeTopProfessional")) $("financeTopProfessional").textContent = insights.topProfessional;
  if ($("paymentList")) {
    $("paymentList").innerHTML = (finance.payments || []).length
      ? finance.payments.map(payment => `
        <div class="item">
          <div class="item-head">
            <div>
              <div class="item-title">Pix ${money(payment.amount)} - ${payment.status}</div>
              <div class="item-meta">${payment.pixKey || "sem chave"} - ${payment.pixCopyPaste || "sem copia e cola"}</div>
            </div>
            <div class="item-actions">
              <button class="btn primary" data-payment-status="${payment.id}:paid">Marcar pago</button>
              <button class="btn danger" data-payment-status="${payment.id}:cancelled">Cancelar</button>
            </div>
          </div>
        </div>
      `).join("")
      : '<div class="empty">Nenhum pagamento Pix registrado.</div>';
  }
}

function renderUsers() {
  if (!$('userList')) return;
  $('userList').innerHTML = state.users.length
    ? state.users.map(user => `<div class="item"><div class="item-title">${user.name}</div><div class="item-meta">${user.email} - ${user.role}</div></div>`).join("")
    : '<div class="empty">Nenhum usuario adicional.</div>';
}

function renderAppointmentItem(appointment) {
  const message = `Ola, ${appointment.customer}! Confirmando seu horario em ${state.business.name}: ${appointment.service}, ${formatDate(appointment.date)} as ${appointment.time}. Codigo: ${appointment.code}`;
  return `
    <div class="item">
      <div class="item-head">
        <div>
          <span class="status ${statusClass(appointment.status)}">${statusLabel(appointment.status)}</span>
          <span class="code">${appointment.code}</span>
          <div class="item-title">${appointment.customer} - ${appointment.service}</div>
          <div class="item-meta">${appointment.professionalName ? `${appointment.professionalName} - ` : ""}${formatDate(appointment.date)} as ${appointment.time} - ${money(appointment.total || appointment.price)} - ${appointment.phone}</div>
        </div>
        <div class="item-actions">
          <a class="btn" target="_blank" href="${whatsappUrl(appointment.phone, message)}">WhatsApp</a>
          ${appointment.status === "pending" ? `<button class="btn primary" data-status="${appointment.id}:confirmed">Aprovar</button>` : ""}
          <button class="btn" data-status="${appointment.id}:done">Compareceu</button>
          <button class="btn" data-status="${appointment.id}:noshow">No-show</button>
          <button class="btn danger" data-status="${appointment.id}:cancelled">Cancelar</button>
        </div>
      </div>
    </div>
  `;
}

function renderAppointments() {
  let appointments = state.appointments.slice();
  if (appointmentFilter === "pending") appointments = appointments.filter(a => a.status === "pending");
  if (appointmentFilter === "confirmed") appointments = appointments.filter(a => a.status === "confirmed" || a.status === "done");
  appointments.sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));

  $("adminAppointments").innerHTML = appointments.length
    ? appointments.map(renderAppointmentItem).join("")
    : '<div class="empty">Nenhum agendamento nesse filtro.</div>';
}

function renderBlocks() {
  if ($("blockProfessional")) {
    const current = $("blockProfessional").value;
    $("blockProfessional").innerHTML = '<option value="">Todos os profissionais</option>' + state.professionals.map(professional => `<option value="${professional.id}">${professional.name}</option>`).join("");
    if (current) $("blockProfessional").value = current;
  }
  $("blockList").innerHTML = state.blocks.length
    ? state.blocks
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(block => `
        <div class="item">
          <div class="item-head">
            <div>
              <div class="item-title">${formatDate(block.date)} - ${block.allDay ? "dia todo" : `${block.startTime} ate ${block.endTime}`}</div>
              <div class="item-meta">${block.reason || "Bloqueio do ADM"}</div>
            </div>
            <button class="btn danger" data-delete-block="${block.id}">Liberar</button>
          </div>
        </div>
      `).join("")
    : '<div class="empty">Nenhum horario bloqueado.</div>';
}

function renderClients() {
  const clients = {};
  state.appointments.forEach(appointment => {
    const key = appointment.phone;
    if (!clients[key]) clients[key] = { name: appointment.customer, phone: appointment.phone, count: 0, total: 0, noShows: 0 };
    clients[key].count += 1;
    if (appointment.status === "done" || appointment.status === "confirmed") clients[key].total += Number(appointment.total || appointment.price);
    if (appointment.status === "noshow") clients[key].noShows += 1;
  });

  const rows = Object.values(clients).sort((a, b) => b.count - a.count);
  $("clientList").innerHTML = rows.length
    ? rows.map(client => `
      <div class="item">
        <div class="item-title">${client.name}</div>
        <div class="item-meta">${client.phone} - ${client.count} agendamento(s) - ${money(client.total)} - no-show: ${client.noShows}</div>
      </div>
    `).join("")
    : '<div class="empty">Nenhum cliente ainda.</div>';

  $("waitlistAdmin").innerHTML = state.waitlist.length
    ? state.waitlist.map(item => `
      <div class="item">
        <div class="item-head">
          <div>
            <div class="item-title">${item.name} - ${item.service}</div>
            <div class="item-meta">${item.phone} - ${formatDate(item.date)} - ${item.period}</div>
          </div>
          <div class="item-actions">
            <a class="btn" target="_blank" href="${whatsappUrl(item.phone, `Ola, ${item.name}! Abriu um horario para ${item.service}. Quer agendar?`)}">Chamar</a>
            <button class="btn danger" data-delete-wait="${item.id}">Remover</button>
          </div>
        </div>
      </div>
    `).join("")
    : '<div class="empty">Lista de espera vazia.</div>';
}

function renderAll() {
  if (!state.business) return;
  applyTheme(state.business.theme || DEFAULT_THEME);
  renderPitch();
  renderPublic();
  renderAuth();
  renderSettings();
  renderProfessionals();
  renderServices();
  renderAdminDashboard();
  renderFinance();
  renderUsers();
  renderAppointments();
  renderBlocks();
  renderClients();
  renderTimes();
}

async function login(event) {
  event.preventDefault();
  try {
    const data = await request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: $("loginEmail").value, password: $("loginPassword").value })
    });
    state.token = data.token;
    localStorage.setItem(TOKEN_KEY, data.token);
    setBundle(data);
    renderAll();
    showAdminView("dashboard");
  } catch (error) {
    alert(error.message);
  }
}

async function register(event) {
  event.preventDefault();
  try {
    const data = await request("/auth/register", {
      method: "POST",
      body: JSON.stringify({
        name: $("registerName").value,
        businessType: $("registerType").value,
        slug: $("registerSlug").value,
        whatsapp: $("registerWhatsapp").value,
        email: $("registerEmail").value,
        password: $("registerPassword").value
      })
    });
    state.token = data.token;
    localStorage.setItem(TOKEN_KEY, data.token);
    setBundle(data);
    renderAll();
    showAdminView("settings");
  } catch (error) {
    alert(error.message);
  }
}

async function logout() {
  if (state.token) await request("/auth/logout", { method: "POST" }).catch(() => null);
  localStorage.removeItem(TOKEN_KEY);
  state.token = null;
  state.user = null;
  renderAuth();
  showAdminView("auth");
}

async function createAppointment(event) {
  event.preventDefault();
  try {
    const service = state.services.find(item => item.id === $("bookingService").value);
    if (!selectedProfessionalId() || !service) {
      showMessage("bookingResult", "Selecione profissional e servico antes de agendar.", "danger");
      return;
    }
    const data = await request(`/public/${currentPublicSlug}/appointments`, {
      method: "POST",
      body: JSON.stringify({
        professionalId: selectedProfessionalId(),
        serviceId: service.id,
        date: $("bookingDate").value,
        time: $("bookingTime").value,
        customer: $("customerName").value,
        phone: $("customerPhone").value,
        coupon: $("couponCode").value,
        recurrence: $("recurrence").value
      })
    });

    const appointment = data.appointment;
    const message = `Ola, ${state.business.name}! Solicitei um agendamento.\n\nCliente: ${appointment.customer}\nProfissional: ${appointment.professionalName || "Nao informado"}\nServico: ${appointment.service}\nData: ${formatDate(appointment.date)}\nHorario: ${appointment.time}\nValor: ${money(appointment.total)}\nCodigo: ${appointment.code}${state.business.deposit > 0 ? `\nSinal Pix: ${money(state.business.deposit)}\nChave Pix: ${state.business.pixKey}` : ""}`;

    $("bookingResult").innerHTML = `
      <div class="alert">
        <strong>Agendamento solicitado.</strong><br>
        Profissional: ${appointment.professionalName || "Nao informado"}<br>
        Servico: ${appointment.service}<br>
        Data: ${formatDate(appointment.date)} as ${appointment.time}<br>
        Valor: ${money(appointment.total)}<br><br>
        <span class="code">${appointment.code}</span><br><br>
        Guarde esse codigo para consultar, cancelar ou remarcar.
      </div>
      ${data.payment ? `<div class="alert warning"><strong>Pix gerado:</strong><br>Sinal: ${money(data.payment.amount)}<br>Chave: ${data.payment.pixKey || state.business.pixKey || "a configurar"}<br><span class="code">${data.payment.pixCopyPaste}</span></div>` : (state.business.deposit > 0 ? `<div class="alert warning">Sinal Pix: ${money(state.business.deposit)} - Chave: ${state.business.pixKey || "a combinar"}</div>` : "")}
      <a class="btn primary full" target="_blank" href="${whatsappUrl(state.business.whatsapp, message)}">Avisar pelo WhatsApp</a>
    `;

    event.target.reset();
    $("bookingDate").value = appointment.date;
    await refreshAdmin();
    await renderTimes();
  } catch (error) {
    showMessage("bookingResult", error.message, "danger");
  }
}

async function lookupAppointment() {
  const code = $("lookupCode").value.trim().toUpperCase();
  if (!code) return;

  try {
    const data = await request(`/appointments/lookup/${code}`);
    const appointment = data.appointment;
    $("lookupResult").innerHTML = `
      <div class="item">
        <span class="status ${statusClass(appointment.status)}">${statusLabel(appointment.status)}</span>
        <div class="item-title">${appointment.service}</div>
        <div class="item-meta">${appointment.professionalName ? `${appointment.professionalName} - ` : ""}${formatDate(appointment.date)} as ${appointment.time} - ${money(appointment.total || appointment.price)}</div>
        <div class="item-actions lookup-actions">
          <button class="btn danger" data-client-cancel="${appointment.id}" ${data.canCancel ? "" : "disabled"}>Cancelar</button>
          <button class="btn" data-client-reschedule="${appointment.id}" ${data.canReschedule ? "" : "disabled"}>Remarcar</button>
        </div>
      </div>
    `;
  } catch (error) {
    showMessage("lookupResult", error.message, "danger");
  }
}

async function clientCancel(id) {
  try {
    await request(`/appointments/${id}/cancel`, { method: "POST" });
    showMessage("lookupResult", "Agendamento cancelado.");
    await refreshAdmin();
    await renderTimes();
  } catch (error) {
    showMessage("lookupResult", error.message, "danger");
  }
}

async function clientReschedule(id) {
  const date = prompt("Nova data no formato AAAA-MM-DD:");
  if (!date) return;
  const time = prompt("Novo horario no formato HH:MM:");
  if (!time) return;

  try {
    await request(`/appointments/${id}/reschedule`, { method: "POST", body: JSON.stringify({ date, time }) });
    showMessage("lookupResult", "Remarcacao solicitada. O ADM precisa aprovar.");
    await refreshAdmin();
    await renderTimes();
  } catch (error) {
    showMessage("lookupResult", error.message, "danger");
  }
}

async function createWaitlist(event) {
  event.preventDefault();
  try {
    await request(`/public/${currentPublicSlug}/waitlist`, {
      method: "POST",
      body: JSON.stringify({
        name: $("waitName").value,
        phone: $("waitPhone").value,
        date: $("waitDate").value,
        period: $("waitPeriod").value,
        serviceId: $("waitService").value
      })
    });
    event.target.reset();
    alert("Cliente adicionado a lista de espera.");
    await refreshAdmin();
  } catch (error) {
    alert(error.message);
  }
}

async function uploadBusinessPhoto() {
  const fileInput = $("businessPhotoFile");
  if (!fileInput || !fileInput.files.length) return null;

  const formData = new FormData();
  formData.append("photo", fileInput.files[0]);

  const data = await request("/admin/business/photo", {
    method: "POST",
    body: formData
  });

  state.business = data.business;
  $("businessPhotoUrl").value = data.photoUrl;
  fileInput.value = "";
  renderBusinessLogo(data.photoUrl);
  showMessage("photoUploadResult", "Imagem enviada e vinculada ao negocio.");
  return data.photoUrl;
}

async function saveSettings(event) {
  event.preventDefault();
  try {
    const uploadedPhotoUrl = await uploadBusinessPhoto();
    const selectedTheme = getThemeFromInputs();
    const data = await request("/admin/business", {
      method: "PUT",
      body: JSON.stringify({
        name: $("businessName").value,
        slug: $("businessSlug").value,
        businessType: $("businessType").value,
        whatsapp: $("businessWhatsapp").value,
        address: $("businessAddress").value,
        description: $("businessDesc").value,
        photoUrl: uploadedPhotoUrl || $("businessPhotoUrl").value,
        theme: selectedTheme,
        deposit: $("defaultDeposit").value,
        pixKey: $("pixKey").value,
        cancellationHours: $("cancellationHours").value,
        rescheduleHours: $("rescheduleHours").value,
        allowClientCancel: $("allowClientCancel").checked,
        allowClientReschedule: $("allowClientReschedule").checked
      })
    });
    state.business = data.business;
    renderAll();
    alert("Configuracao salva.");
  } catch (error) {
    alert(error.message);
  }
}

async function createProfessional(event) {
  event.preventDefault();
  try {
    const data = await request("/admin/professionals", {
      method: "POST",
      body: JSON.stringify({
        name: $("professionalName").value,
        specialty: $("professionalSpecialty").value,
        photoUrl: $("professionalPhotoUrl").value,
        workingHours: getScheduleFromControls("professional"),
        workingDays: getSelectedWorkingDays("professional"),
        workingSchedule: getWeeklyScheduleFromControls("professional")
      })
    });

    const fileInput = $("professionalPhotoFile");
    if (fileInput && fileInput.files.length) {
      await uploadProfessionalPhoto(data.professional.id, fileInput.files[0]);
    }

    event.target.reset();
    resetProfessionalFormPhoto();
    setScheduleControls("professional", undefined, DEFAULT_WORKING_DAYS);
    await refreshAdmin();
  } catch (error) {
    alert(error.message);
  }
}

async function createService(event) {
  event.preventDefault();
  try {
    await request("/admin/services", {
      method: "POST",
      body: JSON.stringify({
        professionalId: $("serviceProfessional").value,
        name: $("serviceName").value,
        price: $("servicePrice").value,
        duration: $("serviceDuration").value,
        buffer: $("serviceBuffer").value
      })
    });
    event.target.reset();
    fillDurationSelect("serviceDuration", 30);
    fillBufferSelect("serviceBuffer", 0);
    await refreshAdmin();
  } catch (error) {
    alert(error.message);
  }
}

async function createBlock(event) {
  event.preventDefault();
  try {
    await request("/admin/blocks", {
      method: "POST",
      body: JSON.stringify({
        date: $("blockDate").value,
        startTime: $("blockStart").value,
        endTime: $("blockEnd").value,
        reason: $("blockReason").value,
        allDay: $("blockAllDay").checked,
        professionalId: $("blockProfessional") ? $("blockProfessional").value : ""
      })
    });
    event.target.reset();
    await refreshAdmin();
    await renderTimes();
  } catch (error) {
    alert(error.message);
  }
}

async function updateAppointment(id, status) {
  try {
    await request(`/admin/appointments/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
    await refreshAdmin();
  } catch (error) {
    alert(error.message);
  }
}

async function toggleProfessional(id, active) {
  await request(`/admin/professionals/${id}/active`, { method: "PATCH", body: JSON.stringify({ active }) });
  await refreshAdmin();
  await renderTimes();
}

function editProfessionalHours(id) {
  const professional = state.professionals.find(item => item.id === id);
  if (!professional) return;

  editingScheduleProfessionalId = id;
  $("scheduleEditorTitle").textContent = `Editar dias e horarios de ${professional.name}`;
  setScheduleControls("schedule", professional.workingHours || [], professional.workingDays || DEFAULT_WORKING_DAYS, professional.workingSchedule || {});
  $("professionalScheduleEditor").classList.remove("hidden");
  $("professionalScheduleEditor").scrollIntoView({ behavior: "smooth", block: "center" });
}

async function saveProfessionalSchedule() {
  if (!editingScheduleProfessionalId) return;

  const workingHours = getScheduleFromControls("schedule");
  const workingDays = getSelectedWorkingDays("schedule");
  const workingSchedule = getWeeklyScheduleFromControls("schedule");

  if (!workingDays.length) {
    alert("Selecione ao menos um dia de trabalho.");
    return;
  }

  if (!workingHours.length) {
    alert("Selecione um horario de fim maior que o horario de inicio.");
    return;
  }

  await request(`/admin/professionals/${editingScheduleProfessionalId}/hours`, {
    method: "PUT",
    body: JSON.stringify({ workingHours, workingDays, workingSchedule })
  });
  editingScheduleProfessionalId = "";
  $("professionalScheduleEditor").classList.add("hidden");
  await refreshAdmin();
  await renderTimes();
}

function cancelProfessionalScheduleEdit() {
  editingScheduleProfessionalId = "";
  if ($("professionalScheduleEditor")) $("professionalScheduleEditor").classList.add("hidden");
}

async function toggleService(id, active) {
  await request(`/admin/services/${id}/active`, { method: "PATCH", body: JSON.stringify({ active }) });
  await refreshAdmin();
  await renderTimes();
}

async function updatePaymentStatus(id, status) {
  await request(`/admin/payments/${id}/status`, { method: "POST", body: JSON.stringify({ status }) });
  await refreshAdmin();
}

async function createAdminUser(event) {
  event.preventDefault();
  try {
    await request("/admin/users", { method: "POST", body: JSON.stringify({ name: $("userName").value, email: $("userEmail").value, password: $("userPassword").value, role: $("userRole").value, permissions: selectedPermissions() }) });
    event.target.reset();
    await refreshAdmin();
  } catch (error) {
    alert(error.message);
  }
}

async function sendReminders() {
  try {
    const data = await request("/admin/reminders/send", { method: "POST" });
    alert(`${data.total} lembrete(s) preparado(s).`);
  } catch (error) {
    alert(error.message);
  }
}

async function removeResource(kind, id) {
  const paths = {
    service: `/admin/services/${id}`,
    professional: `/admin/professionals/${id}`,
    block: `/admin/blocks/${id}`,
    wait: `/admin/waitlist/${id}`
  };
  try {
    await request(paths[kind], { method: "DELETE" });
    await refreshAdmin();
    await renderTimes();
  } catch (error) {
    alert(error.message);
  }
}

function bindEvents() {
  document.querySelectorAll("[data-view]").forEach(button => button.addEventListener("click", () => showView(button.dataset.view)));
  document.querySelectorAll(".admin-tab").forEach(button => button.addEventListener("click", () => showAdminView(button.dataset.admin)));

  document.querySelectorAll(".filter-btn").forEach(button => {
    button.addEventListener("click", () => {
      appointmentFilter = button.dataset.filter;
      document.querySelectorAll(".filter-btn").forEach(btn => btn.classList.toggle("active", btn === button));
      renderAppointments();
    });
  });

  $("loginForm").addEventListener("submit", login);
  $("registerForm").addEventListener("submit", register);
  if ($("forgotPasswordForm")) $("forgotPasswordForm").addEventListener("submit", forgotPassword);
  if ($("resetPasswordForm")) $("resetPasswordForm").addEventListener("submit", resetPassword);
  $("logoutBtn").addEventListener("click", logout);
  $("bookingForm").addEventListener("submit", createAppointment);
  $("waitlistForm").addEventListener("submit", createWaitlist);
  $("settingsForm").addEventListener("submit", saveSettings);
  $("professionalForm").addEventListener("submit", createProfessional);
  $("serviceForm").addEventListener("submit", createService);
  $("blockForm").addEventListener("submit", createBlock);
  if ($("userForm")) $("userForm").addEventListener("submit", createAdminUser);
  if ($("userRole")) $("userRole").addEventListener("change", event => syncPermissionCheckboxes(event.target.value));
  syncPermissionCheckboxes($("userRole") ? $("userRole").value : "business_admin");
  if ($("sendRemindersBtn")) $("sendRemindersBtn").addEventListener("click", sendReminders);
  $("lookupBtn").addEventListener("click", lookupAppointment);
  $("bookingProfessional").addEventListener("change", () => { renderPublic(); renderTimes(); });
  $("bookingService").addEventListener("change", renderTimes);
  $("bookingDate").addEventListener("change", renderTimes);
  $("blockAllDay").addEventListener("change", event => {
    $("blockStart").disabled = event.target.checked;
    $("blockEnd").disabled = event.target.checked;
  });

  prepareScheduleControls();
  renderServicePresets();
  updateSlugPreviews();
  ["professionalStart", "professionalEnd", "professionalInterval"].forEach(id => {
    if ($(id)) $(id).addEventListener("change", () => {
      renderDayScheduleControls("professional", getWeeklyScheduleFromControls("professional"), getSelectedWorkingDays("professional"), getScheduleFromControls("professional"));
    });
  });
  document.querySelectorAll('[data-week-days="professional"]').forEach(container => {
    container.addEventListener("change", () => {
      renderDayScheduleControls("professional", getWeeklyScheduleFromControls("professional"), getSelectedWorkingDays("professional"), getScheduleFromControls("professional"));
    });
  });
  ["scheduleStart", "scheduleEnd", "scheduleInterval"].forEach(id => {
    if ($(id)) $(id).addEventListener("change", () => {
      renderDayScheduleControls("schedule", getWeeklyScheduleFromControls("schedule"), getSelectedWorkingDays("schedule"), getScheduleFromControls("schedule"));
      updateSchedulePreview("schedule");
    });
  });
  document.querySelectorAll('[data-week-days="schedule"]').forEach(container => {
    container.addEventListener("change", () => {
      renderDayScheduleControls("schedule", getWeeklyScheduleFromControls("schedule"), getSelectedWorkingDays("schedule"), getScheduleFromControls("schedule"));
      updateSchedulePreview("schedule");
    });
  });
  if ($("saveScheduleEdit")) $("saveScheduleEdit").addEventListener("click", saveProfessionalSchedule);
  if ($("cancelScheduleEdit")) $("cancelScheduleEdit").addEventListener("click", cancelProfessionalScheduleEdit);

  if ($("businessLogoTrigger")) {
    $("businessLogoTrigger").addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      toggleBusinessLogoMenu();
    });
  }

  if ($("businessPhotoFile")) {
    $("businessPhotoFile").addEventListener("change", async event => {
      const file = event.target.files && event.target.files[0];
      if (!file) return;
      await setBusinessLogoFromFile(file);
    });
  }

  if ($("businessPhotoUrl")) {
    $("businessPhotoUrl").addEventListener("input", event => {
      setBusinessLogoFromUrl(event.target.value);
    });
  }

  if ($("applyThemePreview")) {
    $("applyThemePreview").addEventListener("click", () => {
      applyTheme(getThemeFromInputs());
    });
  }

  if ($("resetTheme")) {
    $("resetTheme").addEventListener("click", resetThemeToDefault);
  }

  THEME_FIELDS.forEach(field => {
    const picker = $(field.picker);
    const hexInput = $(field.hex);

    if (picker) {
      picker.addEventListener("input", event => {
        setThemeField(field, event.target.value);
      });
    }

    if (hexInput) {
      hexInput.addEventListener("input", event => {
        const normalized = normalizeHex(event.target.value, "");
        if (normalized) setThemeField(field, normalized);
      });

      hexInput.addEventListener("blur", event => {
        setThemeField(field, event.target.value);
      });
    }
  });

  if ($("professionalPhotoTrigger")) {
    $("professionalPhotoTrigger").addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      toggleProfessionalFormPhotoMenu();
    });
  }

  if ($("professionalPhotoFile")) {
    $("professionalPhotoFile").addEventListener("change", async event => {
      const file = event.target.files && event.target.files[0];
      if (!file) return;
      await setProfessionalFormPhotoFromFile(file);
    });
  }

  $("businessName").addEventListener("input", event => {
    const slugInput = $("businessSlug");
    if (!slugInput.dataset.edited) slugInput.value = slugify(event.target.value);
    updateSlugPreviews();
  });

  $("businessSlug").addEventListener("input", event => {
    event.target.dataset.edited = "true";
    event.target.value = slugify(event.target.value);
    updateSlugPreviews();
  });

  $("registerName").addEventListener("input", event => {
    const slugInput = $("registerSlug");
    if (!slugInput.dataset.edited) slugInput.value = slugify(event.target.value);
    updateSlugPreviews();
  });

  $("registerSlug").addEventListener("input", event => {
    event.target.dataset.edited = "true";
    event.target.value = slugify(event.target.value);
    updateSlugPreviews();
  });

  document.addEventListener("click", event => {
    if (!event.target.closest(".photo-menu-anchor")) closeAllPhotoMenus();
  });

  document.body.addEventListener("change", event => {
    const daySchedule = event.target.closest(".day-schedule-list");
    if (daySchedule) {
      if (daySchedule.id === "scheduleDaySchedule") updateSchedulePreview("schedule");
      return;
    }
  });

  document.body.addEventListener("change", async event => {
    const fileInput = event.target.closest("[data-professional-file-input]");
    if (!fileInput) return;
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;

    try {
      await uploadProfessionalPhoto(fileInput.dataset.professionalFileInput, file);
      fileInput.value = "";
      closeProfessionalCardPhotoMenus();
      await refreshAdmin();
    } catch (error) {
      alert(error.message);
    }
  });

  document.body.addEventListener("click", event => {
    const presetButton = event.target.closest("[data-service-preset]");
    const businessLogoActionButton = event.target.closest("[data-business-logo-action]");
    const formPhotoActionButton = event.target.closest("[data-form-photo-action]");
    const professionalPhotoTrigger = event.target.closest("[data-professional-photo-trigger]");
    const professionalPhotoActionButton = event.target.closest("[data-professional-photo-action]");
    const professionalId = event.target.dataset.deleteProfessional;
    const toggleProfessionalData = event.target.dataset.toggleProfessional;
    const editHoursId = event.target.dataset.editHours;
    const serviceId = event.target.dataset.deleteService;
    const toggleServiceData = event.target.dataset.toggleService;
    const paymentStatus = event.target.dataset.paymentStatus;
    const blockId = event.target.dataset.deleteBlock;
    const waitId = event.target.dataset.deleteWait;
    const statusData = event.target.dataset.status;
    const cancelId = event.target.dataset.clientCancel;
    const rescheduleId = event.target.dataset.clientReschedule;

    if (presetButton) {
      event.preventDefault();
      applyServicePreset(presetButton.dataset.servicePreset);
      return;
    }

    if (businessLogoActionButton) {
      event.preventDefault();
      event.stopPropagation();
      handleBusinessLogoAction(businessLogoActionButton.dataset.businessLogoAction);
      closeBusinessLogoMenu();
      return;
    }

    if (formPhotoActionButton) {
      event.preventDefault();
      event.stopPropagation();
      handleProfessionalFormPhotoAction(formPhotoActionButton.dataset.formPhotoAction);
      closeProfessionalFormPhotoMenu();
      return;
    }

    if (professionalPhotoTrigger) {
      event.preventDefault();
      event.stopPropagation();
      toggleProfessionalPhotoMenu(professionalPhotoTrigger.dataset.professionalPhotoTrigger);
      return;
    }

    if (professionalPhotoActionButton) {
      event.preventDefault();
      event.stopPropagation();
      const professionalPhotoId = professionalPhotoActionButton.dataset.professionalId;
      const action = professionalPhotoActionButton.dataset.professionalPhotoAction;

      if (action === "upload") {
        const input = document.querySelector(`[data-professional-file-input="${professionalPhotoId}"]`);
        if (input) input.click();
      }

      if (action === "remove" && confirm("Remover a foto deste profissional?")) {
        removeProfessionalPhoto(professionalPhotoId);
      }

      closeProfessionalCardPhotoMenus();
      return;
    }

    if (toggleProfessionalData) { const [id, active] = toggleProfessionalData.split(":"); toggleProfessional(id, active === "true"); }
    if (editHoursId) editProfessionalHours(editHoursId);
    if (professionalId && confirm("Excluir apenas se nao houver historico. Para preservar historico, use Desativar.")) removeResource("professional", professionalId);
    if (toggleServiceData) { const [id, active] = toggleServiceData.split(":"); toggleService(id, active === "true"); }
    if (paymentStatus) { const [id, status] = paymentStatus.split(":"); updatePaymentStatus(id, status); }
    if (serviceId && confirm("Excluir apenas se nao houver historico. Para preservar historico, use Desativar.")) removeResource("service", serviceId);
    if (blockId) removeResource("block", blockId);
    if (waitId) removeResource("wait", waitId);
    if (statusData) {
      const [id, status] = statusData.split(":");
      updateAppointment(id, status);
    }
    if (cancelId) clientCancel(cancelId);
    if (rescheduleId) clientReschedule(rescheduleId);
  });

  renderBusinessLogo();
  renderProfessionalFormPhoto();
}

async function start() {
  bindEvents();
  const params = new URLSearchParams(window.location.search);
  if (params.get("resetToken") && $("resetToken")) {
    $("resetToken").value = params.get("resetToken");
    $("resetPasswordForm").classList.remove("hidden");
    showView("admin");
    showAdminView("auth");
  }
  await loadAdmin();
  if (state.user) {
    renderAll();
    showAdminView("dashboard");
  } else {
    const slugFromUrl = publicSlugFromLocation();
    await loadPublic(slugFromUrl);
    showAdminView("auth");
    if (slugFromUrl) showView("client");
  }
}

start().catch(error => {
  document.body.insertAdjacentHTML("afterbegin", `<div class="alert danger app-error">${error.message}</div>`);
});
