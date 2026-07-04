# Checklist para produção

## Multiempresa

- [x] Cada negócio tem `business_id` próprio.
- [x] Painel filtra dados pelo negócio logado.
- [x] Página pública usa slug do negócio.
- [x] Testes de isolamento entre empresas adicionados.

## Banco em nuvem

Configure:

```env
DATABASE_URL=postgresql://usuario:senha@host:porta/banco
DB_SSL=true
```

## Domínio próprio

1. Compre ou use um domínio existente.
2. No provedor do deploy, adicione o domínio customizado.
3. No DNS do domínio, configure os registros pedidos pelo provedor.
4. Atualize:

```env
PUBLIC_BASE_URL=https://seudominio.com.br
APP_DOMAIN=seudominio.com.br
```

## Imagens reais

Para produção, use Cloudinary:

```env
STORAGE_PROVIDER=cloudinary
CLOUDINARY_CLOUD_NAME=seu_cloud_name
CLOUDINARY_API_KEY=sua_api_key
CLOUDINARY_API_SECRET=sua_api_secret
CLOUDINARY_FOLDER=cliqagenda
```

Sem Cloudinary, o sistema usa upload local em `/uploads`, adequado apenas para MVP/teste.

## Segurança

- [ ] Trocar `JWT_SECRET` para um valor grande.
- [ ] Não subir `.env` no GitHub.
- [ ] Usar HTTPS.
- [ ] Criar rotina de backup.
- [ ] Desativar dados demo em produção.

## Dados demo

Em produção, o demo não é criado automaticamente quando:

```env
NODE_ENV=production
```

Para forçar demo em ambiente controlado:

```env
SEED_DEMO=true
```

## Recuperação de senha por e-mail

Para envio real de e-mail, configure:

```env
RESEND_API_KEY=sua_chave_resend
PASSWORD_RESET_FROM=CliqAgenda <no-reply@seudominio.com.br>
```

Sem essas variáveis, em desenvolvimento o link aparece no console e na resposta da API.
