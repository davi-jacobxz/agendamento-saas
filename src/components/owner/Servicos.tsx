import { useState, type FormEvent } from "react";
import type { Props } from "./tipos";
import { Modal } from "../Modal";
import { apagarServico, atualizarServico, criarServico, definirLigacoes, erroDono, ordenar, type Servico } from "../../lib/ownerApi";
import { eurosInput, fmtDuracao, fmtEuros, parseEuros } from "../../lib/format";

// Duração de 5 min a 12 h; intervalo depois do serviço de 0 a 4 h (os máximos que o sistema aceita)
const DURACOES = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 75, 90, 105, 120, 135, 150, 165, 180, 195, 210, 225, 240, 270, 300, 330, 360, 420, 480, 540, 600, 660, 720];
const INTERVALOS = [0, 5, 10, 15, 20, 30, 45, 60, 75, 90, 105, 120, 150, 180, 210, 240];
const comAtual = (lista: number[], atual: number) => (lista.includes(atual) ? lista : [...lista, atual].sort((a, b) => a - b));

export function Servicos({ dados, recarregar }: Props) {
  const [edit, setEdit] = useState<Servico | "novo" | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function mover(i: number, d: -1 | 1) {
    const ids = dados.servs.map((s) => s.id); const j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    try { await ordenar("services", ids); await recarregar(); setErro(null); } catch (e) { setErro(erroDono(e)); }
  }

  return (
    <section>
      <div className="flex items-center justify-between gap-3">
        <p className="text-mute">{dados.servs.length} {dados.servs.length === 1 ? "serviço" : "serviços"}</p>
        <button type="button" className="btn-primary btn-sm" onClick={() => setEdit("novo")}>Novo serviço</button>
      </div>
      {erro && <p role="alert" className="err mt-3">{erro}</p>}
      {dados.servs.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-line bg-paper p-8 text-center">
          <p className="text-lg font-semibold">Ainda não tem serviços.</p>
          <p className="mt-1 text-mute">Adicione o primeiro para as clientes poderem marcar.</p>
          <button type="button" className="btn-primary mt-5" onClick={() => setEdit("novo")}>Criar serviço</button>
        </div>
      ) : (
        <ul className="mt-5 divide-y divide-line overflow-hidden rounded-xl border border-line bg-paper">
          {dados.servs.map((s, i) => (
            <li key={s.id} className={`flex items-center gap-3 p-4 ${s.active ? "" : "opacity-60"}`}>
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{s.name}{!s.active && <span className="ml-2 text-sm font-normal text-mute">(desativado)</span>}</p>
                <p className="text-sm text-mute">{fmtDuracao(s.duration_minutes)} · {fmtEuros(s.price_cents)}{s.buffer_minutes > 0 ? ` · +${fmtDuracao(s.buffer_minutes)} de intervalo` : ""}{s.category ? ` · ${s.category}` : ""}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button type="button" aria-label={`Subir ${s.name}`} disabled={i === 0} className="btn-ghost btn-sm !px-3" onClick={() => void mover(i, -1)}>↑</button>
                <button type="button" aria-label={`Descer ${s.name}`} disabled={i === dados.servs.length - 1} className="btn-ghost btn-sm !px-3" onClick={() => void mover(i, 1)}>↓</button>
                <button type="button" className="btn-ghost btn-sm" onClick={() => setEdit(s)}>Editar</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {edit && <ServicoModal dados={dados} servico={edit === "novo" ? null : edit} onClose={() => setEdit(null)} onFeito={async () => { setEdit(null); await recarregar(); }} />}
    </section>
  );
}

function ServicoModal({ dados, servico, onClose, onFeito }: { dados: Props["dados"]; servico: Servico | null; onClose: () => void; onFeito: () => Promise<void> }) {
  const ligsAtuais = servico ? dados.ligs.filter((l) => l.service_id === servico.id).map((l) => l.professional_id) : [];
  const [nome, setNome] = useState(servico?.name ?? "");
  const [desc, setDesc] = useState(servico?.description ?? "");
  const [dur, setDur] = useState(servico?.duration_minutes ?? 30);
  const [preco, setPreco] = useState(servico ? eurosInput(servico.price_cents) : "");
  const [folga, setFolga] = useState(servico?.buffer_minutes ?? 0);
  const [cat, setCat] = useState(servico?.category ?? "");
  const [ativo, setAtivo] = useState(servico?.active ?? true);
  const [quem, setQuem] = useState<string[]>(servico ? ligsAtuais : dados.profs.filter((p) => p.active).map((p) => p.id));
  const [erro, setErro] = useState<string | null>(null); const [a, setA] = useState(false);
  const [apagar, setApagar] = useState(false);

  async function submeter(e: FormEvent) {
    e.preventDefault(); setErro(null);
    const d = dur; const c = parseEuros(preco === "" ? "0" : preco);
    if (nome.trim().length < 2 || nome.trim().length > 80) { setErro("O nome precisa de 2 a 80 letras."); return; }
    if (!Number.isInteger(d) || d < 5 || d > 720) { setErro("A duração deve estar entre 5 e 720 minutos."); return; }
    if (c === null) { setErro("Escreva o preço em euros (ex.: 12,50)."); return; }
    if (desc.length > 500 || cat.length > 40) { setErro("A descrição ou a categoria é demasiado longa."); return; }
    const v = { name: nome.trim(), description: desc.trim() || null, duration_minutes: d, price_cents: c, buffer_minutes: folga, category: cat.trim() || null, active: ativo };
    setA(true);
    try {
      if (servico) { await atualizarServico(servico.id, v); await definirLigacoes(dados.negocio.id, { serviceId: servico.id }, ligsAtuais, quem); }
      else { const id = await criarServico(dados.negocio.id, v, dados.servs.length); await definirLigacoes(dados.negocio.id, { serviceId: id }, [], quem); }
      await onFeito();
    } catch (e2) { setErro(erroDono(e2)); } finally { setA(false); }
  }

  async function confirmarApagar() {
    if (!servico) return;
    setA(true); setErro(null);
    try { await apagarServico(servico.id); await onFeito(); } catch (e) { setErro(erroDono(e)); setApagar(false); } finally { setA(false); }
  }

  const alterna = (id: string) => setQuem((q) => q.includes(id) ? q.filter((x) => x !== id) : [...q, id]);
  const rot = dados.negocio.professional_label;

  return (
    <Modal titulo={servico ? "Editar serviço" : "Novo serviço"} onClose={onClose}>
      <form onSubmit={submeter} className="space-y-4" noValidate>
        <div><label htmlFor="sv-nome" className="label">Nome</label><input id="sv-nome" className="field" value={nome} onChange={(e) => setNome(e.target.value)} autoFocus={!servico} /></div>
        <div><label htmlFor="sv-desc" className="label">Descrição (opcional)</label><textarea id="sv-desc" rows={2} className="field !py-2" value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
        <div>
          <label htmlFor="sv-dur" className="label">Duração do serviço</label>
          <select id="sv-dur" className="field" value={dur} onChange={(e) => setDur(Number(e.target.value))}>
            {comAtual(DURACOES, dur).map((v) => <option key={v} value={v}>{fmtDuracao(v)}</option>)}
          </select>
        </div>
        <div><label htmlFor="sv-preco" className="label">Preço (€)</label><input id="sv-preco" inputMode="decimal" className="field" value={preco} onChange={(e) => setPreco(e.target.value)} placeholder="0,00" /></div>
        <div>
          <label htmlFor="sv-folga" className="label">Intervalo depois do serviço</label>
          <select id="sv-folga" className="field" value={folga} onChange={(e) => setFolga(Number(e.target.value))}>
            {comAtual(INTERVALOS, folga).map((v) => <option key={v} value={v}>{v === 0 ? "Sem intervalo" : fmtDuracao(v)}</option>)}
          </select>
          <p className="hint">Tempo livre depois deste serviço, antes da cliente seguinte (limpar, preparar…). Ninguém consegue marcar dentro desse intervalo.</p>
        </div>
        <div><label htmlFor="sv-cat" className="label">Categoria (opcional)</label><input id="sv-cat" className="field" value={cat} onChange={(e) => setCat(e.target.value)} placeholder="Ex.: Unhas, Cabelo" /></div>
        <fieldset className="min-w-0">
          <legend className="label">Quem faz este serviço</legend>
          {dados.profs.map((p) => (
            <label key={p.id} className="flex min-h-[44px] items-center gap-3">
              <input type="checkbox" className="h-5 w-5 accent-[#2F5D50]" checked={quem.includes(p.id)} onChange={() => alterna(p.id)} />{p.name}{!p.active && <span className="text-sm text-mute">(inativo)</span>}
            </label>
          ))}
          {quem.length === 0 && <p className="hint">Sem ninguém associado, as clientes não conseguem marcar este serviço ({rot.toLowerCase()}).</p>}
        </fieldset>
        <label className="flex min-h-[48px] items-center gap-3"><input type="checkbox" className="h-5 w-5 accent-[#2F5D50]" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />Disponível para marcação</label>
        {erro && <p role="alert" className="err">{erro}</p>}
        <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={a}>{a ? "A guardar…" : "Guardar"}</button>
        </div>
      </form>
      {servico && (
        <div className="mt-6 border-t border-line pt-4">
          {!apagar ? <button type="button" className="btn-ghost btn-sm text-brick" onClick={() => setApagar(true)}>Apagar serviço</button> : (
            <div>
              <p className="text-sm">Apagar “{servico.name}”? Se já tiver marcações, não é possível: desative-o.</p>
              <div className="mt-3 flex gap-2"><button type="button" className="btn-ghost btn-sm" onClick={() => setApagar(false)}>Não</button><button type="button" className="btn-danger btn-sm" disabled={a} onClick={() => void confirmarApagar()}>Apagar</button></div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
