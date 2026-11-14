-- 1) pg_net fora do schema public (recomendação de segurança do Supabase)
drop extension if exists pg_net;
create extension if not exists pg_net with schema extensions;

-- 2) a criação de negócios passa pela Edge Function `admin-create-business`;
--    a função SQL antiga deixa de ser chamável pelo browser.
revoke execute on function public.admin_create_business(text, text, text, timestamptz) from authenticated;
