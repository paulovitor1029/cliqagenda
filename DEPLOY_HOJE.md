# Publicar o CliqAgenda na web hoje

## Caminho recomendado: Render + PostgreSQL

O projeto é um servidor Node.js/Express que já entrega o frontend estático e a API no mesmo endereço.

## 1. Subir no GitHub

```powershell
git init
git add .
git commit -m "Prepara CliqAgenda para deploy web"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/cliqagenda.git
git push -u origin main
```

## 2. Criar banco PostgreSQL no Render

1. Render Dashboard
2. New
3. PostgreSQL
4. Copie a Internal Database URL ou External Database URL

## 3. Criar Web Service no Render

1. New
2. Web Service
3. Conecte o repositório do GitHub
4. Runtime: Node
5. Build Command:

```bash
npm install --prefix backend
```

6. Start Command:

```bash
npm run start
```

## 4. Environment Variables

Configure no Render:

```env
NODE_ENV=production
PORT=10000
DATABASE_URL=cole_a_url_do_postgres
DB_SSL=true
JWT_SECRET=gere_um_texto_grande_e_secreto
PUBLIC_BASE_URL=https://seu-site.onrender.com
WHATSAPP_PROVIDER=none
```

## 5. Testar

Abra:

```text
https://seu-site.onrender.com
```

Depois crie um negócio pelo painel e teste:

```text
https://seu-site.onrender.com/p/nome-do-negocio
```

## Observação

O arquivo `.env` local não deve ir para o GitHub. Use as variáveis de ambiente do Render para produção.

## Atualizações de produção incluídas nesta versão

- Testes de isolamento multiempresa.
- Recuperação de senha por token.
- Suporte a `DATABASE_URL` para PostgreSQL em nuvem.
- Suporte a Cloudinary para armazenamento real de imagens.
- Política de backup documentada em `BACKUP_POLICY.md`.
- Dados demo bloqueados automaticamente em `NODE_ENV=production`.

## Variáveis extras recomendadas

```env
APP_DOMAIN=seudominio.com.br
SEED_DEMO=false
BACKUP_DIR=/var/backups/cliqagenda
STORAGE_PROVIDER=cloudinary
CLOUDINARY_CLOUD_NAME=seu_cloud_name
CLOUDINARY_API_KEY=sua_api_key
CLOUDINARY_API_SECRET=sua_api_secret
CLOUDINARY_FOLDER=cliqagenda
```
