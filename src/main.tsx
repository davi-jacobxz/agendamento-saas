import { createRoot } from "react-dom/client";
import "@fontsource/figtree/latin-400.css";
import "@fontsource/figtree/latin-500.css";
import "@fontsource/figtree/latin-600.css";
import "@fontsource/figtree/latin-700.css";
import "./index.css";
import { rotaDe } from "./lib/rota";

const root = createRoot(document.getElementById("root")!);

function Aviso({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-3 px-5">
      <h1 className="text-xl font-bold">{titulo}</h1>
      <p className="text-mute">{texto}</p>
    </main>
  );
}

const falha = (e: unknown) => {
  console.error(e);
  root.render(<Aviso titulo="Não foi possível arrancar" texto="Atualize a página. Se continuar, abra a consola do browser (F12) e envie o erro." />);
};

const rota = rotaDe(location.pathname);

if (rota.tipo === "nao-encontrada") {
  root.render(<Aviso titulo="Página não encontrada" texto="Verifique o endereço que recebeu." />);
} else if (rota.tipo === "privacidade") {
  import("./components/publico/Privacidade").then(({ default: P }) => root.render(<P />)).catch(falha);
} else if (rota.tipo === "pagina") {
  const slug = rota.slug;
  import("./components/publico/PaginaPublica").then(({ default: P }) => root.render(<P slug={slug} />)).catch(falha);
} else {
  import("./App").then(({ default: App }) => root.render(<App />)).catch(falha);
}
