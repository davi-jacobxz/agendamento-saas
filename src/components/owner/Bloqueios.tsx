import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { Props } from "./tipos";
import { Modal } from "../Modal";
import { apagarBloqueio, contarMarcacoesNoPeriodo, criarBloqueio, erroDono, listarBloqueios, type Bloqueio } from "../../lib/ownerApi";
import { addDaysToDateStr, fmtDate, fmtDateTime, fmtTime, lisbonDateInput, lisbonToIso, startOfDayLisbon, todayLisbon } from "../../lib/format";

function descreve(b: Bloqueio): string {
  const ini = new Date(b.starts_at), fim = new Date(b.ends_at);
  const diaInteiro = fmtTime(b.starts_at) === "00:00" && fmtTime(b.ends_at) === "00:00";
  if (diaInteiro) {
    const ultimo = lisbonDateInput(new Date(fim.getTime() - 3600_000).toISOString());
    const primeiro = lisbonDateInput(b.starts_at);
    return primeiro === ultimo ? `${fmtDate(b.starts_at)} · dia inteiro` : `${fmtDate(b.starts_at)} a ${fmtDate(ultimo === primeiro ? b.ends_at : lisbonToIso(ultimo, "12:00:00"))}`;
  }
  return lisbonDateInput(b.starts_at) === lisbonDateInput(b.ends_at) ? `${fmtDate(b.starts_at)} · ${fmtTime(b.starts_at)}–${fmtTime(b.ends_at)}` : `${fmtDateTime(b.starts_at)} → ${fmtDateTime(b.ends_at)}`;
}

