import { supabase } from "./supabase";
import { endOfDayLisbon } from "./format";
import type { NovoNegocio } from "./schemas";

export interface Negocio {
  id: string; slug: string; name: string; contacto: string | null; status: "ativo" | "bloqueado";
  paid_until: string | null; created_at: string; total_marcacoes: number; disponivel: boolean;
}

export interface AuditEntry {
  id: number; actor_id: string | null; business_id: string | null; action: string;
  details: Record<string, unknown>; created_at: string;
}

export interface SupportData {
  negocio: Record<string, unknown> & { id: string; name: string; slug: string; status: string; paid_until: string | null };
  profissionais: { id: string; name: string; active: boolean }[];
  servicos: { id: string; name: string; duration_minutes: number; price_cents: number; active: boolean }[];
  horarios: { professional_id: string; weekday: number; start_time: string; end_time: string }[];
  bloqueios: { id: string; starts_at: string; ends_at: string; reason: string | null; professional_id: string | null }[];
  marcacoes: { id: string; inicio: string; fim: string; status: string; professional_id: string; service_id: string; nome_cliente: string | null; telefone: string | null }[];
}

type PgError = { code?: string; message?: string } | null;

export function mensagemErro(e: PgError | unknown): string {
  const err = e as PgError;
  if (err?.code === "42501") return "Sem permissão para esta ação.";
  if (err?.code === "PGRST301" || /jwt/i.test(err?.message ?? "")) return "A sessão expirou. Entre novamente.";
  if (err?.message === "Failed to fetch") return "Sem ligação à internet. Tente novamente.";
  return "Algo correu mal. Tente novamente.";
}

export async function listarNegocios(): Promise<Negocio[]> {
  const { data, error } = await supabase.rpc("admin_list_businesses");
  if (error) throw error;
  return (data ?? []).map((n: Negocio) => ({ ...n, total_marcacoes: Number(n.total_marcacoes) }));
}

export async function definirBloqueio(id: string, bloqueado: boolean): Promise<void> {
  const { error } = await supabase.rpc("admin_set_blocked", { p_business_id: id, p_blocked: bloqueado });
  if (error) throw error;
}

export async function definirPagoAte(id: string, dataYmd: string): Promise<void> {
  const { error } = await supabase.rpc("admin_set_paid_until", {
    p_business_id: id, p_paid_until: endOfDayLisbon(dataYmd),
  });
  if (error) throw error;
}

export async function abrirVistaSuporte(id: string): Promise<SupportData | null> {
  const { data, error } = await supabase.rpc("admin_open_support_view", { p_business_id: id });
  if (error) throw error;
  return data as SupportData | null;
}

export async function listarAuditoria(): Promise<AuditEntry[]> {
  const { data, error } = await supabase
    .from("audit_log")
    .select("id, actor_id, business_id, action, details, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as AuditEntry[];
}

export interface NegocioCriado { business_id: string; slug: string; owner_user_id: string; senha_temporaria: string }

export async function criarNegocio(v: NovoNegocio): Promise<NegocioCriado> {
  const { data, error } = await supabase.functions.invoke("admin-create-business", {
    body: {
      nome: v.nome, slug: v.slug, contacto: v.contacto?.trim() || null,
      pago_ate: endOfDayLisbon(v.pagoAte), email_proprietario: v.email,
    },
  });
  if (error) {
    // A Edge Function devolve { erro: "..." } em português; mostramos essa mensagem.
    let msg = "Não foi possível criar o negócio. Tente novamente.";
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      try { const j = await ctx.json(); if (j?.erro) msg = String(j.erro); } catch { /* mantém a mensagem geral */ }
    }
    throw new Error(msg);
  }
  return data as NegocioCriado;
}

export async function obterPapel(userId: string): Promise<"super_admin" | "owner" | null> {
  const { data, error } = await supabase.from("memberships").select("role").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return (data?.role as "super_admin" | "owner" | undefined) ?? null;
}

export async function excluirNegocio(id: string, confirmarSlug: string): Promise<{ marcacoes_apagadas: number }> {
  const { data, error } = await supabase.functions.invoke("admin-delete-business", {
    body: { business_id: id, confirmar_slug: confirmarSlug },
  });
  if (error) {
    let msg = "Não foi possível excluir o negócio. Tente novamente.";
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      try { const j = await ctx.json(); if (j?.erro) msg = String(j.erro); } catch { /* mantém a mensagem geral */ }
    }
    throw new Error(msg);
  }
  return data as { marcacoes_apagadas: number };
}

export async function obterPapelCompleto(userId: string): Promise<{ papel: "super_admin" | "owner" | null; businessId: string | null }> {
  const { data, error } = await supabase.from("memberships").select("role, business_id").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return { papel: (data?.role as "super_admin" | "owner" | undefined) ?? null, businessId: (data?.business_id as string | null | undefined) ?? null };
}
