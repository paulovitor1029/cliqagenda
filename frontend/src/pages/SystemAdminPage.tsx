import { FormEvent, ReactNode, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ApiError, api, slugify } from "../api";
import type { SystemBundle } from "../types";

const roleLabel: Record<string, string> = {
  system_admin: "Administrador geral",
  owner: "Proprietário",
  business_admin: "Administrador",
  staff: "Atendimento",
  finance: "Financeiro"
};

export function SystemAdminPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["system"],
    queryFn: () => api<SystemBundle>("/system")
  });

  useEffect(() => {
    if (query.error instanceof ApiError && query.error.status === 401) navigate("/login?next=/sistema", { replace: true });
    if (query.error instanceof ApiError && query.error.status === 403) navigate("/admin", { replace: true });
  }, [query.error, navigate]);

  async function logout() {
    await api("/auth/logout", { method: "POST" }).catch(() => null);
    queryClient.clear();
    localStorage.setItem("cliqagenda_session_event", `logout:${Date.now()}`);
    window.location.replace("/login");
  }

  if (query.isLoading) return <div className="loading full-page">Carregando administração geral...</div>;
  if (!query.data) return null;

  return (
    <div className="system-page">
      <aside className="system-sidebar">
        <div className="brand">
          <span className="brand-mark">CA</span>
          <span><strong>CliqAgenda</strong><small>Administração geral</small></span>
        </div>
        <button className="button danger logout" onClick={logout}>Sair</button>
      </aside>
      <main className="system-content">
        <header className="admin-header">
          <div><span className="eyebrow">Sistema</span><h1>Painel geral</h1></div>
          <span className="session-badge">Administrador geral</span>
        </header>
        <SystemDashboard bundle={query.data} />
      </main>
    </div>
  );
}

