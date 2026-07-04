const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const app = require("../src/app");

function unique(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function registerBusiness(prefix, extra = {}) {
  const slug = unique(prefix);
  const email = `${slug}@teste.local`;
  const response = await request(app)
    .post("/api/auth/register")
    .send({
      name: `Negocio ${prefix}`,
      businessType: "Outro",
      slug,
      whatsapp: "11999999999",
      email,
      password: "senha123",
      ...extra
    })
    .expect(201);

  const cookie = response.headers["set-cookie"][0].split(";")[0];
  assert.deepEqual(response.body.professionals, []);

  const professionalResponse = await request(app)
    .post("/api/admin/professionals")
    .set("Cookie", cookie)
    .send({
      name: `Profissional ${prefix}`,
      workingHours: ["09:00", "09:30", "10:00"],
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
    email,
    password: "senha123",
    professionals: [professionalResponse.body.professional],
    services: [serviceResponse.body.service]
  };
}

test("areas cliente e profissional permanecem separadas pela sessao", async () => {
  const empresa = await registerBusiness("separacao-areas");

  const clientWithoutSession = await request(app)
    .get(`/p/${empresa.business.slug}`)
    .expect(200);
  assert.match(clientWithoutSession.text, /id="root"/);
  assert.match(clientWithoutSession.text, /type="module"/);

  const adminWithoutSession = await request(app)
    .get("/admin")
    .expect(303);
  assert.match(adminWithoutSession.headers.location, /^\/login\?next=/);

  const clientWithProfessionalSession = await request(app)
    .get(`/p/${empresa.business.slug}`)
    .set("Cookie", empresa.cookie)
    .expect(303);
  assert.equal(clientWithProfessionalSession.headers.location, "/admin");

  const adminWithSession = await request(app)
    .get("/admin")
    .set("Cookie", empresa.cookie)
    .expect(200);
  assert.match(adminWithSession.headers["cache-control"], /no-store/);
  assert.match(adminWithSession.text, /id="root"/);
});


test("recuperacao de senha gera token e permite atualizar senha", async () => {
  const empresa = await registerBusiness("recupera-senha");

  const recovery = await request(app)
    .post("/api/auth/password/forgot")
    .send({ email: empresa.email })
    .expect(200);

  assert.ok(recovery.body.resetToken);

  await request(app)
    .post("/api/auth/password/reset")
    .send({ token: recovery.body.resetToken, password: "novaSenha123" })
    .expect(200);

  await request(app)
    .post("/api/auth/login")
    .send({ email: empresa.email, password: "senha123" })
    .expect(401);

  const login = await request(app)
    .post("/api/auth/login")
    .send({ email: empresa.email, password: "novaSenha123" })
    .expect(200);

  assert.match(login.headers["set-cookie"][0], /cliqagenda_session=/);
});

test("apenas owner cria usuarios internos", async () => {
  const empresa = await registerBusiness("permissoes");
  const staffEmail = `${unique("staff")}@teste.local`;

  await request(app)
    .post("/api/admin/users")
    .set("Cookie", empresa.cookie)
    .send({ name: "Atendente", email: staffEmail, password: "senha123", role: "staff" })
    .expect(201);

  const staffLogin = await request(app)
    .post("/api/auth/login")
    .send({ email: staffEmail, password: "senha123" })
    .expect(200);
  const staffCookie = staffLogin.headers["set-cookie"][0].split(";")[0];

  await request(app)
    .post("/api/admin/users")
    .set("Cookie", staffCookie)
    .send({ name: "Outro", email: `${unique("outro")}@teste.local`, password: "senha123", role: "staff" })
    .expect(403);
});

test("isolamento: uma empresa nao altera profissional de outra", async () => {
  const empresaA = await registerBusiness("iso-edit-a");
  const empresaB = await registerBusiness("iso-edit-b");
  const profissionalB = empresaB.professionals[0];

  await request(app)
    .patch(`/api/admin/professionals/${profissionalB.id}/active`)
    .set("Cookie", empresaA.cookie)
    .send({ active: false })
    .expect(404);
});
