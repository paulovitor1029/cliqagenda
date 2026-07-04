import { CSSProperties, FormEvent, useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { api, formatDate, money } from "../api";
import type { Appointment, Payment, PublicBundle } from "../types";

export function ClientLanding() {
  return (
    <main className="link-required-page">
      <div className="brand centered">
        <span className="brand-mark">CA</span>
        <span><strong>CliqAgenda</strong><small>Agendamento online</small></span>
      </div>
      <section className="card link-required-card">
        <span className="eyebrow">Acesso por convite</span>
        <h1>Use o link do estabelecimento</h1>
        <p>Cada negócio possui uma página exclusiva de agendamento. Solicite o link ao estabelecimento para escolher profissional, serviço e horário.</p>
      </section>
    </main>
  );
}

export function PublicBusinessPage() {
  const { businessSlug = "" } = useParams();
  const [professionalId, setProfessionalId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState("");
  const [result, setResult] = useState<{ appointment: Appointment; payment: Payment | null } | null>(null);
  const [message, setMessage] = useState("");

  const publicQuery = useQuery({
    queryKey: ["public-business", businessSlug],
    queryFn: () => api<PublicBundle>(`/public/${businessSlug}`)
  });

  useEffect(() => {
    const professionals = publicQuery.data?.professionals || [];
    if (professionals.length && !professionals.some(item => item.id === professionalId)) {
      setProfessionalId(professionals[0].id);
    }
  }, [publicQuery.data, professionalId]);

  const availableServices = (publicQuery.data?.services || []).filter(service => service.professionalId === professionalId);

  useEffect(() => {
    if (!availableServices.some(item => item.id === serviceId)) {
      setServiceId(availableServices[0]?.id || "");
    }
  }, [availableServices, serviceId]);

  const slotsQuery = useQuery({
    queryKey: ["slots", businessSlug, professionalId, date, serviceId],
    queryFn: () => api<{ slots: string[] }>(`/public/${businessSlug}/slots?date=${encodeURIComponent(date)}&professionalId=${encodeURIComponent(professionalId)}&serviceId=${encodeURIComponent(serviceId)}`),
    enabled: Boolean(publicQuery.data && professionalId && date && serviceId)
  });

  useEffect(() => {
    const slots = slotsQuery.data?.slots || [];
    setTime(current => slots.includes(current) ? current : (slots[0] || ""));
  }, [slotsQuery.data]);

  const booking = useMutation({
    mutationFn: (payload: Record<string, FormDataEntryValue>) => api<{ appointment: Appointment; payment: Payment | null }>(`/public/${businessSlug}/appointments`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),
    onSuccess: data => {
      setResult(data);
      setMessage("Agendamento criado com sucesso.");
      slotsQuery.refetch();
    },
    onError: error => setMessage(error instanceof Error ? error.message : "Não foi possível agendar.")
  });

  const waitlist = useMutation({
    mutationFn: (payload: Record<string, FormDataEntryValue>) => api(`/public/${businessSlug}/waitlist`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),
    onSuccess: () => setMessage("Você entrou na lista de espera."),
    onError: error => setMessage(error instanceof Error ? error.message : "Não foi possível entrar na lista.")
  });

  if (publicQuery.isLoading) return <LoadingPage />;
  if (publicQuery.isError || !publicQuery.data) {
    return (
      <main className="link-required-page">
        <section className="card link-required-card">
          <span className="eyebrow">Link indisponível</span>
          <h1>Negócio não encontrado</h1>
          <p>Confira o endereço recebido ou solicite um novo link ao estabelecimento.</p>
        </section>
      </main>
    );
  }

  const { business, professionals } = publicQuery.data;
  const selectedProfessional = professionals.find(item => item.id === professionalId);
  const themeStyle = {
    "--primary": business.theme.primary || "#16a34a",
    "--primary-dark": business.theme.primaryDark || "#15803d"
  } as CSSProperties;

  function submitBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    booking.mutate({
      professionalId,
      serviceId,
      date,
      time,
      customer: form.get("customer") || "",
      phone: form.get("phone") || "",
      coupon: form.get("coupon") || "",
      recurrence: form.get("recurrence") || "0"
    });
  }

  function submitWaitlist(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    waitlist.mutate({
      professionalId,
      serviceId,
      name: form.get("name") || "",
      phone: form.get("phone") || "",
      date: form.get("date") || "",
      period: form.get("period") || ""
    });
  }

  return (
    <main className="public-page" style={themeStyle}>
      <header className="public-header">
        <div className="brand">
          <span className="brand-mark">{business.name.slice(0, 2).toUpperCase()}</span>
          <span><strong>{business.name}</strong><small>{business.businessType}</small></span>
        </div>
        <span className="secure-label">Página oficial de agendamento</span>
      </header>

      <div className="public-grid">
        <aside className="card professional-profile">
          {business.photoUrl
            ? <img className="profile-photo" src={business.photoUrl} alt={business.name} />
            : <div className="profile-placeholder">{business.name.slice(0, 2).toUpperCase()}</div>}
          <span className="eyebrow">Estabelecimento</span>
          <h1>{business.name}</h1>
          <p>{business.description || business.businessType}</p>
          <dl className="details">
            <div><dt>Tipo</dt><dd>{business.businessType}</dd></div>
            <div><dt>WhatsApp</dt><dd>{business.whatsapp}</dd></div>
            {business.address && <div><dt>Endereço</dt><dd>{business.address}</dd></div>}
          </dl>
        </aside>

        <section className="card booking-panel">
          <span className="eyebrow">Agendamento</span>
          <h2>Escolha profissional, serviço e horário</h2>
          {!professionals.length ? (
            <div className="empty-state">Este estabelecimento ainda não possui profissionais disponíveis.</div>
          ) : (
            <form className="form-stack" onSubmit={submitBooking}>
              <label>Profissional
                <select value={professionalId} onChange={event => setProfessionalId(event.target.value)} required>
                  {professionals.map(professional => <option key={professional.id} value={professional.id}>{professional.name}{professional.specialty ? ` — ${professional.specialty}` : ""}</option>)}
                </select>
              </label>
              {selectedProfessional && (
                <div className="selected-professional">
                  {selectedProfessional.photoUrl
                    ? <img src={selectedProfessional.photoUrl} alt="" />
                    : <span>{selectedProfessional.name.slice(0, 2).toUpperCase()}</span>}
                  <div><strong>{selectedProfessional.name}</strong><small>{selectedProfessional.specialty || "Atendimento profissional"}</small></div>
                </div>
              )}
              <label>Serviço
                <select value={serviceId} onChange={event => setServiceId(event.target.value)} required>
                  {!availableServices.length && <option value="">Sem serviços disponíveis</option>}
                  {availableServices.map(service => <option key={service.id} value={service.id}>{service.name} — {money(service.price)}</option>)}
                </select>
              </label>
              <div className="two-columns">
                <label>Data<input type="date" value={date} min={new Date().toISOString().slice(0, 10)} onChange={event => setDate(event.target.value)} required /></label>
                <label>Horário
                  <select value={time} onChange={event => setTime(event.target.value)} disabled={!slotsQuery.data?.slots.length} required>
                    {!slotsQuery.data?.slots.length && <option value="">Sem horários</option>}
                    {slotsQuery.data?.slots.map(slot => <option key={slot}>{slot}</option>)}
                  </select>
                </label>
              </div>
              <div className="two-columns">
                <label>Seu nome<input name="customer" required /></label>
                <label>WhatsApp<input name="phone" inputMode="numeric" required /></label>
              </div>
              <div className="two-columns">
                <label>Cupom<input name="coupon" /></label>
                <label>Recorrência
                  <select name="recurrence" defaultValue="0">
                    <option value="0">Não repetir</option><option value="15">A cada 15 dias</option><option value="30">A cada 30 dias</option>
                  </select>
                </label>
              </div>
              <button className="button primary" disabled={booking.isPending || !time}>{booking.isPending ? "Agendando..." : "Confirmar agendamento"}</button>
            </form>
          )}

          {message && <div className={`message ${result ? "success" : ""}`}>{message}</div>}
          {result && (
            <div className="appointment-result">
              <strong>Código: {result.appointment.code}</strong>
              <span>{formatDate(result.appointment.date)} às {result.appointment.time}</span>
              <span>{result.appointment.service} com {result.appointment.professionalName}</span>
              {result.payment && <span>Sinal Pix: {money(result.payment.amount)} — chave {result.payment.pixKey || business.pixKey}</span>}
            </div>
          )}

          <details className="waitlist-box">
            <summary>Horário indisponível? Entrar na lista de espera</summary>
            <form className="form-stack" onSubmit={submitWaitlist}>
              <div className="two-columns">
                <label>Nome<input name="name" required /></label>
                <label>WhatsApp<input name="phone" required /></label>
              </div>
              <div className="two-columns">
                <label>Data<input name="date" type="date" min={new Date().toISOString().slice(0, 10)} required /></label>
                <label>Período<input name="period" placeholder="Ex.: tarde" required /></label>
              </div>
              <button className="button secondary" disabled={waitlist.isPending}>Entrar na lista</button>
            </form>
          </details>
        </section>
      </div>
    </main>
  );
}

function LoadingPage() {
  return <main className="link-required-page"><div className="loading">Carregando agenda...</div></main>;
}
