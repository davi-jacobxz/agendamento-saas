import { useCallback, useEffect, useState } from "react";
import { definirBloqueio, listarNegocios, mensagemErro, type Negocio, type NegocioCriado } from "../lib/api";
import { fmtDate } from "../lib/format";
import { EstadoBadge } from "./Estado";
import { NovoNegocioModal } from "./NovoNegocioModal";
import { CredenciaisModal } from "./CredenciaisModal";
import { PagoAteModal } from "./PagoAteModal";
import { SupportView } from "./SupportView";
import { Modal } from "./Modal";
import { ExcluirModal } from "./ExcluirModal";

export function NegociosTab() {
  const [lista, setLista] = useState<Negocio[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [novo, setNovo] = useState(false);
  const [criado, setCriado] = useState<{ dados: NegocioCriado; email: string } | null>(null);
  const [pagoAte, setPagoAte] = useState<Negocio | null>(null);
  const [suporte, setSuporte] = useState<string | null>(null);
  const [aBloquear, setABloquear] = useState<Negocio | null>(null);
  const [aExcluir, setAExcluir] = useState<Negocio | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [aGuardar, setAGuardar] = useState(false);
  const [erroAcao, setErroAcao] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try { setLista(await listarNegocios()); setErro(null); }
    catch (e) { setErro(mensagemErro(e)); }
  }, []);
  useEffect(() => { void carregar(); }, [carregar]);

  async function confirmarBloqueio() {
    if (!aBloquear) return;
    setAGuardar(true); setErroAcao(null);
    try { await definirBloqueio(aBloquear.id, aBloquear.status !== "bloqueado"); setABloquear(null); await carregar(); }
    catch (e) { setErroAcao(mensagemErro(e)); }
    finally { setAGuardar(false); }
  }

  const indisponiveis = lista?.filter((n) => !n.disponivel).length ?? 0;

  return (
    <section>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-mute">
          {lista === null ? "A carregar…" : `${lista.length} ${lista.length === 1 ? "negócio" : "negócios"}${indisponiveis ? ` · ${indisponiveis} sem serviço` : ""}`}
        </p>
        <button type="button" className="btn-primary" onClick={() => setNovo(true)}>Novo negócio</button>
      </div>

      {aviso && <p role="status" className="mt-4 rounded-lg bg-moss/10 px-4 py-3 font-semibold text-moss">{aviso}</p>}

      {erro && (
        <div role="alert" className="mt-4 rounded-lg border border-brick/30 bg-brick/5 p-4">
          <p className="font-semibold text-brick">{erro}</p>
          <button type="button" className="btn-ghost btn-sm mt-3" onClick={() => void carregar()}>Tentar de novo</button>
        </div>
      )}

      {lista && lista.length === 0 && (
        <div className="mt-6 rounded-xl border border-dashed border-line bg-paper p-8 text-center">
          <p className="text-lg font-semibold">Ainda não há negócios.</p>
          <p className="mt-1 text-mute">Crie o primeiro para gerar a conta do proprietário.</p>
          <button type="button" className="btn-primary mt-5" onClick={() => setNovo(true)}>Criar o primeiro negócio</button>
        </div>
      )}

      {lista && lista.length > 0 && (
        <ul className="mt-5 divide-y divide-line overflow-hidden rounded-xl border border-line bg-paper">
          {lista.map((n) => (
            <li key={n.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-lg font-bold">{n.name}</p>
                  <p className="text-sm text-mute">/{n.slug}{n.contacto ? ` · ${n.contacto}` : ""}</p>
                </div>
                <EstadoBadge negocio={n} />
              </div>
              <dl className="mt-3 grid grid-cols-3 gap-3 text-sm">
                <div><dt className="text-mute">Criado em</dt><dd className="font-semibold">{fmtDate(n.created_at)}</dd></div>
                <div><dt className="text-mute">Pago até</dt><dd className="font-semibold">{fmtDate(n.paid_until)}</dd></div>
                <div><dt className="text-mute">Marcações</dt><dd className="font-semibold">{n.total_marcacoes}</dd></div>
              </dl>
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" className="btn-ghost btn-sm" onClick={() => setPagoAte(n)}>Alterar “pago até”</button>
                <button type="button" className="btn-ghost btn-sm" onClick={() => setSuporte(n.id)}>Ver (suporte)</button>
                <button type="button" className={`${n.status === "bloqueado" ? "btn-ghost" : "btn-ghost text-brick"} btn-sm`} onClick={() => { setErroAcao(null); setABloquear(n); }}>
                  {n.status === "bloqueado" ? "Desbloquear" : "Bloquear"}
                </button>
                <button type="button" className="btn-ghost btn-sm text-brick" onClick={() => setAExcluir(n)}>Excluir</button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {novo && <NovoNegocioModal onClose={() => setNovo(false)} onCriado={(dados, email) => { setNovo(false); setCriado({ dados, email }); void carregar(); }} />}
      {criado && <CredenciaisModal dados={criado.dados} email={criado.email} onClose={() => setCriado(null)} />}
      {pagoAte && <PagoAteModal negocio={pagoAte} onClose={() => setPagoAte(null)} onGuardado={() => { setPagoAte(null); void carregar(); }} />}
      {suporte && <SupportView businessId={suporte} onClose={() => setSuporte(null)} />}
      {aExcluir && (
        <ExcluirModal negocio={aExcluir} onClose={() => setAExcluir(null)}
          onExcluido={() => { setAviso(`${aExcluir.name} foi excluído.`); setAExcluir(null); void carregar(); }} />
      )}
      {aBloquear && (
        <Modal titulo={aBloquear.status === "bloqueado" ? "Desbloquear negócio" : "Bloquear negócio"} onClose={() => setABloquear(null)}>
          <p>
            {aBloquear.status === "bloqueado"
              ? `${aBloquear.name} volta a poder receber marcações (se o “pago até” estiver em dia).`
              : `${aBloquear.name} passa a mostrar “Serviço indisponível” e deixa de aceitar marcações. O proprietário vê um aviso no painel.`}
          </p>
          {erroAcao && <p role="alert" className="err mt-3">{erroAcao}</p>}
          <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button type="button" className="btn-ghost" onClick={() => setABloquear(null)}>Cancelar</button>
            <button type="button" className={aBloquear.status === "bloqueado" ? "btn-primary" : "btn-danger"} disabled={aGuardar} onClick={() => void confirmarBloqueio()}>
              {aGuardar ? "A guardar…" : aBloquear.status === "bloqueado" ? "Desbloquear" : "Bloquear"}
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
