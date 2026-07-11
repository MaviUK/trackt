begin;

alter table public.user_shows_new enable row level security;

grant delete on table public.user_shows_new to authenticated;

drop policy if exists "user_shows_new_delete_own" on public.user_shows_new;

create policy "user_shows_new_delete_own"
on public.user_shows_new
as permissive
for delete
to authenticated
using (auth.uid() = user_id);

commit;
