// Exclui DEFINITIVAMENTE um negócio: marcações, dados do negócio e conta(s) de proprietário.
// SÓ o super admin pode chamar. Exige o endereço (slug) do negócio como confirmação.
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
  business_id: z.string().uuid(),
  confirmar_slug: z.string().trim().toLowerCase().min(1).max(60),
});

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
  if (!parsed.success) return json(400, { erro: "Pedido inválido." });
  const { business_id, confirmar_slug } = parsed.data;

  // 3) o negócio existe e a confirmação bate certo
  const { data: biz, error: bErr } = await admin
    .from("businesses")
    .select("id, slug, name")
    .eq("id", business_id)
    .maybeSingle();
  if (bErr) return json(500, { erro: "Não foi possível ler o negócio." });
  if (!biz) return json(404, { erro: "Negócio não encontrado. Pode já ter sido excluído." });
  if (biz.slug !== confirmar_slug) {
    return json(400, { erro: "O endereço escrito não corresponde ao do negócio." });
  }

  // 4) contas ligadas ao negócio. Só se apagam contas de proprietário; nunca super admins.
  const { data: ms, error: msErr } = await admin
    .from("memberships")
    .select("user_id, role")
    .eq("business_id", biz.id);
  if (msErr) return json(500, { erro: "Não foi possível ler as contas do negócio." });
  if ((ms ?? []).some((x) => x.role !== "owner")) {
    return json(409, { erro: "Este negócio tem uma conta que não é de proprietário. Não pode ser excluído por aqui." });
  }
  const donos = (ms ?? []).map((x) => x.user_id).filter((id) => id !== u.user.id);

  // 5) apagar as contas de login (primeiro, para que uma nova tentativa seja sempre segura).
  //    Se o dono tiver ligação a OUTRO negócio, a conta é mantida e só a ligação a este desaparece.
  for (const uid of donos) {
    const { count, error: cErr } = await admin
      .from("memberships")
      .select("user_id", { count: "exact", head: true })
      .eq("user_id", uid)
      .neq("business_id", biz.id);
    if (cErr) { console.error("count_memberships_failed", cErr.code); return json(500, { erro: "Não foi possível concluir a exclusão. Tente novamente." }); }
    if ((count ?? 0) > 0) continue;
    const { error: dErr } = await admin.auth.admin.deleteUser(uid);
    if (dErr) { console.error("delete_user_failed", dErr.status); return json(500, { erro: "Não foi possível apagar a conta do proprietário. Tente novamente." }); }
  }

  // 6) apagar as marcações (o banco bloqueia apagar o negócio enquanto existirem)
  const { count: apagadas, error: aErr } = await admin
    .from("appointments")
    .delete({ count: "exact" })
    .eq("business_id", biz.id);
  if (aErr) { console.error("delete_appointments_failed", aErr.code); return json(500, { erro: "Não foi possível apagar as marcações. Tente novamente." }); }

  // 7) apagar o negócio (serviços, profissionais, horários, bloqueios e ligações caem em cascata)
  const { error: delErr } = await admin.from("businesses").delete().eq("id", biz.id);
  if (delErr) { console.error("delete_business_failed", delErr.code); return json(500, { erro: "Não foi possível apagar o negócio. Tente novamente." }); }

  // 8) auditoria (sem e-mails, telefones nem nomes de clientes)
  const { error: auErr } = await admin.from("audit_log").insert({
    actor_id: u.user.id,
    business_id: null,
    action: "delete_business",
    details: { slug: biz.slug, name: biz.name, marcacoes_apagadas: apagadas ?? 0 },
  });
  if (auErr) console.error("audit_failed", auErr.code);

  return json(200, { ok: true, marcacoes_apagadas: apagadas ?? 0 });
});
