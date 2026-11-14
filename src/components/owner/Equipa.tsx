import { useState, type FormEvent } from "react";
import type { Props } from "./tipos";
import { Modal } from "../Modal";
import { ImageField } from "./ImageField";
import { apagarImagem, apagarProfissional, atualizarProfissional, criarProfissional, definirLigacoes, enviarImagem, erroDono, ordenar, substituirHorarios, urlImagem, type Profissional } from "../../lib/ownerApi";

const DIAS: [number, string][] = [[1, "Segunda"], [2, "Terça"], [3, "Quarta"], [4, "Quinta"], [5, "Sexta"], [6, "Sábado"], [0, "Domingo"]];
type Intervalo = { start: string; end: string };
type Semana = Record<number, Intervalo[]>;

/** Devolve a mensagem do primeiro problema (fim antes do início, sobreposição) ou null. */
/** Define o mesmo horário (um só intervalo) nos dias indicados; os outros dias ficam como estão. */
export function aplicarHorario(s: Semana, dias: number[], start: string, end: string): Semana {
  const n: Semana = { ...s };
  for (const d of dias) n[d] = [{ start, end }];
  return n;
}

export function validarSemana(s: Semana): string | null {
  for (const [d, nome] of DIAS) {
    const v = [...(s[d] ?? [])].sort((a, b) => a.start.localeCompare(b.start));
    for (let i = 0; i < v.length; i++) {
      if (!/^\d{2}:\d{2}$/.test(v[i].start) || !/^\d{2}:\d{2}$/.test(v[i].end)) return `${nome}: preencha as horas.`;
      if (v[i].end <= v[i].start) return `${nome}: a hora de fim tem de ser depois da de início.`;
      if (i > 0 && v[i].start < v[i - 1].end) return `${nome}: os intervalos não podem sobrepor-se.`;
    }
  }
  return null;
}

