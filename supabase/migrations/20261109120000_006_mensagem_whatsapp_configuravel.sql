-- Mensagem pronta do WhatsApp, configurável por cada proprietário.
-- Variáveis suportadas (substituídas na página pública): {nome} {servico} {dia} {hora}
alter table public.businesses
  add column if not exists whatsapp_message text check (char_length(whatsapp_message) <= 300);

grant update (whatsapp_message) on public.businesses to authenticated;

create or replace function public.get_public_business(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare b public.businesses;
begin
  select * into b from public.businesses where slug = lower(coalesce(p_slug, ''));
  if not found then return jsonb_build_object('encontrado', false, 'disponivel', false); end if;
  if not app_private.business_available(b) then
    return jsonb_build_object('encontrado', true, 'disponivel', false);
  end if;
  return jsonb_build_object(
    'encontrado', true, 'disponivel', true,
    'negocio', jsonb_build_object(
      'nome', b.name, 'logo_path', b.logo_path, 'cover_path', b.cover_path,
      'cor_principal', b.primary_color, 'texto_boas_vindas', b.welcome_text,
      'endereco', b.address, 'instagram', b.instagram, 'whatsapp', b.whatsapp, 'mensagem_whatsapp', b.whatsapp_message,
      'rotulo_profissional', b.professional_label,
      'mensagem_confirmacao', b.confirmation_message,
      'antecedencia_max_dias', b.max_advance_days),
    'servicos', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'nome', s.name, 'descricao', s.description,
               'duracao_minutos', s.duration_minutes, 'preco_cents', s.price_cents, 'categoria', s.category)
             order by s.position, s.name)
      from public.services s
      where s.business_id = b.id and s.active
        and exists (select 1 from public.professional_services ps
                    join public.professionals p on p.id = ps.professional_id and p.active
                    where ps.service_id = s.id)), '[]'::jsonb),
    'profissionais', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'nome', p.name, 'foto_path', p.photo_path,
               'servicos', coalesce((select jsonb_agg(ps.service_id) from public.professional_services ps
                                     where ps.professional_id = p.id), '[]'::jsonb))
             order by p.position, p.name)
      from public.professionals p where p.business_id = b.id and p.active), '[]'::jsonb));
end $$;
