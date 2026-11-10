-- Snap to Shelf: run this once in Supabase → SQL Editor → New query → Run.
-- Safe to run again.

-- Items
create table if not exists public.items (
  id text primary key,
  sku text,
  title text,
  short_name text,
  file_name text,
  original_name text,
  category text,
  subcategory text,
  brand text,
  condition text,
  description text,
  price numeric,
  price_low numeric,
  price_high numeric,
  confidence text,
  keywords text[],
  ebay_category_id text,
  ebay_category_name text,
  notes text,
  ebay_url text,
  status text not null default 'Draft',
  hidden boolean not null default false,
  photo_path text,
  photo_url text,
  model text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
alter table public.items enable row level security;

drop policy if exists "storefront sees visible items" on public.items;
drop policy if exists "team adds items" on public.items;
drop policy if exists "team edits items" on public.items;
drop policy if exists "team deletes items" on public.items;
-- The public sees everything not hidden; signed-in team members see all.
create policy "storefront sees visible items" on public.items for select
  using (hidden = false or auth.uid() is not null);
create policy "team adds items" on public.items for insert to authenticated with check (true);
create policy "team edits items" on public.items for update to authenticated using (true) with check (true);
create policy "team deletes items" on public.items for delete to authenticated using (true);

-- Store settings (name, tagline, contact email)
create table if not exists public.settings (
  key text primary key,
  value text
);
alter table public.settings enable row level security;
drop policy if exists "anyone reads settings" on public.settings;
drop policy if exists "team writes settings" on public.settings;
create policy "anyone reads settings" on public.settings for select using (true);
create policy "team writes settings" on public.settings for all to authenticated using (true) with check (true);
-- Store name (only fills it in if no name has been saved yet)
insert into public.settings (key, value) values ('store_name', 'JT Deals&Finds')
on conflict (key) do nothing;

-- Photos (public to view, only the team can add or remove)
insert into storage.buckets (id, name, public)
values ('photos', 'photos', true)
on conflict (id) do update set public = true;

drop policy if exists "team uploads photos" on storage.objects;
drop policy if exists "team updates photos" on storage.objects;
drop policy if exists "team deletes photos" on storage.objects;
create policy "team uploads photos" on storage.objects for insert to authenticated with check (bucket_id = 'photos');
create policy "team updates photos" on storage.objects for update to authenticated using (bucket_id = 'photos');
create policy "team deletes photos" on storage.objects for delete to authenticated using (bucket_id = 'photos');
