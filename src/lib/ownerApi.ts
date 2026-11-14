import { supabase } from "./supabase";

export interface Negocio3 {
  id: string; slug: string; name: string; status: "ativo" | "bloqueado"; paid_until: string | null;
  logo_path: string | null; cover_path: string | null; primary_color: string;
  welcome_text: string | null; address: string | null; instagram: string | null; whatsapp: string | null; whatsapp_message: string | null;
  professional_label: string; confirmation_message: string | null;
  min_notice_minutes: number; max_advance_days: number; slot_interval_minutes: number; buffer_minutes: number;
}
export interface Profissional { id: string; name: string; photo_path: string | null; active: boolean; position: number }
export interface Servico { id: string; name: string; description: string | null; duration_minutes: number; price_cents: number; buffer_minutes: number; category: string | null; active: boolean; position: number }
export interface Ligacao { professional_id: string; service_id: string }
export interface Horario { id: string; professional_id: string; weekday: number; start_time: string; end_time: string }
export interface Bloqueio { id: string; professional_id: string | null; starts_at: string; ends_at: string; reason: string | null }
export interface Marcacao {
  id: string; professional_id: string; service_id: string; inicio: string; fim: string;
  nome_cliente: string | null; telefone: string | null; status: "confirmado" | "cancelado"; origem: "publico" | "manual";
}

type PgErr = { code?: string; message?: string } | null;

export function erroDono(e: unknown): string {
  const err = e as PgErr;
  if (err?.code === "23503") return "Isto tem marcações associadas e não pode ser apagado. Desative-o em vez de o apagar.";
  if (err?.code === "42501") return "Sem permissão para esta ação.";
  if (err?.code === "23514") return "Algum valor não é válido. Verifique os campos.";
  if (err?.code === "PGRST301" || /jwt/i.test(err?.message ?? "")) return "A sessão expirou. Entre novamente.";
  if (err?.message === "Failed to fetch") return "Sem ligação à internet. Tente novamente.";
  return "Algo correu mal. Tente novamente.";
}

const NEG_COLS = "id, slug, name, status, paid_until, logo_path, cover_path, primary_color, welcome_text, address, instagram, whatsapp, whatsapp_message, professional_label, confirmation_message, min_notice_minutes, max_advance_days, slot_interval_minutes, buffer_minutes";

export async function meuNegocio(): Promise<Negocio3> {
  const { data, error } = await supabase.from("businesses").select(NEG_COLS).single();
  if (error) throw error;
  return data as Negocio3;
}

export type NegocioEditavel = Partial<Omit<Negocio3, "id" | "slug" | "status" | "paid_until">>;
export async function guardarNegocio(id: string, patch: NegocioEditavel): Promise<void> {
  const { error } = await supabase.from("businesses").update(patch).eq("id", id);
  if (error) throw error;
}

// ---------- serviços ----------
export async function listarServicos(): Promise<Servico[]> {
  const { data, error } = await supabase.from("services").select("id, name, description, duration_minutes, price_cents, buffer_minutes, category, active, position").order("position").order("name");
  if (error) throw error;
  return (data ?? []) as Servico[];
}
export type ServicoInput = Omit<Servico, "id" | "position">;
export async function criarServico(businessId: string, v: ServicoInput, posicao: number): Promise<string> {
  const { data, error } = await supabase.from("services").insert({ ...v, business_id: businessId, position: posicao }).select("id").single();
  if (error) throw error;
  return data.id as string;
}
export async function atualizarServico(id: string, v: ServicoInput): Promise<void> {
  const { error } = await supabase.from("services").update(v).eq("id", id);
  if (error) throw error;
}
export async function apagarServico(id: string): Promise<void> {
  const { error } = await supabase.from("services").delete().eq("id", id);
  if (error) throw error;
}
export async function ordenar(tabela: "services" | "professionals", idsNaOrdem: string[]): Promise<void> {
  const r = await Promise.all(idsNaOrdem.map((id, i) => supabase.from(tabela).update({ position: i }).eq("id", id)));
  const e = r.find((x) => x.error)?.error;
  if (e) throw e;
}

// ---------- profissionais ----------
export async function listarProfissionais(): Promise<Profissional[]> {
  const { data, error } = await supabase.from("professionals").select("id, name, photo_path, active, position").order("position").order("name");
  if (error) throw error;
  return (data ?? []) as Profissional[];
}
export async function criarProfissional(businessId: string, v: { name: string; photo_path: string | null; active: boolean }, posicao: number): Promise<string> {
  const { data, error } = await supabase.from("professionals").insert({ ...v, business_id: businessId, position: posicao }).select("id").single();
  if (error) throw error;
  return data.id as string;
}
export async function atualizarProfissional(id: string, v: { name: string; photo_path: string | null; active: boolean }): Promise<void> {
  const { error } = await supabase.from("professionals").update(v).eq("id", id);
  if (error) throw error;
}
export async function apagarProfissional(id: string): Promise<void> {
  const { error } = await supabase.from("professionals").delete().eq("id", id);
  if (error) throw error;
}

