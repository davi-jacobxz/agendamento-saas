import { useState, type FormEvent } from "react";
import { Modal } from "./Modal";
import { definirPagoAte, mensagemErro, type Negocio } from "../lib/api";
import { addDaysToDateStr, lisbonDateInput, todayLisbon } from "../lib/format";

export function PagoAteModal({ negocio, onClose, onGuardado }: { negocio: Negocio; onClose: () => void; onGuardado: () => void }) {
  const hoje = todayLisbon();
  const inicial = negocio.paid_until && lisbonDateInput(negocio.paid_until) >= hoje ? lisbonDateInput(negocio.paid_until) : hoje;
  const [data, setData] = useState(inicial);
  const [erro, setErro] = useState<string | null>(null);
  const [aGuardar, setAGuardar] = useState(false);

  async function submeter(e: FormEvent) {
    e.preventDefault();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) { setErro("Escolha uma data."); return; }
    setAGuardar(true); setErro(null);
    try { await definirPagoAte(negocio.id, data); onGuardado(); }
    catch (err) { setErro(mensagemErro(err)); }
    finally { setAGuardar(false); }
  }

  return (
    <Modal titulo={`Pago até · ${negocio.name}`} onClose={onClose}>
      <form onSubmit={submeter} className="space-y-4">
        <div>
          <label htmlFor="pa-data" className="label">Nova data</label>
          <input id="pa-data" type="date" className="field" value={data} onChange={(e) => setData(e.target.value)} />
          <p className="hint">Termina às 23:59 (hora de Lisboa) deste dia.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {[30, 90, 365].map((d) => (
            <button key={d} type="button" className="btn-ghost btn-sm" onClick={() => setData(addDaysToDateStr(hoje, d))}>
              {d === 365 ? "+1 ano" : `+${d} dias`}
            </button>
          ))}
        </div>
        {erro && <p role="alert" className="err">{erro}</p>}
        <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={aGuardar}>{aGuardar ? "A guardar…" : "Guardar data"}</button>
        </div>
      </form>
    </Modal>
  );
}
