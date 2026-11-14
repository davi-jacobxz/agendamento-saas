import { useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";
import { loginSchema } from "../lib/schemas";

export function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [aEntrar, setAEntrar] = useState(false);

  async function submeter(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    const r = loginSchema.safeParse({ email, password });
    if (!r.success) { setErro(r.error.issues[0].message); return; }
    setAEntrar(true);
    const { error } = await supabase.auth.signInWithPassword(r.data);
    setAEntrar(false);
    if (error) setErro(error.message === "Failed to fetch" ? "Sem ligação à internet. Tente novamente." : "E-mail ou palavra-passe incorretos.");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-10">
      <h1 className="text-3xl font-bold tracking-tight">Entrar</h1>
      <p className="mt-2 text-mute">Entre na sua conta para continuar.</p>
      <form onSubmit={submeter} className="mt-8 space-y-5" noValidate>
        <div>
          <label htmlFor="email" className="label">E-mail</label>
          <input id="email" type="email" autoComplete="username" inputMode="email" className="field" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label htmlFor="pw" className="label">Palavra-passe</label>
          <input id="pw" type="password" autoComplete="current-password" className="field" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {erro && <p role="alert" className="err">{erro}</p>}
        <button type="submit" className="btn-primary w-full" disabled={aEntrar}>{aEntrar ? "A entrar…" : "Entrar"}</button>
      </form>
    </main>
  );
}
