import { useEffect, useState } from "react";
import { listarAuditoria, listarNegocios, mensagemErro, type AuditEntry } from "../lib/api";
import { fmtDateTime } from "../lib/format";

const ACOES: Record<string, string> = {
  create_business_with_owner: "Negócio criado",
  support_view: "Vista de suporte aberta",
  block: "Negócio bloqueado",
  unblock: "Negócio desbloqueado",
  set_paid_until: "“Pago até” alterado",
  delete_business: "Negócio excluído",
};

export function AuditTab({ userId }: { userId: string }) {
  const [itens, setItens] = useState<AuditEntry[] | null>(null);
  const [nomes, setNomes] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([listarAuditoria(), listarNegocios()])
      .then(([a, n]) => { setItens(a); setNomes(Object.fromEntries(n.map((x) => [x.id, x.name]))); })
      .catch((e) => setErro(mensagemErro(e)));
  }, []);

  if (erro) return <p role="alert" className="err">{erro}</p>;
  if (!itens) return <p className="text-mute">A carregar…</p>;
  if (itens.length === 0) return <p className="text-mute">Ainda não há acessos registados.</p>;

  return (
    <section>
      <p className="mb-4 text-mute">Últimas {itens.length} ações de administração.</p>
      <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-paper">
        {itens.map((i) => (
          <li key={i.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3">
            <div>
              <p className="font-semibold">{ACOES[i.action] ?? i.action}</p>
              <p className="text-sm text-mute">{i.business_id ? nomes[i.business_id] ?? "Negócio removido" : typeof i.details?.name === "string" ? `${i.details.name} (/${String(i.details.slug ?? "")})` : "—"} · {i.actor_id === userId ? "Você" : "Outro administrador"}</p>
            </div>
            <time className="text-sm text-mute" dateTime={i.created_at}>{fmtDateTime(i.created_at)}</time>
          </li>
        ))}
      </ul>
    </section>
  );
}
