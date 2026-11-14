import { useState, type FormEvent } from "react";
import { supabase } from "../../lib/supabase";
import { Modal } from "../Modal";
import { apagarDadosCliente, erroDono, trocarPalavraPasse } from "../../lib/ownerApi";
import { normalizePhone } from "../../lib/format";
import { PASSE_MIN, validarPasse } from "./SenhaObrigatoria";

export function Conta() {
  const [a, setA] = useState(""); const [b, setB] = useState("");
  const [msgPasse, setMsgPasse] = useState<{ ok: boolean; t: string } | null>(null); const [aPasse, setAPasse] = useState(false);
  const [tel, setTel] = useState(""); const [confirmar, setConfirmar] = useState<string | null>(null);
  const [msgDados, setMsgDados] = useState<{ ok: boolean; t: string } | null>(null); const [aApagar, setAApagar] = useState(false);

  async function mudarPasse(e: FormEvent) {
    e.preventDefault(); setMsgPasse(null);
    const v = validarPasse(a, b); if (v) { setMsgPasse({ ok: false, t: v }); return; }
    setAPasse(true);
    try { await trocarPalavraPasse(a); setA(""); setB(""); setMsgPasse({ ok: true, t: "Palavra-passe alterada." }); }
    catch { setMsgPasse({ ok: false, t: "Não foi possível alterar a palavra-passe. Tente novamente." }); }
    finally { setAPasse(false); }
  }

  function pedirApagar(e: FormEvent) {
    e.preventDefault(); setMsgDados(null);
    const t = normalizePhone(tel);
    if (!t) { setMsgDados({ ok: false, t: "Indique um número de telefone válido." }); return; }
    setConfirmar(t);
  }

  async function apagar() {
    if (!confirmar) return;
    setAApagar(true);
    try {
      const n = await apagarDadosCliente(confirmar);
      setMsgDados({ ok: true, t: n === 0 ? "Não há dados com esse número." : `${n} ${n === 1 ? "marcação anonimizada" : "marcações anonimizadas"}. O nome e o telefone foram apagados.` });
      setTel("");
    } catch (e2) { setMsgDados({ ok: false, t: erroDono(e2) }); }
    finally { setAApagar(false); setConfirmar(null); }
  }

  return (
    <section className="space-y-10">
      <form onSubmit={mudarPasse} className="space-y-4" noValidate>
        <h2 className="text-lg font-bold">Alterar palavra-passe</h2>
        <div><label htmlFor="c-a" className="label">Nova palavra-passe</label><input id="c-a" type="password" autoComplete="new-password" className="field" value={a} onChange={(e) => setA(e.target.value)} /><p className="hint">Pelo menos {PASSE_MIN} caracteres.</p></div>
        <div><label htmlFor="c-b" className="label">Repita a palavra-passe</label><input id="c-b" type="password" autoComplete="new-password" className="field" value={b} onChange={(e) => setB(e.target.value)} /></div>
        {msgPasse && <p role={msgPasse.ok ? "status" : "alert"} className={msgPasse.ok ? "font-semibold text-moss" : "err"}>{msgPasse.t}</p>}
        <button type="submit" className="btn-primary" disabled={aPasse}>{aPasse ? "A guardar…" : "Alterar palavra-passe"}</button>
      </form>

      <form onSubmit={pedirApagar} className="space-y-4" noValidate>
        <h2 className="text-lg font-bold">Apagar dados de uma cliente</h2>
        <p className="text-mute">Se uma cliente pedir, apaga o nome e o telefone de todas as marcações dela. As marcações ficam no histórico, sem identificar a pessoa. Não se pode desfazer.</p>
        <div><label htmlFor="c-tel" className="label">Telemóvel da cliente</label><input id="c-tel" type="tel" inputMode="tel" className="field" value={tel} onChange={(e) => setTel(e.target.value)} placeholder="912 345 678" autoComplete="off" /></div>
        {msgDados && <p role={msgDados.ok ? "status" : "alert"} className={msgDados.ok ? "font-semibold text-moss" : "err"}>{msgDados.t}</p>}
        <button type="submit" className="btn-ghost text-brick">Apagar dados…</button>
      </form>

      <div className="border-t border-line pt-6"><button type="button" className="btn-ghost" onClick={() => void supabase.auth.signOut()}>Sair</button></div>

      {confirmar && (
        <Modal titulo="Apagar dados da cliente" onClose={() => setConfirmar(null)}>
          <p>Apagar o nome e o telefone de todas as marcações de <strong className="font-mono">{confirmar}</strong>? Não se pode desfazer.</p>
          <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button type="button" className="btn-ghost" onClick={() => setConfirmar(null)}>Cancelar</button>
            <button type="button" className="btn-danger" disabled={aApagar} onClick={() => void apagar()}>{aApagar ? "A apagar…" : "Apagar dados"}</button>
          </div>
        </Modal>
      )}
    </section>
  );
}
