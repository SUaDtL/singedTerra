-- Runs only in the disposable database owned by check:database.
BEGIN;
INSERT INTO public.rooms (id, code, seed, status, options, players)
VALUES ('10000000-0000-4000-8000-000000000001', 'TEST', 1, 'finished',
  '{"maxPlayers":2,"maxWind":6,"gravity":0.15,"rulesetVersion":4}',
  '[{"id":"test-seat","name":"Test","color":"#f00","ready":true}]');
INSERT INTO public.room_seats (room_id, seat_id, token)
VALUES ('10000000-0000-4000-8000-000000000001', 'test-seat', repeat('x', 32));

DO $test$
DECLARE v_successor uuid; v_retry uuid; v_options jsonb; v_players jsonb;
BEGIN
  SELECT options, players INTO v_options, v_players FROM public.rooms WHERE code='TEST';
  -- Prove the exact former protocol fails under the real immediate FK.
  BEGIN
    UPDATE public.rooms SET rematch_room_id='20000000-0000-4000-8000-000000000001' WHERE code='TEST';
    RAISE EXCEPTION 'regression fixture must enforce the immediate foreign key';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
  v_successor := public.create_room_rematch('10000000-0000-4000-8000-000000000001', 'test-seat',
    '20000000-0000-4000-8000-000000000001', 'NEXT', 2, v_options, v_players);
  IF v_successor <> '20000000-0000-4000-8000-000000000001' OR NOT EXISTS (
    SELECT 1 FROM public.rooms r JOIN public.room_seats s ON s.room_id=r.rematch_room_id
    WHERE r.code='TEST' AND s.seat_id='test-seat' AND s.token=repeat('x',32)
  ) THEN RAISE EXCEPTION 'published successor must exist with copied credentials'; END IF;
  v_retry := public.create_room_rematch('10000000-0000-4000-8000-000000000001', 'test-seat',
    '30000000-0000-4000-8000-000000000001', 'LOSE', 3, v_options, v_players);
  IF v_retry <> v_successor OR EXISTS (SELECT 1 FROM public.rooms WHERE code='LOSE')
    THEN RAISE EXCEPTION 'retry created an orphan or changed the winner'; END IF;
  IF EXISTS (SELECT 1 FROM public.room_actions WHERE room_id=v_successor)
    THEN RAISE EXCEPTION 'successor action log must start empty'; END IF;
  IF has_function_privilege('anon', 'public.create_room_rematch(uuid,text,uuid,text,bigint,jsonb,jsonb)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.create_room_rematch(uuid,text,uuid,text,bigint,jsonb,jsonb)', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.create_room_rematch(uuid,text,uuid,text,bigint,jsonb,jsonb)', 'EXECUTE')
    THEN RAISE EXCEPTION 'rematch RPC must remain service-only'; END IF;
END;
$test$;

CREATE FUNCTION pg_temp.reject_test_seat() RETURNS trigger LANGUAGE plpgsql AS $f$
BEGIN RAISE EXCEPTION 'injected seat copy failure'; END;
$f$;
CREATE TRIGGER reject_test_seat BEFORE INSERT ON public.room_seats
FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_test_seat();
DO $test$
DECLARE v_room public.rooms%ROWTYPE;
BEGIN
  SELECT * INTO v_room FROM public.rooms WHERE code='NEXT';
  BEGIN
    PERFORM public.create_room_rematch(v_room.id, 'test-seat',
      '40000000-0000-4000-8000-000000000001', 'FAIL', 4, v_room.options, v_room.players);
    RAISE EXCEPTION 'failure injection did not run';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'injected seat copy failure' THEN RAISE; END IF;
  END;
  IF EXISTS (SELECT 1 FROM public.rooms WHERE code='FAIL') OR EXISTS (
    SELECT 1 FROM public.rooms WHERE id=v_room.id AND rematch_room_id IS NOT NULL
  ) THEN RAISE EXCEPTION 'seat-copy failure leaked successor or pointer'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.room_seats WHERE room_id=v_room.id)
    THEN RAISE EXCEPTION 'failure deleted an existing winning successor'; END IF;
END;
$test$;
ROLLBACK;