// ---------- quem faz o quê ----------
export async function listarLigacoes(): Promise<Ligacao[]> {
  const { data, error } = await supabase.from("professional_services").select("professional_id, service_id");
  if (error) throw error;
  return (data ?? []) as Ligacao[];
}
/** Acrescenta/remove ligações para que `atual` passe a ser exatamente `desejado`. */
export async function definirLigacoes(businessId: string, filtro: { professionalId: string } | { serviceId: string }, atual: string[], desejado: string[]): Promise<void> {
  const mk = (outroId: string) => "professionalId" in filtro
    ? { professional_id: filtro.professionalId, service_id: outroId, business_id: businessId }
    : { professional_id: outroId, service_id: filtro.serviceId, business_id: businessId };
  const adicionar = desejado.filter((x) => !atual.includes(x));
  const remover = atual.filter((x) => !desejado.includes(x));
  if (adicionar.length) {
    const { error } = await supabase.from("professional_services").insert(adicionar.map(mk));
    if (error) throw error;
  }
  for (const id of remover) {
    const q = supabase.from("professional_services").delete();
    const { error } = "professionalId" in filtro
      ? await q.eq("professional_id", filtro.professionalId).eq("service_id", id)
      : await q.eq("service_id", filtro.serviceId).eq("professional_id", id);
    if (error) throw error;
  }
}

// ---------- horários ----------
export async function listarHorarios(): Promise<Horario[]> {
  const { data, error } = await supabase.from("working_hours").select("id, professional_id, weekday, start_time, end_time");
  if (error) throw error;
  return (data ?? []) as Horario[];
}
/** Insere os novos e só depois apaga os antigos: se algo falhar, nunca se perde o horário. */
export async function substituirHorarios(businessId: string, professionalId: string, antigos: string[], novos: { weekday: number; start_time: string; end_time: string }[]): Promise<void> {
  if (novos.length) {
    const { error } = await supabase.from("working_hours").insert(novos.map((n) => ({ ...n, business_id: businessId, professional_id: professionalId })));
    if (error) throw error;
  }
  if (antigos.length) {
    const { error } = await supabase.from("working_hours").delete().in("id", antigos);
    if (error) throw error;
  }
}

// ---------- bloqueios ----------
export async function listarBloqueios(desdeIso: string): Promise<Bloqueio[]> {
  const { data, error } = await supabase.from("blocked_times").select("id, professional_id, starts_at, ends_at, reason").gte("ends_at", desdeIso).order("starts_at");
  if (error) throw error;
  return (data ?? []) as Bloqueio[];
}
export async function criarBloqueio(businessId: string, v: { professional_id: string | null; starts_at: string; ends_at: string; reason: string | null }): Promise<void> {
  const { error } = await supabase.from("blocked_times").insert({ ...v, business_id: businessId });
  if (error) throw error;
}
export async function apagarBloqueio(id: string): Promise<void> {
  const { error } = await supabase.from("blocked_times").delete().eq("id", id);
  if (error) throw error;
}
export async function contarMarcacoesNoPeriodo(startsAt: string, endsAt: string, professionalId: string | null): Promise<number> {
  let q = supabase.from("appointments").select("id", { count: "exact", head: true }).eq("status", "confirmado").lt("inicio", endsAt).gt("fim", startsAt);
  if (professionalId) q = q.eq("professional_id", professionalId);
  const { count, error } = await q;
  if (error) throw error;
  return count ?? 0;
}

// ---------- marcações ----------
export async function listarMarcacoes(deIso: string, ateIso: string): Promise<Marcacao[]> {
  const { data, error } = await supabase.from("appointments")
    .select("id, professional_id, service_id, inicio, fim, nome_cliente, telefone, status, origem")
    .gte("inicio", deIso).lt("inicio", ateIso).order("inicio");
  if (error) throw error;
  return (data ?? []) as Marcacao[];
}
export async function cancelarMarcacao(id: string): Promise<void> {
  const { error } = await supabase.from("appointments").update({ status: "cancelado" }).eq("id", id);
  if (error) throw error;
}
export async function marcarManual(a: { servico: string; profissional: string | null; inicio: string; nome: string; telefone: string }): Promise<{ ok: boolean; mensagem?: string }> {
  const { data, error } = await supabase.rpc("owner_create_appointment", {
    p_service_id: a.servico, p_professional_id: a.profissional, p_inicio: a.inicio, p_nome: a.nome, p_telefone: a.telefone,
  });
  if (error) throw error;
  const r = data as { ok: boolean; mensagem?: string };
  return { ok: !!r.ok, mensagem: r.mensagem };
}
export async function apagarDadosCliente(telefone: string): Promise<number> {
  const { data, error } = await supabase.rpc("owner_erase_client_data", { p_telefone: telefone });
  if (error) throw error;
  return Number(data ?? 0);
}

// ---------- imagens ----------
const BUCKET = "business-assets";
export const IMG_MAX_BYTES = 1024 * 1024;
export const IMG_TIPOS: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

export function urlImagem(path: string | null): string | null {
  return path ? supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl : null;
}
export async function enviarImagem(businessId: string, prefixo: string, file: File): Promise<string> {
  const ext = IMG_TIPOS[file.type];
  if (!ext) throw new Error("Use uma imagem PNG, JPG ou WebP.");
  if (file.size > IMG_MAX_BYTES) throw new Error("A imagem tem mais de 1 MB. Escolha uma mais pequena.");
  const path = `${businessId}/${prefixo}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, cacheControl: "3600", upsert: false });
  if (error) throw new Error("Não foi possível enviar a imagem. Tente novamente.");
  return path;
}
export async function apagarImagem(path: string | null): Promise<void> {
  if (path) await supabase.storage.from(BUCKET).remove([path]);
}

// ---------- conta ----------
export async function trocarPalavraPasse(nova: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password: nova, data: { must_change_password: false } });
  if (error) throw error;
}
