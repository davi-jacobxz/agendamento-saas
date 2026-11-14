import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { erroDono, listarHorarios, listarLigacoes, listarProfissionais, listarServicos, meuNegocio } from "../../lib/ownerApi";
import { fmtDate } from "../../lib/format";
import type { Dados } from "./tipos";
import { Agenda } from "./Agenda";
import { Servicos } from "./Servicos";
import { Equipa } from "./Equipa";
import { Bloqueios } from "./Bloqueios";
import { Negocio } from "./Negocio";
import { Conta } from "./Conta";

type Aba = "agenda" | "servicos" | "equipa" | "bloqueios" | "negocio" | "conta";
const ABAS: [Aba, string][] = [["agenda", "Agenda"], ["servicos", "Serviços"], ["equipa", "Equipa"], ["bloqueios", "Bloqueios"], ["negocio", "Negócio"]];
const ICONES: Record<string, string> = {
  agenda: "M5 5h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2zM3 10h18M8 3v4M16 3v4",
  servicos: "M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01",
  equipa: "M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM2.5 20c0-3.6 3-6 6.5-6s6.5 2.4 6.5 6M16 4.6a3.5 3.5 0 010 6.8M18 14.4c2.2.7 3.5 2.6 3.5 5.6",
  bloqueios: "M12 21a9 9 0 100-18 9 9 0 000 18zM5.6 5.6l12.8 12.8",
  negocio: "M4 21V9l8-5 8 5v12M9 21v-7h6v7",
};

export function avisoIndisponivel(n: { status: string; paid_until: string | null }, agora = new Date()): string | null {
  if (n.status === "bloqueado") return "O seu serviço está bloqueado. A sua página mostra “Serviço indisponível” e não aceita marcações. Contacte o suporte.";
  if (!n.paid_until) return "O seu serviço ainda não tem data de pagamento. A sua página mostra “Serviço indisponível” e não aceita marcações. Contacte o suporte.";
  if (new Date(n.paid_until) <= agora) return `O pagamento terminou em ${fmtDate(n.paid_until)}. A sua página mostra “Serviço indisponível” e não aceita marcações. Contacte o suporte.`;
  return null;
}

export function OwnerApp() {
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aba, setAba] = useState<Aba>("agenda");

  const carregar = useCallback(async () => {
    try {
      const [negocio, profs, servs, ligs, horarios] = await Promise.all([meuNegocio(), listarProfissionais(), listarServicos(), listarLigacoes(), listarHorarios()]);
      setDados({ negocio, profs, servs, ligs, horarios }); setErro(null);
    } catch (e) { setErro(erroDono(e)); }
  }, []);
  useEffect(() => { void carregar(); }, [carregar]);

  if (erro && !dados) return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-5">
      <p role="alert" className="text-lg font-semibold text-brick">{erro}</p>
      <button type="button" className="btn-primary" onClick={() => void carregar()}>Tentar de novo</button>
      <button type="button" className="btn-ghost" onClick={() => void supabase.auth.signOut()}>Sair</button>
    </main>
  );
  if (!dados) return <p className="p-6 text-mute">A carregar…</p>;

  const aviso = avisoIndisponivel(dados.negocio);
  const props = { dados, recarregar: carregar };

  return (
    <div className="mx-auto min-h-screen max-w-3xl px-4 pb-28">
      <header className="flex items-center justify-between gap-3 py-4">
        <h1 className="min-w-0 truncate text-xl font-bold tracking-tight">{dados.negocio.name}</h1>
        <button type="button" aria-current={aba === "conta" ? "page" : undefined} className={`btn-sm ${aba === "conta" ? "btn-primary" : "btn-ghost"}`} onClick={() => setAba("conta")}>Conta</button>
      </header>
      {aviso && <p role="alert" className="mb-4 rounded-lg border border-brass/40 bg-brass/10 px-4 py-3 text-sm font-semibold text-brass">{aviso}</p>}
      <main>
        {aba === "agenda" && <Agenda {...props} />}
        {aba === "servicos" && <Servicos {...props} />}
        {aba === "equipa" && <Equipa {...props} />}
        {aba === "bloqueios" && <Bloqueios {...props} />}
        {aba === "negocio" && <Negocio key={dados.negocio.logo_path + "|" + dados.negocio.cover_path} {...props} />}
        {aba === "conta" && <Conta />}
      </main>
      <nav aria-label="Secções" className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-paper pb-[env(safe-area-inset-bottom,0px)]">
        <ul className="mx-auto flex max-w-3xl">
          {ABAS.map(([id, texto]) => (
            <li key={id} className="flex-1">
              <button type="button" aria-current={aba === id ? "page" : undefined} onClick={() => setAba(id)}
                className={`flex min-h-[68px] w-full flex-col items-center justify-center gap-0.5 border-t-4 px-1 text-[12px] font-semibold sm:text-sm ${aba === id ? "border-moss text-moss" : "border-transparent text-mute"}`}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICONES[id]} /></svg>
                {texto}
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