export function Equipa({ dados, recarregar }: Props) {
  const [edit, setEdit] = useState<Profissional | "novo" | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const rot = dados.negocio.professional_label;

  async function mover(i: number, d: -1 | 1) {
    const ids = dados.profs.map((p) => p.id); const j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    try { await ordenar("professionals", ids); await recarregar(); setErro(null); } catch (e) { setErro(erroDono(e)); }
  }

  return (
    <section>
      <div className="flex items-center justify-between gap-3">
        <p className="text-mute">{dados.profs.length} {dados.profs.length === 1 ? rot.toLowerCase() : "profissionais"}</p>
        <button type="button" className="btn-primary btn-sm" onClick={() => setEdit("novo")}>Adicionar {rot.toLowerCase()}</button>
      </div>
      {erro && <p role="alert" className="err mt-3">{erro}</p>}
      <ul className="mt-5 divide-y divide-line overflow-hidden rounded-xl border border-line bg-paper">
        {dados.profs.map((p, i) => {
          const n = dados.ligs.filter((l) => l.professional_id === p.id).length;
          const foto = urlImagem(p.photo_path);
          return (
            <li key={p.id} className={`flex items-center gap-3 p-4 ${p.active ? "" : "opacity-60"}`}>
              <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-white font-bold text-mute">
                {foto ? <img src={foto} alt="" className="h-full w-full object-cover" /> : p.name.slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{p.name}{!p.active && <span className="ml-2 text-sm font-normal text-mute">(inativo)</span>}</p>
                <p className="text-sm text-mute">{n} {n === 1 ? "serviço" : "serviços"}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button type="button" aria-label={`Subir ${p.name}`} disabled={i === 0} className="btn-ghost btn-sm !px-3" onClick={() => void mover(i, -1)}>↑</button>
                <button type="button" aria-label={`Descer ${p.name}`} disabled={i === dados.profs.length - 1} className="btn-ghost btn-sm !px-3" onClick={() => void mover(i, 1)}>↓</button>
                <button type="button" className="btn-ghost btn-sm" onClick={() => setEdit(p)}>Editar</button>
              </div>
            </li>
          );
        })}
      </ul>
      {edit && <ProfModal dados={dados} prof={edit === "novo" ? null : edit} onClose={() => setEdit(null)} onFeito={async () => { setEdit(null); await recarregar(); }} />}
    </section>
  );
}

function ProfModal({ dados, prof, onClose, onFeito }: { dados: Props["dados"]; prof: Profissional | null; onClose: () => void; onFeito: () => Promise<void> }) {
  const ligsAtuais = prof ? dados.ligs.filter((l) => l.professional_id === prof.id).map((l) => l.service_id) : [];
  const horariosAtuais = prof ? dados.horarios.filter((h) => h.professional_id === prof.id) : [];
  const inicial: Semana = {};
  if (prof) for (const h of horariosAtuais) (inicial[h.weekday] ??= []).push({ start: h.start_time.slice(0, 5), end: h.end_time.slice(0, 5) });
  else for (const d of [1, 2, 3, 4, 5]) inicial[d] = [{ start: "09:00", end: "18:00" }];

  const [nome, setNome] = useState(prof?.name ?? "");
  const [ativo, setAtivo] = useState(prof?.active ?? true);
  const [foto, setFoto] = useState<File | null>(null); const [fotoRem, setFotoRem] = useState(false);
  const [quem, setQuem] = useState<string[]>(ligsAtuais);
  const [semana, setSemana] = useState<Semana>(inicial);
  const [erro, setErro] = useState<string | null>(null); const [a, setA] = useState(false);
  const [apagar, setApagar] = useState(false);
  const [rapIni, setRapIni] = useState("09:00"); const [rapFim, setRapFim] = useState("18:00"); const [erroRap, setErroRap] = useState<string | null>(null);
  const rot = dados.negocio.professional_label;

  function aplicarRapido(dias: number[]) {
    if (!/^\d{2}:\d{2}$/.test(rapIni) || !/^\d{2}:\d{2}$/.test(rapFim) || rapFim <= rapIni) { setErroRap("A hora de fim tem de ser depois da de início."); return; }
    setErroRap(null); setSemana((x) => aplicarHorario(x, dias, rapIni, rapFim));
  }

  const setDia = (d: number, f: (v: Intervalo[]) => Intervalo[]) => setSemana((s) => ({ ...s, [d]: f(s[d] ?? []) }));

  async function submeter(e: FormEvent) {
    e.preventDefault(); setErro(null);
    if (nome.trim().length < 2 || nome.trim().length > 80) { setErro("O nome precisa de 2 a 80 letras."); return; }
    const ve = validarSemana(semana); if (ve) { setErro(ve); return; }
    setA(true);
    let novoPath: string | null = null;
    try {
      if (foto) novoPath = await enviarImagem(dados.negocio.id, "prof", foto);
      const photo_path = foto ? novoPath : fotoRem ? null : prof?.photo_path ?? null;
      const v = { name: nome.trim(), photo_path, active: ativo };
      let id: string;
      if (prof) { await atualizarProfissional(prof.id, v); id = prof.id; } else { id = await criarProfissional(dados.negocio.id, v, dados.profs.length); }
      await definirLigacoes(dados.negocio.id, { professionalId: id }, ligsAtuais, quem);
      const novos = DIAS.flatMap(([d]) => (semana[d] ?? []).map((i) => ({ weekday: d, start_time: i.start, end_time: i.end })));
      await substituirHorarios(dados.negocio.id, id, horariosAtuais.map((h) => h.id), novos);
      if (prof && (foto || fotoRem)) await apagarImagem(prof.photo_path);
      await onFeito();
    } catch (e2) {
      if (novoPath) await apagarImagem(novoPath);
      setErro(e2 instanceof Error && !("code" in e2) ? e2.message : erroDono(e2));
    } finally { setA(false); }
  }

  async function confirmarApagar() {
    if (!prof) return;
    if (dados.profs.length <= 1) { setErro(`Tem de existir pelo menos um ${rot.toLowerCase()}.`); setApagar(false); return; }
    setA(true); setErro(null);
    try { await apagarProfissional(prof.id); await apagarImagem(prof.photo_path); await onFeito(); }
    catch (e) { setErro(erroDono(e)); setApagar(false); } finally { setA(false); }
  }

  const alterna = (id: string) => setQuem((q) => q.includes(id) ? q.filter((x) => x !== id) : [...q, id]);

  return (
    <Modal titulo={prof ? `Editar ${rot.toLowerCase()}` : `Adicionar ${rot.toLowerCase()}`} onClose={onClose} largo>
      <form onSubmit={submeter} className="space-y-6" noValidate>
        <div><label htmlFor="pf-nome" className="label">Nome</label><input id="pf-nome" className="field" value={nome} onChange={(e) => setNome(e.target.value)} autoFocus={!prof} /></div>
        <ImageField label="Foto (opcional)" atual={prof?.photo_path ?? null} pendente={foto} removida={fotoRem} redonda onPick={(f) => { setFoto(f); setFotoRem(false); }} onRemove={() => { setFoto(null); setFotoRem(true); }} />
        <label className="flex min-h-[48px] items-center gap-3"><input type="checkbox" className="h-5 w-5 accent-[#2F5D50]" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />Aceita marcações</label>

        <fieldset className="min-w-0">
          <legend className="label">Serviços que realiza</legend>
          {dados.servs.length === 0 ? <p className="hint">Ainda não há serviços. Crie-os no separador “Serviços”.</p> : dados.servs.map((s) => (
            <label key={s.id} className="flex min-h-[44px] items-center gap-3"><input type="checkbox" className="h-5 w-5 accent-[#2F5D50]" checked={quem.includes(s.id)} onChange={() => alterna(s.id)} />{s.name}{!s.active && <span className="text-sm text-mute">(desativado)</span>}</label>
          ))}
        </fieldset>

        <fieldset className="min-w-0">
          <legend className="label">Horário de trabalho</legend>
          <p className="hint mb-3">Para uma pausa, use dois intervalos no mesmo dia (ex.: 09:00–13:00 e 14:00–18:00). Dia sem intervalos = folga.</p>
          <div className="mb-3 rounded-xl border border-line bg-white p-3">
            <p className="text-sm font-semibold">Definir rapidamente</p>
            <div className="mt-2 flex items-center gap-2">
              <input type="time" aria-label="Abre às" className="field !min-h-[44px] min-w-0 flex-1" value={rapIni} onChange={(e) => setRapIni(e.target.value)} />
              <span aria-hidden>–</span>
              <input type="time" aria-label="Fecha às" className="field !min-h-[44px] min-w-0 flex-1" value={rapFim} onChange={(e) => setRapFim(e.target.value)} />
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" className="btn-ghost btn-sm" onClick={() => aplicarRapido([1, 2, 3, 4, 5])}>Segunda a sexta</button>
              <button type="button" className="btn-ghost btn-sm" onClick={() => aplicarRapido([1, 2, 3, 4, 5, 6])}>Segunda a sábado</button>
              <button type="button" className="btn-ghost btn-sm" onClick={() => aplicarRapido([0, 1, 2, 3, 4, 5, 6])}>Todos os dias</button>
            </div>
            {erroRap && <p role="alert" className="err">{erroRap}</p>}
            <p className="hint">Substitui o horário desses dias. Depois pode ajustar cada dia abaixo.</p>
          </div>
          <div className="space-y-3">
            {DIAS.map(([d, nomeDia]) => {
              const v = semana[d] ?? [];
              return (
                <div key={d} className="rounded-lg border border-line bg-white p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold">{nomeDia}</p>
                    {v.length === 0 && <span className="text-sm text-mute">Folga</span>}
                  </div>
                  {v.map((it, i) => (
                    <div key={i} className="mt-2 flex items-center gap-2">
                      <input type="time" aria-label={`${nomeDia}: início`} className="field !min-h-[44px] min-w-0 flex-1" value={it.start} onChange={(e) => setDia(d, (x) => x.map((y, k) => k === i ? { ...y, start: e.target.value } : y))} />
                      <span aria-hidden>–</span>
                      <input type="time" aria-label={`${nomeDia}: fim`} className="field !min-h-[44px] min-w-0 flex-1" value={it.end} onChange={(e) => setDia(d, (x) => x.map((y, k) => k === i ? { ...y, end: e.target.value } : y))} />
                      <button type="button" aria-label={`Remover intervalo de ${nomeDia}`} className="btn-ghost btn-sm shrink-0 !px-3 text-brick" onClick={() => setDia(d, (x) => x.filter((_, k) => k !== i))}>×</button>
                    </div>
                  ))}
                  <button type="button" className="btn-ghost btn-sm mt-2" onClick={() => setDia(d, (x) => [...x, x.length ? { start: x[x.length - 1].end, end: "18:00" } : { start: "09:00", end: "18:00" }])}>+ Intervalo</button>
                </div>
              );
            })}
          </div>
        </fieldset>

        {erro && <p role="alert" className="err">{erro}</p>}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={a}>{a ? "A guardar…" : "Guardar"}</button>
        </div>
      </form>
      {prof && (
        <div className="mt-6 border-t border-line pt-4">
          {!apagar ? <button type="button" className="btn-ghost btn-sm text-brick" onClick={() => setApagar(true)}>Apagar {rot.toLowerCase()}</button> : (
            <div>
              <p className="text-sm">Apagar {prof.name}? Se já tiver marcações, não é possível: desative-o (“Aceita marcações”).</p>
              <div className="mt-3 flex gap-2"><button type="button" className="btn-ghost btn-sm" onClick={() => setApagar(false)}>Não</button><button type="button" className="btn-danger btn-sm" disabled={a} onClick={() => void confirmarApagar()}>Apagar</button></div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
