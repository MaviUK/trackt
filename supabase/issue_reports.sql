-- BURGRS issue reports and private screenshot uploads
-- Run this file in the Supabase SQL Editor.

create table if not exists public.issue_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text,
  category text not null default 'bug' check (
    category in ('bug', 'content', 'account', 'suggestion', 'other')
  ),
  subject text not null check (char_length(subject) between 1 and 140),
  description text not null check (char_length(description) between 10 and 3000),
  steps_to_reproduce text check (
    steps_to_reproduce is null or char_length(steps_to_reproduce) <= 2000
  ),
  screenshot_paths text[] not null default '{}',
  page_url text,
  user_agent text,
  viewport text,
  status text not null default 'open' check (
    status in ('open', 'reviewing', 'resolved', 'closed')
  ),
  admin_notes text,
  email_sent_at timestamptz,
  email_delivery_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.issue_reports
  add column if not exists email_sent_at timestamptz;

alter table public.issue_reports
  add column if not exists email_delivery_error text;

create index if not exists issue_reports_user_created_idx
  on public.issue_reports (user_id, created_at desc);

create index if not exists issue_reports_status_created_idx
  on public.issue_reports (status, created_at desc);

alter table public.issue_reports enable row level security;

drop policy if exists "Users can submit their own issue reports" on public.issue_reports;
create policy "Users can submit their own issue reports"
  on public.issue_reports
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can view their own issue reports" on public.issue_reports;
create policy "Users can view their own issue reports"
  on public.issue_reports
  for select
  to authenticated
  using (auth.uid() = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'issue-screenshots',
  'issue-screenshots',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users can upload their own issue screenshots" on storage.objects;
create policy "Users can upload their own issue screenshots"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'issue-screenshots'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can view their own issue screenshots" on storage.objects;
create policy "Users can view their own issue screenshots"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'issue-screenshots'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can remove their own issue screenshots" on storage.objects;
create policy "Users can remove their own issue screenshots"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'issue-screenshots'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Reports and screenshots can be reviewed through the Supabase dashboard or
-- by a trusted backend using the service-role key. Do not expose that key in the app.
