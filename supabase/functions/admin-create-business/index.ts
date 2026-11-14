// Cria um negócio + a conta do proprietário. SÓ o super admin pode chamar.
// Usa a service role key, que existe apenas aqui (Edge Function), nunca no browser.
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const Body = z.object({
  nome: z.string().trim().min(2).max(80),
  slug: z.string().trim().toLowerCase().min(3).max(40).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  contacto: z.string().trim().max(120).nullish(),
  pago_ate: z.string().datetime({ offset: true }),
  email_proprietario: z.string().trim().toLowerCase().email().max(254),
});

function gerarSenha(): string {
  const alfabeto = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => alfabeto[b % alfabeto.length]).join("");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json(405, { erro: "Método não permitido." });

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json(500, { erro: "Configuração em falta no servidor." });

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1) quem chama? tem de ser super admin
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: u, error: uErr } = await admin.auth.getUser(token);
  if (uErr || !u?.user) return json(401, { erro: "Sessão inválida. Entre novamente." });

  const { data: m, error: mErr } = await admin
    .from("memberships")
    .select("role")
    .eq("user_id", u.user.id)
    .eq("role", "super_admin")
    .maybeSingle();
  if (mErr) return json(500, { erro: "Não foi possível verificar permissões." });
  if (!m) return json(403, { erro: "Sem permissão para esta ação." });

  // 2) validar o pedido
  let raw: unknown;
  try { raw = await req.json(); } catch { return json(400, { erro: "Pedido inválido." }); }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return json(400, { erro: "Dados inválidos. Verifique o nome, o endereço (slug), a data e o e-mail." });
  }
  const b = parsed.data;

  // 3) criar o negócio (o trigger cria o 1.º profissional e o horário base)
  const { data: biz, error: bErr } = await admin
    .from("businesses")
    .insert({
      name: b.nome,
      slug: b.slug,
      contacto: b.contacto?.trim() ? b.contacto.trim() : null,
      paid_until: b.pago_ate,
    })
    .select("id, slug")
    .single();
  if (bErr || !biz) {
    if (bErr?.code === "23505") return json(409, { erro: "Esse endereço (slug) já está em uso." });
    if (bErr?.code === "23514") return json(400, { erro: "Endereço (slug) inválido ou reservado." });
    console.error("create_business_failed", bErr?.code);
    return json(500, { erro: "Não foi possível criar o negócio." });
  }

  // 4) criar a conta do proprietário (senha temporária mostrada UMA vez ao super admin)
  const senha = gerarSenha();
  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email: b.email_proprietario,
    password: senha,
    email_confirm: true,
    user_metadata: { must_change_password: true },
  });
  if (cErr || !created?.user) {
    await admin.from("businesses").delete().eq("id", biz.id); // desfaz
    const jaExiste = cErr?.status === 422 || /already|registered|exists/i.test(cErr?.message ?? "");
    if (jaExiste) return json(409, { erro: "Já existe uma conta com esse e-mail." });
    console.error("create_user_failed", cErr?.status);
    return json(500, { erro: "Não foi possível criar a conta do proprietário." });
  }

  // 5) ligar o proprietário ao negócio
  const { error: msErr } = await admin
    .from("memberships")
    .insert({ user_id: created.user.id, business_id: biz.id, role: "owner" });
  if (msErr) {
    await admin.auth.admin.deleteUser(created.user.id); // desfaz
    await admin.from("businesses").delete().eq("id", biz.id);
    console.error("membership_failed", msErr.code);
    return json(500, { erro: "Não foi possível associar o proprietário ao negócio." });
  }

  // 6) auditoria (sem e-mails nem senhas)
  await admin.from("audit_log").insert({
    actor_id: u.user.id,
    business_id: biz.id,
    action: "create_business_with_owner",
  });

  return json(201, {
    business_id: biz.id,
    slug: biz.slug,
    owner_user_id: created.user.id,
    senha_temporaria: senha,
  });
});
