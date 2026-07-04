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

  return { ...response.body, email, password: "senha123" };
}


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

  assert.ok(login.body.token);
});

test("apenas owner cria usuarios internos", async () => {
  const empresa = await registerBusiness("permissoes");
  const staffEmail = `${unique("staff")}@teste.local`;

  await request(app)
    .post("/api/admin/users")
    .set("Authorization", `Bearer ${empresa.token}`)
    .send({ name: "Atendente", email: staffEmail, password: "senha123", role: "staff" })
    .expect(201);

  const staffLogin = await request(app)
    .post("/api/auth/login")
    .send({ email: staffEmail, password: "senha123" })
    .expect(200);

  await request(app)
    .post("/api/admin/users")
    .set("Authorization", `Bearer ${staffLogin.body.token}`)
    .send({ name: "Outro", email: `${unique("outro")}@teste.local`, password: "senha123", role: "staff" })
    .expect(403);
});

test("isolamento: uma empresa nao altera profissional de outra", async () => {
  const empresaA = await registerBusiness("iso-edit-a");
  const empresaB = await registerBusiness("iso-edit-b");
  const profissionalB = empresaB.professionals[0];

  await request(app)
    .patch(`/api/admin/professionals/${profissionalB.id}/active`)
    .set("Authorization", `Bearer ${empresaA.token}`)
    .send({ active: false })
    .expect(404);
});
