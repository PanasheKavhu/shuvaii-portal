-- pgTAP smoke test. Real RLS tests go in supabase/tests/ as tables are added.
begin;
select plan(1);
select ok(true, 'pgTAP is wired up');
select * from finish();
rollback;
