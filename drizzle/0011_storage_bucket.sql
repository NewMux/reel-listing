-- Creates the private media bucket 0004's RLS policies are written against.
--
-- 0004 was applied to a managed Supabase project where the bucket had been created by
-- hand in the dashboard, so it was never captured in SQL. A self-hosted Supabase starts
-- with no buckets at all, which would leave every upload failing with "Bucket not found"
-- despite the policies being present and correct.
--
-- Private on purpose: server/storage.ts reads through 1-hour signed URLs.
insert into storage.buckets (id, name, public)
values ('reel-listing-media', 'reel-listing-media', false)
on conflict (id) do nothing;
