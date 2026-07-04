function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "");
}

function waMeUrl(phone, message) {
  const normalized = normalizePhone(phone);
  const withCountry = normalized.startsWith("55") ? normalized : `55${normalized}`;
  return `https://wa.me/${withCountry}?text=${encodeURIComponent(message)}`;
}

function buildAppointmentMessage({ business, appointment }) {
  const lines = [
    `Ola, ${business.name}! Solicitei um agendamento pelo CliqAgenda.`,
    "",
    `Cliente: ${appointment.customer}`,
    `Profissional: ${appointment.professionalName || "Nao informado"}`,
    `Servico: ${appointment.service}`,
    `Data: ${formatDate(appointment.date)}`,
    `Horario: ${appointment.time}`,
    `Valor: R$ ${Number(appointment.total || appointment.price || 0).toFixed(2).replace(".", ",")}`,
    `Codigo: ${appointment.code}`
  ];

  if (Number(business.deposit || 0) > 0) {
    lines.push("", `Sinal Pix: R$ ${Number(business.deposit).toFixed(2).replace(".", ",")}`);
    lines.push(`Chave Pix: ${business.pixKey || "a combinar"}`);
  }

  return lines.join("\n");
}

async function sendWhatsAppMessage({ to, message }) {
  const provider = String(process.env.WHATSAPP_PROVIDER || "link").toLowerCase();

  if (provider === "meta") {
    return sendMetaMessage({ to, message });
  }

  if (provider === "zapi") {
    return sendZapiMessage({ to, message });
  }

  if (provider === "evolution") {
    return sendEvolutionMessage({ to, message });
  }

  return {
    provider: "link",
    sent: false,
    mode: "manual",
    url: waMeUrl(to, message),
    message: "API de WhatsApp nao configurada. Use o link manual como fallback."
  };
}

async function sendMetaMessage({ to, message }) {
  const token = process.env.WHATSAPP_META_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_META_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) {
    return fallbackMissingConfig("meta", to, message);
  }

  const response = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: normalizeInternational(to),
      type: "text",
      text: { preview_url: false, body: message }
    })
  });

  const data = await safeJson(response);
  if (!response.ok) {
    return {
      provider: "meta",
      sent: false,
      mode: "api",
      url: waMeUrl(to, message),
      error: data?.error?.message || "Falha ao enviar mensagem pela Meta WhatsApp Cloud API."
    };
  }

  return { provider: "meta", sent: true, mode: "api", data };
}

async function sendZapiMessage({ to, message }) {
  const instanceId = process.env.ZAPI_INSTANCE_ID;
  const instanceToken = process.env.ZAPI_INSTANCE_TOKEN;
  const clientToken = process.env.ZAPI_CLIENT_TOKEN;
  if (!instanceId || !instanceToken || !clientToken) {
    return fallbackMissingConfig("zapi", to, message);
  }

  const response = await fetch(`https://api.z-api.io/instances/${instanceId}/token/${instanceToken}/send-text`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Client-Token": clientToken
    },
    body: JSON.stringify({ phone: normalizeInternational(to), message })
  });

  const data = await safeJson(response);
  if (!response.ok) {
    return { provider: "zapi", sent: false, mode: "api", url: waMeUrl(to, message), error: data?.message || "Falha ao enviar mensagem pela Z-API." };
  }

  return { provider: "zapi", sent: true, mode: "api", data };
}

async function sendEvolutionMessage({ to, message }) {
  const baseUrl = process.env.EVOLUTION_API_URL;
  const instance = process.env.EVOLUTION_INSTANCE;
  const apiKey = process.env.EVOLUTION_API_KEY;
  if (!baseUrl || !instance || !apiKey) {
    return fallbackMissingConfig("evolution", to, message);
  }

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/message/sendText/${instance}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: apiKey
    },
    body: JSON.stringify({ number: normalizeInternational(to), text: message })
  });

  const data = await safeJson(response);
  if (!response.ok) {
    return { provider: "evolution", sent: false, mode: "api", url: waMeUrl(to, message), error: data?.message || "Falha ao enviar mensagem pela Evolution API." };
  }

  return { provider: "evolution", sent: true, mode: "api", data };
}

function fallbackMissingConfig(provider, to, message) {
  return {
    provider,
    sent: false,
    mode: "manual",
    url: waMeUrl(to, message),
    message: `Credenciais do provedor ${provider} nao configuradas. Use o link manual como fallback.`
  };
}

function normalizeInternational(phone) {
  const normalized = normalizePhone(phone);
  return normalized.startsWith("55") ? normalized : `55${normalized}`;
}

function formatDate(value) {
  if (!value) return "";
  const [year, month, day] = String(value).split("-");
  return `${day}/${month}/${year}`;
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch (error) {
    return null;
  }
}

module.exports = {
  buildAppointmentMessage,
  sendWhatsAppMessage,
  waMeUrl
};
