export const MENSAGEM_WHATSAPP_PADRAO = "Olá! Sou {nome} e marquei {servico} para {dia}, às {hora}. Confirmo a marcação.";

export const VARIAVEIS_WHATSAPP: { chave: "nome" | "servico" | "dia" | "hora"; descricao: string }[] = [
  { chave: "nome", descricao: "nome da cliente" },
  { chave: "servico", descricao: "serviço marcado" },
  { chave: "dia", descricao: "dia da marcação" },
  { chave: "hora", descricao: "hora da marcação" },
];

type Vars = { nome: string; servico: string; dia: string; hora: string };

/** Preenche a mensagem pronta do WhatsApp. Variáveis desconhecidas ficam como estão. */
export function montarMensagemWhatsApp(modelo: string | null | undefined, v: Vars): string {
  const base = modelo && modelo.trim() ? modelo : MENSAGEM_WHATSAPP_PADRAO;
  return base.replace(/\{(nome|servico|serviço|dia|hora)\}/gi, (_m, k: string) => {
    const chave = k.toLowerCase().replace("ç", "c") as keyof Vars;
    return v[chave];
  });
}
