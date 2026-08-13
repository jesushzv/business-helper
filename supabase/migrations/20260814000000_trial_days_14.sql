-- #270 — the trial is 14 days, as marketing has promised all along.
--
-- Marketing said "14 días de prueba gratis" on ~15 surfaces; the column
-- DEFAULT granted 30. The founder's decision: 14 is the real trial. Only the
-- DEFAULT changes — a new organization row created after this migration gets
-- now() + 14 days. Rows already carrying a trial_ends_at keep it: nobody who
-- signed up under the 30-day grant gets cut short (no UPDATE here, on
-- purpose).

ALTER TABLE public.organizations
  ALTER COLUMN trial_ends_at SET DEFAULT (now() + interval '14 days');
