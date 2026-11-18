import { createClient } from "@supabase/supabase-js";
import { SUPABASE_KEY as key, SUPABASE_URL as url } from "./config";

// Cliente anónimo, sem sessão: a página pública nunca usa a sessão de quem possa estar logado no mesmo browser.
const pub = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });

export interface NegocioPublico {
  nome: string; logo_path: string | null; cover_path: string | null; cor_principal: string;
  texto_boas_vindas: string | null; endereco: string | null; instagram: string | null; whatsapp: string | null; mensagem_whatsapp: string | null;
  rotulo_profissional: string; mensagem_confirmacao: string | null; antecedencia_max_dias: number;
}
export interface ServicoPublico { id: string; nome: string; descricao: string | null; duracao_minutos: number; preco_cents: number; categoria: string | null }
export interface ProfissionalPublico { id: string; nome: string; foto_path: string | null; servicos: string[] }

export type Carregado =
  | { encontrado: false }
  | { encontrado: true; disponivel: false }
  | { encontrado: true; disponivel: true; negocio: NegocioPublico; servicos: ServicoPublico[]; profissionais: ProfissionalPublico[] };

/** O banco devolve "muitas_tentativas" quando um IP faz demasiados pedidos seguidos. */
export const LIMITE = "LIMITE_DE_PEDIDOS";
function falha(error: { message?: string }): never {
  throw new Error(/muitas_tentativas/.test(error.message ?? "") ? LIMITE : "ERRO");
}

export async function carregarNegocio(slug: string): Promise<Carregado> {
  const { data, error } = await pub.rpc("get_public_business", { p_slug: slug });
  if (error) falha(error);
  return data as Carregado;
}

export async function horariosLivres(slug: string, servico: string, profissional: string | null, dia: string): Promise<string[]> {
  const { data, error } = await pub.rpc("get_available_slots", { p_slug: slug, p_service_id: servico, p_professional_id: profissional, p_data: dia });
  if (error) falha(error);
  return ((data ?? []) as { inicio: string }[]).map((r) => r.inicio);
}

export interface ResultadoMarcacao {
  ok: boolean; code?: string; mensagem?: string;
  marcacao?: { id: string; inicio: string; fim: string; servico: string; duracao_minutos: number; preco_cents: number; profissional: string; nome_cliente: string };
  mensagem_confirmacao?: string | null; whatsapp?: string | null; negocio?: string;
}

export async function marcar(a: { slug: string; servico: string; profissional: string | null; inicio: string; nome: string; telefone: string; consentimento: boolean; website: string }): Promise<ResultadoMarcacao> {
  const { data, error } = await pub.rpc("book_appointment", {
    p_slug: a.slug, p_service_id: a.servico, p_professional_id: a.profissional, p_inicio: a.inicio,
    p_nome: a.nome, p_telefone: a.telefone, p_consentimento: a.consentimento, p_website: a.website,
  });
  if (error) throw error;
  return data as ResultadoMarcacao;
}

export function urlImagemPublica(path: string | null): string | null {
  return path ? pub.storage.from("business-assets").getPublicUrl(path).data.publicUrl : null;
}


export type MinhaMarcacao =
  | { encontrada: false }
  | {
      encontrada: true;
      status: "confirmado" | "cancelado";
      inicio: string;
      fim: string;
      servico: string;
      profissional: string;
      pode_cancelar: boolean;
    };

export interface ResultadoCancelamento {
  ok: boolean;
  code?: string;
  mensagem?: string;
  status?: "cancelado";
}

export async function verMinhaMarcacao(slug: string, id: string): Promise<MinhaMarcacao> {
  const { data, error } = await pub.rpc("get_my_appointment", { p_slug: slug, p_id: id });
  if (error) falha(error);
  return data as MinhaMarcacao;
}

export async function cancelarMinhaMarcacao(slug: string, id: string): Promise<ResultadoCancelamento> {
  const { data, error } = await pub.rpc("cancel_my_appointment", { p_slug: slug, p_id: id });
  if (error) falha(error);
  return data as ResultadoCancelamento;
}
