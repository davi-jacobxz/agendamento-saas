import { useState, type FormEvent } from "react";
import { supabase } from "../../lib/supabase";
import { trocarPalavraPasse } from "../../lib/ownerApi";

export const PASSE_MIN = 10;

export function validarPasse(a: string, b: string): string | null {
  if (a.length < PASSE_MIN) return `A palavra-passe precisa de pelo menos ${PASSE_MIN} caracteres.`;
  if (a !== b) return "As duas palavras-passe não são iguais.";
  return null;
}

export function SenhaObrigatoria({ onFeito }: { onFeito: () => void }) {
  const [a, setA] = useState(""); const [b, setB] = useState("");
  const [erro, setErro] = useState<string | null>(null); const [aGuardar, setAGuardar] = useState(false);

  async function submeter(e: FormEvent) {
    e.preventDefault();
    const v = validarPasse(a, b);
    if (v) { setErro(v); return; }
    setAGuardar(true); setErro(null);
    try { await trocarPalavraPasse(a); onFeito(); }
    catch { setErro("Não foi possível guardar a palavra-passe. Tente novamente."); }
    finally { setAGuardar(false); }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-10">
      <h1 className="text-2xl font-bold tracking-tight">Escolha a sua palavra-passe</h1>
      <p className="mt-2 text-mute">Entrou com uma palavra-passe temporária. Defina uma só sua para continuar.</p>
      <form onSubmit={submeter} className="mt-6 space-y-5" noValidate>
        <div>
          <label htmlFor="np1" className="label">Nova palavra-passe</label>
          <input id="np1" type="password" autoComplete="new-password" className="field" value={a} onChange={(e) => setA(e.target.value)} />
          <p className="hint">Pelo menos {PASSE_MIN} caracteres.</p>
        </div>
        <div>
          <label htmlFor="np2" className="label">Repita a palavra-passe</label>
          <input id="np2" type="password" autoComplete="new-password" className="field" value={b} onChange={(e) => setB(e.target.value)} />
        </div>
        {erro && <p role="alert" className="err">{erro}</p>}
        <button type="submit" className="btn-primary w-full" disabled={aGuardar}>{aGuardar ? "A guardar…" : "Guardar e continuar"}</button>
        <button type="button" className="btn-ghost w-full" onClick={() => void supabase.auth.signOut()}>Sair</button>
      </form>
    </main>
  );
}
