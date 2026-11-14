import { useState, type FormEvent } from "react";
import { Modal } from "./Modal";
import { criarNegocio, type NegocioCriado } from "../lib/api";
import { novoNegocioSchema } from "../lib/schemas";
import { addDaysToDateStr, slugify, todayLisbon } from "../lib/format";

export function NovoNegocioModal({ onClose, onCriado }: { onClose: () => void; onCriado: (r: NegocioCriado, email: string) => void }) {
  const [nome, setNome] = useState("");
  const [slug, setSlug] = useState("");
  const [slugManual, setSlugManual] = useState(false);
  const [contacto, setContacto] = useState("");
  const [email, setEmail] = useState("");
  const [pagoAte, setPagoAte] = useState(addDaysToDateStr(todayLisbon(), 30));
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [aGuardar, setAGuardar] = useState(false);

  async function submeter(e: FormEvent) {
    e.preventDefault();
    setErroGeral(null);
    const r = novoNegocioSchema.safeParse({ nome, slug, contacto, pagoAte, email });
    if (!r.success) {
      const m: Record<string, string> = {};
      for (const i of r.error.issues) m[String(i.path[0])] ??= i.message;
      setErros(m);
      return;
    }
    setErros({});
    setAGuardar(true);
    try {
      const res = await criarNegocio(r.data);
      onCriado(res, r.data.email);
    } catch (err) {
      setErroGeral(err instanceof Error ? err.message : "Não foi possível criar o negócio.");
    } finally {
      setAGuardar(false);
    }
  }

  return (
    <Modal titulo="Novo negócio" onClose={onClose}>
      <form onSubmit={submeter} className="space-y-4" noValidate>
        <div>
          <label htmlFor="nn-nome" className="label">Nome do negócio</label>
          <input id="nn-nome" className="field" value={nome} autoFocus
            onChange={(e) => { setNome(e.target.value); if (!slugManual) setSlug(slugify(e.target.value)); }} />
          {erros.nome && <p className="err">{erros.nome}</p>}
        </div>
        <div>
          <label htmlFor="nn-slug" className="label">Endereço da página pública</label>
          <input id="nn-slug" className="field" value={slug} autoCapitalize="none"
            onChange={(e) => { setSlugManual(true); setSlug(e.target.value.toLowerCase()); }} />
          <p className="hint">A cliente marca em /{slug || "endereco"}</p>
          {erros.slug && <p className="err">{erros.slug}</p>}
        </div>
        <div>
          <label htmlFor="nn-contacto" className="label">Contacto (opcional)</label>
          <input id="nn-contacto" className="field" value={contacto} onChange={(e) => setContacto(e.target.value)} placeholder="Telemóvel ou nome da pessoa" />
          {erros.contacto && <p className="err">{erros.contacto}</p>}
        </div>
        <div>
          <label htmlFor="nn-email" className="label">E-mail do proprietário</label>
          <input id="nn-email" type="email" inputMode="email" autoCapitalize="none" className="field" value={email} onChange={(e) => setEmail(e.target.value)} />
          <p className="hint">Será criada uma conta com palavra-passe temporária.</p>
          {erros.email && <p className="err">{erros.email}</p>}
        </div>
        <div>
          <label htmlFor="nn-pago" className="label">Pago até</label>
          <input id="nn-pago" type="date" className="field" value={pagoAte} onChange={(e) => setPagoAte(e.target.value)} />
          <p className="hint">Até ao fim deste dia (hora de Lisboa) a página aceita marcações.</p>
          {erros.pagoAte && <p className="err">{erros.pagoAte}</p>}
        </div>
        {erroGeral && <p role="alert" className="err">{erroGeral}</p>}
        <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={aGuardar}>{aGuardar ? "A criar…" : "Criar negócio"}</button>
        </div>
      </form>
    </Modal>
  );
}
