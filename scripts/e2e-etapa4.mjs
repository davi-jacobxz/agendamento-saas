// Teste ponta a ponta da Etapa 4 (marcação pública) contra o Supabase real.
// Uso:  SUPERADMIN_EMAIL=... SUPERADMIN_PASSWORD=... npm run test:e2e4
// Cria UM negócio de teste e EXCLUI-O no fim.
// ATENÇÃO: o limite anti-spam é de 30 pedidos/hora por IP; este teste usa cerca de 25.
// Não o repita em menos de 1 hora a partir da mesma ligação (daria "muitas tentativas").
import { createClient } from "@supabase/supabase-js";

const url = process.env.VITE_SUPABASE_URL, key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const { SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD } = process.env;
if (!url || !key || !SUPERADMIN_EMAIL || !SUPERADMIN_PASSWORD) { console.error("Faltam variáveis de ambiente."); process.exit(2); }

let falhas = 0;
const ok = (c, m) => { console.log(`${c ? "✓" : "✗"} ${m}`); if (!c) falhas++; };
const info = (m) => console.log(`ℹ ${m}`);
const novo = () => createClient(url, key, { auth: { persistSession: false } });

const admin = novo();
const { error: e0 } = await admin.auth.signInWithPassword({ email: SUPERADMIN_EMAIL, password: SUPERADMIN_PASSWORD });
ok(!e0, "super admin entra");
if (e0) { console.error("Use o e-mail e a palavra-passe REAIS do super admin."); process.exit(1); }

const slug = `teste-e4-${Date.now().toString(36)}`, email = `${slug}@example.com`;
const pago = new Date(Date.now() + 30 * 864e5).toISOString();
const c = await admin.functions.invoke("admin-create-business", { body: { nome: "Teste E4", slug, contacto: null, pago_ate: pago, email_proprietario: email } });
ok(!c.error, "cria o negócio de teste");
const id = c.data?.business_id;
const dono = novo();
await dono.auth.signInWithPassword({ email, password: c.data?.senha_temporaria ?? "x" });

try {
  const sv = await dono.from("services").insert({ business_id: id, name: "Corte", duration_minutes: 30, price_cents: 1500 }).select("id").single();
  const prof = (await dono.from("professionals").select("id")).data?.[0]?.id;
  await dono.from("professional_services").insert({ professional_id: prof, service_id: sv.data.id, business_id: id });

  const visitante = novo();
  const pg = await visitante.rpc("get_public_business", { p_slug: slug });
  ok(pg.data?.disponivel === true && pg.data?.servicos?.length === 1, "página pública disponível, com 1 serviço");
  ok((await visitante.rpc("get_public_business", { p_slug: "nao-existe-zzz" })).data?.encontrado === false, "slug inexistente → não encontrado");

  // próximo dia útil com pelo menos 3 dias de avanço
  let dia = new Date(Date.now() + 3 * 864e5);
  while ([0, 6].includes(dia.getUTCDay())) dia = new Date(+dia + 864e5);
  const ymd = dia.toISOString().slice(0, 10);
  const sl = await visitante.rpc("get_available_slots", { p_slug: slug, p_service_id: sv.data.id, p_professional_id: null, p_data: ymd });
  const horarios = (sl.data ?? []).map((r) => r.inicio);
  ok(horarios.length >= 30, `há horários livres em ${ymd} (${horarios.length})`);
  const alvo = horarios[0];

  // OBRIGATÓRIO: 20 pedidos simultâneos para o mesmo horário e profissional → exatamente 1
  const pedidos = await Promise.all(Array.from({ length: 20 }, (_, i) =>
    novo().rpc("book_appointment", { p_slug: slug, p_service_id: sv.data.id, p_professional_id: null, p_inicio: alvo, p_nome: `Cliente ${i}`, p_telefone: `93000${String(i).padStart(4, "0")}`, p_consentimento: true, p_website: null })));
  const criadas = pedidos.filter((p) => p.data?.ok === true).length;
  const ocupados = pedidos.filter((p) => p.data?.code === "slot_taken").length;
  ok(criadas === 1, `20 pedidos simultâneos para o mesmo horário → ${criadas} criada(s) (esperado 1)`);
  ok(ocupados === 19, `os outros 19 receberam "Esse horário acabou de ser ocupado" (${ocupados})`);
  const conf = await dono.from("appointments").select("id", { count: "exact", head: true }).eq("status", "confirmado").eq("inicio", alvo);
  ok(conf.count === 1, "na base de dados existe exatamente 1 marcação confirmada nesse horário");

  const depois = (await visitante.rpc("get_available_slots", { p_slug: slug, p_service_id: sv.data.id, p_professional_id: null, p_data: ymd })).data.map((r) => r.inicio);
  ok(!depois.includes(alvo) && depois.length === horarios.length - 2, "o horário marcado (e o que se sobrepõe) já não aparece livre");

  // recusas
  const base = { p_slug: slug, p_service_id: sv.data.id, p_professional_id: null, p_inicio: horarios[10], p_nome: "Ana", p_telefone: "925000001", p_consentimento: true, p_website: null };
  ok((await novo().rpc("book_appointment", { ...base, p_consentimento: false })).data?.code === "consentimento_necessario", "sem consentimento → recusado");
  ok((await novo().rpc("book_appointment", { ...base, p_nome: "A", p_telefone: "925000002" })).data?.code === "nome_invalido", "nome curto → recusado");
  ok((await novo().rpc("book_appointment", { ...base, p_telefone: "123" })).data?.code === "telefone_invalido", "telefone inválido → recusado");
  ok((await novo().rpc("book_appointment", { ...base, p_website: "http://spam" })).data?.ok === false, "campo armadilha preenchido → recusado");

  // marcação feita pelo proprietário aparece com o telefone completo; aviso por e-mail (informativo)
  const ap = (await dono.from("appointments").select("nome_cliente, telefone, origem, notificado_em").eq("inicio", alvo).eq("status", "confirmado")).data?.[0];
  ok(ap?.origem === "publico" && /^\+351930/.test(ap?.telefone ?? ""), "o proprietário vê a marcação pública com o telefone normalizado (+351…)");
  await new Promise((r) => setTimeout(r, 4000));
  const n2 = (await dono.from("appointments").select("notificado_em").eq("inicio", alvo).eq("status", "confirmado")).data?.[0];
  info(n2?.notificado_em ? "aviso por e-mail ENVIADO ao proprietário (Resend configurado)" : "aviso por e-mail não enviado: Resend ainda não está configurado (ver README)");

  // bloqueado
  await admin.rpc("admin_set_blocked", { p_business_id: id, p_blocked: true });
  ok((await visitante.rpc("get_public_business", { p_slug: slug })).data?.disponivel === false, "negócio bloqueado → página indisponível");
  ok((await novo().rpc("book_appointment", { ...base, p_telefone: "925000003" })).data?.code === "indisponivel", "negócio bloqueado → não aceita marcações");
} finally {
  if (id) {
    const r = await admin.functions.invoke("admin-delete-business", { body: { business_id: id, confirmar_slug: slug } });
    ok(!r.error, "limpeza: negócio de teste excluído");
  }
}
console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTudo OK");
process.exit(falhas ? 1 : 0);
