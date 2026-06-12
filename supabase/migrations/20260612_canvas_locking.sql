alter table public.canvas_items
add column if not exists locked boolean not null default false;
