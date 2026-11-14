import { useEffect, useState } from "react";
import { IMG_MAX_BYTES, IMG_TIPOS, urlImagem } from "../../lib/ownerApi";

/** Escolhe e pré-visualiza uma imagem. O envio só acontece quando o formulário é guardado. */
export function ImageField({ label, atual, pendente, removida, onPick, onRemove, redonda = false }: {
  label: string; atual: string | null; pendente: File | null; removida: boolean;
  onPick: (f: File) => void; onRemove: () => void; redonda?: boolean;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!pendente) { setPreview(null); return; }
    const u = URL.createObjectURL(pendente);
    setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [pendente]);

  const mostrar = preview ?? (removida ? null : urlImagem(atual));

  function escolher(f: File | undefined) {
    setErro(null);
    if (!f) return;
    if (!IMG_TIPOS[f.type]) { setErro("Use uma imagem PNG, JPG ou WebP."); return; }
    if (f.size > IMG_MAX_BYTES) { setErro("A imagem tem mais de 1 MB. Escolha uma mais pequena."); return; }
    onPick(f);
  }

  return (
    <div>
      <p className="label">{label}</p>
      <div className="flex items-center gap-4">
        <div className={`flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden border border-line bg-white text-xs text-mute ${redonda ? "rounded-full" : "rounded-lg"}`}>
          {mostrar ? <img src={mostrar} alt="" className="h-full w-full object-cover" /> : "Sem imagem"}
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="btn-ghost btn-sm cursor-pointer">
            {mostrar ? "Trocar" : "Escolher imagem"}
            <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => { escolher(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
          {mostrar && <button type="button" className="btn-ghost btn-sm text-brick" onClick={() => { setErro(null); onRemove(); }}>Remover</button>}
        </div>
      </div>
      <p className="hint">PNG, JPG ou WebP, até {IMG_MAX_BYTES / 1024 / 1024} MB.</p>
      {erro && <p role="alert" className="err">{erro}</p>}
    </div>
  );
}
