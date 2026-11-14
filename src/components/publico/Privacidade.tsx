import { useEffect, useState } from "react";
import { EMPRESA, empresaConfigurada } from "../../lib/empresa";
import { carregarNegocio, type NegocioPublico } from "../../lib/publicApi";
import { ligacaoInstagram } from "../../lib/rota";

const ATUALIZADA = "novembro de 2026";
const RGPD_URL = "https://eur-lex.europa.eu/legal-content/PT/TXT/?uri=CELEX:32016R0679";
const CNPD_URL = "https://www.cnpd.pt";

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (<><h2 className="mt-8 text-xl font-bold">{titulo}</h2><div className="mt-2 space-y-2">{children}</div></>);
}

export default function Privacidade() {
  const slug = new URLSearchParams(location.search).get("negocio")?.trim().toLowerCase() ?? "";
  const [negocio, setNegocio] = useState<NegocioPublico | null>(null);

  useEffect(() => {
    document.title = "Política de privacidade";
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length < 3 || slug.length > 40) return;
    carregarNegocio(slug).then((c) => { if (c.encontrado && c.disponivel) setNegocio(c.negocio); }).catch(() => { /* mostra a versão geral */ });
  }, [slug]);

  const insta = ligacaoInstagram(negocio?.instagram);
  const contactoNegocio = negocio && (negocio.whatsapp || negocio.instagram)
    ? [negocio.whatsapp ? `WhatsApp ${negocio.whatsapp}` : null, negocio.instagram ? `Instagram @${negocio.instagram}` : null].filter(Boolean).join(" · ")
    : null;
  const quem = negocio ? negocio.nome : "o negócio onde faz a marcação";

  return (
    <main className="mx-auto max-w-2xl px-5 py-10 leading-relaxed">
      <h1 className="text-3xl font-bold tracking-tight">Política de privacidade</h1>
      <p className="mt-2 text-mute">Como tratamos os dados que indica ao fazer uma marcação, nos termos do Regulamento Geral sobre a Proteção de Dados (RGPD). Atualizada em {ATUALIZADA}.</p>

      <Secao titulo="Quem é o responsável">
        {negocio ? (
          <>
            <p>O responsável pelo tratamento dos seus dados é <strong>{negocio.nome}</strong>{negocio.endereco ? `, com morada em ${negocio.endereco}` : ""}.</p>
            {contactoNegocio && <p>Contacto: {contactoNegocio}.{insta ? <> <a className="font-semibold underline" href={insta} target="_blank" rel="noreferrer">Abrir Instagram</a></> : null}</p>}
          </>
        ) : (
          <p>O responsável pelo tratamento dos seus dados é o <strong>negócio onde faz a marcação</strong> (o nome e os contactos estão na página de marcação).</p>
        )}
        <p>A plataforma de marcações{empresaConfigurada() ? `, operada por ${EMPRESA.nome},` : ""} trata os dados por conta {negocio ? "deste negócio" : "desse negócio"} e segundo as suas instruções (como subcontratante).</p>
      </Secao>

      <Secao titulo="Que dados recolhemos">
        <p>O seu <strong>nome</strong> e o seu <strong>número de telemóvel</strong>, o serviço, o dia e a hora da marcação, e o momento em que autorizou o uso do telefone. Não criamos conta para si e não recolhemos mais nada.</p>
        <p>Para evitar abusos (como marcações falsas ou em excesso), guardamos durante poucos dias um código irreversível derivado do endereço IP e do telefone. Não guardamos o IP em si para esse fim.</p>
      </Secao>

      <Secao titulo="Para que usamos e com que fundamento">
        <p>Apenas para gerir a sua marcação e, se for preciso, contactá-la sobre ela. O fundamento é o seu <strong>consentimento</strong>, que dá ao marcar a caixa de autorização, e a necessidade de tratar estes dados para realizar a marcação que pediu. Não usamos os dados para publicidade nem os vendemos.</p>
      </Secao>

      <Secao titulo="Quem tem acesso">
        <p>{negocio ? negocio.nome : "O negócio onde marcou"} tem acesso aos dados da marcação. Os dados ficam guardados na União Europeia (base de dados em Paris). Recorremos a prestadores técnicos de alojamento e de base de dados, que tratam os dados apenas para o funcionamento da plataforma. Se algum estiver fora da União Europeia, aplicam-se as garantias adequadas previstas no RGPD (por exemplo, as cláusulas contratuais-tipo).</p>
        <p>Esta página de marcação não usa cookies de publicidade nem de rastreamento e não carrega tipos de letra nem scripts de terceiros.</p>
      </Secao>

      <Secao titulo="Durante quanto tempo">
        <p>{negocio ? negocio.nome : "O negócio"} guarda a marcação enquanto for necessária para prestar o serviço e cumprir obrigações legais. Pode pedir a eliminação dos seus dados a qualquer momento: o negócio apaga o seu nome e telefone das marcações.</p>
      </Secao>

      <Secao titulo="Os seus direitos">
        <p>Pode pedir o <strong>acesso</strong>, a <strong>retificação</strong> ou o <strong>apagamento</strong> dos seus dados, a <strong>limitação</strong> do tratamento, opor-se a ele e pedir a <strong>portabilidade</strong>. Pode ainda <strong>retirar o consentimento</strong> a qualquer momento, tão facilmente como o deu (isso não afeta o tratamento já feito). Responde-se no prazo de um mês.</p>
        <p>Para exercer os seus direitos, contacte {negocio ? <strong>{negocio.nome}</strong> : "o negócio onde marcou"}{contactoNegocio ? ` (${contactoNegocio})` : ""}{empresaConfigurada() ? ` ou escreva para ${EMPRESA.email}` : ""}.</p>
        <p>Tem direito a apresentar reclamação à autoridade de controlo, a <a className="font-semibold underline" href={CNPD_URL} target="_blank" rel="noreferrer">Comissão Nacional de Proteção de Dados (CNPD)</a>.</p>
        <p>Se quiser consultar a lei, o <a className="font-semibold underline" href={RGPD_URL} target="_blank" rel="noreferrer">texto oficial do RGPD</a> está disponível no EUR-Lex.</p>
      </Secao>

      <p className="mt-10"><button type="button" className="font-semibold underline" onClick={() => history.back()}>Voltar</button></p>
    </main>
  );
}