function SystemDashboard({ bundle }: { bundle: SystemBundle }) {
  const queryClient = useQueryClient();
  const createBusiness = useSystemMutation<Record<string, unknown>>(payload => api("/system/businesses", { method: "POST", body: JSON.stringify(payload) }));
  const createUser = useSystemMutation<Record<string, unknown>>(payload => api("/system/users", { method: "POST", body: JSON.stringify(payload) }));
  const toggleBusiness = useSystemMutation<{ id: string; active: boolean }>(({ id, active }) => api(`/system/businesses/${id}/active`, { method: "PATCH", body: JSON.stringify({ active }) }));
  const removeBusiness = useSystemMutation<string>(id => api(`/system/businesses/${id}`, { method: "DELETE" }));
  const removeSelectedBusinesses = useSystemMutation<string[]>(ids => api("/system/businesses/bulk-delete", { method: "POST", body: JSON.stringify({ ids }) }));
  const removeUser = useSystemMutation<string>(id => api(`/system/users/${id}`, { method: "DELETE" }));
  const [selectedBusinessIds, setSelectedBusinessIds] = useState<string[]>([]);
  const allSelected = bundle.businesses.length > 0 && selectedBusinessIds.length === bundle.businesses.length;

  useEffect(() => {
    setSelectedBusinessIds(current => current.filter(id => bundle.businesses.some(business => business.id === id)));
  }, [bundle.businesses]);

  function submitBusiness(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    createBusiness.mutate({
      name: form.get("name"),
      slug: form.get("slug"),
      businessType: form.get("businessType"),
      whatsapp: form.get("whatsapp"),
      ownerName: form.get("ownerName"),
      ownerEmail: form.get("ownerEmail"),
      ownerPassword: form.get("ownerPassword")
    }, { onSuccess: () => formElement.reset() });
  }

  function submitUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    createUser.mutate({
      name: form.get("name"),
      email: form.get("email"),
      password: form.get("password"),
      role: form.get("role"),
      businessId: form.get("businessId")
    }, { onSuccess: () => formElement.reset() });
  }

  function toggleSelectedBusiness(id: string) {
    setSelectedBusinessIds(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]);
  }

  function toggleAllBusinesses() {
    setSelectedBusinessIds(allSelected ? [] : bundle.businesses.map(business => business.id));
  }

  function removeSelected() {
    const total = selectedBusinessIds.length;
    if (!total) return;
    if (!confirm(`Remover ${total} negócio${total > 1 ? "s" : ""} selecionado${total > 1 ? "s" : ""} e seus dados?`)) return;
    removeSelectedBusinesses.mutate(selectedBusinessIds, { onSuccess: () => setSelectedBusinessIds([]) });
  }

  return (
    <>
      <div className="metric-grid">
        <Metric label="Negócios" value={String(bundle.totals.businesses)} />
        <Metric label="Liberados" value={String(bundle.totals.activeBusinesses)} />
        <Metric label="Usuários" value={String(bundle.totals.users)} />
        <Metric label="Agendamentos" value={String(bundle.totals.appointments)} />
      </div>

      <Panel title="Novo negócio">
        <form className="form-grid" onSubmit={submitBusiness}>
          <label>Negócio<input name="name" onChange={event => {
            const slugInput = event.currentTarget.form?.elements.namedItem("slug") as HTMLInputElement | null;
            if (slugInput && !slugInput.value) slugInput.value = slugify(event.target.value);
          }} required /></label>
          <label>Identificador<input name="slug" minLength={3} required /></label>
          <label>Tipo<input name="businessType" defaultValue="Outro" /></label>
          <label>WhatsApp<input name="whatsapp" inputMode="numeric" minLength={10} required /></label>
          <label>Proprietário<input name="ownerName" required /></label>
          <label>E-mail do proprietário<input name="ownerEmail" type="email" required /></label>
          <label>Senha inicial<input name="ownerPassword" type="password" minLength={8} required /></label>
          <SubmitButton pending={createBusiness.isPending}>Cadastrar negócio</SubmitButton>
        </form>
        <MutationMessage mutation={createBusiness} />
      </Panel>

      <Panel title="Novo usuário">
        <form className="form-grid" onSubmit={submitUser}>
          <label>Nome<input name="name" required /></label>
          <label>E-mail<input name="email" type="email" required /></label>
          <label>Senha<input name="password" type="password" minLength={8} required /></label>
          <label>Função
            <select name="role" defaultValue="system_admin">
              <option value="system_admin">Administrador geral</option>
              <option value="owner">Proprietário</option>
              <option value="business_admin">Administrador do negócio</option>
              <option value="staff">Atendimento</option>
              <option value="finance">Financeiro</option>
            </select>
          </label>
          <label>Negócio
            <select name="businessId">
              <option value="">Somente para usuário de empresa</option>
              {bundle.businesses.map(business => <option key={business.id} value={business.id}>{business.name}</option>)}
            </select>
          </label>
          <SubmitButton pending={createUser.isPending}>Criar usuário</SubmitButton>
        </form>
        <MutationMessage mutation={createUser} />
      </Panel>

      <Panel title="Negócios">
        <div className="bulk-actions">
          <label className="inline-check"><input type="checkbox" checked={allSelected} onChange={toggleAllBusinesses} /> Selecionar todos</label>
          <span>{selectedBusinessIds.length} selecionado{selectedBusinessIds.length === 1 ? "" : "s"}</span>
          <button className="button danger" type="button" onClick={removeSelected} disabled={!selectedBusinessIds.length || removeSelectedBusinesses.isPending}>
            {removeSelectedBusinesses.isPending ? "Removendo..." : "Remover selecionados"}
          </button>
        </div>
        <MutationMessage mutation={removeSelectedBusinesses} />
        <div className="table-list">
          {bundle.businesses.map(business => (
            <div className="row-item" key={business.id}>
              <label className="row-select" aria-label={`Selecionar ${business.name}`}>
                <input type="checkbox" checked={selectedBusinessIds.includes(business.id)} onChange={() => toggleSelectedBusiness(business.id)} />
              </label>
              <span><strong>{business.name}</strong><small>/{business.slug} · {business.users} usuários · {business.professionals} profissionais · {business.appointments} agendamentos</small></span>
              <span className={`status ${business.active ? "active" : "inactive"}`}>{business.active ? "Liberado" : "Bloqueado"}</span>
              <div className="actions">
                <button className="button secondary" onClick={() => toggleBusiness.mutate({ id: business.id, active: !business.active })}>{business.active ? "Bloquear" : "Liberar"}</button>
                <button className="button danger" onClick={() => confirm("Remover este negócio e seus dados?") && removeBusiness.mutate(business.id)}>Remover</button>
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Usuários">
        <div className="table-list">
          {bundle.users.map(user => (
            <div className="row-item" key={user.id}>
              <span><strong>{user.name}</strong><small>{user.email} · {roleLabel[user.role] || user.role}</small></span>
              {user.id !== bundle.user.id && <button className="button danger" onClick={() => confirm("Remover este usuário?") && removeUser.mutate(user.id)}>Remover</button>}
            </div>
          ))}
        </div>
      </Panel>
    </>
  );

  function useSystemMutation<TVariables>(mutationFn: (variables: TVariables) => Promise<unknown>) {
    return useMutation({
      mutationFn,
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ["system"] })
    });
  }
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="card metric"><span>{label}</span><strong>{value}</strong></div>;
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return <section className="card panel"><header><h2>{title}</h2></header>{children}</section>;
}

function SubmitButton({ pending, children }: { pending: boolean; children: ReactNode }) {
  return <button className="button primary" disabled={pending}>{pending ? "Aguarde..." : children}</button>;
}

function MutationMessage({ mutation }: { mutation: { isError: boolean; isSuccess: boolean; error: Error | null } }) {
  if (mutation.isError) return <div className="message error">{mutation.error?.message}</div>;
  if (mutation.isSuccess) return <div className="message success">Alteração salva.</div>;
  return null;
}
