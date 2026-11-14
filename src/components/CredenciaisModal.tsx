import { useState } from "react";
import { Modal } from "./Modal";
import type { NegocioCriado } from "../lib/api";

export function CredenciaisModal({ dados, email, onClose }: { dados: NegocioCriado; email: string; onClose: () => void }) {
  const [copiado, setCopiado] = useState(false);
  const [confirmado, setConfirmado] = useState(false);
  const texto = `Página: ${location.origin}/${dados.slug}\nE-mail: ${email}\nPalavra-passe temporária: ${dados.senha_temporaria}`;

  async function copiar() {
    try { await navigator.clipboard.writeText(texto); setCopiado(true); } catch { setCopiado(false); }
  }

  return (
    <Modal titulo="Negócio criado" onClose={() => { if (confirmado) onClose(); }}>
      <p className="font-semibold text-brick">Esta palavra-passe só aparece agora. Guarde-a antes de fechar.</p>
      <dl className="mt-4 space-y-3 rounded-lg border border-line bg-white p-4 text-base">
        <div><dt className="text-sm text-mute">E-mail</dt><dd className="break-all font-semibold">{email}</dd></div>
        <div><dt className="text-sm text-mute">Palavra-passe temporária</dt><dd className="select-all font-mono text-lg font-bold tracking-wide">{dados.senha_temporaria}</dd></div>
        <div><dt className="text-sm text-mute">Endereço público</dt><dd className="break-all font-semibold">/{dados.slug}</dd></div>
      </dl>
      <button type="button" className="btn-ghost mt-4 w-full" onClick={copiar}>{copiado ? "Copiado" : "Copiar tudo"}</button>
      <label className="mt-5 flex min-h-[48px] items-start gap-3 text-base">
        <input type="checkbox" className="mt-1 h-5 w-5 accent-[#2F5D50]" checked={confirmado} onChange={(e) => setConfirmado(e.target.checked)} />
        <span>Já guardei a palavra-passe.</span>
      </label>
      <button type="button" className="btn-primary mt-3 w-full" disabled={!confirmado} onClick={onClose}>Fechar</button>
    </Modal>
  );
}
