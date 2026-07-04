const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const app = require("../src/app");

function unique(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function registerBusiness(prefix, businessType = "Outro") {
  const slug = unique(prefix);
  const adminLogin = await request(app)
    .post("/api/auth/login")
    .send({ email: "admin@cliqagenda.local", password: "Admin12345" })
    .expect(200);
  const adminCookie = adminLogin.headers["set-cookie"][0].split(";")[0];

  const createResponse = await request(app)
    .post("/api/system/businesses")
    .set("Cookie", adminCookie)
    .send({
      name: `Negocio ${prefix}`,
      businessType,
      slug,
      whatsapp: "11999999999",
      ownerName: `Dono ${prefix}`,
      ownerEmail: `${slug}@teste.local`,
      ownerPassword: "senha123"
    })
    .expect(201);

  const response = await request(app)
    .post("/api/auth/login")
    .send({ email: `${slug}@teste.local`, password: "senha123" })
    .expect(200);

  assert.equal(response.body.business.slug, slug);
  assert.equal(response.body.business.businessType, businessType);
  assert.equal(response.body.token, undefined);
  assert.deepEqual(response.body.professionals, []);
  assert.deepEqual(response.body.services, []);
  const cookie = response.headers["set-cookie"][0].split(";")[0];
  assert.match(cookie, /^cliqagenda_session=/);

  const professionalResponse = await request(app)
    .post("/api/admin/professionals")
    .set("Cookie", cookie)
    .send({
      name: `Profissional ${prefix}`,
      specialty: "Atendimento",
      workingHours: ["09:00", "09:30", "10:00", "10:30", "11:00"],
      workingDays: [1, 2, 3, 4, 5, 6]
    })
    .expect(201);

  const serviceResponse = await request(app)
    .post("/api/admin/services")
    .set("Cookie", cookie)
    .send({
      professionalId: professionalResponse.body.professional.id,
      name: `Servico ${prefix}`,
      price: 40,
      duration: 30,
      buffer: 0
    })
    .expect(201);

  return {
    ...response.body,
    cookie,
    professionals: [professionalResponse.body.professional],
    services: [serviceResponse.body.service]
  };
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

test("GET /api/public exige slug do negocio", async () => {
  await request(app).get("/api/public").expect(404);
});

test("link publico do negocio exibe seus profissionais", async () => {
  const empresa = await registerBusiness("link-negocio");
  const firstProfessional = empresa.professionals[0];

  const secondResponse = await request(app)
    .post("/api/admin/professionals")
    .set("Cookie", empresa.cookie)
    .send({
      name: "Segundo Profissional",
      workingHours: ["09:00", "09:30"],
      workingDays: [1, 2, 3, 4, 5, 6]
    })
    .expect(201);

  await request(app)
    .post("/api/admin/services")
    .set("Cookie", empresa.cookie)
    .send({ professionalId: secondResponse.body.professional.id, name: "Servico segundo", price: 50, duration: 30 })
    .expect(201);

  const publicPage = await request(app)
    .get(`/api/public/${empresa.business.slug}`)
    .expect(200);

  assert.equal(publicPage.body.professionals.length, 2);
  assert.ok(publicPage.body.professionals.some(item => item.id === firstProfessional.id));
  assert.ok(publicPage.body.professionals.some(item => item.id === secondResponse.body.professional.id));
  assert.ok(publicPage.body.services.some(service => service.professionalId === firstProfessional.id));
  assert.ok(publicPage.body.services.some(service => service.professionalId === secondResponse.body.professional.id));
});

test("POST /api/auth/register bloqueia auto-cadastro de negocios", async () => {
  const response = await request(app)
    .post("/api/auth/register")
    .send({ name: "Teste" })
    .expect(403);

  assert.match(response.body.message, /cadastro público/i);
});

test("multiempresa: cada login acessa somente dados da propria empresa", async () => {
  const empresaA = await registerBusiness("empresa-a", "Barbearia");
  const empresaB = await registerBusiness("empresa-b", "Manicure / Nail designer");

  assert.notEqual(empresaA.business.id, empresaB.business.id);
  assert.notEqual(empresaA.business.slug, empresaB.business.slug);

  const adminA = await request(app)
    .get("/api/admin")
    .set("Cookie", empresaA.cookie)
    .expect(200);

  const adminB = await request(app)
    .get("/api/admin")
    .set("Cookie", empresaB.cookie)
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
    .set("Cookie", empresaA.cookie)
    .expect(200);

  const adminB = await request(app)
    .get("/api/admin")
    .set("Cookie", empresaB.cookie)
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
    .set("Cookie", empresaA.cookie)
    .expect(204);

  const adminB = await request(app)
    .get("/api/admin")
    .set("Cookie", empresaB.cookie)
    .expect(200);

  assert.ok(adminB.body.services.some(item => item.id === serviceFromB.id));
});

test("profissional pode ter horarios individuais", async () => {
  const empresa = await registerBusiness("horarios-prof", "Estetica");
  const professional = empresa.professionals[0];

  await request(app)
    .put(`/api/admin/professionals/${professional.id}/hours`)
    .set("Cookie", empresa.cookie)
    .send({ workingHours: ["08:00", "08:30", "09:00"] })
    .expect(200);

  const service = empresa.services.find(item => item.professionalId === professional.id);
  const slots = await request(app)
    .get(`/api/public/${empresa.business.slug}/slots?date=2099-04-10&professionalId=${professional.id}&serviceId=${service.id}`)
    .expect(200);

  assert.deepEqual(slots.body.slots, ["08:00", "08:30", "09:00"]);
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
    .set("Cookie", empresa.cookie)
    .send({ active: false })
    .expect(200);

  const publico = await request(app)
    .get(`/api/public/${empresa.business.slug}`)
    .expect(200);

  const admin = await request(app)
    .get("/api/admin")
    .set("Cookie", empresa.cookie)
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
    .set("Cookie", empresa.cookie)
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
    .send({ name: "Cliente Espera", phone: "11944443333", date: "2099-07-10", period: "tarde", professionalId: empresa.professionals[0].id, serviceId: service.id })
    .expect(201);

  const admin = await request(app)
    .get("/api/admin")
    .set("Cookie", empresa.cookie)
    .expect(200);

  assert.ok(admin.body.waitlist.some(item => item.name === "Cliente Espera"));
});

test("Pix local e dashboard financeiro registram sinal pendente", async () => {
  const empresa = await registerBusiness("pix-financeiro", "Barbearia");
  const professional = empresa.professionals[0];
  const service = empresa.services.find(item => item.professionalId === professional.id);

  await request(app)
    .put("/api/admin/business")
    .set("Cookie", empresa.cookie)
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
    .set("Cookie", empresa.cookie)
    .expect(200);

  assert.ok(finance.body.pendingPix >= 20);
});
