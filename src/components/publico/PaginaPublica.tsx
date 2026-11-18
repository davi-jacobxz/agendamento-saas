import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { LIMITE, carregarNegocio, urlImagemPublica, type Carregado, type ResultadoMarcacao, type ServicoPublico } from "../../lib/publicApi";
import { ligacaoInstagram } from "../../lib/rota";
import CancelarMarcacao from "./CancelarMarcacao";
import { ListaServicos, EscolhaProfissional, EscolhaDia, FormDados, ConfirmacaoModal, BannerConfirmada } from "./Passos";

type Passo = "servico" | "prof" | "dia" | "dados";
const TITULOS: Record<Passo, string> = { servico: "Escolha o serviço", prof: "Escolha com quem", dia: "Escolha o dia e a hora", dados: "Os seus dados" };
const ico = { width: 15, height: 15, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2.2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

export default function PaginaPublica({ slug }: { slug: string }) {
  const [c, setC] = useState<Carregado | null>(null);
  const [erro, setErro] = useState<null | "geral" | "limite">(null);
  const [passo, setPasso] = useState<Passo>("servico");
  const [servico, setServico] = useState<ServicoPublico | null>(null);
  const [profId, setProfId] = useState<string | null>(null);
  const [dia, setDia] = useState<string | null>(null);
  const [inicio, setInicio] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoMarcacao | null>(null);
  const [modalAberto, setModalAberto] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [chave, setChave] = useState(0);
  const titulo = useRef<HTMLHeadingElement>(null);
  const cancelarId = new URLSearchParams(window.location.search).get("cancelar");
  const idCancelarValido = cancelarId !== null && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(cancelarId);

  const carregar = () => { setErro(null); setC(null); carregarNegocio(slug).then(setC).catch((e: Error) => setErro(e.message === LIMITE ? "limite" : "geral")); };
  useEffect(() => { if (!idCancelarValido) carregar(); }, [slug, idCancelarValido]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { titulo.current?.focus({ preventScroll: true }); }, [passo]);
  useEffect(() => { if (c && "negocio" in c) document.title = c.negocio.nome; }, [c]);

  if (idCancelarValido && cancelarId) return <CancelarMarcacao slug={slug} id={cancelarId} />;
  if (erro) return <Centro><p className="text-lg font-semibold">{erro === "limite" ? "Demasiados pedidos seguidos. Aguarde um minuto e tente de novo." : "Não foi possível carregar a página."}</p><button type="button" className="btn-primary mt-4" onClick={carregar}>Tentar de novo</button></Centro>;
  if (!c) return <Centro><p className="text-mute">A carregar…</p></Centro>;
  if (!c.encontrado) return <Centro><h1 className="text-2xl font-bold">Página não encontrada</h1><p className="mt-2 text-mute">Verifique o endereço que recebeu.</p></Centro>;
  if (!c.disponivel) return <Centro><h1 className="text-2xl font-bold">Serviço indisponível</h1><p className="mt-2 text-mute">De momento não é possível fazer marcações aqui.</p></Centro>;

  const { negocio, servicos, profissionais } = c;
  const estilo = { "--cor": negocio.cor_principal } as CSSProperties;
  const candidatos = servico ? profissionais.filter((p) => p.servicos.includes(servico.id)) : [];
  const profNome = profissionais.length > 1 && profId ? profissionais.find((p) => p.id === profId)?.nome ?? null : null;
  const logo = urlImagemPublica(negocio.logo_path), capa = urlImagemPublica(negocio.cover_path);
  const insta = ligacaoInstagram(negocio.instagram);

  // indicador de passos (o passo “com quem” só existe quando há escolha)
  const total = servico ? (candidatos.length > 1 ? 4 : 3) : profissionais.length > 1 ? 4 : 3;
  const numero = passo === "servico" ? 1 : passo === "prof" ? 2 : passo === "dia" ? (candidatos.length > 1 ? 3 : 2) : total;

  function escolherServico(s: ServicoPublico) {
    setServico(s); setAviso(null);
    const cand = profissionais.filter((p) => p.servicos.includes(s.id));
    if (cand.length <= 1) { setProfId(cand[0]?.id ?? null); setPasso("dia"); } else { setProfId(null); setPasso("prof"); }
  }
  function voltar() {
    setAviso(null);
    if (passo === "dados") setPasso("dia");
    else if (passo === "dia") setPasso(candidatos.length > 1 ? "prof" : "servico");
    else if (passo === "prof") setPasso("servico");
  }
  function recomecar() { setServico(null); setProfId(null); setDia(null); setInicio(null); setAviso(null); setChave((k) => k + 1); setPasso("servico"); }

  return (
    <div style={estilo} className="min-h-screen bg-porcelain">
      <header>
        <div className="relative h-32 overflow-hidden sm:h-44" style={{ backgroundColor: "var(--cor)" }}>
          {capa && <img src={capa} alt="" className="absolute inset-0 h-full w-full object-cover" />}
          <div className="absolute inset-0" style={{ backgroundImage: "linear-gradient(135deg, rgba(255,255,255,0.16), rgba(0,0,0,0.28))" }} />
        </div>
        <div className="mx-auto max-w-lg px-4">
          {logo
            ? <img src={logo} alt="" className="relative z-10 -mt-10 h-20 w-20 rounded-2xl border-4 border-porcelain bg-white object-cover shadow-md" />
            : <span aria-hidden="true" className="relative z-10 -mt-10 flex h-20 w-20 items-center justify-center rounded-2xl border-4 border-porcelain text-3xl font-extrabold text-white shadow-md" style={{ backgroundColor: "var(--cor)" }}>{negocio.nome.slice(0, 1).toUpperCase()}</span>}
          <h1 className="mt-3 text-2xl font-extrabold tracking-tight">{negocio.nome}</h1>
          {negocio.texto_boas_vindas && <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed text-ink/80">{negocio.texto_boas_vindas}</p>}
          {(negocio.endereco || insta) && (
            <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-mute">
              {negocio.endereco && <span className="inline-flex items-center gap-1.5"><svg {...ico}><path d="M12 21s7-6.2 7-11a7 7 0 10-14 0c0 4.8 7 11 7 11z" /><circle cx="12" cy="10" r="2.5" /></svg>{negocio.endereco}</span>}
              {insta && <a className="inline-flex min-h-[36px] items-center gap-1.5 font-semibold underline" href={insta} target="_blank" rel="noreferrer"><svg {...ico}><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="0.6" /></svg>Instagram</a>}
            </p>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-lg px-4 pb-14 pt-5">
        {resultado && passo === "servico" && <BannerConfirmada r={resultado} slug={slug} onVer={() => setModalAberto(true)} />}
        <section className="cartao">
          <div className="flex gap-1.5" role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={numero} aria-label={`Passo ${numero} de ${total}`}>
            {Array.from({ length: total }, (_, i) => <span key={i} className="h-1.5 flex-1 rounded-full" style={{ backgroundColor: i < numero ? "var(--cor)" : "#D3D9D1" }} />)}
          </div>
          <div className="mt-4 flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--cor)" }}>Passo {numero} de {total}</p>
              <h2 ref={titulo} tabIndex={-1} className="mt-0.5 text-xl font-extrabold outline-none">{TITULOS[passo]}</h2>
            </div>
            {passo !== "servico" && <button type="button" className="btn-ghost btn-sm shrink-0" onClick={voltar}>← Voltar</button>}
          </div>
          <div className="mt-5">
            {passo === "servico" && (servicos.length === 0 ? <p className="text-mute">Ainda não há serviços disponíveis.</p> : <ListaServicos servicos={servicos} onEscolher={escolherServico} />)}
            {passo === "prof" && <EscolhaProfissional rotulo={negocio.rotulo_profissional} profs={candidatos} onEscolher={(id) => { setProfId(id); setPasso("dia"); }} />}
            {passo === "dia" && servico && <EscolhaDia key={chave} slug={slug} servicoId={servico.id} profId={profId} maxDias={negocio.antecedencia_max_dias} aviso={aviso} onEscolher={(d, i) => { setDia(d); setInicio(i); setAviso(null); setPasso("dados"); }} />}
            {passo === "dados" && servico && dia && inicio && (
              <FormDados slug={slug} negocio={negocio} servico={servico} profNome={profNome} profId={profId} dia={dia} inicio={inicio}
                onVoltarAoDia={(a) => { setAviso(a); setChave((k) => k + 1); setPasso("dia"); }}
                onResultado={(r) => { setResultado(r); setModalAberto(true); recomecar(); }} />
            )}
          </div>
        </section>
        <p className="mt-8 text-center text-sm text-mute"><a href={`/privacidade?negocio=${slug}`} className="underline">Política de privacidade</a></p>
      </main>
      {resultado && modalAberto && <ConfirmacaoModal r={resultado} negocio={negocio} mostrarProf={profissionais.length > 1} onFechar={() => setModalAberto(false)} />}
    </div>
  );
}

function Centro({ children }: { children: ReactNode }) {
  return <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-5 text-center">{children}</main>;
}
