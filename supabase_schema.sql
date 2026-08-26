-- ==========================================
-- YEAR OF BOOKS PORTAL - SUPABASE DATABASE SCHEMA
-- Paste this script in the Supabase SQL Editor.
-- ==========================================

-- Enable extensions
create extension if not exists "uuid-ossp";

-- Clean up existing tables before rebuilding (drops everything cleanly)
drop table if exists program_photos cascade;
drop table if exists program_reports cascade;
drop table if exists points cascade;
drop table if exists students cascade;
drop table if exists study_centres cascade;
drop table if exists system_settings cascade;

-- 1. SYSTEM SETTINGS
create table if not exists system_settings (
  key text primary key,
  value jsonb not null
);

-- Seed default settings
insert into system_settings (key, value)
values 
  ('upload_window', '{"mode": "auto"}'), -- modes: "auto" (1st-5th), "open" (force open), "closed" (force closed)
  ('active_month', '{"month": "2026-08"}')
on conflict (key) do nothing;


-- 2. STUDY CENTRES
create table if not exists study_centres (
  id uuid references auth.users on delete cascade primary key,
  code text unique not null,
  name text not null,
  place text not null,
  district text not null,
  username text unique not null,
  coordinator_name text,
  coordinator_phone text,
  is_active_override boolean default null, -- null: follows global setting; true: open; false: closed
  created_at timestamptz default timezone('utc'::text, now()) not null
);


-- 3. STUDENTS
create table if not exists students (
  id uuid default gen_random_uuid() primary key,
  register_number text unique not null,
  name text not null,
  class text not null check (class in ('M1', 'M2', 'M3', 'M4', 'M5')),
  study_centre_code text references study_centres(code) on delete cascade not null,
  created_at timestamptz default timezone('utc'::text, now()) not null
);


-- 4. POINTS
create table if not exists points (
  id uuid default gen_random_uuid() primary key,
  student_id uuid references students(id) on delete cascade not null,
  month text not null, -- Format: YYYY-MM
  points numeric(5, 2) not null,
  created_at timestamptz default timezone('utc'::text, now()) not null,
  updated_at timestamptz default timezone('utc'::text, now()) not null,
  constraint unique_student_month unique (student_id, month)
);


-- 5. PROGRAM REPORTS
create table if not exists program_reports (
  id uuid default gen_random_uuid() primary key,
  study_centre_code text references study_centres(code) on delete cascade not null,
  month text not null, -- Format: YYYY-MM
  name text not null,
  date date not null,
  description text not null,
  created_at timestamptz default timezone('utc'::text, now()) not null
);


-- 6. PROGRAM PHOTOS
create table if not exists program_photos (
  id uuid default gen_random_uuid() primary key,
  report_id uuid references program_reports(id) on delete cascade not null,
  photo_url text not null,
  created_at timestamptz default timezone('utc'::text, now()) not null
);


-- ==========================================
-- DEADLINE CONTROL LOGIC (PL/pgSQL Functions)
-- ==========================================

create or replace function check_submission_allowed(sc_code text)
returns boolean as $$
declare
  v_mode text;
  v_override boolean;
  v_day integer;
begin
  -- 1. Check if there is a specific manual override for this study centre
  select is_active_override into v_override
  from study_centres
  where code = sc_code;

  if v_override is not null then
    return v_override;
  end if;

  -- 2. Check global setting mode
  select (value->>'mode') into v_mode
  from system_settings
  where key = 'upload_window';

  if v_mode = 'open' then
    return true;
  elsif v_mode = 'closed' then
    return false;
  else
    -- "auto" mode: Allow uploading only from 1st to 5th of the month
    v_day := extract(day from current_date);
    return v_day >= 1 and v_day <= 5;
  end if;
end;
$$ language plpgsql security definer;


-- Helper function for RLS checking on point updates
create or replace function is_study_centre_submission_allowed_for_student(student_id uuid)
returns boolean as $$
declare
  v_sc_code text;
begin
  select study_centre_code into v_sc_code
  from students
  where id = student_id;
  
  return check_submission_allowed(v_sc_code);
end;
$$ language plpgsql security definer;


-- ==========================================
-- SECURITY: ROW LEVEL SECURITY (RLS)
-- ==========================================

-- Enable RLS
alter table system_settings enable row level security;
alter table study_centres enable row level security;
alter table students enable row level security;
alter table points enable row level security;
alter table program_reports enable row level security;
alter table program_photos enable row level security;

-- Create role classification helper function
-- Admins will log in as a specific auth user (e.g., email = mahdiyya@dhiu.in)
create or replace function is_admin()
returns boolean as $$
begin
  return (auth.jwt() ->> 'email') = 'mahdiyya@dhiu.in';
end;
$$ language plpgsql security definer;


-- Policies for SYSTEM SETTINGS
create policy "Admins have full access to system_settings"
  on system_settings for all using (is_admin());

create policy "Study centres can read system_settings"
  on system_settings for select using (true);


