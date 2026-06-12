create type public.canvas_item_kind as enum ('note', 'text', 'group');
create type public.canvas_link_type as enum (
  'related', 'supports', 'contradicts', 'extends', 'answers'
);

create table public.canvases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  question text not null default '',
  book_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.canvas_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  canvas_id uuid not null references public.canvases(id) on delete cascade,
  kind public.canvas_item_kind not null,
  note_id uuid references public.notes(id) on delete cascade,
  content text not null default '',
  label text not null default '',
  x double precision not null default 0,
  y double precision not null default 0,
  width double precision not null default 260,
  height double precision not null default 160,
  color text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint note_items_reference_note check (
    (kind = 'note' and note_id is not null)
    or (kind <> 'note' and note_id is null)
  )
);

create table public.canvas_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  canvas_id uuid not null references public.canvases(id) on delete cascade,
  source_item_id uuid not null references public.canvas_items(id) on delete cascade,
  target_item_id uuid not null references public.canvas_items(id) on delete cascade,
  type public.canvas_link_type not null default 'related',
  label text not null default '',
  created_at timestamptz not null default now(),
  constraint no_self_links check (source_item_id <> target_item_id)
);

create index canvases_user_id_idx on public.canvases(user_id);
create index canvas_items_canvas_id_idx on public.canvas_items(canvas_id);
create index canvas_links_canvas_id_idx on public.canvas_links(canvas_id);

alter table public.canvases enable row level security;
alter table public.canvas_items enable row level security;
alter table public.canvas_links enable row level security;

create policy "Users manage their canvases"
on public.canvases for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users manage their canvas items"
on public.canvas_items for all to authenticated
using (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.canvases
    where canvases.id = canvas_id
      and canvases.user_id = (select auth.uid())
  )
)
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.canvases
    where canvases.id = canvas_id
      and canvases.user_id = (select auth.uid())
  )
);

create policy "Users manage their canvas links"
on public.canvas_links for all to authenticated
using (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.canvases
    where canvases.id = canvas_id
      and canvases.user_id = (select auth.uid())
  )
)
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.canvases
    where canvases.id = canvas_id
      and canvases.user_id = (select auth.uid())
  )
);
