import { useEffect, useState } from "react";
import { cancelarMinhaMarcacao, verMinhaMarcacao, LIMITE, type MinhaMarcacao } from "../../lib/publicApi";
import { fmtDayLong, fmtTime, lisbonDateInput } from "../../lib/format";

type Estado = "a_carregar" | "erro" | "limite" | "nao_encontrada" | "carregada";

export default function CancelarMarcacao({ slug, id }: { slug: string; id: string }) {
  const [estado, setEstado] = useState<Estado>("a_carregar");
  const [marcacao, setMarcacao] = useState<MinhaMarcacao | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [aCancelar, setACancelar] = useState(false);

  async function carregar() {
    setEstado("a_carregar");
    setMensagem(null);
    try {
      const resultado = await verMinhaMarcacao(slug, id);
      if (!resultado.encontrada) {
        setMarcacao(null);
        setEstado("nao_encontrada");
        return;
      }
      setMarcacao(resultado);
      setEstado("carregada");
    } catch (e) {
      setEstado((e as Error).message === LIMITE ? "limite" : "erro");
    }
  }

  useEffect(() => { void carregar(); }, [slug, id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function cancelar() {
    if (!window.confirm("Tem a certeza de que pretende cancelar esta marcação?")) return;
    setACancelar(true);
    setMensagem(null);
    try {
      const resultado = await cancelarMinhaMarcacao(slug, id);
      if (resultado.ok) {
        setMarcacao((atual) => atual?.encontrada ? { ...atual, status: "cancelado", pode_cancelar: false } : atual);
        return;
      }
      setMensagem(resultado.mensagem ?? "Não foi possível cancelar a marcação.");
      if (resultado.code === "ja_cancelada" || resultado.code === "no_passado" || resultado.code === "nao_encontrada") {
        await carregar();
      }
    } catch (e) {
      setMensagem((e as Error).message === LIMITE
        ? "Demasiados pedidos seguidos. Aguarde um minuto e tente de novo."
        : "Não foi possível cancelar a marcação. Verifique a ligação e tente novamente.");
    } finally {
      setACancelar(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4 py-10">
      <section className="cartao">
        <p className="text-xs font-bold uppercase tracking-wider text-mute">Gestão da marcação</p>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight">Cancelar marcação</h1>

        {estado === "a_carregar" && <p className="mt-5 text-mute">A consultar a sua marcação…</p>}
        {estado === "erro" && (
          <div className="mt-5">
            <p role="alert" className="text-mute">Não foi possível consultar a marcação.</p>
            <button type="button" className="btn-primary mt-4" onClick={() => void carregar()}>Tentar de novo</button>
          </div>
        )}
        {estado === "limite" && (
          <div className="mt-5">
            <p role="alert" className="text-mute">Demasiados pedidos seguidos. Aguarde um minuto e tente de novo.</p>
            <button type="button" className="btn-primary mt-4" onClick={() => void carregar()}>Tentar de novo</button>
          </div>
        )}
        {estado === "nao_encontrada" && (
          <div className="mt-5">
            <p className="text-mute">Não foi possível encontrar esta marcação. Confirme se está a utilizar o link recebido.</p>
          </div>
        )}
        {estado === "carregada" && marcacao?.encontrada && (
          <>
            <div className="mt-5 rounded-xl border border-line bg-white p-4">
              <p className="text-lg font-bold">{marcacao.servico}</p>
              <p className="mt-1 first-letter:uppercase">{fmtDayLong(lisbonDateInput(marcacao.inicio))}</p>
              <p className="text-sm text-mute">Às {fmtTime(marcacao.inicio)}</p>
              {marcacao.profissional && <p className="mt-2 text-sm text-mute">Com {marcacao.profissional}</p>}
            </div>

            {marcacao.status === "cancelado" && (
              <p role="status" className="mt-5 rounded-xl bg-porcelain p-4 font-semibold">Esta marcação já foi cancelada.</p>
            )}
            {marcacao.status === "confirmado" && !marcacao.pode_cancelar && (
              <p className="mt-5 rounded-xl bg-porcelain p-4 font-semibold">Esta marcação já passou e não pode ser cancelada online.</p>
            )}
            {mensagem && <p role="alert" className="mt-4 text-sm font-semibold text-brick">{mensagem}</p>}
            {marcacao.pode_cancelar && (
              <button type="button" className="btn-primary mt-5 w-full" disabled={aCancelar} onClick={() => void cancelar()}>
                {aCancelar ? "A cancelar…" : "Cancelar marcação"}
              </button>
            )}
          </>
        )}

        <a href={`/${slug}`} className="btn-ghost mt-5 w-full">Voltar à página de marcação</a>
      </section>
    </main>
  );
}
