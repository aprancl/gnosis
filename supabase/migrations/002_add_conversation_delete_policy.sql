-- Add DELETE policy for conversation_messages so users can clear their own conversations
-- (needed for scenario replay functionality).

create policy "Users can delete their own messages"
  on public.conversation_messages for delete
  using (auth.uid() = user_id);
