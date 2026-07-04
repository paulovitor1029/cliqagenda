# TODO - CliqAgenda

## Concluído nesta versão

- Cadastro/login de ADM vinculado a empresa.
- Painel protegido por autenticação e isolado por empresa.
- Página pública por slug para cada empresa e fluxo público sem login.
- Persistência em PostgreSQL.
- Migrations versionadas.
- Upload real de logo/foto do negócio.
- Cadastro de vários profissionais/funcionários.
- Foto individual por profissional via URL ou upload.
- Serviços e preços vinculados a cada profissional.
- Agendamento por profissional.
- Bloqueio de horário pelo ADM.
- Lista de espera integrada.
- Estrutura para WhatsApp API com fallback wa.me.
- Testes de rotas críticas e isolamento multiempresa.

- Cadastro de empresa no registro.
- Tipo de negócio por empresa.
- Slug público exclusivo por empresa.
- Isolamento total por `business_id`.
- Serviços, profissionais, agendamentos, bloqueios e lista de espera separados por empresa.

## Próximas evoluções recomendadas

- Desativar profissional/serviço sem excluir histórico.
- Criar horários individuais por profissional.
- Adicionar pagamentos Pix integrados.
- Melhorar permissões para múltiplos usuários ADM por negócio.
- Criar dashboard financeiro.
- Criar lembretes automáticos por WhatsApp.
- Ampliar testes cobrindo regras de bloqueio, lista de espera e remarcação.


- [x] Permitir que cada profissional escolha os dias da semana em que trabalha.
- [x] Otimizar horários por início, fim e intervalo, sem digitação manual.
- [x] Padronizar exibição de duração/intervalo em minutos e horas.

## Ajustes finais para publicação

- [x] Trocar termos técnicos por termos simples.
- [x] Criar cadastro guiado.
- [x] Melhorar tela pública e tela inicial.
- [x] Adicionar modelos rápidos de serviços.
- [x] Permitir dias e horários personalizados por profissional.
- [x] Exibir duração/intervalo em minutos ou horas.
- [x] Melhorar dashboard financeiro.
- [x] Melhorar permissões de usuários.
- [x] Preparar scripts e documentação de deploy.
- [x] Criar guia `DEPLOY_HOJE.md`.

## Produção antes do lançamento público

- [x] Isolamento entre empresas testado.
- [x] Política de backup documentada.
- [x] Recuperação de senha criada.
- [x] Usuários, profissionais e serviços demo removidos de todos os ambientes.
- [x] Permissões internas melhoradas.
- [x] Guia de domínio próprio criado.
- [x] Banco PostgreSQL em nuvem configurável por `DATABASE_URL`.
- [x] Upload real de imagens via Cloudinary.

## Ajuste solicitado — remoção de plano mensal

- [x] Remover tela de escolha de plano mensal.
- [x] Remover plano mensal das configurações do negócio.
- [x] Remover regras de limite por plano.
- [x] Remover rota pública de planos.
- [x] Tornar layout responsivo para celular, tablet e desktop.
