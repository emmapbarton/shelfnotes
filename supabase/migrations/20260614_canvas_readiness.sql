alter table public.canvas_items
add column if not exists compact boolean not null default false;
