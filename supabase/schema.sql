create extension if not exists pgcrypto;

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  event_date date not null,
  category text not null default '',
  location text not null default '',
  price numeric(10, 2) not null default 0,
  image_url text,
  description text not null default '',
  artists text not null default '',
  ra_url text,
  instagram_url text,
  featured boolean not null default false,
  visible boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.residents (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text not null default '',
  bio text not null default '',
  image_url text,
  visible boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.site_settings (
  key text primary key,
  value text not null default ''
);

create table if not exists public.loyalty_signups (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(email)),
  consented_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.events enable row level security;
alter table public.residents enable row level security;
alter table public.site_settings enable row level security;
alter table public.loyalty_signups enable row level security;

revoke all on public.events, public.residents, public.site_settings, public.loyalty_signups
  from anon, authenticated;
grant usage on schema public to service_role;
grant select, insert, update, delete on public.events, public.residents, public.site_settings, public.loyalty_signups
  to service_role;

insert into public.events
  (title, event_date, category, location, price, image_url, description, artists, ra_url, instagram_url, sort_order)
select
  'Dylan Fogarty Halloween Night', '2026-10-31', 'Techno', 'Savoy, Cork, Ireland', 15,
  'https://images.pexels.com/photos/5192289/pexels-photo-5192289.jpeg?auto=compress&cs=tinysrgb&w=900',
  'Catacombs and Instinct Collective took over the Savoy for a two-stage Halloween night from 8pm to 1am. The main stage featured Dylan Fogarty, MEJMI and Mannio; Stage 2 featured Hushpuppy, Esoterica Sound and After Dark.',
  'Dylan Fogarty · MEJMI · Mannio · Hushpuppy · Esoterica Sound · After Dark',
  'https://ra.co/events/2555713', 'https://www.instagram.com/catacombsevents/p/DeR8SnGtXUZ/', 0
where not exists (
  select 1 from public.events where title = 'Dylan Fogarty Halloween Night' and event_date = '2026-10-31'
);

insert into public.events
  (title, event_date, category, location, price, image_url, description, artists, ra_url, instagram_url, sort_order)
select
  'MTRPLS x DISTORT x CATACOMBS: Jazz Weekend Special', '2026-10-23', 'Techno',
  'Savoy, Cork, Ireland', 15.5,
  'https://images.pexels.com/photos/359995/pexels-photo-359995.jpeg?auto=compress&cs=tinysrgb&w=900',
  'A two-stage techno show at the Savoy during Cork Jazz Weekend. Main stage: Sunil Sharpe, Rebecca Delle Piane and Tiarnola; Stage 2: MEJMI, Riastartha and Ashes.',
  'Sunil Sharpe · Rebecca Delle Piane · Ashes · MEJMI · RiaStartha · Tiarnola',
  'https://ra.co/events/2533056', 'https://www.instagram.com/catacombsevents/p/DekZ3F_AvO3/', 1
where not exists (
  select 1 from public.events
  where title = 'MTRPLS x DISTORT x CATACOMBS: Jazz Weekend Special' and event_date = '2026-10-23'
);

insert into public.events
  (title, event_date, category, location, price, image_url, description, artists, ra_url, sort_order)
select
  'DANCEHAVEN', '2026-08-01', 'Disco · LGBTQ+', 'The Pav, Cork, Ireland', 6.75,
  'https://images.pexels.com/photos/5152595/pexels-photo-5152595.jpeg?auto=compress&cs=tinysrgb&w=900',
  'Come as you are, dance as you are, celebrate as you are. A DANCEHAVEN gathering with an LGBTQ+ lineup.',
  'LGBTQ+ line-up', 'https://ra.co/events/2497647', 2
where not exists (
  select 1 from public.events where title = 'DANCEHAVEN' and event_date = '2026-08-01'
);

insert into public.residents (name, role, bio, sort_order)
select 'Frequency Obaudire', 'DJ / Producer', '', 0
where not exists (select 1 from public.residents where name = 'Frequency Obaudire');

insert into public.site_settings (key, value) values
  ('hero_image_url', 'https://images.pexels.com/photos/9534908/pexels-photo-9534908.jpeg?auto=compress&cs=tinysrgb&w=2000'),
  ('community_image_url', '')
on conflict (key) do nothing;

create or replace function public.replace_site_content(payload jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  item record;
begin
  if jsonb_typeof(payload->'events') <> 'array'
     or jsonb_typeof(payload->'residents') <> 'array'
     or jsonb_typeof(payload->'settings') <> 'object' then
    raise exception 'Invalid site content payload';
  end if;

  delete from public.events;
  for item in select value from jsonb_array_elements(payload->'events')
  loop
    insert into public.events
      (id, title, event_date, category, location, price, image_url, description, artists,
       ra_url, instagram_url, featured, visible, sort_order)
    values
      (coalesce(nullif(item.value->>'id', '')::uuid, gen_random_uuid()),
       item.value->>'title',
       (item.value->>'date')::date,
       coalesce(item.value->>'category', ''),
       coalesce(item.value->>'location', ''),
       coalesce(nullif(item.value->>'price', '')::numeric, 0),
       nullif(item.value->>'image', ''),
       coalesce(item.value->>'description', ''),
       coalesce(item.value->>'artists', ''),
       nullif(item.value->>'raUrl', ''),
       nullif(item.value->>'instagramUrl', ''),
       coalesce((item.value->>'featured')::boolean, false),
       coalesce((item.value->>'visible')::boolean, true),
       coalesce((item.value->>'sortOrder')::integer, 0));
  end loop;

  delete from public.residents;
  for item in select value from jsonb_array_elements(payload->'residents')
  loop
    insert into public.residents (id, name, role, bio, image_url, visible, sort_order)
    values
      (coalesce(nullif(item.value->>'id', '')::uuid, gen_random_uuid()),
       item.value->>'name',
       coalesce(item.value->>'role', ''),
       coalesce(item.value->>'bio', ''),
       nullif(item.value->>'image', ''),
       coalesce((item.value->>'visible')::boolean, true),
       coalesce((item.value->>'sortOrder')::integer, 0));
  end loop;

  insert into public.site_settings (key, value) values
    ('hero_image_url', coalesce(payload->'settings'->>'hero_image_url', '')),
    ('community_image_url', coalesce(payload->'settings'->>'community_image_url', ''))
  on conflict (key) do update set value = excluded.value;
end;
$$;

revoke all on function public.replace_site_content(jsonb) from public, anon, authenticated;
grant execute on function public.replace_site_content(jsonb) to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'catacombs-images',
  'catacombs-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
