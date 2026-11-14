import { useEffect, useRef, useState } from "react";
import { Modal } from "./Modal";
import { abrirVistaSuporte, mensagemErro, type SupportData } from "../lib/api";
import { fmtDate, fmtDateTime, fmtDuracao } from "../lib/format";
import { EstadoBadge } from "./Estado";

const DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const euros = (c: number) => new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(c / 100);
const hhmm = (t: string) => t.slice(0, 5);

export function SupportView({ businessId, onClose }: { businessId: string; onClose: () => void }) {
  const [dados, setDados] = useState<SupportData | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aCarregar, setACarregar] = useState(true);
  const jaAbriu = useRef(false); // cada abertura gera UM registo de auditoria

  useEffect(() => {
    if (jaAbriu.current) return;
    jaAbriu.current = true;
    abrirVistaSuporte(businessId)
      .then((d) => { if (!d) setErro("Negócio não encontrado."); setDados(d); })
      .catch((e) => setErro(mensagemErro(e)))
      .finally(() => setACarregar(false));
  }, [businessId]);

  const nomeProf = (id: string) => dados?.profissionais.find((p) => p.id === id)?.name ?? "—";
  const nomeServ = (id: string) => dados?.servicos.find((s) => s.id === id)?.name ?? "—";

  return (
    <Modal titulo={dados ? `Suporte · ${dados.negocio.name}` : "Vista de suporte"} onClose={onClose} largo>
      <p className="rounded-lg bg-brass/10 px-4 py-3 text-sm font-medium text-brass">
        Só leitura. Este acesso ficou registado. Os telefones aparecem mascarados.
      </p>
      {aCarregar && <p className="mt-4 text-mute">A carregar…</p>}
      {erro && <p role="alert" className="err mt-4">{erro}</p>}
      {dados && (
        <div className="mt-5 space-y-7">
          <section>
            <h3 className="mb-2 text-base font-bold">Negócio</h3>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <EstadoBadge negocio={{ status: dados.negocio.status as "ativo" | "bloqueado", paid_until: dados.negocio.paid_until, disponivel: dados.negocio.status === "ativo" && !!dados.negocio.paid_until && new Date(dados.negocio.paid_until) > new Date() }} />
              <span className="text-sm text-mute">Pago até {fmtDate(dados.negocio.paid_until)}</span>
              <span className="text-sm text-mute">/{dados.negocio.slug}</span>
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-base font-bold">Profissionais ({dados.profissionais.length})</h3>
            {dados.profissionais.length === 0 ? <p className="text-mute">Sem profissionais.</p> : (
              <ul className="space-y-3">
                {dados.profissionais.map((p) => {
                  const h = dados.horarios.filter((x) => x.professional_id === p.id)
                    .sort((a, b) => a.weekday - b.weekday || a.start_time.localeCompare(b.start_time));
                  return (
                    <li key={p.id} className="rounded-lg border border-line bg-white p-3">
                      <p className="font-semibold">{p.name}{!p.active && <span className="ml-2 text-sm font-normal text-mute">(inativo)</span>}</p>
                      {h.length === 0 ? <p className="text-sm text-mute">Sem horário definido.</p> : (
                        <ul className="mt-1 text-sm text-mute">
                          {h.map((x, i) => <li key={i}>{DIAS[x.weekday]}: {hhmm(x.start_time)}–{hhmm(x.end_time)}</li>)}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section>
            <h3 className="mb-2 text-base font-bold">Serviços ({dados.servicos.length})</h3>
            {dados.servicos.length === 0 ? <p className="text-mute">Ainda sem serviços.</p> : (
              <ul className="divide-y divide-line rounded-lg border border-line bg-white">
                {dados.servicos.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <span>{s.name}{!s.active && <span className="ml-2 text-sm text-mute">(inativo)</span>}</span>
                    <span className="shrink-0 text-sm text-mute">{fmtDuracao(s.duration_minutes)} · {euros(s.price_cents)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h3 className="mb-2 text-base font-bold">Bloqueios ({dados.bloqueios.length})</h3>
            {dados.bloqueios.length === 0 ? <p className="text-mute">Sem bloqueios.</p> : (
              <ul className="space-y-1 text-sm">
                {dados.bloqueios.map((b) => <li key={b.id}>{fmtDateTime(b.starts_at)} → {fmtDateTime(b.ends_at)}{b.reason ? ` · ${b.reason}` : ""}</li>)}
              </ul>
            )}
          </section>

          <section>
            <h3 className="mb-1 text-base font-bold">Marcações ({dados.marcacoes.length})</h3>
            <p className="mb-2 text-sm text-mute">Últimos 7 dias e próximos 30.</p>
            {dados.marcacoes.length === 0 ? <p className="text-mute">Sem marcações neste período.</p> : (
              <ul className="divide-y divide-line rounded-lg border border-line bg-white">
                {dados.marcacoes.map((m) => (
                  <li key={m.id} className={`px-3 py-2 ${m.status === "cancelado" ? "opacity-60" : ""}`}>
                    <p className="font-semibold">{fmtDateTime(m.inicio)}{m.status === "cancelado" && <span className="ml-2 text-sm font-normal text-brick">cancelada</span>}</p>
                    <p className="text-sm text-mute">{nomeServ(m.service_id)} · {nomeProf(m.professional_id)}</p>
                    <p className="text-sm">{m.nome_cliente ?? "Cliente anonimizada"} · <span className="font-mono">{m.telefone ?? "—"}</span></p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </Modal>
  );
}
