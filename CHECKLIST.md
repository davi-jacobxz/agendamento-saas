# Lista de testes manuais antes de enviar ao cliente

Faça no **telemóvel** e no computador. Marque cada item.

## Antes de tudo (uma vez)
- [ ] Trocar a palavra-passe do super admin (Supabase → Authentication → Users). Foi exposta durante o desenvolvimento.
- [ ] Supabase → Authentication → URL Configuration: **Site URL** = endereço do site na Vercel; acrescentar o mesmo aos **Redirect URLs**.
- [ ] Supabase → Authentication → Sign In / Providers → Password: comprimento mínimo **10** (e ligar a proteção contra palavras-passe vazadas, se o plano permitir).
- [ ] Ligar a autenticação de dois fatores (2FA) nas contas do **GitHub, Vercel e Supabase** (quem as controla controla tudo).
- [ ] Supabase → Authentication → Rate Limits: confirmar os limites de tentativas de login.
- [ ] **RGPD**: cada proprietário preenche, no painel (Negócio), o **nome, a morada e o WhatsApp**, porque são eles que aparecem como “responsável pelo tratamento” na política que a cliente lê.
- [ ] **RGPD**: assinar com cada negócio o acordo de subcontratação (art. 28.º RGPD) e pedir a revisão jurídica da página `/privacidade`. Opcional: preencher `src/lib/empresa.ts`.

## Criar o negócio do cliente (super admin)
- [ ] Entrar no site com a conta de super admin → **Novo negócio** (nome, endereço/slug, e-mail do proprietário, “pago até”).
- [ ] Guardar a palavra-passe temporária (aparece uma só vez) e enviá-la ao cliente por um canal privado.

## O proprietário (entrar com a palavra-passe temporária)
- [ ] É obrigado a escolher uma palavra-passe nova.
- [ ] **Negócio**: nome, logótipo, cor, texto de boas-vindas, morada, Instagram, **WhatsApp**, mensagem pronta do WhatsApp → Guardar.
- [ ] **Serviços**: criar pelo menos um (nome, duração, preço) com o profissional associado.
- [ ] **Equipa**: definir o horário com “Definir rapidamente” (início e fim) e confirmar as pausas como dois intervalos.
- [ ] **Serviços**: definir o “Intervalo depois do serviço” de cada um.
- [ ] **Bloqueios**: criar um feriado e ver que o dia deixa de ter horários na página pública.

## A cliente (página pública `/slug`, em janela anónima)
- [ ] A página mostra o logótipo, a cor e os textos do negócio.
- [ ] Escolher serviço → (profissional) → dia → hora → nome e telemóvel → **Confirmar marcação**.
- [ ] A caixinha de consentimento **não vem marcada**; o link “Política de privacidade” abre a política **com o nome e a morada do negócio**.
- [ ] Aparece a tela “Marcação confirmada” com o “x” para fechar; o botão do WhatsApp abre a conversa com a mensagem pronta.
- [ ] Depois de fechar a confirmação, aparece “Cancelar esta marcação” e “Copiar link”; copiar e abrir o link numa janela anónima.
- [ ] No link privado, confirmar que aparecem apenas o serviço, a data, a hora e o profissional (nunca o telefone).
- [ ] Cancelar uma marcação futura pela página pública; confirmar a operação e verificar a mensagem de sucesso.
- [ ] Depois do cancelamento público, confirmar que o horário volta a ficar disponível e que o proprietário vê o estado “cancelado” na Agenda.
- [ ] Abrir novamente o mesmo link: deve informar que a marcação já foi cancelada e não permitir um segundo cancelamento.
- [ ] Tentar cancelar uma marcação passada e um UUID inexistente ou de outro negócio: a operação deve ser recusada sem revelar dados.
- [ ] Confirmar que o link funciona mesmo quando a página pública do negócio está indisponível; o cliente ainda deve conseguir consultar/cancelar a marcação.
- [ ] **Duplicados**: abrir a mesma página em **dois telemóveis**, escolher a mesma hora e confirmar quase ao mesmo tempo → só um consegue; o outro vê “Esse horário acabou de ser ocupado”.
- [ ] Marcar no **mesmo dia, em horas diferentes** → ambos aceites.
- [ ] **Serviços diferentes à mesma hora**: marcar um serviço às 09:00 e tentar outro serviço às 09:00 (e às 09:15, a meio do primeiro) → o segundo é sempre recusado e a página nem mostra esses horários.
- [ ] **Intervalo por serviço**: dar a um serviço 15 min de intervalo; depois de o marcar, o horário logo a seguir não aparece livre até passar o intervalo.
- [ ] Tentar marcar a **6.ª vez** com o mesmo telemóvel (marcações futuras) → aparece “Já tem 5 marcações futuras neste negócio”.

## De volta ao proprietário
- [ ] A **Agenda** mostra as marcações (telefone completo, link do WhatsApp).
- [ ] **Cancelar** uma marcação → o horário volta a aparecer livre na página pública.
- [ ] **Nova marcação** manual (só valida sobreposição).
- [ ] **Conta → Apagar dados de uma cliente** → a marcação fica sem nome nem telefone.

## Bloqueio e pagamento (super admin)
- [ ] **Bloquear** o negócio → a página pública mostra “Serviço indisponível” e o proprietário vê o aviso no painel.
- [ ] Desbloquear; pôr “pago até” numa data passada → mesmo efeito; renovar → volta ao normal.
- [ ] **Ver (suporte)** → só leitura, telefones mascarados, e fica registado no “Registo de acessos”.

## Automáticos (opcional, com a conta de super admin)
`npm run test:e2e`, `npm run test:e2e3`, `npm run test:e2e4` e `npm run test:e2e-duplicados` (os dois últimos usam o limite anti-spam: não repetir em menos de 1 hora).
