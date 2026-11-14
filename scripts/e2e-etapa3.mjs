// Teste ponta a ponta da Etapa 3 (painel do proprietário) contra o Supabase real.
// Uso:  SUPERADMIN_EMAIL=... SUPERADMIN_PASSWORD=... npm run test:e2e3
// Cria DOIS negócios de teste (A e B), testa e EXCLUI os dois no fim.
import { createClient } from "@supabase/supabase-js";

const url = process.env.VITE_SUPABASE_URL, key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const { SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD } = process.env;
if (!url || !key || !SUPERADMIN_EMAIL || !SUPERADMIN_PASSWORD) { console.error("Faltam variáveis de ambiente."); process.exit(2); }

let falhas = 0;
const ok = (c, m) => { console.log(`${c ? "✓" : "✗"} ${m}`); if (!c) falhas++; };
const novo = () => createClient(url, key, { auth: { persistSession: false } });
const PNG = new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,1,0,0,0,1,8,6,0,0,0,31,21,196,137,0,0,0,10,73,68,65,84,120,156,99,0,1,0,0,5,0,1,13,10,45,180,0,0,0,0,73,69,78,68,174,66,96,130]);

const admin = novo();
const { error: e0 } = await admin.auth.signInWithPassword({ email: SUPERADMIN_EMAIL, password: SUPERADMIN_PASSWORD });
ok(!e0, "super admin entra");
if (e0) { console.error("Use o e-mail e a palavra-passe REAIS do super admin."); process.exit(1); }

const pago = new Date(Date.now() + 30 * 864e5).toISOString();
const sufixo = Date.now().toString(36);
async function criar(letra) {
  const slug = `teste-e3${letra}-${sufixo}`, email = `${slug}@example.com`;
  const r = await admin.functions.invoke("admin-create-business", { body: { nome: `Teste E3 ${letra}`, slug, contacto: null, pago_ate: pago, email_proprietario: email } });
  const c = novo();
  const login = await c.auth.signInWithPassword({ email, password: r.data?.senha_temporaria ?? "x" });
  return { slug, email, id: r.data?.business_id, senha: r.data?.senha_temporaria, c, userId: login.data?.user?.id, criado: !r.error, entrou: !login.error };
}
const A = await criar("a"), B = await criar("b");
ok(A.criado && B.criado, "super admin cria os negócios A e B");
ok(A.entrou && B.entrou, "os dois proprietários entram");

