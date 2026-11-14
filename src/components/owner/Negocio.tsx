import { useState, type FormEvent } from "react";
import { z } from "zod";
import type { Props } from "./tipos";
import { ImageField } from "./ImageField";
import { apagarImagem, enviarImagem, erroDono, guardarNegocio, type NegocioEditavel } from "../../lib/ownerApi";
import { contrastWithWhite, normalizePhone } from "../../lib/format";
import { MENSAGEM_WHATSAPP_PADRAO, VARIAVEIS_WHATSAPP, montarMensagemWhatsApp } from "../../lib/mensagem";

const schema = z.object({
  name: z.string().trim().min(2, "O nome precisa de pelo menos 2 letras.").max(80, "O nome pode ter no máximo 80 letras."),
  primary_color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Escolha uma cor válida."),
  welcome_text: z.string().trim().max(500, "O texto de boas-vindas pode ter no máximo 500 caracteres."),
  address: z.string().trim().max(200, "A morada pode ter no máximo 200 caracteres."),
  instagram: z.string().trim().regex(/^$|^[A-Za-z0-9._]{1,30}$/, "O Instagram deve ser só o nome de utilizador (ex.: studio.ana)."),
  professional_label: z.string().trim().min(2, "O nome do profissional precisa de pelo menos 2 letras.").max(40, "O nome do profissional pode ter no máximo 40 letras."),
  confirmation_message: z.string().trim().max(500, "A mensagem final pode ter no máximo 500 caracteres."),
  whatsapp_message: z.string().trim().max(300, "A mensagem do WhatsApp pode ter no máximo 300 caracteres."),
});

const MIN_NOTICE: [number, string][] = [[0, "Sem antecedência"], [30, "30 minutos"], [60, "1 hora"], [120, "2 horas"], [240, "4 horas"], [720, "12 horas"], [1440, "1 dia"], [2880, "2 dias"]];
const MAX_ADV: [number, string][] = [[7, "1 semana"], [14, "2 semanas"], [30, "1 mês"], [60, "2 meses"], [90, "3 meses"], [180, "6 meses"], [365, "1 ano"]];
const SLOTS = [5, 10, 15, 20, 30, 45, 60, 75, 90, 100];

function opcoes<T extends number>(lista: [T, string][], atual: T): [T, string][] {
  return lista.some(([v]) => v === atual) ? lista : [...lista, [atual, `${atual} (valor atual)`]].sort((a, b) => (a[0] as number) - (b[0] as number)) as [T, string][];
}

