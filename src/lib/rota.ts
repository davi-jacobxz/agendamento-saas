export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
/** Tem de coincidir com a lista de slugs reservados do banco. */
export const RESERVADOS = ["admin", "api", "login", "painel", "privacidade", "app", "assets", "static", "suporte", "super", "sw", "manifest", "robots", "sitemap"];
const APP = ["", "login", "painel", "admin", "suporte", "super"];

export type Rota = { tipo: "app" } | { tipo: "privacidade" } | { tipo: "pagina"; slug: string } | { tipo: "nao-encontrada" };

export function rotaDe(pathname: string): Rota {
  const seg = pathname.split("/").filter(Boolean).map((s) => s.toLowerCase());
  if (seg.length === 0) return { tipo: "app" };
  if (seg.length > 1) return { tipo: "nao-encontrada" };
  const [s] = seg;
  if (APP.includes(s)) return { tipo: "app" };
  if (s === "privacidade") return { tipo: "privacidade" };
  if (RESERVADOS.includes(s) || s.length < 3 || s.length > 40 || !SLUG_RE.test(s)) return { tipo: "nao-encontrada" };
  return { tipo: "pagina", slug: s };
}

/** Ligação do WhatsApp com a mensagem pronta. Devolve null se o número não for válido. */
export function ligacaoWhatsApp(numero: string | null | undefined, texto: string): string | null {
  const d = (numero ?? "").replace(/\D/g, "");
  if (d.length < 8 || d.length > 15) return null;
  return `https://wa.me/${d}?text=${encodeURIComponent(texto)}`;
}

/** Instagram: só o nome de utilizador → ligação. */
export function ligacaoInstagram(user: string | null | undefined): string | null {
  return user && /^[A-Za-z0-9._]{1,30}$/.test(user) ? `https://instagram.com/${user}` : null;
}
