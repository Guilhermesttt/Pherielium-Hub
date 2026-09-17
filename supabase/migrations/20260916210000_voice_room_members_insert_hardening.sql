-- P0 security: membership em voice_room_members só via service role (Express).
-- Antes, qualquer usuário autenticado podia INSERT direto e burlar senha/convite.
--
-- Também reforça grants: authenticated mantém SELECT/UPDATE (sair / host
-- gerenciar), mas perde INSERT e DELETE. Criação/entrada de membros passa
-- exclusivamente por /api/voice/rooms/:id/join com supabaseAdmin.

begin;

-- Remove a policy permissiva (user_id = auth.uid() sem checagem de sala/senha).
drop policy if exists voice_room_members_insert on public.voice_room_members;

-- Revoga privilégios de mutação direta que permitiam bypass do Express.
revoke insert, delete on public.voice_room_members from authenticated;
revoke all on public.voice_room_members from anon;

-- Garante leitura e update próprios (leave / host kick via policy de update).
grant select, update on public.voice_room_members to authenticated;
grant all on public.voice_room_members to service_role;

-- SELECT e UPDATE policies já existentes em 20260818160000 permanecem válidas:
-- - select: salas públicas ativas, host, ou próprio user_id
-- - update: próprio user_id ou host da sala

commit;
