-- Initial preview account schema. Apply once to a dedicated Supabase project.
create schema if not exists private;
create table private.portal_owners (email text primary key);
revoke all on private.portal_owners from public, anon, authenticated;
create function private.is_owner() returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from auth.users u join private.portal_owners o on lower(u.email)=lower(o.email)
    where u.id=auth.uid() and u.email_confirmed_at is not null
  );
$$;
revoke all on function private.is_owner() from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.is_owner() to authenticated;
create function public.portal_is_owner() returns boolean language sql stable security invoker set search_path='' as $$ select private.is_owner(); $$;
revoke all on function public.portal_is_owner() from public, anon;
grant execute on function public.portal_is_owner() to authenticated;
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '' check(length(name)<=120),
  phone text not null default '' check(length(phone)<=30),
  address text not null default '' check(length(address)<=250),
  city text not null default '' check(length(city)<=100),
  zip text not null default '' check(length(zip)<=10),
  notes text not null default '' check(length(notes)<=1000)
);
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  service text not null check(service in ('Lawn mowing','Yard cleanup','Leaf cleanup','Mulch installation','Gutter cleaning','Weed pulling','Other')),
  preferred_date date not null,
  notes text not null default '' check(length(notes)<=2000),
  status text not null default 'requested' check(status in ('requested','approved','scheduled','completed','declined','canceled')),
  quote_cents integer check(quote_cents between 100 and 1000000),
  scheduled_date date,
  created_at timestamptz not null default now()
);
create index bookings_user_id_idx on public.bookings(user_id);
create table public.service_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  booking_id uuid references public.bookings(id),
  service text not null check(length(service) between 1 and 120),
  service_date date not null,
  notes text not null default '' check(length(notes)<=2000),
  amount_cents integer check(amount_cents between 0 and 1000000),
  created_at timestamptz not null default now()
);
create index history_user_id_idx on public.service_history(user_id);
create index history_booking_id_idx on public.service_history(booking_id);
alter table public.profiles enable row level security;
alter table public.bookings enable row level security;
alter table public.service_history enable row level security;
revoke all on public.profiles,public.bookings,public.service_history from anon,authenticated;
grant select,insert,update on public.profiles to authenticated;
grant select,insert,update on public.bookings to authenticated;
grant select,insert on public.service_history to authenticated;
create policy profiles_read on public.profiles for select to authenticated using (id=(select auth.uid()) or (select private.is_owner()));
create policy profiles_insert on public.profiles for insert to authenticated with check(id=(select auth.uid()));
create policy profiles_update on public.profiles for update to authenticated using(id=(select auth.uid())) with check(id=(select auth.uid()));
create policy bookings_read on public.bookings for select to authenticated using(user_id=(select auth.uid()) or (select private.is_owner()));
create policy bookings_insert on public.bookings for insert to authenticated with check(user_id=(select auth.uid()) and status='requested' and quote_cents is null and scheduled_date is null and preferred_date >= (current_timestamp at time zone 'America/Indiana/Indianapolis')::date);
create policy bookings_update on public.bookings for update to authenticated using((select private.is_owner())) with check((select private.is_owner()));
create policy history_read on public.service_history for select to authenticated using(user_id=(select auth.uid()) or (select private.is_owner()));
create policy history_insert on public.service_history for insert to authenticated with check((select private.is_owner()));
insert into private.portal_owners(email) values ('indymowmasters@gmail.com');
