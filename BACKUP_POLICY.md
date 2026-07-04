# Política de backup do banco

## Objetivo

Evitar perda de dados de empresas, clientes, serviços, horários, pagamentos e agendamentos.

## Frequência recomendada

- Produção inicial/MVP: 1 backup por dia.
- Quando houver clientes reais: 2 backups por dia.
- Antes de migrations importantes: backup manual obrigatório.

## Retenção recomendada

- Backups diários: manter por 7 dias.
- Backups semanais: manter por 4 semanas.
- Backups mensais: manter por 6 meses.

## Backup manual local

Requer `pg_dump` instalado e disponível no PATH.

```powershell
npm run backup --prefix backend
```

O arquivo será criado em:

```text
backend/backups/
```

Você pode alterar o destino com:

```env
BACKUP_DIR=C:\backups\cliqagenda
```

## Backup em produção

Use backup automático do provedor PostgreSQL em nuvem. Configure também exportações manuais antes de rodar migrations.

## Restauração

Use `psql`:

```bash
psql "$DATABASE_URL" -f arquivo-backup.sql
```

Em Windows local:

```powershell
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -h 127.0.0.1 -d cliqagenda -f .\backup.sql
```
