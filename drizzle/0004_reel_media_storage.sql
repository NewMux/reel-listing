create policy "reel listing media insert own folder"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'reel-listing-media'
  and split_part(name, '/', 1) = 'property-projects'
  and split_part(name, '/', 2) = (
    select id::text
    from public.users
    where "openId" = 'supabase:' || auth.uid()::text
    limit 1
  )
);

create policy "reel listing media select own folder"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'reel-listing-media'
  and split_part(name, '/', 1) = 'property-projects'
  and split_part(name, '/', 2) = (
    select id::text
    from public.users
    where "openId" = 'supabase:' || auth.uid()::text
    limit 1
  )
);

create policy "reel listing media update own folder"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'reel-listing-media'
  and split_part(name, '/', 1) = 'property-projects'
  and split_part(name, '/', 2) = (
    select id::text
    from public.users
    where "openId" = 'supabase:' || auth.uid()::text
    limit 1
  )
)
with check (
  bucket_id = 'reel-listing-media'
  and split_part(name, '/', 1) = 'property-projects'
  and split_part(name, '/', 2) = (
    select id::text
    from public.users
    where "openId" = 'supabase:' || auth.uid()::text
    limit 1
  )
);

create policy "reel listing media delete own folder"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'reel-listing-media'
  and split_part(name, '/', 1) = 'property-projects'
  and split_part(name, '/', 2) = (
    select id::text
    from public.users
    where "openId" = 'supabase:' || auth.uid()::text
    limit 1
  )
);