try {
  // identidade: lê só o seu
  const nA = await A.c.from("businesses").select("id, slug");
  ok(nA.data?.length === 1 && nA.data[0].id === A.id, "A vê apenas o seu negócio");
  ok((await A.c.from("businesses").update({ name: "Teste E3 A (renomeado)", primary_color: "#2f5d50", whatsapp: "+351912345678" }).eq("id", A.id).select("id")).data?.length === 1, "A personaliza o próprio negócio");
  ok(!(await A.c.from("businesses").update({ whatsapp_message: "Olá! Sou {nome}." }).eq("id", A.id)).error, "A define a mensagem pronta do WhatsApp");
  ok((await novo().rpc("get_public_business", { p_slug: A.slug })).data?.negocio?.mensagem_whatsapp === "Olá! Sou {nome}.", "a página pública recebe a mensagem do WhatsApp do proprietário");
  ok(!!(await A.c.from("businesses").update({ whatsapp_message: "x".repeat(301) }).eq("id", A.id)).error, "mensagem do WhatsApp com mais de 300 caracteres é recusada");
  ok(((await A.c.from("businesses").update({ name: "Hack" }).eq("id", B.id).select("id")).data ?? []).length === 0, "A não altera o negócio B");
  ok(!!(await A.c.from("businesses").update({ status: "bloqueado" }).eq("id", A.id)).error, "A não consegue alterar o próprio status");
  ok(!!(await A.c.from("businesses").update({ paid_until: pago }).eq("id", A.id)).error, "A não consegue alterar o próprio 'pago até'");

  // serviços e equipa
  const profA = (await A.c.from("professionals").select("id")).data?.[0]?.id;
  const sA = await A.c.from("services").insert({ business_id: A.id, name: "Corte", duration_minutes: 30, price_cents: 1500 }).select("id").single();
  ok(!sA.error, "A cria um serviço");
  ok(!(await A.c.from("professional_services").insert({ professional_id: profA, service_id: sA.data.id, business_id: A.id })).error, "A associa o serviço ao profissional");
  ok(!!(await A.c.from("services").insert({ business_id: B.id, name: "Intruso", duration_minutes: 30 })).error, "A não cria serviços em B");
  ok(((await A.c.from("services").select("id")).data ?? []).every((s) => s.id === sA.data.id), "A só vê os seus serviços");

  // horários com pausa
  const wh = await A.c.from("working_hours").insert([
    { business_id: A.id, professional_id: profA, weekday: 1, start_time: "09:00", end_time: "13:00" },
    { business_id: A.id, professional_id: profA, weekday: 1, start_time: "14:00", end_time: "18:00" }]);
  ok(!wh.error, "A define horário com pausa (dois intervalos)");
  ok(!!(await A.c.from("working_hours").insert({ business_id: A.id, professional_id: profA, weekday: 2, start_time: "18:00", end_time: "09:00" })).error, "horário com fim antes do início é recusado");

  // bloqueio
  const t0 = new Date(Date.now() + 5 * 864e5);
  ok(!(await A.c.from("blocked_times").insert({ business_id: A.id, starts_at: t0.toISOString(), ends_at: new Date(+t0 + 36e5).toISOString(), reason: "Teste" })).error, "A cria um bloqueio");
  ok(!!(await A.c.from("blocked_times").insert({ business_id: B.id, starts_at: t0.toISOString(), ends_at: new Date(+t0 + 36e5).toISOString() })).error, "A não cria bloqueios em B");

  // marcação manual
  const inicio = new Date(Math.ceil((Date.now() + 3 * 864e5) / 9e5) * 9e5).toISOString();
  const m1 = await A.c.rpc("owner_create_appointment", { p_service_id: sA.data.id, p_professional_id: null, p_inicio: inicio, p_nome: "Ana Teste", p_telefone: "912345678" });
  ok(m1.data?.ok === true, "A cria uma marcação manual");
  const m2 = await A.c.rpc("owner_create_appointment", { p_service_id: sA.data.id, p_professional_id: null, p_inicio: inicio, p_nome: "Outra", p_telefone: "913456789" });
  ok(m2.data?.ok === false && m2.data?.code === "slot_taken", "marcação sobreposta é recusada (slot_taken)");
  const pedidos = await Promise.all(Array.from({ length: 10 }, (_, i) => A.c.rpc("owner_create_appointment", { p_service_id: sA.data.id, p_professional_id: null, p_inicio: new Date(+new Date(inicio) + 36e5 * 24).toISOString(), p_nome: `Cliente ${i}`, p_telefone: "91234567" + i })));
  ok(pedidos.filter((p) => p.data?.ok === true).length === 1, "10 marcações manuais simultâneas no mesmo horário → exatamente 1 criada");
  ok(((await B.c.from("appointments").select("id")).data ?? []).length === 0, "B não vê as marcações de A");

  // cancelar e anonimizar
  const mid = (await A.c.from("appointments").select("id, telefone").eq("nome_cliente", "Ana Teste")).data?.[0];
  ok(!!mid && mid.telefone === "+351912345678", "A vê o telefone completo da sua cliente");
  ok(((await B.c.from("appointments").update({ status: "cancelado" }).eq("id", mid.id).select("id")).data ?? []).length === 0, "B não cancela marcações de A");
  ok(!!(await A.c.from("appointments").update({ nome_cliente: "Alterado" }).eq("id", mid.id)).error, "A não altera dados de uma marcação (só cancelar)");
  ok(((await A.c.from("appointments").update({ status: "cancelado" }).eq("id", mid.id).select("id")).data ?? []).length === 1, "A cancela a marcação");
  const m3 = await A.c.rpc("owner_create_appointment", { p_service_id: sA.data.id, p_professional_id: null, p_inicio: inicio, p_nome: "Reocupa", p_telefone: "914567890" });
  ok(m3.data?.ok === true, "o horário cancelado volta a estar livre");
  ok((await B.c.rpc("owner_erase_client_data", { p_telefone: "912345678" })).data === 0, "B não apaga dados de clientes de A");
  ok((await A.c.rpc("owner_erase_client_data", { p_telefone: "912345678" })).data === 1, "A apaga os dados da sua cliente (anonimiza)");
  const anon = (await A.c.from("appointments").select("nome_cliente, telefone, anonimizado_em").eq("id", mid.id)).data?.[0];
  ok(anon?.nome_cliente === null && anon?.telefone === null && !!anon?.anonimizado_em, "nome e telefone ficam nulos");

  // imagens
  const up = await A.c.storage.from("business-assets").upload(`${A.id}/logo-teste.png`, PNG, { contentType: "image/png" });
  ok(!up.error, "A envia um logótipo para a sua pasta");
  ok(!!(await A.c.storage.from("business-assets").upload(`${B.id}/logo-intruso.png`, PNG, { contentType: "image/png" })).error, "A não envia ficheiros para a pasta de B");
  ok(!!(await A.c.storage.from("business-assets").upload(`${A.id}/ficheiro.txt`, new Uint8Array([1, 2, 3]), { contentType: "text/plain" })).error, "tipos que não são imagem são recusados");
  const grande = new Uint8Array(1024 * 1024 + 10);
  ok(!!(await A.c.storage.from("business-assets").upload(`${A.id}/grande.png`, grande, { contentType: "image/png" })).error, "imagem com mais de 1 MB é recusada");
  ok(!(await A.c.from("businesses").update({ logo_path: `${A.id}/logo-teste.png` }).eq("id", A.id)).error, "A define o logótipo");
  ok(!!(await A.c.from("businesses").update({ logo_path: `${B.id}/logo.png` }).eq("id", A.id)).error, "A não aponta o logótipo para a pasta de B");
  const pub = await fetch(A.c.storage.from("business-assets").getPublicUrl(`${A.id}/logo-teste.png`).data.publicUrl);
  ok(pub.ok, "o logótipo é visível publicamente");
  await A.c.storage.from("business-assets").remove([`${A.id}/logo-teste.png`]);

  // password
  const up2 = await A.c.auth.updateUser({ password: "NovaPasse-12345", data: { must_change_password: false } });
  ok(!up2.error, "A troca a palavra-passe temporária");
  const relog = novo();
  ok(!(await relog.auth.signInWithPassword({ email: A.email, password: "NovaPasse-12345" })).error, "entra com a nova palavra-passe");

  // painel de admin continua fechado
  ok((await A.c.rpc("admin_list_businesses")).error?.code === "42501", "A continua sem acesso ao painel de super admin");

  // negócio bloqueado: a página pública diz indisponível, o dono continua a entrar
  await admin.rpc("admin_set_blocked", { p_business_id: A.id, p_blocked: true });
  const pubB = await novo().rpc("get_public_business", { p_slug: A.slug });
  ok(pubB.data?.disponivel === false, "negócio bloqueado: página pública indisponível");
  ok((await A.c.from("businesses").select("status").single()).data?.status === "bloqueado", "o proprietário vê que está bloqueado (para o aviso no painel)");
  ok(!(await novo().rpc("book_appointment", { p_slug: A.slug, p_service_id: sA.data.id, p_professional_id: null, p_inicio: new Date(Date.now() + 9 * 864e5).toISOString(), p_nome: "Visitante", p_telefone: "915678901", p_consentimento: true })).data?.ok, "negócio bloqueado: não aceita marcações públicas");
} finally {
  for (const n of [A, B]) {
    if (!n.id) continue;
    const r = await admin.functions.invoke("admin-delete-business", { body: { business_id: n.id, confirmar_slug: n.slug } });
    ok(!r.error, `limpeza: negócio ${n.slug} excluído`);
  }
}
console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTudo OK");
process.exit(falhas ? 1 : 0);
