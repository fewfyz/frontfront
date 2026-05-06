create table public.task_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id integer not null,
  transcript text,
  tags text[] not null default '{}',
  completed boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (user_id, task_id)
);

alter table public.task_progress enable row level security;

create policy "Users can view their own progress"
  on public.task_progress for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert their own progress"
  on public.task_progress for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update their own progress"
  on public.task_progress for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own progress"
  on public.task_progress for delete
  to authenticated
  using (auth.uid() = user_id);

create index task_progress_user_id_idx on public.task_progress(user_id);