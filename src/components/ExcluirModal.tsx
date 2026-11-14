import { useState, type FormEvent } from "react";
import { Modal } from "./Modal";
import { excluirNegocio, type Negocio } from "../lib/api";

export function ExcluirModal({ negocio, onClose, onExcluido }: { negocio: Negocio; onClose: () => void; onExcluido: () => void }) {
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [aApagar, setAApagar] = useState(false);
  const confere = texto.trim().toLowerCase() === negocio.slug;

  async function submeter(e: FormEvent) {
    e.preventDefault();
    if (!confere) return;
    setAApagar(true); setErro(null);
    try { await excluirNegocio(negocio.id, texto.trim().toLowerCase()); onExcluido(); }
    catch (err) { setErro(err instanceof Error ? err.message : "Não foi possível excluir o negócio."); }
    finally { setAApagar(false); }
  }

  return (
    <Modal titulo={`Excluir · ${negocio.name}`} onClose={() => { if (!aApagar) onClose(); }}>
      <form onSubmit={submeter} className="space-y-4">
        <p className="rounded-lg bg-brick/10 px-4 py-3 text-sm font-semibold text-brick">Esta ação é definitiva e não pode ser desfeita.</p>
        <p>Vai apagar:</p>
        <ul className="list-disc space-y-1 pl-6">
          <li>a conta do proprietário (deixa de conseguir entrar);</li>
          <li>o negócio, os serviços, os profissionais e os horários;</li>
          <li>todas as marcações e os dados das clientes ({negocio.total_marcacoes} {negocio.total_marcacoes === 1 ? "marcação" : "marcações"}).</li>
        </ul>
        <p className="text-sm text-mute">O registo de acessos guarda só o nome e o endereço do negócio excluído.</p>
        <div>
          <label htmlFor="ex-slug" className="label">Para confirmar, escreva <span className="font-mono">{negocio.slug}</span></label>
          <input id="ex-slug" className="field font-mono" value={texto} autoCapitalize="none" autoComplete="off" spellCheck={false} onChange={(e) => setTexto(e.target.value)} />
        </div>
        {erro && <p role="alert" className="err">{erro}</p>}
        <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={aApagar}>Cancelar</button>
          <button type="submit" className="btn-danger" disabled={!confere || aApagar}>{aApagar ? "A excluir…" : "Excluir definitivamente"}</button>
        </div>
      </form>
    </Modal>
  );
}
