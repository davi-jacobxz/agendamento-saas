import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { Props } from "./tipos";
import { Modal } from "../Modal";
import { cancelarMarcacao, erroDono, listarMarcacoes, marcarManual, type Marcacao } from "../../lib/ownerApi";
import { addDaysToDateStr, fmtDayLong, fmtDuracao, fmtTime, lisbonDateInput, lisbonToIso, mondayOf, normalizePhone, startOfDayLisbon, todayLisbon } from "../../lib/format";

export function Agenda({ dados, recarregar }: Props) {
  const [vista, setVista] = useState<"dia" | "semana">("dia");
  const [data, setData] = useState(todayLisbon());
  const [prof, setProf] = useState("todos");
  const [mostrarCanceladas, setMostrarCanceladas] = useState(false);
  const [lista, setLista] = useState<Marcacao[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [nova, setNova] = useState(false);
  const [aCancelar, setACancelar] = useState<Marcacao | null>(null);

  const inicio = vista === "dia" ? data : mondayOf(data);
  const dias = vista === "dia" ? 1 : 7;

  const carregar = useCallback(async () => {
    try {
      setLista(await listarMarcacoes(startOfDayLisbon(inicio), startOfDayLisbon(addDaysToDateStr(inicio, dias))));
      setErro(null);
    } catch (e) { setErro(erroDono(e)); }
  }, [inicio, dias]);
  useEffect(() => { setLista(null); void carregar(); }, [carregar]);

  const nomeServ = (id: string) => dados.servs.find((s) => s.id === id)?.name ?? "—";
  const nomeProf = (id: string) => dados.profs.find((p) => p.id === id)?.name ?? "—";
  const varios = dados.profs.filter((p) => p.active).length > 1;
  const rotulo = dados.negocio.professional_label.toLowerCase();

  const visiveis = useMemo(() => (lista ?? []).filter((m) =>
    (prof === "todos" || m.professional_id === prof) && (mostrarCanceladas || m.status === "confirmado")), [lista, prof, mostrarCanceladas]);

  const porDia = useMemo(() => {
    const g = new Map<string, Marcacao[]>();
    for (let i = 0; i < dias; i++) g.set(addDaysToDateStr(inicio, i), []);
    for (const m of visiveis) g.get(lisbonDateInput(m.inicio))?.push(m);
    return [...g.entries()];
  }, [visiveis, inicio, dias]);

  const passo = (n: number) => setData(addDaysToDateStr(data, n * (vista === "dia" ? 1 : 7)));
  const titulo = vista === "dia" ? fmtDayLong(data) : `${fmtDayLong(inicio)} – ${fmtDayLong(addDaysToDateStr(inicio, 6))}`;

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Vista" className="flex overflow-hidden rounded-lg border border-line">
          {(["dia", "semana"] as const).map((v) => (
            <button key={v} type="button" aria-pressed={vista === v} onClick={() => setVista(v)}
              className={`min-h-[44px] px-5 text-sm font-semibold ${vista === v ? "bg-moss text-white" : "bg-paper"}`}>{v === "dia" ? "Dia" : "Semana"}</button>
          ))}
        </div>
        <button type="button" className="btn-primary btn-sm" onClick={() => setNova(true)}>Nova marcação</button>
      </div>

      <div className="mt-4 flex items-center justify-between gap-2">
        <button type="button" className="btn-ghost btn-sm" aria-label="Anterior" onClick={() => passo(-1)}>←</button>
        <div className="text-center">
          <p className="font-bold first-letter:uppercase">{titulo}</p>
          {data !== todayLisbon() && <button type="button" className="text-sm font-semibold text-moss underline" onClick={() => setData(todayLisbon())}>Voltar a hoje</button>}
        </div>
        <button type="button" className="btn-ghost btn-sm" aria-label="Seguinte" onClick={() => passo(1)}>→</button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
        {dados.profs.length > 1 && (
          <label className="flex items-center gap-2 text-sm font-semibold">Ver
            <select className="field !min-h-[44px] !w-auto" value={prof} onChange={(e) => setProf(e.target.value)}>
              <option value="todos">Todos os {rotulo}s</option>
              {dados.profs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
        )}
        <label className="flex min-h-[44px] items-center gap-2 text-sm">
          <input type="checkbox" className="h-5 w-5 accent-[#2F5D50]" checked={mostrarCanceladas} onChange={(e) => setMostrarCanceladas(e.target.checked)} /> Mostrar canceladas
        </label>
      </div>

      {erro && <div role="alert" className="mt-4 rounded-lg border border-brick/30 bg-brick/5 p-4"><p className="font-semibold text-brick">{erro}</p><button type="button" className="btn-ghost btn-sm mt-3" onClick={() => void carregar()}>Tentar de novo</button></div>}
      {!erro && lista === null && <p className="mt-6 text-mute">A carregar…</p>}

      {lista && (
        <div className="mt-5 space-y-6">
          {porDia.map(([dia, ms]) => (
            <div key={dia}>
              {vista === "semana" && <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-mute">{fmtDayLong(dia)}</h3>}
              {ms.length === 0 ? (
                <p className="rounded-xl border border-dashed border-line bg-paper px-4 py-5 text-center text-mute">Sem marcações.</p>
              ) : (
                <ul className="space-y-3">
                  {ms.map((m) => (
                    <li key={m.id} className={`rounded-xl border border-line bg-paper p-4 ${m.status === "cancelado" ? "opacity-60" : ""}`}>
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-lg font-bold">{fmtTime(m.inicio)}–{fmtTime(m.fim)}</p>
                        <div className="flex flex-wrap justify-end gap-2">
                          {m.origem === "manual" && <span className="rounded-full bg-porcelain px-2.5 py-0.5 text-xs font-semibold text-mute">Manual</span>}
                          {m.status === "cancelado" && <span className="rounded-full bg-brick/10 px-2.5 py-0.5 text-xs font-semibold text-brick">Cancelada</span>}
                        </div>
                      </div>
                      <p className="mt-1 font-semibold">{nomeServ(m.service_id)}{varios && <span className="font-normal text-mute"> · {nomeProf(m.professional_id)}</span>}</p>
                      <p className="mt-1">{m.nome_cliente ?? "Cliente anonimizada"}</p>
                      {m.telefone && (
                        <p className="mt-1 flex flex-wrap items-center gap-x-4 text-sm">
                          <a className="flex min-h-[44px] items-center font-mono underline" href={`tel:${m.telefone}`}>{m.telefone}</a>
                          <a className="flex min-h-[44px] items-center font-semibold text-moss underline" href={`https://wa.me/${m.telefone.replace("+", "")}`} target="_blank" rel="noreferrer">WhatsApp</a>
                        </p>
                      )}
                      {m.status === "confirmado" && new Date(m.fim) > new Date() && (
                        <button type="button" className="btn-ghost btn-sm mt-2 text-brick" onClick={() => setACancelar(m)}>Cancelar marcação</button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      {nova && <NovaMarcacao dados={dados} dataInicial={data} onClose={() => setNova(false)} onFeito={(d) => { setNova(false); setData(d); void carregar(); void recarregar(); }} />}
      {aCancelar && <CancelarModal m={aCancelar} nome={nomeServ(aCancelar.service_id)} onClose={() => setACancelar(null)} onFeito={() => { setACancelar(null); void carregar(); }} />}
    </section>
  );
}

function CancelarModal({ m, nome, onClose, onFeito }: { m: Marcacao; nome: string; onClose: () => void; onFeito: () => void }) {
  const [erro, setErro] = useState<string | null>(null); const [a, setA] = useState(false);
  async function ok() {
    setA(true); setErro(null);
    try { await cancelarMarcacao(m.id); onFeito(); } catch (e) { setErro(erroDono(e)); } finally { setA(false); }
  }
  return (
    <Modal titulo="Cancelar marcação" onClose={onClose}>
      <p>Cancelar <strong>{nome}</strong> de {m.nome_cliente ?? "cliente"} às {fmtTime(m.inicio)}? O horário fica livre. A cliente não é avisada automaticamente.</p>
      {erro && <p role="alert" className="err mt-3">{erro}</p>}
      <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button type="button" className="btn-ghost" onClick={onClose}>Manter</button>
        <button type="button" className="btn-danger" disabled={a} onClick={() => void ok()}>{a ? "A cancelar…" : "Cancelar marcação"}</button>
      </div>
    </Modal>
  );
}

function NovaMarcacao({ dados, dataInicial, onClose, onFeito }: { dados: Props["dados"]; dataInicial: string; onClose: () => void; onFeito: (dia: string) => void }) {
  const ativos = dados.servs.filter((s) => s.active);
  const [serv, setServ] = useState(ativos[0]?.id ?? "");
  const [prof, setProf] = useState("");
  const [dia, setDia] = useState(dataInicial);
  const [hora, setHora] = useState("10:00");
  const [nome, setNome] = useState(""); const [tel, setTel] = useState("");
  const [erro, setErro] = useState<string | null>(null); const [a, setA] = useState(false);

  const possiveis = dados.profs.filter((p) => p.active && dados.ligs.some((l) => l.professional_id === p.id && l.service_id === serv));
  useEffect(() => { if (prof && !possiveis.some((p) => p.id === prof)) setProf(""); }, [serv]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submeter(e: FormEvent) {
    e.preventDefault(); setErro(null);
    if (!serv) { setErro("Escolha um serviço."); return; }
    if (nome.trim().length < 2) { setErro("Indique o nome da cliente."); return; }
    const t = normalizePhone(tel);
    if (!t) { setErro("Indique um número de telefone válido."); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dia) || !/^\d{2}:\d{2}$/.test(hora)) { setErro("Escolha o dia e a hora."); return; }
    setA(true);
    try {
      const r = await marcarManual({ servico: serv, profissional: prof || null, inicio: lisbonToIso(dia, hora), nome: nome.trim(), telefone: t });
      if (!r.ok) { setErro(r.mensagem ?? "Não foi possível marcar."); return; }
      onFeito(dia);
    } catch (e2) { setErro(erroDono(e2)); } finally { setA(false); }
  }

  if (ativos.length === 0) return (
    <Modal titulo="Nova marcação" onClose={onClose}>
      <p>Ainda não tem serviços ativos. Crie um serviço no separador “Serviços”.</p>
      <button type="button" className="btn-ghost mt-4 w-full" onClick={onClose}>Fechar</button>
    </Modal>
  );

  return (
    <Modal titulo="Nova marcação" onClose={onClose}>
      <form onSubmit={submeter} className="space-y-4" noValidate>
        <div>
          <label htmlFor="nm-serv" className="label">Serviço</label>
          <select id="nm-serv" className="field" value={serv} onChange={(e) => setServ(e.target.value)}>
            {ativos.map((s) => <option key={s.id} value={s.id}>{s.name} ({fmtDuracao(s.duration_minutes)})</option>)}
          </select>
        </div>
        {possiveis.length > 1 && (
          <div>
            <label htmlFor="nm-prof" className="label">{dados.negocio.professional_label}</label>
            <select id="nm-prof" className="field" value={prof} onChange={(e) => setProf(e.target.value)}>
              <option value="">Qualquer livre</option>
              {possiveis.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        )}
        {possiveis.length === 0 && <p className="err">Nenhum {dados.negocio.professional_label.toLowerCase()} faz este serviço. Associe-o no separador “Equipa”.</p>}
        <div className="grid grid-cols-2 gap-3">
          <div><label htmlFor="nm-dia" className="label">Dia</label><input id="nm-dia" type="date" className="field" value={dia} onChange={(e) => setDia(e.target.value)} /></div>
          <div><label htmlFor="nm-hora" className="label">Hora</label><input id="nm-hora" type="time" step={300} className="field" value={hora} onChange={(e) => setHora(e.target.value)} /></div>
        </div>
        <div><label htmlFor="nm-nome" className="label">Nome da cliente</label><input id="nm-nome" className="field" value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="off" /></div>
        <div><label htmlFor="nm-tel" className="label">Telemóvel</label><input id="nm-tel" type="tel" inputMode="tel" className="field" value={tel} onChange={(e) => setTel(e.target.value)} placeholder="912 345 678" autoComplete="off" /></div>
        <p className="hint">A marcação manual só verifica se o horário não se sobrepõe a outra marcação. Pode marcar fora do horário normal.</p>
        {erro && <p role="alert" className="err">{erro}</p>}
        <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={a || possiveis.length === 0}>{a ? "A marcar…" : "Marcar"}</button>
        </div>
      </form>
    </Modal>
  );
}
