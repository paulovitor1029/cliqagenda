const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const app = require("../src/app");

function unique(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function registerBusiness(prefix, businessType = "Outro") {
  const slug = unique(prefix);
  const response = await request(app)
    .post("/api/auth/register")
    .send({
      name: `Negocio ${prefix}`,
      businessType,
      slug,
      whatsapp: "11999999999",
      email: `${slug}@teste.local`,
      password: "senha123"
    })
    .expect(201);

  assert.equal(response.body.business.slug, slug);
  assert.equal(response.body.business.businessType, businessType);
  assert.ok(response.body.token);
  return response.body;
}

test("GET /api/health retorna status da API", async () => {
  const response = await request(app).get("/api/health").expect(200);
  assert.equal(response.body.status, "ok");
  assert.equal(response.body.service, "cliqagenda-api");
});

test("POST /api/auth/login rejeita credenciais invalidas", async () => {
  const response = await request(app)
    .post("/api/auth/login")
    .send({ email: "invalido@teste.com", password: "senhaerrada" })
    .expect(401);

  assert.match(response.body.message, /Email ou senha invalidos/i);
});

test("GET /api/public carrega o negocio publico demo", async () => {
  const response = await request(app).get("/api/public").expect(200);
  assert.ok(response.body.business);
  assert.ok(Array.isArray(response.body.professionals));
  assert.ok(Array.isArray(response.body.services));
});

test("POST /api/auth/register exige dados obrigatorios", async () => {
  const response = await request(app)
    .post("/api/auth/register")
    .send({ name: "Teste" })
    .expect(400);

  assert.match(response.body.message, /Informe nome/i);
});

test("multiempresa: cada login acessa somente dados da propria empresa", async () => {
  const empresaA = await registerBusiness("empresa-a", "Barbearia");
  const empresaB = await registerBusiness("empresa-b", "Manicure / Nail designer");

  assert.notEqual(empresaA.business.id, empresaB.business.id);
  assert.notEqual(empresaA.business.slug, empresaB.business.slug);

  const adminA = await request(app)
    .get("/api/admin")
    .set("Authorization", `Bearer ${empresaA.token}`)
    .expect(200);

  const adminB = await request(app)
    .get("/api/admin")
    .set("Authorization", `Bearer ${empresaB.token}`)
    .expect(200);

  assert.equal(adminA.body.business.id, empresaA.business.id);
  assert.equal(adminB.body.business.id, empresaB.business.id);
  assert.ok(adminA.body.professionals.every(item => item.id !== empresaB.professionals[0].id));
  assert.ok(adminB.body.services.every(item => item.businessId === undefined || item.businessId !== empresaA.business.id));
});

test("multiempresa: agendamento de uma empresa nao aparece no painel de outra", async () => {
  const empresaA = await registerBusiness("isolamento-a", "Estetica");
  const empresaB = await registerBusiness("isolamento-b", "Cilios");

  const publicB = await request(app)
    .get(`/api/public/${empresaB.business.slug}`)
    .expect(200);

  const professionalB = publicB.body.professionals[0];
  const serviceB = publicB.body.services.find(service => service.professionalId === professionalB.id);

  const appointmentB = await request(app)
    .post(`/api/public/${empresaB.business.slug}/appointments`)
    .send({
      professionalId: professionalB.id,
      serviceId: serviceB.id,
      date: "2099-01-10",
      time: "09:00",
      customer: "Cliente Empresa B",
      phone: "11988887777"
    })
    .expect(201);

  const adminA = await request(app)
    .get("/api/admin")
    .set("Authorization", `Bearer ${empresaA.token}`)
    .expect(200);

  const adminB = await request(app)
    .get("/api/admin")
    .set("Authorization", `Bearer ${empresaB.token}`)
    .expect(200);

  assert.ok(!adminA.body.appointments.some(item => item.id === appointmentB.body.appointment.id));
  assert.ok(adminB.body.appointments.some(item => item.id === appointmentB.body.appointment.id));
});

test("multiempresa: ADM de uma empresa nao consegue remover servico de outra", async () => {
  const empresaA = await registerBusiness("delete-a", "Maquiagem");
  const empresaB = await registerBusiness("delete-b", "Sobrancelha");
  const serviceFromB = empresaB.services[0];

  await request(app)
    .delete(`/api/admin/services/${serviceFromB.id}`)
    .set("Authorization", `Bearer ${empresaA.token}`)
    .expect(204);

  const adminB = await request(app)
    .get("/api/admin")
    .set("Authorization", `Bearer ${empresaB.token}`)
    .expect(200);

  assert.ok(adminB.body.services.some(item => item.id === serviceFromB.id));
});

test("profissional pode ter horarios individuais", async () => {
  const empresa = await registerBusiness("horarios-prof", "Estetica");
  const professional = empresa.professionals[0];

  await request(app)
    .put(`/api/admin/professionals/${professional.id}/hours`)
    .set("Authorization", `Bearer ${empresa.token}`)
    .send({ workingHours: ["08:00", "08:30", "09:00"] })
    .expect(200);

  const service = empresa.services.find(item => item.professionalId === professional.id);
  const slots = await request(app)
    .get(`/api/public/${empresa.business.slug}/slots?date=2099-04-10&professionalId=${professional.id}&serviceId=${service.id}`)
    .expect(200);

  assert.deepEqual(slots.body.slots, ["08:00", "08:30"]);
});

test("servico desativado sai da pagina publica sem apagar historico", async () => {
  const empresa = await registerBusiness("desativa-servico", "Cilios");
  const professional = empresa.professionals[0];
  const service = empresa.services.find(item => item.professionalId === professional.id);

  const appointment = await request(app)
    .post(`/api/public/${empresa.business.slug}/appointments`)
    .send({
      professionalId: professional.id,
      serviceId: service.id,
      date: "2099-05-09",
      time: "09:00",
      customer: "Cliente Historico",
      phone: "11977776666"
    })
    .expect(201);

  await request(app)
    .patch(`/api/admin/services/${service.id}/active`)
    .set("Authorization", `Bearer ${empresa.token}`)
    .send({ active: false })
    .expect(200);

  const publico = await request(app)
    .get(`/api/public/${empresa.business.slug}`)
    .expect(200);

  const admin = await request(app)
    .get("/api/admin")
    .set("Authorization", `Bearer ${empresa.token}`)
    .expect(200);

  assert.ok(!publico.body.services.some(item => item.id === service.id));
  assert.ok(admin.body.appointments.some(item => item.id === appointment.body.appointment.id));
});

test("bloqueio impede novo agendamento e remarcacao", async () => {
  const empresa = await registerBusiness("bloqueio-regra", "Sobrancelha");
  const professional = empresa.professionals[0];
  const service = empresa.services.find(item => item.professionalId === professional.id);

  const appointment = await request(app)
    .post(`/api/public/${empresa.business.slug}/appointments`)
    .send({ professionalId: professional.id, serviceId: service.id, date: "2099-06-10", time: "09:00", customer: "Cliente Bloqueio", phone: "11966665555" })
    .expect(201);

  await request(app)
    .post("/api/admin/blocks")
    .set("Authorization", `Bearer ${empresa.token}`)
    .send({ date: "2099-06-10", startTime: "10:00", endTime: "10:00", professionalId: professional.id, reason: "Emergencia" })
    .expect(201);

  await request(app)
    .post(`/api/public/${empresa.business.slug}/appointments`)
    .send({ professionalId: professional.id, serviceId: service.id, date: "2099-06-10", time: "10:00", customer: "Cliente Novo", phone: "11955554444" })
    .expect(409);

  await request(app)
    .post(`/api/appointments/${appointment.body.appointment.id}/reschedule`)
    .send({ date: "2099-06-10", time: "10:00" })
    .expect(409);
});

test("lista de espera fica isolada e aparece no painel da empresa", async () => {
  const empresa = await registerBusiness("espera-regra", "Maquiagem");
  const service = empresa.services[0];

  await request(app)
    .post(`/api/public/${empresa.business.slug}/waitlist`)
    .send({ name: "Cliente Espera", phone: "11944443333", date: "2099-07-10", period: "tarde", serviceId: service.id })
    .expect(201);

  const admin = await request(app)
    .get("/api/admin")
    .set("Authorization", `Bearer ${empresa.token}`)
    .expect(200);

  assert.ok(admin.body.waitlist.some(item => item.name === "Cliente Espera"));
});

test("Pix local e dashboard financeiro registram sinal pendente", async () => {
  const empresa = await registerBusiness("pix-financeiro", "Barbearia");
  const professional = empresa.professionals[0];
  const service = empresa.services.find(item => item.professionalId === professional.id);

  await request(app)
    .put("/api/admin/business")
    .set("Authorization", `Bearer ${empresa.token}`)
    .send({ ...empresa.business, deposit: 20, pixKey: "11999999999" })
    .expect(200);

  const appointment = await request(app)
    .post(`/api/public/${empresa.business.slug}/appointments`)
    .send({ professionalId: professional.id, serviceId: service.id, date: "2099-08-10", time: "09:00", customer: "Cliente Pix", phone: "11933332222" })
    .expect(201);

  assert.ok(appointment.body.payment);
  assert.equal(appointment.body.payment.amount, 20);

  const finance = await request(app)
    .get("/api/admin/finance")
    .set("Authorization", `Bearer ${empresa.token}`)
    .expect(200);

  assert.ok(finance.body.pendingPix >= 20);
});
