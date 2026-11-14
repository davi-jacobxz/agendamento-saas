import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { addDaysToDateStr, fmtDayLong, fmtDuracao, fmtEuros, fmtTime, normalizePhone, todayLisbon } from "../../lib/format";
import { montarMensagemWhatsApp } from "../../lib/mensagem";
import { LIMITE, horariosLivres, marcar, urlImagemPublica, type NegocioPublico, type ProfissionalPublico, type ResultadoMarcacao, type ServicoPublico } from "../../lib/publicApi";

const svg = { width: 15, height: 15, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2.2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;
export const IcoRelogio = () => <svg {...svg}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>;
export const IcoSeta = () => <svg {...svg} width={20} height={20}><path d="M9 6l6 6-6 6" /></svg>;

export function ListaServicos({ servicos, onEscolher }: { servicos: ServicoPublico[]; onEscolher: (s: ServicoPublico) => void }) {
  const grupos = useMemo(() => {
    const m = new Map<string, ServicoPublico[]>();
    for (const s of servicos) { const c = s.categoria ?? ""; (m.get(c) ?? m.set(c, []).get(c)!).push(s); }
    return [...m.entries()];
  }, [servicos]);
  return (
    <div className="space-y-6">
      {grupos.map(([cat, lista]) => (
        <div key={cat}>
          {cat && <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-mute">{cat}</h3>}
          <ul className="space-y-3">
            {lista.map((s) => (
              <li key={s.id}>
                <button type="button" className="opcao flex items-center gap-3" aria-pressed={false} onClick={() => onEscolher(s)}>
                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-bold leading-snug">{s.nome}</span>
                    {s.descricao && <span className="mt-0.5 line-clamp-2 block text-sm text-mute">{s.descricao}</span>}
                    <span className="mt-2 flex"><span className="chip"><IcoRelogio /> {fmtDuracao(s.duracao_minutos)}</span></span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    {s.preco_cents > 0 && <span className="text-lg font-extrabold" style={{ color: "var(--cor)" }}>{fmtEuros(s.preco_cents)}</span>}
                    <span className="text-mute"><IcoSeta /></span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function EscolhaProfissional({ rotulo, profs, onEscolher }: { rotulo: string; profs: ProfissionalPublico[]; onEscolher: (id: string | null) => void }) {
  return (
    <ul className="space-y-3">
      <li>
        <button type="button" className="opcao flex items-center gap-3" aria-pressed={false} onClick={() => onEscolher(null)}>
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-lg text-white" style={{ backgroundColor: "var(--cor)" }} aria-hidden="true">✦</span>
          <span className="min-w-0 flex-1"><span className="block font-bold">Sem preferência</span><span className="block text-sm text-mute">O primeiro {rotulo.toLowerCase()} livre</span></span>
          <span className="text-mute"><IcoSeta /></span>
        </button>
      </li>
      {profs.map((p) => {
        const foto = urlImagemPublica(p.foto_path);
        return (
          <li key={p.id}>
            <button type="button" className="opcao flex items-center gap-3" aria-pressed={false} onClick={() => onEscolher(p.id)}>
              <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-porcelain text-lg font-bold text-mute">
                {foto ? <img src={foto} alt="" className="h-full w-full object-cover" /> : p.nome.slice(0, 1).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1 font-bold">{p.nome}</span>
              <span className="text-mute"><IcoSeta /></span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

const PAGINA = 7;
const diaCurto = (d: string) => { const [y, m, dd] = d.split("-").map(Number); return new Intl.DateTimeFormat("pt-PT", { timeZone: "UTC", weekday: "long" }).format(new Date(Date.UTC(y, m - 1, dd, 12))).slice(0, 3); };
const mesDe = (d: string) => { const [y, m, dd] = d.split("-").map(Number); return new Intl.DateTimeFormat("pt-PT", { timeZone: "UTC", month: "long", year: "numeric" }).format(new Date(Date.UTC(y, m - 1, dd, 12))); };

type Slots = Record<string, string[] | "erro" | "limite">;

export function EscolhaDia({ slug, servicoId, profId, maxDias, aviso, onEscolher }: { slug: string; servicoId: string; profId: string | null; maxDias: number; aviso: string | null; onEscolher: (dia: string, inicio: string) => void }) {
  const hoje = todayLisbon();
  const total = Math.max(1, Math.min(maxDias, 180));
  const [pagina, setPagina] = useState(0);
  const [tentativa, setTentativa] = useState(0);
  const [slots, setSlots] = useState<Slots>({});
  const [sel, setSel] = useState<string | null>(null);
  const pedidos = useRef(new Set<string>());

  const dias = Array.from({ length: Math.min(PAGINA, total - pagina * PAGINA) }, (_, i) => addDaysToDateStr(hoje, pagina * PAGINA + i));

  useEffect(() => {
    let vivo = true;
    for (const d of dias) {
      if (pedidos.current.has(d)) continue;
      pedidos.current.add(d);
      horariosLivres(slug, servicoId, profId, d)
        .then((r) => { if (vivo) setSlots((s) => ({ ...s, [d]: r })); })
        .catch((e: Error) => { pedidos.current.delete(d); if (vivo) setSlots((s) => ({ ...s, [d]: e.message === LIMITE ? "limite" : "erro" })); });
    }
    return () => { vivo = false; };
  }, [pagina, tentativa]); // eslint-disable-line react-hooks/exhaustive-deps

  // escolhe sozinha o primeiro dia com horários
  useEffect(() => {
    if (sel) return;
    const primeiro = dias.find((d) => Array.isArray(slots[d]) && (slots[d] as string[]).length > 0);
    if (primeiro) setSel(primeiro);
  }, [slots]); // eslint-disable-line react-hooks/exhaustive-deps

  const carregados = dias.every((d) => slots[d] !== undefined);
  const algum = dias.some((d) => Array.isArray(slots[d]) && (slots[d] as string[]).length > 0);
  const comFalha = dias.some((d) => slots[d] === "erro" || slots[d] === "limite");
  const limite = dias.some((d) => slots[d] === "limite");
  const horas = sel && Array.isArray(slots[sel]) ? (slots[sel] as string[]) : [];
  const haMais = (pagina + 1) * PAGINA < total;

  function tentarDeNovo() {
    setSlots((s) => { const n = { ...s }; for (const d of dias) if (n[d] === "erro" || n[d] === "limite") delete n[d]; return n; });
    setTentativa((t) => t + 1);
  }

  return (
    <div>
      {aviso && <p role="alert" className="mb-4 rounded-xl bg-brick/10 px-4 py-3 font-semibold text-brick">{aviso}</p>}
      <div className="flex items-center justify-between gap-2">
        <button type="button" className="btn-ghost btn-sm !px-4" aria-label="Dias anteriores" disabled={pagina === 0} onClick={() => { setPagina(pagina - 1); setSel(null); }}>←</button>
        <p className="font-bold first-letter:uppercase">{mesDe(dias[0])}</p>
        <button type="button" className="btn-ghost btn-sm !px-4" aria-label="Dias seguintes" disabled={!haMais} onClick={() => { setPagina(pagina + 1); setSel(null); }}>→</button>
      </div>
      <ul className="mt-3 grid grid-cols-7 gap-1.5">
        {dias.map((d) => {
          const r = slots[d]; const vazio = Array.isArray(r) && r.length === 0; const ativo = sel === d;
          return (
            <li key={d}>
              <button type="button" disabled={vazio || r === undefined || r === "erro" || r === "limite"} aria-pressed={ativo} aria-label={fmtDayLong(d)}
                onClick={() => setSel(d)} className="opcao flex !min-h-[66px] flex-col items-center justify-center !rounded-xl !p-1 text-center disabled:opacity-35 disabled:shadow-none">
                <span className="text-[11px] font-semibold uppercase text-mute">{d === hoje ? "hoje" : diaCurto(d)}</span>
                <span className="text-lg font-extrabold leading-tight">{Number(d.slice(8))}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {!carregados && !comFalha && <p className="mt-4 text-mute">A procurar horários…</p>}
      {comFalha && (
        <div role="alert" className="mt-4 rounded-xl border border-brick/30 bg-brick/5 p-4">
          <p className="font-semibold text-brick">{limite ? "Demasiados pedidos seguidos. Aguarde um minuto e tente de novo." : "Não foi possível carregar os horários."}</p>
          <button type="button" className="btn-ghost btn-sm mt-3" onClick={tentarDeNovo}>Tentar de novo</button>
        </div>
      )}
      {carregados && !comFalha && !algum && <p className="mt-4 rounded-xl border border-dashed border-line px-4 py-4 text-center text-mute">Sem horários livres nestes dias.{haMais ? " Veja os dias seguintes." : ""}</p>}
      {sel && horas.length > 0 && (
        <div className="mt-6">
          <h3 className="mb-3 font-bold first-letter:uppercase">{fmtDayLong(sel)}</h3>
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {horas.map((h) => <li key={h}><button type="button" className="opcao !min-h-[50px] !rounded-full !p-2 !text-center font-bold" aria-pressed={false} onClick={() => onEscolher(sel, h)}>{fmtTime(h)}</button></li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

export function FormDados({ slug, negocio, servico, profNome, profId, dia, inicio, onVoltarAoDia, onResultado }: {
  slug: string; negocio: NegocioPublico; servico: ServicoPublico; profNome: string | null; profId: string | null;
  dia: string; inicio: string; onVoltarAoDia: (aviso: string) => void; onResultado: (r: ResultadoMarcacao) => void;
}) {
  const [nome, setNome] = useState(""); const [tel, setTel] = useState(""); const [ok, setOk] = useState(false);
  const [website, setWebsite] = useState(""); // armadilha para robôs
  const [erro, setErro] = useState<string | null>(null); const [a, setA] = useState(false);

  async function submeter(e: FormEvent) {
    e.preventDefault(); setErro(null);
    if (nome.trim().length < 2) { setErro("Indique o seu nome."); return; }
    const t = normalizePhone(tel);
    if (!t) { setErro("Indique um número de telemóvel válido (ex.: 912 345 678)."); return; }
    if (!ok) { setErro("Tem de aceitar o uso do telefone para confirmar a marcação."); return; }
    setA(true);
    try {
      // recalcula os horários livres imediatamente antes de confirmar
      const livres = await horariosLivres(slug, servico.id, profId, dia);
      if (!livres.some((h) => new Date(h).getTime() === new Date(inicio).getTime())) { onVoltarAoDia("Esse horário acabou de ser ocupado. Escolha outro."); return; }
      const r = await marcar({ slug, servico: servico.id, profissional: profId, inicio, nome: nome.trim(), telefone: t, consentimento: ok, website });
      if (r.ok) { onResultado(r); return; }
      if (r.code === "slot_taken" || r.code === "fora_do_horario" || r.code === "antecedencia_minima" || r.code === "no_passado") { onVoltarAoDia(r.mensagem ?? "Esse horário acabou de ser ocupado. Escolha outro."); return; }
      setErro(r.mensagem ?? "Não foi possível confirmar a marcação.");
    } catch (e2) { setErro((e2 as Error).message === LIMITE ? "Demasiados pedidos seguidos. Aguarde um minuto e tente de novo." : "Sem ligação ou erro temporário. Tente novamente."); }
    finally { setA(false); }
  }

  return (
    <form onSubmit={submeter} className="space-y-5" noValidate>
      <div className="rounded-2xl border border-line border-l-4 bg-white p-4" style={{ borderLeftColor: "var(--cor)" }}>
        <p className="text-base font-bold">{servico.nome}</p>
        <p className="mt-0.5 first-letter:uppercase">{fmtDayLong(dia)}, às <strong>{fmtTime(inicio)}</strong></p>
        {profNome && <p className="text-sm text-mute">Com {profNome}</p>}
        <p className="mt-1 text-sm text-mute">{fmtDuracao(servico.duracao_minutos)}{servico.preco_cents > 0 ? ` · ${fmtEuros(servico.preco_cents)}` : ""}</p>
      </div>
      <div><label htmlFor="p-nome" className="label">O seu nome</label><input id="p-nome" className="field !min-h-[52px] !rounded-xl" value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="name" maxLength={100} /></div>
      <div><label htmlFor="p-tel" className="label">Telemóvel</label><input id="p-tel" type="tel" inputMode="tel" className="field !min-h-[52px] !rounded-xl" value={tel} onChange={(e) => setTel(e.target.value)} autoComplete="tel" placeholder="912 345 678" /></div>
      <div aria-hidden="true" style={{ position: "absolute", left: "-9999px", width: 1, height: 1, overflow: "hidden" }}>
        <label>Não preencha este campo<input tabIndex={-1} autoComplete="off" name="website" value={website} onChange={(e) => setWebsite(e.target.value)} /></label>
      </div>
      <label className="flex items-start gap-3 rounded-xl border border-line bg-white p-3 text-sm">
        <input type="checkbox" className="mt-0.5 h-6 w-6 shrink-0" style={{ accentColor: "var(--cor)" }} checked={ok} onChange={(e) => setOk(e.target.checked)} />
        <span>Autorizo que {negocio.nome} use o meu telefone para gerir esta marcação. <a href={`/privacidade?negocio=${slug}`} target="_blank" rel="noreferrer" className="font-semibold underline">Política de privacidade</a></span>
      </label>
      {erro && <p role="alert" className="err">{erro}</p>}
      <button type="submit" className="btn-cor w-full" disabled={a}>{a ? "A confirmar…" : "Confirmar marcação"}</button>
    </form>
  );
}

function detalhesDe(r: ResultadoMarcacao) {
  const m = r.marcacao!;
  const dia = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(m.inicio));
  return { m, dia, quando: `${fmtDayLong(dia)}, às ${fmtTime(m.inicio)}` };
}

/** Ecrã de confirmação: aparece por cima da página logo depois de marcar. Tem um “x” para fechar. */
export function ConfirmacaoModal({ r, negocio, mostrarProf, onFechar }: { r: ResultadoMarcacao; negocio: NegocioPublico; mostrarProf: boolean; onFechar: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    return () => { if (d?.open) d.close(); };
  }, []);
  const { m, dia, quando } = detalhesDe(r);
  const texto = montarMensagemWhatsApp(negocio.mensagem_whatsapp, { nome: m.nome_cliente, servico: m.servico, dia: fmtDayLong(dia), hora: fmtTime(m.inicio) });
  const num = (negocio.whatsapp ?? "").replace(/\D/g, "");
  const link = num.length >= 8 && num.length <= 15 ? `https://wa.me/${num}?text=${encodeURIComponent(texto)}` : null;
  const primeiroNome = m.nome_cliente.trim().split(/\s+/)[0];

  return (
    <dialog ref={ref} aria-labelledby="conf-titulo" onCancel={(e) => { e.preventDefault(); onFechar(); }} onClick={(e) => { if (e.target === ref.current) onFechar(); }}
      className="m-auto w-[calc(100%-1.5rem)] max-w-md rounded-2xl border border-line bg-paper p-0 text-ink shadow-2xl">
      <div className="relative px-6 pb-6 pt-9 text-center">
        <button type="button" onClick={onFechar} aria-label="Fechar" className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-lg text-2xl leading-none text-mute hover:bg-porcelain">×</button>
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full" style={{ backgroundColor: "var(--cor)" }} aria-hidden="true">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
        </div>
        <h2 id="conf-titulo" className="mt-4 text-2xl font-bold tracking-tight">Marcação confirmada</h2>
        <p className="mt-1 text-mute">Obrigado, {primeiroNome}! O seu horário está reservado.</p>

        <div className="mt-5 rounded-xl border border-line bg-white p-4 text-left">
          <p className="text-lg font-bold">{m.servico}</p>
          <p className="mt-0.5 first-letter:uppercase">{quando}</p>
          {mostrarProf && m.profissional && <p className="text-sm text-mute">Com {m.profissional}</p>}
          <p className="mt-2 text-sm text-mute">{negocio.nome}{negocio.endereco ? ` · ${negocio.endereco}` : ""}</p>
        </div>

        {r.mensagem_confirmacao && <p className="mt-4 whitespace-pre-line text-left text-sm">{r.mensagem_confirmacao}</p>}
        <p className="mt-4 text-left text-sm text-mute">Precisa de alterar ou cancelar? Contacte {negocio.nome}{link ? " pelo WhatsApp" : ""}.</p>

        <div className="mt-6 space-y-3">
          {link && <a href={link} target="_blank" rel="noreferrer" className="btn-cor w-full">Confirmar pelo WhatsApp</a>}
          <button type="button" className="btn-ghost w-full" onClick={onFechar}>Fechar</button>
        </div>
      </div>
    </dialog>
  );
}

/** Faixa que fica no topo, depois de fechar o ecrã de confirmação. */
export function BannerConfirmada({ r, onVer }: { r: ResultadoMarcacao; onVer: () => void }) {
  const { m, quando } = detalhesDe(r);
  return (
    <div role="status" className="mb-5 flex items-center justify-between gap-3 rounded-xl border-2 bg-paper px-4 py-3" style={{ borderColor: "var(--cor)" }}>
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--cor)" }}>Marcação confirmada</p>
        <p className="truncate text-sm font-semibold">{m.servico}</p>
        <p className="truncate text-sm text-mute first-letter:uppercase">{quando}</p>
      </div>
      <button type="button" className="btn-ghost btn-sm shrink-0" onClick={onVer}>Ver detalhes</button>
    </div>
  );
}
