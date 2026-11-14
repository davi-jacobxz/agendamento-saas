import { useEffect, useRef, type ReactNode } from "react";

export function Modal({ titulo, onClose, children, largo = false }: { titulo: string; onClose: () => void; children: ReactNode; largo?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    return () => { if (d?.open) d.close(); };
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}
      aria-labelledby="modal-titulo"
      className={`m-auto w-[calc(100%-1.5rem)] ${largo ? "max-w-3xl" : "max-w-lg"} rounded-2xl border border-line bg-paper p-0 text-ink shadow-xl`}
    >
      <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
        <h2 id="modal-titulo" className="text-lg font-bold">{titulo}</h2>
        <button type="button" onClick={onClose} aria-label="Fechar" className="-m-2 flex h-11 w-11 items-center justify-center rounded-lg text-2xl leading-none text-mute hover:bg-porcelain">×</button>
      </div>
      <div className="max-h-[75vh] overflow-y-auto px-5 py-4">{children}</div>
    </dialog>
  );
}
