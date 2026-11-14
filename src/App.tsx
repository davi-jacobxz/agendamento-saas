import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import { obterPapel, mensagemErro } from "./lib/api";
import { Login } from "./components/Login";
import { NegociosTab } from "./components/NegociosTab";
import { AuditTab } from "./components/AuditTab";
import { OwnerApp } from "./components/owner/OwnerApp";
import { SenhaObrigatoria } from "./components/owner/SenhaObrigatoria";

type Papel = "super_admin" | "owner" | null;

export default function App() {
  const [sessao, setSessao] = useState<Session | null>(null);
  const [pronto, setPronto] = useState(false);
  const [papel, setPapel] = useState<Papel | undefined>(undefined);
  const [erro, setErro] = useState<string | null>(null);
  const [aba, setAba] = useState<"negocios" | "auditoria">("negocios");
  const [trocada, setTrocada] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSessao(data.session); setPronto(true); });
    // Só esquece o papel quando a sessão termina. Renovar a sessão (token) não pode desmontar o painel.
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => { setSessao(s); if (!s) { setPapel(undefined); setErro(null); } });
    return () => sub.subscription.unsubscribe();
  }, []);

  const userId = sessao?.user.id;
  useEffect(() => {
    if (!userId) return;
    obterPapel(userId).then(setPapel).catch((e) => setErro(mensagemErro(e)));
  }, [userId]);

  if (!pronto) return <p className="p-6 text-mute">A carregar…</p>;
  if (!sessao) return <Login />;
  if (erro) return <Mensagem texto={erro} />;
  if (papel === undefined) return <p className="p-6 text-mute">A verificar permissões…</p>;
  if (papel === "owner") {
    if (sessao.user.user_metadata?.must_change_password === true && !trocada) {
      return <SenhaObrigatoria onFeito={() => { setTrocada(true); void supabase.auth.refreshSession(); }} />;
    }
    return <OwnerApp />;
  }
  if (papel !== "super_admin") return <Mensagem texto="Esta conta não tem acesso a esta área." />;

  return (
    <div className="mx-auto min-h-screen max-w-4xl px-4 pb-16">
      <header className="flex items-center justify-between gap-3 py-5">
        <h1 className="text-xl font-bold tracking-tight">Administração</h1>
        <button type="button" className="btn-ghost btn-sm" onClick={() => void supabase.auth.signOut()}>Sair</button>
      </header>
      <nav aria-label="Secções" className="mb-6 flex gap-2 border-b border-line">
        {([["negocios", "Negócios"], ["auditoria", "Registo de acessos"]] as const).map(([id, texto]) => (
          <button key={id} type="button" onClick={() => setAba(id)} aria-current={aba === id ? "page" : undefined}
            className={`-mb-px min-h-[48px] border-b-4 px-3 text-base font-semibold ${aba === id ? "border-moss text-moss" : "border-transparent text-mute hover:text-ink"}`}>
            {texto}
          </button>
        ))}
      </nav>
      <main>{aba === "negocios" ? <NegociosTab /> : <AuditTab userId={sessao.user.id} />}</main>
    </div>
  );
}

function Mensagem({ texto }: { texto: string }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-5 px-5">
      <p className="text-lg">{texto}</p>
      <button type="button" className="btn-ghost" onClick={() => void supabase.auth.signOut()}>Sair</button>
    </main>
  );
}
