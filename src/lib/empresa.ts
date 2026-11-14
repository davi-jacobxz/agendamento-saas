// PREENCHA antes de publicar: aparecem na página de privacidade (/privacidade).
// A política deve ser revista por um jurista.
export const EMPRESA = {
  nome: "[NOME DA EMPRESA]",
  email: "[E-MAIL PARA PEDIDOS DE PRIVACIDADE]",
};

/** Só mostra os dados da empresa na página de privacidade depois de preenchidos (sem marcadores “[…]”). */
export const empresaConfigurada = (): boolean => !EMPRESA.nome.startsWith("[") && !EMPRESA.email.startsWith("[");
