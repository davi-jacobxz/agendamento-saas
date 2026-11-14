# Marcações — super admin, proprietário e página pública de marcação

Interface em pt-PT, fuso Europe/Lisbon, mobile-first. Fala com o projeto Supabase `ipwiljwxedxkgoenwiwg` (Paris).

## Correr localmente
```bash
npm install
cp .env.example .env     # opcional: sem ele a app usa o URL e a chave PÚBLICA do projeto que estão em src/lib/config.ts
npm run dev              # http://localhost:5173
```
Quem entra é encaminhado pelo papel da conta: **super admin** → administração; **proprietário** → o seu painel
(se a palavra-passe ainda for a temporária, é obrigado a escolher uma nova).

## Página pública de marcação (`/o-seu-slug`)
Serviço → profissional (se houver mais de um; “Sem preferência” disponível) → dia → hora → nome e telemóvel (+ consentimento) → “Marcação confirmada”
com botão **Confirmar pelo WhatsApp**. Usa a cor, o logótipo, a capa e os textos do negócio. Negócio bloqueado ou com “pago até” vencido mostra
“Serviço indisponível”. Horários calculados no servidor e recalculados antes de confirmar. `/privacidade` tem a política de privacidade.
**RGPD:** a caixinha de consentimento (nunca pré-marcada, com a data e hora guardadas em `consentimento_em`) liga a `/privacidade?negocio=<slug>`, que mostra o **responsável concreto** (nome, morada e contactos do negócio, vindos do painel dele), as finalidades, o fundamento, os destinatários, a conservação, os direitos, o link da CNPD e o texto oficial do RGPD. O tipo de letra vem incluído no site (nenhum pedido a terceiros, por isso nenhum IP de visitante sai da UE por essa via). Opcional: preencha `src/lib/empresa.ts` (nome da empresa operadora e e-mail de privacidade); enquanto estiver por preencher, a página simplesmente não os mostra. Peça a revisão da política a um jurista e assine com cada negócio um **acordo de subcontratação (art. 28.º RGPD)**.

### Aviso por e-mail ao proprietário
Quando uma cliente marca pela página pública, o proprietário recebe um e-mail com o **nome da cliente, o serviço, o dia, a hora** (e o profissional, se houver mais de um). **Nunca leva o telefone**: o proprietário vê-o no painel.
Para ativar (uma vez):
1. Crie conta em resend.com e **verifique um domínio** vosso (sem isso só envia para o seu próprio e-mail). Prefira a região da UE.
2. Crie uma API key no Resend.
3. No Supabase: *Edge Functions → Secrets*, adicione `RESEND_API_KEY`, `MAIL_FROM` (ex.: `Marcações <avisos@o-seu-dominio.pt>`) e `APP_URL` (endereço do painel, opcional).
Sem estes segredos nada falha: a marcação funciona e o e-mail simplesmente não é enviado.

## Painel do super admin
Negócios (nome, contacto, estado, criado em, pago até, marcações), criar negócio + conta do proprietário,
“pago até”, bloquear/desbloquear, excluir definitivamente (com confirmação escrevendo o endereço),
vista de suporte só de leitura (telefones mascarados) e registo de acessos.

## Painel do proprietário
- **Agenda**: dia e semana, filtro por profissional, marcação manual (só valida sobreposição), cancelar (liberta o horário).
- **Serviços**: ilimitados; nome, descrição, duração (de 5 min a 12 h), preço, **intervalo depois do serviço** (de 0 a 4 h, tempo livre antes da cliente seguinte), categoria, ativar/desativar, ordenar, quem os faz.
- **Equipa**: profissionais (foto opcional, serviços, horário por dia com pausas = intervalos separados, e **“Definir rapidamente”**: início e fim aplicados de uma vez a segunda–sexta, segunda–sábado ou todos os dias). Nasce com 1 profissional.
- **Bloqueios**: folgas, feriados, dias inteiros ou algumas horas, para o negócio todo ou um profissional. Avisa se já existirem marcações.
- **Negócio**: nome, logótipo, capa, cor (com verificação de contraste), textos, morada, Instagram, WhatsApp,
  rótulo do profissional, mensagem final, **mensagem pronta do WhatsApp** (com variáveis `{nome}` `{servico}` `{dia}` `{hora}` e pré-visualização) e regras (antecedência mínima/máxima e intervalo entre horários: 5, 10, 15, 20, 30, 45, 60, 75, 90 ou 100 minutos).
