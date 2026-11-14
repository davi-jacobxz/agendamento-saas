// Teste ponta a ponta da Etapa 2 contra o Supabase real.
// Uso:  SUPERADMIN_EMAIL=... SUPERADMIN_PASSWORD=... node --env-file=.env scripts/e2e-etapa2.mjs
// Cria um negócio de teste (teste-e2e-<hora>) e EXCLUI-O no fim (testa também a exclusão).
import { createClient } from "@supabase/supabase-js";

const url = process.env.VITE_SUPABASE_URL, key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const { SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD } = process.env;
if (!url || !key || !SUPERADMIN_EMAIL || !SUPERADMIN_PASSWORD) { console.error("Faltam variáveis de ambiente."); process.exit(2); }

let falhas = 0;
const ok = (c, m) => { console.log(`${c ? "✓" : "✗"} ${m}`); if (!c) falhas++; };
const novo = () => createClient(url, key, { auth: { persistSession: false } });

const admin = novo();
const { error: e0 } = await admin.auth.signInWithPassword({ email: SUPERADMIN_EMAIL, password: SUPERADMIN_PASSWORD });
ok(!e0, "super admin entra");
if (e0) {
  console.error("\nNão foi possível entrar com SUPERADMIN_EMAIL / SUPERADMIN_PASSWORD.");
  console.error("Use o e-mail e a palavra-passe REAIS do super admin (não os valores de exemplo).");
  process.exit(1);
}

// anónimo não pode nada
const anon = novo();
ok((await anon.rpc("admin_list_businesses")).error?.code === "42501", "anónimo: admin_list_businesses bloqueado");
const rAnonFn = await anon.functions.invoke("admin-create-business", { body: {} });
ok(!!rAnonFn.error, "anónimo: Edge Function recusa");

// criar negócio
const slug = `teste-e2e-${Date.now().toString(36)}`;
const email = `${slug}@example.com`;
const pago = new Date(Date.now() + 30 * 864e5).toISOString();
const c = await admin.functions.invoke("admin-create-business", { body: { nome: "Teste E2E", slug, contacto: null, pago_ate: pago, email_proprietario: email } });
ok(!c.error && c.data?.senha_temporaria?.length >= 12, "super admin cria negócio + proprietário");
const id = c.data?.business_id;

// slug repetido → 409
const dup = await admin.functions.invoke("admin-create-business", { body: { nome: "Teste E2E 2", slug, pago_ate: pago, email_proprietario: `2-${email}` } });
ok(dup.error?.context?.status === 409, "slug repetido devolve 409");

// lista inclui o negócio e está disponível
const l = await admin.rpc("admin_list_businesses");
const mine = l.data?.find((n) => n.id === id);
ok(mine?.disponivel === true && Number(mine?.total_marcacoes) === 0, "lista mostra o negócio disponível, 0 marcações");

// pago até no passado → indisponível; futuro → disponível
await admin.rpc("admin_set_paid_until", { p_business_id: id, p_paid_until: new Date(Date.now() - 864e5).toISOString() });
ok((await admin.rpc("admin_list_businesses")).data.find((n) => n.id === id).disponivel === false, "pago até vencido → indisponível");
await admin.rpc("admin_set_paid_until", { p_business_id: id, p_paid_until: pago });
ok((await admin.rpc("admin_list_businesses")).data.find((n) => n.id === id).disponivel === true, "pago até renovado → disponível");

// bloquear / desbloquear
await admin.rpc("admin_set_blocked", { p_business_id: id, p_blocked: true });
ok((await admin.rpc("admin_list_businesses")).data.find((n) => n.id === id).disponivel === false, "bloqueado → indisponível");
await admin.rpc("admin_set_blocked", { p_business_id: id, p_blocked: false });

// vista de suporte gera auditoria
const antes = (await admin.from("audit_log").select("id", { count: "exact", head: true }).eq("business_id", id).eq("action", "support_view")).count;
const sv = await admin.rpc("admin_open_support_view", { p_business_id: id });
ok(!sv.error && sv.data?.profissionais?.length === 1, "vista de suporte abre (nasce com 1 profissional)");
const depois = (await admin.from("audit_log").select("id", { count: "exact", head: true }).eq("business_id", id).eq("action", "support_view")).count;
ok(depois === antes + 1, "cada abertura do suporte cria 1 registo de auditoria");

// o proprietário NÃO acede ao painel de super admin
const owner = novo();
const { error: eo } = await owner.auth.signInWithPassword({ email, password: c.data.senha_temporaria });
ok(!eo, "proprietário entra com a senha temporária");
ok((await owner.rpc("admin_list_businesses")).error?.code === "42501", "proprietário: admin_list_businesses bloqueado");
ok((await owner.rpc("admin_set_blocked", { p_business_id: id, p_blocked: true })).error?.code === "42501", "proprietário: não consegue bloquear");
ok((await owner.rpc("admin_open_support_view", { p_business_id: id })).error?.code === "42501", "proprietário: sem vista de suporte");
const rOwnerFn = await owner.functions.invoke("admin-create-business", { body: { nome: "X", slug: `${slug}-x`, pago_ate: pago, email_proprietario: `x-${email}` } });
ok(rOwnerFn.error?.context?.status === 403, "proprietário: Edge Function devolve 403");
ok(((await owner.from("audit_log").select("id")).data ?? []).length === 0, "proprietário: não lê o audit_log");

// exclusão: só o super admin, com o slug certo
const rOwnerDel = await owner.functions.invoke("admin-delete-business", { body: { business_id: id, confirmar_slug: slug } });
ok(rOwnerDel.error?.context?.status === 403, "proprietário: não consegue excluir (403)");
const rAnonDel = await anon.functions.invoke("admin-delete-business", { body: { business_id: id, confirmar_slug: slug } });
ok(!!rAnonDel.error, "anónimo: não consegue excluir");
const rErrado = await admin.functions.invoke("admin-delete-business", { body: { business_id: id, confirmar_slug: "outro-slug" } });
ok(rErrado.error?.context?.status === 400, "slug de confirmação errado → 400, nada é apagado");
ok((await admin.rpc("admin_list_businesses")).data.some((n) => n.id === id), "negócio continua a existir após confirmação errada");
const rDel = await admin.functions.invoke("admin-delete-business", { body: { business_id: id, confirmar_slug: slug } });
ok(!rDel.error && rDel.data?.ok === true, "super admin exclui o negócio");
ok(!(await admin.rpc("admin_list_businesses")).data.some((n) => n.id === id), "negócio já não aparece na lista");
const donoDepois = novo();
ok(!!(await donoDepois.auth.signInWithPassword({ email, password: c.data.senha_temporaria })).error, "conta do proprietário já não entra");
const au = await admin.from("audit_log").select("details").eq("action", "delete_business").order("created_at", { ascending: false }).limit(1);
ok(au.data?.[0]?.details?.slug === slug, "auditoria regista a exclusão (slug e nome, sem dados de clientes)");
const rRepetido = await admin.functions.invoke("admin-delete-business", { body: { business_id: id, confirmar_slug: slug } });
ok(rRepetido.error?.context?.status === 404, "excluir de novo devolve 404");
console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTudo OK");
process.exit(falhas ? 1 : 0);
