import { FormEvent, ReactNode, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";

function AuthLayout({ children, title, description }: { children: ReactNode; title: string; description: string }) {
  return (
    <main className="auth-page">
      <section className="auth-presentation">
        <Link className="brand" to="/">
          <span className="brand-mark">CA</span>
          <span><strong>CliqAgenda</strong><small>Agenda profissional</small></span>
        </Link>
        <div>
          <span className="eyebrow">Área profissional</span>
          <h1>{title}</h1>
          <p>{description}</p>
          <ul className="check-list">
            <li>Sessão protegida no servidor</li>
            <li>Dados isolados por negócio</li>
            <li>Link público único por negócio</li>
          </ul>
        </div>
      </section>
      <section className="auth-card card">{children}</section>
    </main>
  );
}

export function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState<"login" | "forgot" | "reset">(searchParams.has("resetToken") ? "reset" : "login");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setLoading(true);
    setError("");
    try {
      const data = await api<{ user?: { role: string }; system?: boolean }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: form.get("email"), password: form.get("password") })
      });
      localStorage.setItem("cliqagenda_session_event", `login:${Date.now()}`);
      const next = searchParams.get("next");
      const fallback = data.system || data.user?.role === "system_admin" ? "/sistema" : "/admin";
      navigate(next?.startsWith("/") && !next.startsWith("//") ? next : fallback, { replace: true });
    } catch (currentError) {
      setError(currentError instanceof Error ? currentError.message : "Falha no login.");
    } finally {
      setLoading(false);
    }
  }

  async function submitForgot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setLoading(true);
    setError("");
    try {
      const data = await api<{ message: string; resetUrl?: string }>("/auth/password/forgot", {
        method: "POST",
        body: JSON.stringify({ email: form.get("email") })
      });
      setMessage(data.resetUrl ? `${data.message} Link de desenvolvimento: ${data.resetUrl}` : data.message);
    } catch (currentError) {
      setError(currentError instanceof Error ? currentError.message : "Falha na recuperação.");
    } finally {
      setLoading(false);
    }
  }

  async function submitReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") || "");
    if (password !== form.get("confirmation")) {
      setError("As senhas não coincidem.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const data = await api<{ message: string }>("/auth/password/reset", {
        method: "POST",
        body: JSON.stringify({ token: searchParams.get("resetToken"), password })
      });
      setMessage(data.message);
      setMode("login");
    } catch (currentError) {
      setError(currentError instanceof Error ? currentError.message : "Falha ao redefinir senha.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout title="Gerencie sua agenda em um só lugar." description="Entre somente se você faz parte da equipe do negócio. Clientes acessam diretamente o link de um profissional.">
      {mode === "login" && (
        <>
          <span className="eyebrow">Acesso</span>
          <h2>Entrar no painel</h2>
          <form className="form-stack" onSubmit={submitLogin}>
            <label>E-mail<input name="email" type="email" autoComplete="username" required /></label>
            <label>Senha<input name="password" type="password" autoComplete="current-password" required /></label>
            <button className="button primary" disabled={loading}>{loading ? "Aguarde..." : "Entrar"}</button>
          </form>
          <button className="text-button" onClick={() => { setMode("forgot"); setError(""); setMessage(""); }}>Esqueci minha senha</button>
          <div className="auth-switch">Novo por aqui? Solicite acesso ao administrador geral.</div>
        </>
      )}

      {mode === "forgot" && (
        <>
          <span className="eyebrow">Recuperação</span>
          <h2>Recuperar acesso</h2>
          <form className="form-stack" onSubmit={submitForgot}>
            <label>E-mail cadastrado<input name="email" type="email" required /></label>
            <button className="button primary" disabled={loading}>Enviar instruções</button>
          </form>
          <button className="text-button" onClick={() => setMode("login")}>Voltar ao login</button>
        </>
      )}

      {mode === "reset" && (
        <>
          <span className="eyebrow">Nova senha</span>
          <h2>Redefinir senha</h2>
          <form className="form-stack" onSubmit={submitReset}>
            <label>Nova senha<input name="password" type="password" minLength={8} required /></label>
            <label>Confirmar senha<input name="confirmation" type="password" minLength={8} required /></label>
            <button className="button primary" disabled={loading}>Atualizar senha</button>
          </form>
        </>
      )}
      {message && <div className="message success">{message}</div>}
      {error && <div className="message error">{error}</div>}
    </AuthLayout>
  );
}

export function RegisterPage() {
  return (
    <AuthLayout title="Cadastro somente por convite." description="Novos negócios e usuários são criados por um administrador geral do sistema.">
      <span className="eyebrow">Cadastro desativado</span>
      <h2>Solicite seu acesso</h2>
      <p>O auto-cadastro de empresas foi removido. Peça ao administrador geral para criar o negócio e o usuário inicial.</p>
      <Link className="button primary" to="/login">Ir para o login</Link>
    </AuthLayout>
  );
}
