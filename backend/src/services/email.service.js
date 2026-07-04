async function sendPasswordResetEmail(to, resetUrl) {
  if (!to || !resetUrl) return { sent: false, provider: "none" };

  if (process.env.RESEND_API_KEY && process.env.PASSWORD_RESET_FROM) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: process.env.PASSWORD_RESET_FROM,
        to,
        subject: "Recuperação de senha — CliqAgenda",
        html: `
          <p>Olá.</p>
          <p>Recebemos uma solicitação para redefinir sua senha.</p>
          <p><a href="${resetUrl}">Clique aqui para criar uma nova senha</a></p>
          <p>Este link expira em 1 hora.</p>
          <p>Se você não pediu isso, ignore esta mensagem.</p>
        `
      })
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Falha ao enviar e-mail de recuperação: ${text || response.status}`);
    }

    return { sent: true, provider: "resend" };
  }

  if (process.env.NODE_ENV !== "production") {
    console.log(`Link de recuperação CliqAgenda para ${to}: ${resetUrl}`);
  }

  return { sent: false, provider: "console" };
}

module.exports = { sendPasswordResetEmail };
