import type { Negocio } from "../lib/api";

export function estadoDe(n: Pick<Negocio, "status" | "paid_until" | "disponivel">): { texto: string; classe: string } {
  if (n.status === "bloqueado") return { texto: "Bloqueado", classe: "bg-brick/10 text-brick" };
  if (!n.paid_until) return { texto: "Sem data de pagamento", classe: "bg-brass/10 text-brass" };
  if (!n.disponivel) return { texto: "Pagamento vencido", classe: "bg-brass/10 text-brass" };
  return { texto: "Ativo", classe: "bg-moss/10 text-moss" };
}

export function EstadoBadge({ negocio }: { negocio: Pick<Negocio, "status" | "paid_until" | "disponivel"> }) {
  const e = estadoDe(negocio);
  return <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ${e.classe}`}>{e.texto}</span>;
}
