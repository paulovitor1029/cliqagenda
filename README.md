# CliqAgenda

MVP de agenda online para profissionais e pequenos negócios de beleza, estética e atendimento com hora marcada.

O produto atende barbearias, salões, manicures, nail designers, maquiadores, profissionais de cílios, sobrancelhas, limpeza de pele, estética, depilação e serviços similares.

## Funcionalidades principais

- Cadastro e login de administradores vinculados a uma empresa/negócio específico.
- Painel ADM protegido por autenticação e isolado por `business_id`.
- Abas e ações administrativas bloqueadas até login.
- Página pública por slug para cada empresa, com fluxo de cliente sem login.
- Cadastro de vários profissionais/funcionários por negócio.
- Foto individual para cada profissional, via URL ou upload real de imagem.
- Cada profissional pode ter seus próprios serviços, preços, duração e intervalo.
- Cliente escolhe profissional antes de escolher o serviço.
- Agenda considera profissional, data e horário, permitindo profissionais diferentes no mesmo horário.
- Cancelamento e remarcação respeitando regras definidas pelo ADM.
- Bloqueio emergencial de dias ou horários pelo ADM.
- Lista de espera integrada ao backend.
- Upload real de imagem para logo/foto do negócio.
- Confirmação por WhatsApp com fallback para link `wa.me`.
- Estrutura para envio por Meta WhatsApp Cloud API, Z-API ou Evolution API.
- Persistência em PostgreSQL local com tabelas relacionais e vínculo por empresa.
- Migrations versionadas.
- Testes automatizados cobrindo rotas críticas e isolamento entre empresas.

## Como rodar

### 1. Instalar dependências

```bash
npm install --prefix backend
```

### 2. Configurar ambiente

Crie ou ajuste o arquivo:

```text
backend/.env
```

Exemplo:

```env
DB_HOST=127.0.0.1
DB_PORT=5432
DB_USER=postgres
DB_PASS=sua_senha_do_postgres
DB_NAME=cliqagenda
ADMIN_EMAIL=admin@cliqagenda.local
ADMIN_PASSWORD=admin123
```

### 3. Rodar migrations

```bash
npm run migrate --prefix backend
```

### 4. Rodar em desenvolvimento

```bash
npm run dev
```

Acesse:

```text
http://localhost:3000
```

## Login demo

```text
admin@cliqagenda.local
admin123
```

## Estrutura

```text
cliqagenda/
├── backend/
│   ├── migrations/
│   │   ├── 001_initial_schema.sql
│   │   └── 002_professionals_and_service_prices.sql
│   ├── src/
│   │   ├── database/
│   │   ├── data/
│   │   ├── middlewares/
│   │   ├── routes/
│   │   ├── services/
│   │   └── app.js
│   ├── tests/
│   └── uploads/
├── frontend/
│   └── src/
│       ├── css/
│       ├── js/
│       └── index.html
└── README.md
```

## WhatsApp API

Sem credenciais configuradas, o sistema usa fallback manual com link `wa.me`.

Para envio real, configure no `.env` um dos provedores suportados:

### Meta WhatsApp Cloud API

```env
WHATSAPP_PROVIDER=meta
WHATSAPP_META_TOKEN=
WHATSAPP_META_PHONE_NUMBER_ID=
```

### Z-API

```env
WHATSAPP_PROVIDER=zapi
ZAPI_INSTANCE_ID=
ZAPI_INSTANCE_TOKEN=
ZAPI_CLIENT_TOKEN=
```

### Evolution API

```env
WHATSAPP_PROVIDER=evolution
EVOLUTION_API_URL=
EVOLUTION_INSTANCE=
EVOLUTION_API_KEY=
```

## Testes

```bash
npm test --prefix backend
```

## Observação técnica

A modelagem atual mantém o termo `business` para o negócio e adiciona `professionals` para os profissionais/funcionários. Os serviços ficam vinculados a um profissional específico, permitindo que cada profissional tenha sua própria tabela de serviços e preços.


## Multiempresa

Esta versão funciona como uma plataforma multiempresa. O mesmo site pode ser usado por negócios diferentes, como a empresa do seu pai e a empresa da sua tia, mantendo os dados separados.

