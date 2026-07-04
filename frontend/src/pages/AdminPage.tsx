import { FormEvent, ReactNode, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import { ApiError, api, formatDate, money } from "../api";
import type { AdminBundle, Appointment, Business, Professional, Service } from "../types";

const sections = [
  ["dashboard", "Resumo"],
  ["business", "Negócio"],
  ["professionals", "Profissionais"],
  ["services", "Serviços"],
  ["appointments", "Agenda"],
  ["blocks", "Bloqueios"],
  ["finance", "Financeiro"],
  ["users", "Usuários"],
  ["clients", "Clientes"]
] as const;

type Section = typeof sections[number][0];

export function AdminPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const section = (location.pathname.split("/")[2] || "dashboard") as Section;
  const adminQuery = useQuery({
    queryKey: ["admin"],
    queryFn: () => api<AdminBundle>("/auth/me")
  });

  useEffect(() => {
    if (adminQuery.error instanceof ApiError && adminQuery.error.status === 401) {
      navigate("/login?next=/admin", { replace: true });
    }
  }, [adminQuery.error, navigate]);

  useEffect(() => {
    const listener = (event: PageTransitionEvent) => {
      if (event.persisted) window.location.reload();
    };
    window.addEventListener("pageshow", listener);
    return () => window.removeEventListener("pageshow", listener);
  }, []);

  async function logout() {
    await api("/auth/logout", { method: "POST" }).catch(() => null);
    queryClient.clear();
    localStorage.setItem("cliqagenda_session_event", `logout:${Date.now()}`);
    window.location.replace("/login");
  }

  if (adminQuery.isLoading) return <div className="loading full-page">Carregando painel...</div>;
  if (!adminQuery.data) return null;

  const bundle = adminQuery.data;
  const visibleSections = sections.filter(([key]) => {
    if (bundle.user.role === "owner" || key === "dashboard") return true;
    return bundle.user.permissions?.[key] !== false;
  });

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="brand admin-brand">
          <span className="brand-mark">{bundle.business.name.slice(0, 2).toUpperCase()}</span>
          <span><strong>{bundle.business.name}</strong><small>{bundle.user.email}</small></span>
        </div>
        <nav>
          {visibleSections.map(([key, label]) => (
            <button key={key} className={section === key ? "active" : ""} onClick={() => navigate(`/admin/${key}`)}>{label}</button>
          ))}
        </nav>
        <button className="button danger logout" onClick={logout}>Sair</button>
      </aside>
      <main className="admin-content">
        <header className="admin-header">
          <div><span className="eyebrow">Área profissional</span><h1>{sections.find(([key]) => key === section)?.[1] || "Painel"}</h1></div>
          <span className="session-badge">Sessão protegida</span>
        </header>
        <SectionContent section={section} bundle={bundle} />
      </main>
    </div>
  );
}

function SectionContent({ section, bundle }: { section: Section; bundle: AdminBundle }) {
  switch (section) {
    case "business": return <BusinessSection business={bundle.business} />;
    case "professionals": return <ProfessionalsSection bundle={bundle} />;
    case "services": return <ServicesSection bundle={bundle} />;
    case "appointments": return <AppointmentsSection appointments={bundle.appointments} />;
    case "blocks": return <BlocksSection bundle={bundle} />;
    case "finance": return <FinanceSection bundle={bundle} />;
    case "users": return <UsersSection bundle={bundle} />;
    case "clients": return <ClientsSection appointments={bundle.appointments} waitlist={bundle.waitlist} />;
    default: return <DashboardSection bundle={bundle} />;
  }
}

function useAdminMutation<TVariables>(mutationFn: (variables: TVariables) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin"] })
  });
}

function DashboardSection({ bundle }: { bundle: AdminBundle }) {
  const today = new Date().toISOString().slice(0, 10);
  const todayAppointments = bundle.appointments.filter(item => item.date === today && item.status !== "cancelled");
  return (
    <>
      {!bundle.professionals.length && (
        <div className="message warning">
          Nenhum profissional cadastrado. Cadastre o primeiro profissional para gerar um link de acesso aos clientes.
        </div>
      )}
      <div className="metric-grid">
        <Metric label="Hoje" value={String(todayAppointments.length)} />
        <Metric label="Pendentes" value={String(bundle.appointments.filter(item => item.status === "pending").length)} />
        <Metric label="Profissionais" value={String(bundle.professionals.length)} />
        <Metric label="Receita ativa" value={money(bundle.finance?.grossRevenue || 0)} />
      </div>
      <Panel title="Próximos agendamentos">
        <AppointmentList appointments={bundle.appointments.filter(item => item.date >= today).slice(0, 8)} compact />
      </Panel>
    </>
  );
}