- **Conta**: alterar palavra-passe e apagar dados de uma cliente (anonimiza nome e telefone).
- Aviso no topo quando o negócio está bloqueado ou com “pago até” vencido/vazio.

## Base de dados (`supabase/`)
- `migrations/` — 001 a 004 pela ordem (tabelas e constraint anti-sobreposição; RLS e guarda; funções; Storage).
- `migrations/` também inclui a 005 (aviso por e-mail), a 010 (intervalo por serviço) e a 011 (opções maiores de intervalo entre horários). **Contém o URL do projeto**: num projeto novo, ajuste-o.
- `functions/` — Edge Functions `admin-create-business`, `admin-delete-business` e `notify-booking` (usam a service role key, só no servidor).
Num projeto novo: aplique as migrações por ordem (`supabase db push` ou colando no SQL Editor) e faça deploy das funções.

## Testes
```bash
npm test                                   # 81 testes unitários (datas/DST, telefone, contraste, horários, avisos…)
SUPERADMIN_EMAIL=... SUPERADMIN_PASSWORD=... npm run test:e2e     # Etapa 2 (cria e exclui 1 negócio)
SUPERADMIN_EMAIL=... SUPERADMIN_PASSWORD=... npm run test:e2e3    # Etapa 3 (cria e exclui 2 negócios A e B)
SUPERADMIN_EMAIL=... SUPERADMIN_PASSWORD=... npm run test:e2e4    # Etapa 4 (20 marcações simultâneas → 1; usa ~25 do limite de 30/hora por IP)
SUPERADMIN_EMAIL=... SUPERADMIN_PASSWORD=... npm run test:e2e-duplicados   # prova que serviços diferentes não podem coincidir (usa ~28 do limite de 30/hora por IP)
```
No PowerShell: `$env:SUPERADMIN_EMAIL = Read-Host "E-mail"` e `$env:SUPERADMIN_PASSWORD = Read-Host "Palavra-passe"`;
no fim, `Remove-Item Env:SUPERADMIN_PASSWORD`.

## Segurança
- RLS em todas as tabelas; as funções de administração e de proprietário verificam quem as chama; a service role key só existe nas Edge Functions.
- `vercel.json` aplica uma política de segurança de conteúdo (CSP), `X-Frame-Options`, `nosniff`, `Referrer-Policy` e `Permissions-Policy`.
- Marcações duplicadas são impossíveis ao nível da base de dados: restrição de exclusão por **profissional** e intervalo de tempo, **seja qual for o serviço**. Provado com 150 pedidos simultâneos contra a API real (serviços iguais e diferentes, horários sobrepostos). Cada marcação ocupa o seu tempo + o intervalo do seu serviço. Duas profissionais diferentes podem, naturalmente, trabalhar ao mesmo tempo.
- **Limite de pedidos (rate limit):** 5 tentativas/hora por telefone, 30/hora por IP, 40 marcações criadas/hora por negócio, máximo de 5 marcações futuras por telefone e negócio, e 600 consultas/10 min por IP à página pública. IPs e telefones são guardados só como hash.
- **Senhas:** o Supabase Auth guarda-as com hash bcrypt; nenhuma tabela nossa guarda senhas e a senha temporária só é mostrada uma vez, nunca gravada nem registada em logs.
- **Variáveis de ambiente:** o `.env` está no `.gitignore`. No browser só existem o URL e a chave pública (`VITE_*`). A service role key e a chave do Resend vivem só nos segredos das Edge Functions do Supabase, nunca no código nem no GitHub. Se o `.env` já estiver no repositório: `git rm --cached .env` e `git commit`.
- Limite de tentativas de login: é do próprio Supabase (Authentication → Rate Limits).
- Dependências verificadas com `npm audit` (0 vulnerabilidades). As Edge Functions usam `zod@3` (sem listas grandes a validar).
- Requer Node 20.19 ou superior (`engines` no `package.json`).

## Testes manuais
Veja `CHECKLIST.md`.

## Deploy na Vercel
Importe o repositório (framework Vite). As variáveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` são opcionais (se faltarem, usa `src/lib/config.ts`). O `vercel.json` trata as rotas.
Nunca coloque a service role key no browser nem em variáveis `VITE_*`.
