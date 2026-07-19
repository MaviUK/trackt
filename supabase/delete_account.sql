-- BURGRS account deletion cleanup
-- Run this file once in Supabase SQL Editor after deployment.
-- Uploaded files are removed by the Netlify function through the Storage API.
-- The function is callable only by the service role used by the Netlify function.

create or replace function public.delete_account_data(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
set statement_timeout = '45s'
as $$
declare
  target record;
begin
  if p_user_id is