function BusinessSection({ business }: { business: Business }) {
  const mutation = useAdminMutation<Record<string, unknown>>(payload => api("/admin/business", { method: "PUT", body: JSON.stringify(payload) }));

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    mutation.mutate({
      name: form.get("name"), slug: form.get("slug"), businessType: form.get("businessType"),
      whatsapp: form.get("whatsapp"), address: form.get("address"), description: form.get("description"),
      deposit: Number(form.get("deposit")), pixKey: form.get("pixKey"),
      cancellationHours: Number(form.get("cancellationHours")), rescheduleHours: Number(form.get("rescheduleHours")),
      allowClientCancel: form.get("allowClientCancel") === "on",
      allowClientReschedule: form.get("allowClientReschedule") === "on",
      photoUrl: business.photoUrl,
      theme: business.theme
    });
  }

  return (
    <Panel title="Dados do negócio" description="O acesso público é definido nos links individuais dos profissionais.">
      <form className="form-stack" onSubmit={submit}>
        <div className="two-columns">
          <label>Nome<input name="name" defaultValue={business.name} required /></label>
          <label>Identificador interno<input name="slug" defaultValue={business.slug} required /></label>
        </div>
        <div className="two-columns">
          <label>Tipo<input name="businessType" defaultValue={business.businessType} /></label>
          <label>WhatsApp<input name="whatsapp" defaultValue={business.whatsapp} required /></label>
        </div>
        <label>Endereço<input name="address" defaultValue={business.address} /></label>
        <label>Descrição<textarea name="description" defaultValue={business.description} rows={3} /></label>
        <div className="two-columns">
          <label>Sinal Pix<input name="deposit" type="number" min="0" step="0.01" defaultValue={business.deposit} /></label>
          <label>Chave Pix<input name="pixKey" defaultValue={business.pixKey} /></label>
        </div>
        <div className="two-columns">
          <label>Prazo de cancelamento (h)<input name="cancellationHours" type="number" min="0" defaultValue={business.cancellationHours} /></label>
          <label>Prazo de remarcação (h)<input name="rescheduleHours" type="number" min="0" defaultValue={business.rescheduleHours} /></label>
        </div>
        <div className="check-row">
          <label><input name="allowClientCancel" type="checkbox" defaultChecked={business.allowClientCancel} /> Permitir cancelamento</label>
          <label><input name="allowClientReschedule" type="checkbox" defaultChecked={business.allowClientReschedule} /> Permitir remarcação</label>
        </div>
        <SubmitButton pending={mutation.isPending}>Salvar negócio</SubmitButton>
        <MutationMessage mutation={mutation} />
      </form>
    </Panel>
  );
}

function ProfessionalsSection({ bundle }: { bundle: AdminBundle }) {
  const create = useAdminMutation<Record<string, unknown>>(payload => api("/admin/professionals", { method: "POST", body: JSON.stringify(payload) }));
  const toggle = useAdminMutation<{ id: string; active: boolean }>(({ id, active }) => api(`/admin/professionals/${id}/active`, { method: "PATCH", body: JSON.stringify({ active }) }));
  const remove = useAdminMutation<string>(id => api(`/admin/professionals/${id}`, { method: "DELETE" }));

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const name = String(form.get("name") || "");
    create.mutate({
      name,
      specialty: form.get("specialty"),
      workingHours: String(form.get("workingHours") || "").split(/[\s,;]+/).filter(Boolean),
      workingDays: [1, 2, 3, 4, 5, 6]
    }, { onSuccess: () => formElement.reset() });
  }

  return (
    <>
      <Panel title="Cadastrar profissional" description={`Todos os profissionais são acessados pelo link do negócio: ${window.location.origin}/p/${bundle.business.slug}`}>
        <form className="form-grid" onSubmit={submit}>
          <label>Nome<input name="name" required /></label>
          <label>Especialidade<input name="specialty" /></label>
          <label>Horários<input name="workingHours" placeholder="09:00, 09:30, 10:00" required /></label>
          <SubmitButton pending={create.isPending}>Cadastrar</SubmitButton>
        </form>
        <MutationMessage mutation={create} />
        <div className="public-link business-public-link">
          <span>Link público do negócio</span>
          <strong>{window.location.origin}/p/{bundle.business.slug}</strong>
          <button className="button secondary" type="button" onClick={() => navigator.clipboard.writeText(`${window.location.origin}/p/${bundle.business.slug}`)}>Copiar link</button>
        </div>
      </Panel>
      <div className="cards-list">
        {!bundle.professionals.length && <div className="empty-state">Nenhum profissional cadastrado no banco.</div>}
        {bundle.professionals.map(professional => (
            <article className="card list-card" key={professional.id}>
              <div>
                <span className={`status ${professional.active ? "active" : "inactive"}`}>{professional.active ? "Ativo" : "Inativo"}</span>
                <h3>{professional.name}</h3>
                <p>{professional.specialty || "Sem especialidade informada"}</p>
              </div>
              <div className="actions">
                <button className="button secondary" onClick={() => toggle.mutate({ id: professional.id, active: !professional.active })}>{professional.active ? "Desativar" : "Ativar"}</button>
                <button className="button danger" onClick={() => confirm("Excluir este profissional?") && remove.mutate(professional.id)}>Excluir</button>
              </div>
            </article>
        ))}
      </div>
    </>
  );
}

