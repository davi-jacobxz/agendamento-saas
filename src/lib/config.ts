// Configuração do Supabase. Os dois valores são PÚBLICOS por natureza: o endereço do projeto e a chave
// "publishable", feita para ir no browser (aparece em todos os pedidos do navegador). A proteção dos dados
// está nas regras do banco (RLS), não em esconder estes valores. Se existirem as variáveis VITE_*, essas ganham.
// A service role key e a chave do Resend NUNCA entram aqui: vivem só nos segredos das Edge Functions.
export const SUPABASE_URL: string =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() || "https://ipwiljwxedxkgoenwiwg.supabase.co";
export const SUPABASE_KEY: string =
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined)?.trim() || "sb_publishable_YRMkrnmpQh0oUAoYVQqrJw_-613Pefr";