export function Bloqueios({ dados }: Props) {
  const [lista, setLista] = useState<Bloqueio[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [novo, setNovo] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [apagar, setApagar] = useState<Bloqueio | null>(null);

  const carregar = useCallback(async () => {
    try { setLista(await listarBloqueios(new Date().toISOString())); setErro(null); } catch (e) { setErro(erroDono(e)); }
  }, []);
  useEffect(() => { void carregar(); }, [carregar]);

  const nomeProf = (id: string | null) => id ? dados.profs.find((p) => p.id === id)?.name ?? "—" : "Todo o negócio";

  async function confirmarApagar() {
    if (!apagar) return;
    try { await apagarBloqueio(apagar.id); setApagar(null); await carregar(); } catch (e) { setErro(erroDono(e)); setApagar(null); }
  }

  return (
    <section>
      <div className="flex items-center justify-between gap-3">
        <p className="text-mute">Folgas, feriados e horas em que não aceita marcações.</p>
        <button type="button" className="btn-primary btn-sm shrink-0" onClick={() => { setAviso(null); setNovo(true); }}>Novo bloqueio</button>
      </div>
      {aviso && <p role="status" className="mt-4 rounded-lg bg-brass/10 px-4 py-3 font-medium text-brass">{aviso}</p>}
      {erro && <p role="alert" className="err mt-3">{erro}</p>}
      {lista === null && !erro && <p className="mt-6 text-mute">A carregar…</p>}
      {lista && lista.length === 0 && <p className="mt-6 rounded-xl border border-dashed border-line bg-paper px-4 py-8 text-center text-mute">Sem bloqueios futuros.</p>}
      {lista && lista.length > 0 && (
        <ul className="mt-5 divide-y divide-line overflow-hidden rounded-xl border border-line bg-paper">
          {lista.map((b) => (
            <li key={b.id} className="flex items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="font-bold">{descreve(b)}</p>
                <p className="text-sm text-mute">{nomeProf(b.professional_id)}{b.reason ? ` · ${b.reason}` : ""}</p>
              </div>
              <button type="button" className="btn-ghost btn-sm shrink-0 text-brick" onClick={() => setApagar(b)}>Remover</button>
            </li>
          ))}
        </ul>
      )}
      {novo && <NovoBloqueio dados={dados} onClose={() => setNovo(false)} onFeito={async (n) => {
        setNovo(false); await carregar();
        if (n > 0) setAviso(`Atenção: já existem ${n} ${n === 1 ? "marcação confirmada" : "marcações confirmadas"} nesse período. O bloqueio não as cancela: cancele-as na Agenda, se for preciso.`);
      }} />}
      {apagar && (
        <Modal titulo="Remover bloqueio" onClose={() => setApagar(null)}>
          <p>Remover o bloqueio de {descreve(apagar)}? As clientes voltam a poder marcar nesse período.</p>
          <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button type="button" className="btn-ghost" onClick={() => setApagar(null)}>Manter</button>
            <button type="button" className="btn-danger" onClick={() => void confirmarApagar()}>Remover</button>
          </div>
        </Modal>
      )}
    </section>
  );
}

function NovoBloqueio({ dados, onClose, onFeito }: { dados: Props["dados"]; onClose: () => void; onFeito: (conflitos: number) => Promise<void> }) {
  const [quem, setQuem] = useState("");
  const [tipo, setTipo] = useState<"dias" | "horas">("dias");
  const [de, setDe] = useState(todayLisbon()); const [ate, setAte] = useState(todayLisbon());
  const [h1, setH1] = useState("09:00"); const [h2, setH2] = useState("13:00");
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null); const [a, setA] = useState(false);

  async function submeter(e: FormEvent) {
    e.preventDefault(); setErro(null);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(de)) { setErro("Escolha o dia."); return; }
    let starts: string, ends: string;
    if (tipo === "dias") {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(ate) || ate < de) { setErro("O último dia não pode ser antes do primeiro."); return; }
      starts = startOfDayLisbon(de); ends = startOfDayLisbon(addDaysToDateStr(ate, 1));
    } else {
      if (!h1 || !h2 || h2 <= h1) { setErro("A hora de fim tem de ser depois da de início."); return; }
      starts = lisbonToIso(de, h1); ends = lisbonToIso(de, h2);
    }
    if (motivo.length > 120) { setErro("O motivo pode ter no máximo 120 letras."); return; }
    setA(true);
    try {
      const prof = quem || null;
      await criarBloqueio(dados.negocio.id, { professional_id: prof, starts_at: starts, ends_at: ends, reason: motivo.trim() || null });
      await onFeito(await contarMarcacoesNoPeriodo(starts, ends, prof));
    } catch (e2) { setErro(erroDono(e2)); } finally { setA(false); }
  }

  return (
    <Modal titulo="Novo bloqueio" onClose={onClose}>
      <form onSubmit={submeter} className="space-y-4" noValidate>
        {dados.profs.length > 1 && (
          <div><label htmlFor="bl-quem" className="label">Para quem</label>
            <select id="bl-quem" className="field" value={quem} onChange={(e) => setQuem(e.target.value)}>
              <option value="">Todo o negócio</option>
              {dados.profs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select></div>
        )}
        <div role="group" aria-label="Tipo" className="flex overflow-hidden rounded-lg border border-line">
          {([["dias", "Dia(s) inteiro(s)"], ["horas", "Algumas horas"]] as const).map(([v, t]) => (
            <button key={v} type="button" aria-pressed={tipo === v} onClick={() => setTipo(v)} className={`min-h-[48px] flex-1 px-3 text-sm font-semibold ${tipo === v ? "bg-moss text-white" : "bg-paper"}`}>{t}</button>
          ))}
        </div>
        {tipo === "dias" ? (
          <div className="grid grid-cols-2 gap-3">
            <div><label htmlFor="bl-de" className="label">Primeiro dia</label><input id="bl-de" type="date" className="field" value={de} onChange={(e) => { setDe(e.target.value); if (ate < e.target.value) setAte(e.target.value); }} /></div>
            <div><label htmlFor="bl-ate" className="label">Último dia</label><input id="bl-ate" type="date" className="field" min={de} value={ate} onChange={(e) => setAte(e.target.value)} /></div>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            <div><label htmlFor="bl-dia" className="label">Dia</label><input id="bl-dia" type="date" className="field" value={de} onChange={(e) => setDe(e.target.value)} /></div>
            <div><label htmlFor="bl-h1" className="label">Das</label><input id="bl-h1" type="time" className="field" value={h1} onChange={(e) => setH1(e.target.value)} /></div>
            <div><label htmlFor="bl-h2" className="label">Às</label><input id="bl-h2" type="time" className="field" value={h2} onChange={(e) => setH2(e.target.value)} /></div>
          </div>
        )}
        <div><label htmlFor="bl-motivo" className="label">Motivo (opcional)</label><input id="bl-motivo" className="field" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: Feriado, férias" /></div>
        {erro && <p role="alert" className="err">{erro}</p>}
        <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={a}>{a ? "A guardar…" : "Bloquear"}</button>
        </div>
      </form>
    </Modal>
  );
}
