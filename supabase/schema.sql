-- Run this file in the Supabase SQL editor.
-- Every table is private by default and scoped to the authenticated user.

create extension if not exists "pgcrypto";

create type public.book_status as enum (
  'not_started',
  'reading',
  'paused',
  'finished'
);

create type public.note_kind as enum (
  'note',
  'quote',
  'question'
);

create table public.books (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 500),
  author text,
  category text not null default 'Uncategorised',
  cover_url text,
  total_pages integer not null default 0 check (total_pages >= 0),
  current_page integer not null default 0 check (current_page >= 0),
  status public.book_status not null default 'not_started',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint current_page_within_book
    check (total_pages = 0 or current_page <= total_pages)
);

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  book_id uuid not null references public.books(id) on delete cascade,
  page_start integer check (page_start is null or page_start >= 0),
  page_end integer check (page_end is null or page_end >= 0),
  content text not null check (char_length(content) between 1 and 50000),
  kind public.note_kind not null default 'note',
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint valid_page_range
    check (page_start is null or page_end is null or page_end >= page_start)
);

create index books_user_id_idx on public.books(user_id);
create index notes_user_id_idx on public.notes(user_id);
create index notes_book_id_idx on public.notes(book_id);
create index notes_tags_idx on public.notes using gin(tags);

alter table public.books enable row level security;
alter table public.notes enable row level security;

create policy "Users can read their own books"
on public.books for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can create their own books"
on public.books for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their own books"
on public.books for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete their own books"
on public.books for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can read their own notes"
on public.notes for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can create notes for their own books"
on public.notes for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.books
    where books.id = book_id
      and books.user_id = (select auth.uid())
  )
);

create policy "Users can update their own notes"
on public.notes for update
to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.books
    where books.id = book_id
      and books.user_id = (select auth.uid())
  )
);

create policy "Users can delete their own notes"
on public.notes for delete
to authenticated
using ((select auth.uid()) = user_id);

-- Attachments will use paths shaped like: <user-id>/<generated-file-name>
insert into storage.buckets (id, name, public)
values ('note-attachments', 'note-attachments', false)
on conflict (id) do nothing;

create policy "Users can read their own note attachments"
on storage.objects for select
to authenticated
using (
  bucket_id = 'note-attachments'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "Users can upload their own note attachments"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'note-attachments'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "Users can update their own note attachments"
on storage.objects for update
to authenticated
using (
  bucket_id = 'note-attachments'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'note-attachments'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "Users can delete their own note attachments"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'note-attachments'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