-- Policies for STUDY CENTRES
create policy "Admins have full access to study_centres"
  on study_centres for all using (is_admin());

create policy "Study centres can read their own profile"
  on study_centres for select using (auth.uid() = id);

create policy "Study centres can update their own profile fields"
  on study_centres for update using (auth.uid() = id)
  with check (
    auth.uid() = id 
    and (is_active_override = is_active_override) -- Protect override field from modification
  );


-- Policies for STUDENTS
create policy "Admins have full access to students"
  on students for all using (is_admin());

create policy "Study centres can read students in their own center"
  on students for select using (
    exists (
      select 1 from study_centres 
      where id = auth.uid() and code = study_centre_code
    )
  );


-- Policies for POINTS
create policy "Admins have full access to points"
  on points for all using (is_admin());

create policy "Study centres can read points of their own students"
  on points for select using (
    exists (
      select 1 from students s
      join study_centres sc on s.study_centre_code = sc.code
      where s.id = student_id and sc.id = auth.uid()
    )
  );

create policy "Study centres can insert points for their own students"
  on points for insert with check (
    -- Must belong to their study centre
    exists (
      select 1 from students s
      join study_centres sc on s.study_centre_code = sc.code
      where s.id = student_id and sc.id = auth.uid()
    )
    -- Submission window must be open
    and is_study_centre_submission_allowed_for_student(student_id)
  );

create policy "Study centres can update points for their own students"
  on points for update using (
    exists (
      select 1 from students s
      join study_centres sc on s.study_centre_code = sc.code
      where s.id = student_id and sc.id = auth.uid()
    )
  ) with check (
    -- Submission window must be open
    is_study_centre_submission_allowed_for_student(student_id)
  );

create policy "Study centres can delete points for their own students"
  on points for delete using (
    exists (
      select 1 from students s
      join study_centres sc on s.study_centre_code = sc.code
      where s.id = student_id and sc.id = auth.uid()
    )
    and is_study_centre_submission_allowed_for_student(student_id)
  );


-- Policies for PROGRAM REPORTS
create policy "Admins have full access to program_reports"
  on program_reports for all using (is_admin());

create policy "Study centres can read their own program_reports"
  on program_reports for select using (
    exists (
      select 1 from study_centres 
      where id = auth.uid() and code = study_centre_code
    )
  );

create policy "Study centres can insert their own program_reports"
  on program_reports for insert with check (
    exists (
      select 1 from study_centres 
      where id = auth.uid() and code = study_centre_code
    )
    and check_submission_allowed(study_centre_code)
  );

create policy "Study centres can update their own program_reports"
  on program_reports for update using (
    exists (
      select 1 from study_centres 
      where id = auth.uid() and code = study_centre_code
    )
  ) with check (
    check_submission_allowed(study_centre_code)
  );

create policy "Study centres can delete their own program_reports"
  on program_reports for delete using (
    exists (
      select 1 from study_centres 
      where id = auth.uid() and code = study_centre_code
    )
    and check_submission_allowed(study_centre_code)
  );


-- Policies for PROGRAM PHOTOS
create policy "Admins have full access to program_photos"
  on program_photos for all using (is_admin());

create policy "Study centres can read program_photos of their reports"
  on program_photos for select using (
    exists (
      select 1 from program_reports r
      join study_centres sc on r.study_centre_code = sc.code
      where r.id = report_id and sc.id = auth.uid()
    )
  );

create policy "Study centres can insert program_photos for their reports"
  on program_photos for insert with check (
    exists (
      select 1 from program_reports r
      join study_centres sc on r.study_centre_code = sc.code
      where r.id = report_id and sc.id = auth.uid()
    )
  );

create policy "Study centres can delete program_photos of their reports"
  on program_photos for delete using (
    exists (
      select 1 from program_reports r
      join study_centres sc on r.study_centre_code = sc.code
      where r.id = report_id and sc.id = auth.uid()
    )
  );


-- ==========================================
-- ADMIN HELPERS: USER CREATION FROM EXCEL
-- ==========================================

-- Function to safely insert a user into Supabase Auth from SQL
-- Requires pg_crypt extension (which is standard in Supabase)
create or replace function create_auth_user(
  p_id uuid,
  p_email text,
  p_password text,
  p_username text
) returns void as $$
begin
  -- Insert into auth.users
  insert into auth.users (
    id,
    instance_id,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    role,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token
  ) values (
    p_id,
    '00000000-0000-0000-0000-000000000000',
    p_email,
    crypt(p_password, gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object('username', p_username),
    now(),
    now(),
    'authenticated',
    '',
    '',
    '',
    ''
  );

  -- Link into auth.identities to make it fully authenticatable in Supabase
  insert into auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
  ) values (
    p_id,
    p_id,
    jsonb_build_object('sub', p_id, 'email', p_email),
    'email',
    now(),
    now(),
    now()
  );
end;
$$ language plpgsql security definer;