Cada empresa possui:

- cadastro próprio;
- login próprio;
- tipo de negócio;
- slug público exclusivo;
- profissionais próprios;
- serviços e preços próprios;
- agendamentos próprios;
- bloqueios próprios;
- lista de espera própria.

A separação é feita por `business_id` no backend. O painel ADM sempre retorna somente os dados da empresa vinculada ao usuário autenticado.

Exemplos de páginas públicas:

```text
http://localhost:3000/p/pai-cortes
http://localhost:3000/p/tia-beauty
```

## Testes de isolamento

Os testes automatizados incluem cenários para validar que uma empresa não acessa dados de outra:

- login de duas empresas diferentes;
- painel ADM retornando apenas dados da empresa logada;
- agendamento de uma empresa não aparecendo no painel da outra;
- tentativa de remover serviço de outra empresa não remove o registro real.


## Atualização — Dias e horários inteligentes por profissional

- Profissional escolhe os dias da semana em que trabalha.
- Horários são configurados por início, fim e intervalo, sem digitação manual.
- Durações e intervalos são exibidos em minutos ou em horas quando passam de 60 minutos.
- A agenda pública não libera horários em dias em que o profissional não trabalha.

## Versão final para publicar hoje — 10 etapas implementadas

1. Linguagem mais simples: `Slug público` virou `Nome do link público`.
2. Painel administrativo renomeado para `Painel do negócio`.
3. Cadastro guiado em etapas: dados do negócio, link público e acesso.
4. Tela inicial com logo, boas-vindas, identidade visual e botão de agendamento.
5. Serviços com modelos rápidos para preencher duração e intervalo.
6. Horários por profissional com dias da semana e horários personalizados por dia.
7. Duração e intervalos exibidos em formato legível: `30 min`, `1h`, `1h 30min`, `3h`.
8. Dashboard financeiro ampliado com cancelados, serviço mais vendido e profissional destaque.
9. Permissões reforçadas: apenas o dono do negócio cria novos usuários.
10. Preparação para deploy web com `DATABASE_URL`, `DB_SSL`, `DEPLOY_HOJE.md` e scripts de produção.

## Deploy rápido

Consulte o arquivo `DEPLOY_HOJE.md`.

Comandos locais:

```powershell
npm install --prefix backend
npm run migrate --prefix backend
npm run dev
```

Comandos de produção sugeridos:

```bash
npm install --prefix backend
npm run start
```

## Atualização de produção — Multiempresa real

Esta versão adiciona os 10 ajustes antes de publicar o sistema na web:

1. Testes automatizados de isolamento entre empresas.
2. Política de backup em `BACKUP_POLICY.md`.
3. Recuperação de senha por token.
4. Dados demo desativados automaticamente em `NODE_ENV=production`.
7. Permissões internas reforçadas por função e por checkbox.
8. Guia para domínio próprio em `DOMINIO_E_BANCO_NUVEM.md`.
9. Suporte a PostgreSQL em nuvem via `DATABASE_URL`.
10. Suporte a armazenamento real de imagens via Cloudinary.

### Scripts úteis

```bash
npm install --prefix backend
npm run migrate --prefix backend
npm run dev
npm test --prefix backend
npm run backup --prefix backend
```

### Produção

Use:

```env
NODE_ENV=production
DATABASE_URL=postgresql://...
DB_SSL=true
JWT_SECRET=um_segredo_grande
STORAGE_PROVIDER=cloudinary
PUBLIC_BASE_URL=https://seudominio.com.br
```

## Atualização — Sem plano mensal e responsivo

- Toda interface de plano mensal foi removida do cadastro e das configurações.
- O sistema não aplica mais limites por plano para profissionais, serviços ou agendamentos.
- O cadastro ficou direto: dados do negócio, link público e acesso ao painel.
- CSS reforçado para celular, tablet e desktop com ajustes de grid, menus, cards, formulários e botões.
- Foi adicionada uma migration de limpeza para remover a coluna antiga de plano, caso ela exista em algum banco local anterior.