export function Negocio({ dados, recarregar }: Props) {
  const n = dados.negocio;
  const [nome, setNome] = useState(n.name);
  const [cor, setCor] = useState(n.primary_color);
  const [boasVindas, setBoasVindas] = useState(n.welcome_text ?? "");
  const [morada, setMorada] = useState(n.address ?? "");
  const [insta, setInsta] = useState(n.instagram ?? "");
  const [zap, setZap] = useState(n.whatsapp ?? "");
  const [rotulo, setRotulo] = useState(n.professional_label);
  const [msgFinal, setMsgFinal] = useState(n.confirmation_message ?? "");
  const [msgZap, setMsgZap] = useState(n.whatsapp_message ?? "");
  const [antMin, setAntMin] = useState(n.min_notice_minutes);
  const [antMax, setAntMax] = useState(n.max_advance_days);
  const [passo, setPasso] = useState(n.slot_interval_minutes);
  const [logo, setLogo] = useState<File | null>(null); const [logoRem, setLogoRem] = useState(false);
  const [capa, setCapa] = useState<File | null>(null); const [capaRem, setCapaRem] = useState(false);
  const [erro, setErro] = useState<string | null>(null); const [ok, setOk] = useState(false); const [a, setA] = useState(false);
  const [copiado, setCopiado] = useState(false);

  const contraste = contrastWithWhite(/^#[0-9a-fA-F]{6}$/.test(cor) ? cor : "#000000");
  const fraco = contraste < 4.5, ilegivel = contraste < 3;
  const link = `${location.origin}/${n.slug}`;

  async function submeter(e: FormEvent) {
    e.preventDefault(); setErro(null); setOk(false);
    const r = schema.safeParse({ name: nome, primary_color: cor, welcome_text: boasVindas, address: morada, instagram: insta.replace(/^@/, ""), professional_label: rotulo, confirmation_message: msgFinal, whatsapp_message: msgZap });
    if (!r.success) { setErro(r.error.issues[0].message); return; }
    let whatsapp: string | null = null;
    if (zap.trim()) { whatsapp = normalizePhone(zap); if (!whatsapp) { setErro("Número de WhatsApp inválido. Ex.: 912 345 678."); return; } }
    if (ilegivel) { setErro("A cor principal é demasiado clara: o texto branco dos botões não se lê. Escolha uma cor mais escura."); return; }
    setA(true);
    const novos: string[] = [];
    try {
      const patch: NegocioEditavel = {
        name: r.data.name, primary_color: r.data.primary_color.toLowerCase(),
        welcome_text: r.data.welcome_text || null, address: r.data.address || null, instagram: r.data.instagram || null,
        whatsapp, professional_label: r.data.professional_label, confirmation_message: r.data.confirmation_message || null, whatsapp_message: r.data.whatsapp_message || null,
        min_notice_minutes: antMin, max_advance_days: antMax, slot_interval_minutes: passo,
      };
      if (logo) { const p = await enviarImagem(n.id, "logo", logo); novos.push(p); patch.logo_path = p; } else if (logoRem) patch.logo_path = null;
      if (capa) { const p = await enviarImagem(n.id, "capa", capa); novos.push(p); patch.cover_path = p; } else if (capaRem) patch.cover_path = null;
      await guardarNegocio(n.id, patch);
      if (logo || logoRem) await apagarImagem(n.logo_path);
      if (capa || capaRem) await apagarImagem(n.cover_path);
      setLogo(null); setLogoRem(false); setCapa(null); setCapaRem(false);
      await recarregar(); setOk(true);
    } catch (e2) {
      for (const p of novos) await apagarImagem(p);
      setErro(e2 instanceof Error && !("code" in e2) ? e2.message : erroDono(e2));
    } finally { setA(false); }
  }

  async function copiar() { try { await navigator.clipboard.writeText(link); setCopiado(true); } catch { setCopiado(false); } }

  return (
    <form onSubmit={submeter} noValidate className="space-y-8 pb-24">
      <section className="rounded-xl border border-line bg-paper p-4">
        <p className="label">A sua página de marcações</p>
        <p className="break-all font-mono text-sm">{link}</p>
        <button type="button" className="btn-ghost btn-sm mt-2" onClick={() => void copiar()}>{copiado ? "Copiado" : "Copiar ligação"}</button>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-bold">Identidade</h2>
        <div><label htmlFor="n-nome" className="label">Nome do negócio</label><input id="n-nome" className="field" value={nome} onChange={(e) => setNome(e.target.value)} /></div>
        <ImageField label="Logótipo" atual={n.logo_path} pendente={logo} removida={logoRem} onPick={(f) => { setLogo(f); setLogoRem(false); }} onRemove={() => { setLogo(null); setLogoRem(true); }} />
        <ImageField label="Foto de capa (opcional)" atual={n.cover_path} pendente={capa} removida={capaRem} onPick={(f) => { setCapa(f); setCapaRem(false); }} onRemove={() => { setCapa(null); setCapaRem(true); }} />
        <div>
          <label htmlFor="n-cor" className="label">Cor principal</label>
          <div className="flex items-center gap-3">
            <input id="n-cor" type="color" className="h-12 w-16 cursor-pointer rounded-lg border border-line bg-white p-1" value={/^#[0-9a-fA-F]{6}$/.test(cor) ? cor : "#000000"} onChange={(e) => setCor(e.target.value)} />
            <span className="inline-flex min-h-[48px] items-center rounded-lg px-5 font-semibold text-white" style={{ backgroundColor: cor }}>Marcar</span>
          </div>
          <p className={`mt-1 text-sm font-medium ${ilegivel ? "text-brick" : fraco ? "text-brass" : "text-moss"}`}>
            Contraste {contraste.toFixed(1).replace(".", ",")}:1 — {ilegivel ? "o texto não se lê; escolha uma cor mais escura" : fraco ? "fraco; recomendado pelo menos 4,5:1" : "bom"}
          </p>
        </div>
        <div><label htmlFor="n-bv" className="label">Texto de boas-vindas</label><textarea id="n-bv" rows={3} className="field !py-2" value={boasVindas} onChange={(e) => setBoasVindas(e.target.value)} /></div>
        <div><label htmlFor="n-morada" className="label">Morada</label><input id="n-morada" className="field" value={morada} onChange={(e) => setMorada(e.target.value)} autoComplete="street-address" /></div>
        <div><label htmlFor="n-insta" className="label">Instagram</label><input id="n-insta" className="field" value={insta} onChange={(e) => setInsta(e.target.value)} placeholder="studio.ana" autoCapitalize="none" /><p className="hint">Só o nome de utilizador, sem @.</p></div>
        <div><label htmlFor="n-zap" className="label">WhatsApp</label><input id="n-zap" type="tel" inputMode="tel" className="field" value={zap} onChange={(e) => setZap(e.target.value)} placeholder="912 345 678" /><p className="hint">É para este número que a cliente envia a confirmação.</p></div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-bold">Textos</h2>
        <div><label htmlFor="n-rot" className="label">Como chama aos seus profissionais</label><input id="n-rot" className="field" value={rotulo} onChange={(e) => setRotulo(e.target.value)} placeholder="Barbeiro, Manicure…" /><p className="hint">Aparece quando a cliente escolhe com quem marcar.</p></div>
        <div><label htmlFor="n-msg" className="label">Mensagem final de confirmação</label><textarea id="n-msg" rows={3} className="field !py-2" value={msgFinal} onChange={(e) => setMsgFinal(e.target.value)} placeholder="Ex.: Obrigada! Pedimos que chegue 5 minutos antes." /></div>
        <div>
          <label htmlFor="n-zap-msg" className="label">Mensagem pronta do WhatsApp</label>
          <textarea id="n-zap-msg" rows={3} maxLength={300} className="field !py-2" value={msgZap} onChange={(e) => setMsgZap(e.target.value)} placeholder={MENSAGEM_WHATSAPP_PADRAO} />
          <p className="hint">É o texto que a cliente envia ao carregar em “Confirmar pelo WhatsApp”. Se deixar em branco, usa uma mensagem padrão. Toque para acrescentar:</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {VARIAVEIS_WHATSAPP.map((v) => (
              <button key={v.chave} type="button" className="btn-ghost btn-sm" title={v.descricao} onClick={() => setMsgZap((t) => (t + (t && !t.endsWith(" ") ? " " : "") + `{${v.chave}}`).slice(0, 300))}>{`{${v.chave}}`}</button>
            ))}
          </div>
          <p className="mt-3 text-sm font-semibold">Como a cliente vai ver:</p>
          <p className="mt-1 whitespace-pre-line rounded-lg border border-line bg-white px-3 py-2 text-sm">{montarMensagemWhatsApp(msgZap, { nome: "Maria", servico: "Corte", dia: "terça-feira, 10 de novembro", hora: "15:00" })}</p>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-bold">Regras de marcação</h2>
        <div><label htmlFor="n-am" className="label">Antecedência mínima</label><select id="n-am" className="field" value={antMin} onChange={(e) => setAntMin(Number(e.target.value))}>{opcoes(MIN_NOTICE, antMin).map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select><p className="hint">Quanto tempo antes a cliente tem de marcar.</p></div>
        <div><label htmlFor="n-aM" className="label">Antecedência máxima</label><select id="n-aM" className="field" value={antMax} onChange={(e) => setAntMax(Number(e.target.value))}>{opcoes(MAX_ADV, antMax).map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select><p className="hint">Até onde no futuro se pode marcar.</p></div>
        <div><label htmlFor="n-ps" className="label">Intervalo entre horários</label><select id="n-ps" className="field" value={passo} onChange={(e) => setPasso(Number(e.target.value))}>{SLOTS.map((v) => <option key={v} value={v}>{v >= 60 ? `${Math.floor(v / 60)} h${v % 60 ? ` ${v % 60} min` : ""}` : `${v} minutos`}</option>)}</select><p className="hint">De quanto em quanto tempo aparecem horários livres.</p></div>
        <p className="hint">O intervalo entre clientes define-se em cada serviço (separador “Serviços”). O horário de funcionamento define-se por profissional, no separador “Equipa”.</p>
      </section>

      <div className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] z-10 border-t border-line bg-porcelain/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <div className="min-w-0 flex-1 text-sm">{erro ? <p role="alert" className="err !mt-0">{erro}</p> : ok ? <p role="status" className="font-semibold text-moss">Guardado.</p> : null}</div>
          <button type="submit" className="btn-primary shrink-0" disabled={a}>{a ? "A guardar…" : "Guardar alterações"}</button>
        </div>
      </div>
    </form>
  );
}
