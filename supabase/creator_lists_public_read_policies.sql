-- Public read policies for creator lists.
-- Run this in Supabase SQL Editor.
-- This lets other logged-in users see public creator lists and their items.

alter table public.creator_lists enable row level security;
alter table public.creator_list_items enable row level security;

-- Anyone authenticated can read creator lists marked public.
drop policy if exists "Authenticated users can read public creator lists" on public.creator_lists;
create policy "Authenticated users can read public creator lists"
  on public.creator_lists
  for select
  to authenticated
  using (visibility = 'public');

-- List owners can read all their own lists, including private drafts.
drop policy if exists "Users can read own creator lists" on public.creator_lists;
create policy "Users can read own creator lists"
  on public.creator_lists
  for select
  to authenticated
  using (auth.uid() = user_id);

-- List owners can create their own lists.
drop policy if exists "Users can create own creator lists" on public.creator_lists;
create policy "Users can create own creator lists"
  on public.creator_lists
  for insert
  to authenticated
  with check (auth.uid() = user_id);

-- List owners can update their own lists.
drop policy if exists "Users can update own creator lists" on public.creator_lists;
create policy "Users can update own creator lists"
  on public.creator_lists
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- List owners can delete their own lists.
drop policy if exists "Users can delete own creator lists" on public.creator_lists;
create policy "Users can delete own creator lists"
  on public.creator_lists
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- Anyone authenticated can read items belonging to public lists.
drop policy if exists "Authenticated users can read public creator list items" on public.creator_list_items;
create policy "Authenticated users can read public creator list items"
  on public.creator_list_items
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.creator_lists cl
      where cl.id = creator_list_items.list_id
        and cl.visibility = 'public'
    )
  );

-- List owners can read all items in their own lists, including private drafts.
drop policy if exists "Users can read own creator list items" on public.creator_list_items;
create policy "Users can read own creator list items"
  on public.creator_list_items
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.creator_lists cl
      where cl.id = creator_list_items.list_id
        and cl.user_id = auth.uid()
    )
  );

-- List owners can add items to their own lists.
drop policy if exists "Users can create own creator list items" on public.creator_list_items;
create policy "Users can create own creator list items"
  on public.creator_list_items
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.creator_lists cl
      where cl.id = creator_list_items.list_id
        and cl.user_id = auth.uid()
    )
  );

-- List owners can update items in their own lists.
drop policy if exists "Users can update own creator list items" on public.creator_list_items;
create policy "Users can update own creator list items"
  on public.creator_list_items
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.creator_lists cl
      where cl.id = creator_list_items.list_id
        and cl.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.creator_lists cl
      where cl.id = creator_list_items.list_id
        and cl.user_id = auth.uid()
    )
  );

-- List owners can delete items in their own lists.
drop policy if exists "Users can delete own creator list items" on public.creator_list_items;
create policy "Users can delete own creator list items"
  on public.creator_list_items
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.creator_lists cl
      where cl.id = creator_list_items.list_id
        and cl.user_id = auth.uid()
    )
  );
