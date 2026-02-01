-- Gnosis Initial Schema
-- Creates core tables: profiles, chapters, scenarios, user_progress, conversation_messages
-- Includes RLS policies and indexes for common query patterns.

-- gen_random_uuid() is available natively in Postgres 13+

-- =============================================================================
-- 1. chapters
-- =============================================================================
create table public.chapters (
  id uuid primary key default gen_random_uuid(),
  chapter_number integer not null unique,
  title text not null,
  description text not null,
  target_vocabulary jsonb not null default '[]'::jsonb,
  target_grammar jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.chapters is 'Learning chapters containing groups of scenarios.';

-- =============================================================================
-- 2. profiles (depends on chapters for FK)
-- =============================================================================
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text,
  current_chapter_id uuid references public.chapters on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'Extended user profile linked to Supabase auth.users.';

-- =============================================================================
-- 3. scenarios (depends on chapters)
-- =============================================================================
create table public.scenarios (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.chapters on delete cascade,
  scenario_number integer not null,
  title text not null,
  context_description text not null,
  agent_role text not null,
  target_phrases jsonb not null default '[]'::jsonb,
  system_prompt text not null,
  created_at timestamptz not null default now(),

  unique (chapter_id, scenario_number)
);

comment on table public.scenarios is 'Individual conversation scenarios within a chapter.';

-- =============================================================================
-- 4. user_progress (depends on scenarios)
-- =============================================================================
create table public.user_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  scenario_id uuid not null references public.scenarios on delete cascade,
  completed boolean not null default false,
  accuracy_score double precision,
  vocabulary_used jsonb,
  completed_at timestamptz,
  created_at timestamptz not null default now(),

  unique (user_id, scenario_id)
);

comment on table public.user_progress is 'Tracks user completion and performance for each scenario.';

-- =============================================================================
-- 5. conversation_messages (depends on scenarios)
-- =============================================================================
create table public.conversation_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  scenario_id uuid not null references public.scenarios on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  corrections jsonb,
  created_at timestamptz not null default now()
);

comment on table public.conversation_messages is 'Stores conversation history for each user/scenario session.';

-- =============================================================================
-- Indexes
-- =============================================================================

-- chapters: order by chapter_number
create index idx_chapters_chapter_number on public.chapters (chapter_number);

-- scenarios: lookup by chapter, ordered by scenario_number
create index idx_scenarios_chapter_id on public.scenarios (chapter_id, scenario_number);

-- user_progress: lookup by user, filter by completion
create index idx_user_progress_user_id on public.user_progress (user_id);
create index idx_user_progress_scenario_id on public.user_progress (scenario_id);

-- conversation_messages: lookup by user+scenario, ordered by created_at
create index idx_conversation_messages_user_scenario on public.conversation_messages (user_id, scenario_id, created_at);

-- =============================================================================
-- Row Level Security
-- =============================================================================

-- profiles
alter table public.profiles enable row level security;

create policy "Users can view their own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can insert their own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- chapters: readable by all authenticated users (content is shared)
alter table public.chapters enable row level security;

create policy "Authenticated users can view chapters"
  on public.chapters for select
  using (auth.role() = 'authenticated');

-- scenarios: readable by all authenticated users (content is shared)
alter table public.scenarios enable row level security;

create policy "Authenticated users can view scenarios"
  on public.scenarios for select
  using (auth.role() = 'authenticated');

-- user_progress
alter table public.user_progress enable row level security;

create policy "Users can view their own progress"
  on public.user_progress for select
  using (auth.uid() = user_id);

create policy "Users can insert their own progress"
  on public.user_progress for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own progress"
  on public.user_progress for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- conversation_messages
alter table public.conversation_messages enable row level security;

create policy "Users can view their own messages"
  on public.conversation_messages for select
  using (auth.uid() = user_id);

create policy "Users can insert their own messages"
  on public.conversation_messages for insert
  with check (auth.uid() = user_id);

-- =============================================================================
-- Trigger: auto-update updated_at on profiles
-- =============================================================================
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger on_profiles_updated
  before update on public.profiles
  for each row
  execute function public.handle_updated_at();
