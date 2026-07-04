# Domínio próprio e PostgreSQL em nuvem

## Domínio próprio

O código já está preparado para domínio próprio por meio de:

```env
PUBLIC_BASE_URL=https://seudominio.com.br
APP_DOMAIN=seudominio.com.br
```

O domínio em si precisa ser configurado no provedor de hospedagem e no DNS do domínio.

## PostgreSQL em nuvem

Use a variável:

```env
DATABASE_URL=postgresql://usuario:senha@host:porta/banco
DB_SSL=true
```

O sistema detecta `DATABASE_URL` automaticamente e não tenta criar banco local.

## Start command recomendado

```bash
npm run start
```

Esse comando roda migrations antes de iniciar o servidor.
