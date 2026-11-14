// Avisa o proprietário por e-mail quando uma cliente marca pela página pública.
// O e-mail leva o nome da cliente, o serviço, o dia e a hora (e o profissional, se houver mais de um).
// NUNCA leva o telefone: o proprietário vê-o no painel.
//
// Chamada pelo gatilho do banco (pg_net) logo após a marcação. Não exige JWT, por isso é desenhada para
// ser inofensiva: só atua sobre marcações públicas confirmadas com menos de 10 minutos e envia no máximo
// UM e-mail por marcação (a marcação é "reclamada" de forma atómica antes do envio).
//
// Segredos (Supabase → Edge Functions → Secrets): RESEND_API_KEY, MAIL_FROM, APP_URL (opcional).
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";

const TZ = "Europe/Lisbon";
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

const Body = z.object({ appointment_id: z.string().uuid() });
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const linha = (s: string) => s.replace(/[\r\n]+/g, " ").trim();

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json(405, { erro: "Método não permitido." });

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json(500, { erro: "Configuração em falta no servidor." });

  let raw: unknown;
  try { raw = await req.json(); } catch { return json(400, { erro: "Pedido inválido." }); }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) return json(400, { erro: "Pedido inválido." });

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  // 1) a marcação tem de existir, ser pública, estar confirmada e ser recente
  const { data: ap, error: aErr } = await admin
    .from("appointments")
    .select("id, business_id, professional_id, service_id, inicio, status, origem, criado_em, notificado_em, nome_cliente")
    .eq("id", parsed.data.appointment_id)
    .maybeSingle();
  if (aErr) { console.error("read_appointment_failed", aErr.code); return json(500, { erro: "Erro ao ler a marcação." }); }
  if (!ap || ap.status !== "confirmado" || ap.origem !== "publico") return json(200, { ok: false, motivo: "ignorada" });
  if (Date.now() - new Date(ap.criado_em).getTime() > 10 * 60 * 1000) return json(200, { ok: false, motivo: "antiga" });
  if (ap.notificado_em) return json(200, { ok: true, motivo: "ja_enviado" });

  // 2) sem serviço de e-mail configurado não se faz nada (e não se marca como enviado)
  const resendKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("MAIL_FROM");
  if (!resendKey || !from) return json(200, { ok: false, motivo: "email_nao_configurado" });

  // 3) reclamar a marcação (atómico): só quem conseguir marcar `notificado_em` envia o e-mail
  const { data: claimed, error: cErr } = await admin
    .from("appointments")
    .update({ notificado_em: new Date().toISOString() })
    .eq("id", ap.id)
    .is("notificado_em", null)
    .select("id");
  if (cErr) { console.error("claim_failed", cErr.code); return json(500, { erro: "Erro interno." }); }
  if (!claimed || claimed.length === 0) return json(200, { ok: true, motivo: "ja_enviado" });

  const desfazer = () => admin.from("appointments").update({ notificado_em: null }).eq("id", ap.id);

  // 4) dados para o e-mail (nome da cliente, serviço, dia e hora; nunca o telefone)
  const [{ data: biz }, { data: serv }, { data: profs }, { data: owners }] = await Promise.all([
    admin.from("businesses").select("name").eq("id", ap.business_id).maybeSingle(),
    admin.from("services").select("name").eq("id", ap.service_id).maybeSingle(),
    admin.from("professionals").select("id, name, active").eq("business_id", ap.business_id),
    admin.from("memberships").select("user_id").eq("business_id", ap.business_id).eq("role", "owner"),
  ]);

  const emails: string[] = [];
  for (const o of owners ?? []) {
    const { data: u } = await admin.auth.admin.getUserById(o.user_id);
    if (u?.user?.email) emails.push(u.user.email);
  }
  if (!biz || !serv || emails.length === 0) { await desfazer(); console.error("dados_em_falta"); return json(200, { ok: false, motivo: "sem_destinatario" }); }

  const quando = new Date(ap.inicio);
  const dia = new Intl.DateTimeFormat("pt-PT", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" }).format(quando);
  const hora = new Intl.DateTimeFormat("pt-PT", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(quando);
  const ativos = (profs ?? []).filter((p) => p.active);
  const prof = ativos.length > 1 ? (profs ?? []).find((p) => p.id === ap.professional_id)?.name ?? null : null;
  const appUrl = Deno.env.get("APP_URL") ?? "";

  const cliente = ap.nome_cliente ? linha(ap.nome_cliente) : "uma cliente";
  const assunto = linha(`Nova marcação: ${cliente}, ${serv.name}, ${dia} às ${hora}`);
  const texto = [
    `Tem uma nova marcação em ${linha(biz.name)}.`, "",
    `Cliente: ${cliente}`, `Serviço: ${linha(serv.name)}`, `Quando: ${dia}, às ${hora}`,
    ...(prof ? [`Com: ${linha(prof)}`] : []), "",
    `Veja o telefone e os restantes detalhes no seu painel${appUrl ? `: ${appUrl}` : "."}`,
  ].join("\n");
  const html = `<div style="font-family:system-ui,Segoe UI,sans-serif;font-size:16px;color:#14211f;max-width:480px">
<p>Tem uma nova marcação em <strong>${esc(biz.name)}</strong>.</p>
<p style="margin:16px 0;padding:14px 16px;background:#f2f4f1;border-radius:8px">
<strong>${esc(cliente)}</strong><br>${esc(serv.name)}<br>${esc(dia)}, às ${esc(hora)}${prof ? `<br>Com ${esc(prof)}` : ""}</p>
<p>Veja o telefone e os restantes detalhes no seu painel${appUrl ? `: <a href="${esc(appUrl)}">${esc(appUrl)}</a>` : "."}</p></div>`;

  // 5) enviar (a chave de idempotência impede duplicados mesmo em caso de repetição)
  let res: Response;
  try {
    res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json", "Idempotency-Key": `booking-${ap.id}` },
      body: JSON.stringify({ from, to: emails, subject: assunto, text: texto, html }),
    });
  } catch {
    await desfazer(); console.error("resend_unreachable");
    return json(502, { erro: "Não foi possível enviar o e-mail." });
  }
  if (!res.ok) {
    await desfazer(); console.error("resend_failed", res.status);
    return json(502, { erro: "Não foi possível enviar o e-mail." });
  }
  return json(200, { ok: true });
});