function ServicesSection({ bundle }: { bundle: AdminBundle }) {
  const create = useAdminMutation<Record<string, unknown>>(payload => api("/admin/services", { method: "POST", body: JSON.stringify(payload) }));
  const toggle = useAdminMutation<{ id: string; active: boolean }>(({ id, active }) => api(`/admin/services/${id}/active`, { method: "PATCH", body: JSON.stringify({ active }) }));
  const remove = useAdminMutation<string>(id => api(`/admin/services/${id}`, { method: "DELETE" }));

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    create.mutate({
      professionalId: form.get("professionalId"), name: form.get("name"),
      price: Number(form.get("price")), duration: Number(form.get("duration")), buffer: Number(form.get("buffer"))
    }, { onSuccess: () => formElement.reset() });
  }

  return (
    <>
      <Panel title="Novo serviço">
        {!bundle.professionals.length ? <div className="empty-state">Cadastre um profissional antes de adicionar serviços.</div> : (
          <form className="form-grid" onSubmit={submit}>
            <label>Profissional<select name="professionalId">{bundle.professionals.filter(item => item.active).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label>Serviço<input name="name" required /></label>
            <label>Preço<input name="price" type="number" min="0" step="0.01" required /></label>
            <label>Duração<input name="duration" type="number" min="10" defaultValue="30" required /></label>
            <label>Intervalo<input name="buffer" type="number" min="0" defaultValue="0" /></label>
            <SubmitButton pending={create.isPending}>Adicionar</SubmitButton>
          </form>
        )}
        <MutationMessage mutation={create} />
      </Panel>
      <div className="cards-list">
        {bundle.services.map(service => (
          <article className="card list-card" key={service.id}>
            <div><span className={`status ${service.active ? "active" : "inactive"}`}>{service.active ? "Ativo" : "Inativo"}</span><h3>{service.name}</h3><p>{service.professionalName} · {money(service.price)} · {service.duration} min</p></div>
            <div className="actions">
              <button className="button secondary" onClick={() => toggle.mutate({ id: service.id, active: !service.active })}>{service.active ? "Desativar" : "Ativar"}</button>
              <button className="button danger" onClick={() => confirm("Excluir este serviço?") && remove.mutate(service.id)}>Excluir</button>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}

function AppointmentsSection({ appointments }: { appointments: Appointment[] }) {
  const update = useAdminMutation<{ id: string; status: string }>(({ id, status }) => api(`/admin/appointments/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }));
  return (
    <Panel title="Agendamentos">
      <AppointmentList appointments={appointments} actions={appointment => (
        <select value={appointment.status} onChange={event => update.mutate({ id: appointment.id, status: event.target.value })}>
          <option value="pending">Pendente</option><option value="confirmed">Confirmado</option><option value="done">Concluído</option><option value="noshow">Não compareceu</option><option value="cancelled">Cancelado</option>
        </select>
      )} />
    </Panel>
  );
}

function BlocksSection({ bundle }: { bundle: AdminBundle }) {
  const create = useAdminMutation<Record<string, unknown>>(payload => api("/admin/blocks", { method: "POST", body: JSON.stringify(payload) }));
  const remove = useAdminMutation<string>(id => api(`/admin/blocks/${id}`, { method: "DELETE" }));
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    create.mutate({
      date: form.get("date"), professionalId: form.get("professionalId"),
      allDay: form.get("allDay") === "on", startTime: form.get("startTime"), endTime: form.get("endTime"), reason: form.get("reason")
    }, { onSuccess: () => formElement.reset() });
  }
  return (
    <>
      <Panel title="Novo bloqueio">
        <form className="form-grid" onSubmit={submit}>
          <label>Profissional<select name="professionalId"><option value="">Todos</option>{bundle.professionals.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label>Data<input name="date" type="date" required /></label>
          <label>Início<input name="startTime" type="time" /></label>
          <label>Fim<input name="endTime" type="time" /></label>
          <label>Motivo<input name="reason" /></label>
          <label className="inline-check"><input name="allDay" type="checkbox" /> Dia inteiro</label>
          <SubmitButton pending={create.isPending}>Bloquear</SubmitButton>
        </form>
      </Panel>
      <div className="cards-list">{bundle.blocks.map(block => (
        <article className="card list-card" key={block.id}><div><h3>{formatDate(block.date)}</h3><p>{block.allDay ? "Dia inteiro" : `${block.startTime}–${block.endTime}`} · {block.reason}</p></div><button className="button danger" onClick={() => remove.mutate(block.id)}>Remover</button></article>
      ))}</div>
    </>
  );
}

function FinanceSection({ bundle }: { bundle: AdminBundle }) {
  const update = useAdminMutation<{ id: string; status: string }>(({ id, status }) => api(`/admin/payments/${id}/status`, { method: "POST", body: JSON.stringify({ status }) }));
  return (
    <>
      <div className="metric-grid">
        <Metric label="Receita ativa" value={money(bundle.finance?.grossRevenue || 0)} />
        <Metric label="Recebido" value={money(bundle.finance?.paidRevenue || 0)} />
        <Metric label="Pix pendente" value={money(bundle.finance?.pendingPix || 0)} />
      </div>
      <Panel title="Pagamentos">
        {bundle.payments.map(payment => (
          <div className="row-item" key={payment.id}><span>{money(payment.amount)} · {payment.status}</span><select value={payment.status} onChange={event => update.mutate({ id: payment.id, status: event.target.value })}><option value="pending">Pendente</option><option value="paid">Pago</option><option value="cancelled">Cancelado</option><option value="refunded">Estornado</option></select></div>
        ))}
      </Panel>
    </>
  );
}

function UsersSection({ bundle }: { bundle: AdminBundle }) {
  const create = useAdminMutation<Record<string, unknown>>(payload => api("/admin/users", { method: "POST", body: JSON.stringify(payload) }));
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    create.mutate({ name: form.get("name"), email: form.get("email"), password: form.get("password"), role: form.get("role") }, { onSuccess: () => formElement.reset() });
  }
  return (
    <>
      {bundle.user.role === "owner" && <Panel title="Novo usuário"><form className="form-grid" onSubmit={submit}><label>Nome<input name="name" required /></label><label>E-mail<input name="email" type="email" required /></label><label>Senha<input name="password" type="password" minLength={8} required /></label><label>Função<select name="role"><option value="business_admin">Administrador</option><option value="staff">Atendimento</option><option value="finance">Financeiro</option></select></label><SubmitButton pending={create.isPending}>Criar usuário</SubmitButton></form><MutationMessage mutation={create} /></Panel>}
      <div className="cards-list">{bundle.users.map(user => <article className="card list-card" key={user.id}><div><h3>{user.name}</h3><p>{user.email} · {user.role}</p></div></article>)}</div>
    </>
  );
}

function ClientsSection({ appointments, waitlist }: { appointments: Appointment[]; waitlist: AdminBundle["waitlist"] }) {
  const clients = Object.values(appointments.reduce<Record<string, { name: string; phone: string; visits: number; total: number }>>((all, item) => {
    const key = item.phone;
    all[key] ||= { name: item.customer, phone: item.phone, visits: 0, total: 0 };
    all[key].visits += 1;
    if (item.status !== "cancelled") all[key].total += item.total;
    return all;
  }, {}));
  return (
    <>
      <Panel title="Clientes">{clients.map(client => <div className="row-item" key={client.phone}><span><strong>{client.name}</strong><small>{client.phone}</small></span><span>{client.visits} agendamentos · {money(client.total)}</span></div>)}</Panel>
      <Panel title="Lista de espera">{waitlist.map(item => <div className="row-item" key={item.id}><span><strong>{item.name}</strong><small>{item.phone}</small></span><span>{formatDate(item.date)} · {item.period} · {item.service}</span></div>)}</Panel>
    </>
  );
}

function AppointmentList({ appointments, compact = false, actions }: { appointments: Appointment[]; compact?: boolean; actions?: (appointment: Appointment) => ReactNode }) {
  if (!appointments.length) return <div className="empty-state">Nenhum agendamento encontrado.</div>;
  return <div className="table-list">{appointments.map(item => <div className="row-item" key={item.id}><span><strong>{item.customer} · {item.service}</strong><small>{item.professionalName} · {formatDate(item.date)} às {item.time} · {item.code}</small></span>{!compact && actions?.(item)}<span className={`status ${item.status}`}>{item.status}</span></div>)}</div>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="card metric"><span>{label}</span><strong>{value}</strong></div>;
}

function Panel({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return <section className="card panel"><header><h2>{title}</h2>{description && <p>{description}</p>}</header>{children}</section>;
}

function SubmitButton({ pending, children }: { pending: boolean; children: ReactNode }) {
  return <button className="button primary" disabled={pending}>{pending ? "Aguarde..." : children}</button>;
}

function MutationMessage({ mutation }: { mutation: { isError: boolean; isSuccess: boolean; error: Error | null } }) {
  if (mutation.isError) return <div className="message error">{mutation.error?.message}</div>;
  if (mutation.isSuccess) return <div className="message success">Alteração salva.</div>;
  return null;
}
