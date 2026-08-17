# Live verification recipes

How to check a claim against the *running* system from an agent session, without parking the work
on the founder. `docs/LESSONS.md` carries the rule ("a session with the Supabase connector can run
its own deployed checks"); this file carries the mechanics.

Read this when an issue's only remaining step is "needs a deployment to verify". That step has
twice been the one that mattered: #96 was merged and reviewed with just its deployed check
outstanding, and running it found a table missing three columns the shipped code read. #95 sat
three weeks behind an assumed-impossible check, #48 two days.

**The governing rule, from `CLAUDE.md` hard rule #2:** confirm every claim by reading state back,
never by exit code. Prove a constraint by making it *reject* something.

## What is reachable, and what genuinely is not

Reachable from a session with the Supabase connector:

- live schema, columns, defaults and CHECK definitions
- grants and RLS policies as the database actually holds them
- migrations (via `apply_migration`, which keeps the ledger)
- PostgREST behaviour, including embed resolution
- GoTrue's provider configuration and sign-in history
- the deployed app itself, authenticated

Genuinely out of reach: an interactive browser session, and any real third-party credential the
project does not hold. Everything else on that list has at some point been wrongly assumed
unreachable.

## Schema, columns and constraints

Query `pg_catalog` / `information_schema` through `execute_sql`. A column the code reads is not a
column that exists — `types/database.ts` is a claim, the catalog is evidence.

```sql
-- columns actually present
select column_name, data_type, column_default, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'clients'
order by ordinal_position;

-- the real CHECK definition, before narrowing any TS union to match it
select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'public.organizations'::regclass and contype = 'c';
```

## Grants on SECURITY DEFINER functions

`REVOKE … FROM PUBLIC` does not lock these down: Supabase grants `EXECUTE` to `anon` and
`authenticated` as *named roles*, so PostgREST keeps serving `/rest/v1/rpc/<name>` outside RLS.
`tests/unit/securityDefinerGrants.test.ts` scans the migration files, but only the live catalog
proves the deployment:

```sql
select p.proname, a.grantee, a.privilege_type
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
cross join lateral aclexplode(p.proacl) a
where n.nspname = 'public'
  and a.grantee::regrole::text in ('anon', 'authenticated')
  and a.privilege_type = 'EXECUTE';
```

Any row naming a `SECURITY DEFINER` function is a finding.

## Proving RLS actually admits the caller

App-level access and RLS can each decide "which tenants may this user act on" and disagree (#146):
auth passed, the route ran, and every INSERT came back `42501`. Impersonate a real `auth.uid()`
and prove both directions — it must succeed for the caller's org and be refused for another's.

```sql
select set_config('request.jwt.claims', json_build_object('sub', '<user-uuid>')::text, true);
set local role authenticated;
-- then INSERT into the target table for the caller's org (expect success),
-- and again for a different organization_id (expect 42501).
```

## PostgREST, from inside the database

The session shell cannot reach `*.supabase.co`, so call the project's own REST endpoint from
within Postgres. Install the extension, make the call, drop it again.

```sql
create extension if not exists http with schema extensions;

select status, content::text
from extensions.http_get(
  'https://<project>.supabase.co/rest/v1/<path>?select=...&apikey=<anon-key>'
);

drop extension http;
```

The anon key goes in as an `apikey=` query parameter. This is how an unhinted embed is caught
live: two FKs join `quotes` and `contracts`, so an embed missing the `quotes!quote_id(...)` hint
returns `300 PGRST201` here even though it looks fine in the source.

## The deployed app, authenticated

A `403` from the shell against the app domain is not the last word. Send an `@supabase/ssr`
session cookie on an outbound request made from the database (full recipe in #129):

```sql
select status, content::text
from extensions.http((
  'PATCH',
  'https://businesshelper.app/api/<route>',
  array[extensions.http_header('cookie', 'sb-<ref>-auth-token=<cookie-value>')],
  'application/json',
  '{"...":"..."}'
)::extensions.http_request);
```

## GoTrue — provider config and sign-in history

```
GET /auth/v1/settings?apikey=<anon>      -- the `external` provider map
GET /auth/v1/authorize?provider=<name>   -- the error the user would actually see
```

And `auth.identities` records who has *ever* signed in by a given provider — the difference
between "configured" and "has worked for a real person".

## Which pilot organizations still have no settlement account

The launch gate asks whether every pilot organization can actually be paid. Since #164 the accounts
live in `bank_accounts`, so the query is:

```sql
select o.id, o.name
  from organizations o
 where not exists (
   select 1 from bank_accounts b
    where b.organization_id = o.id
      and b.archived_at is null
 );
```

**Not** `organizations.bank_clabe is null` — that reads a legacy mirror column rather than the
source, and will answer for rows the app no longer writes.

A returned row is **a question to ask, not automatically a defect**: since #163 a tenant may have
removed their account on purpose. What the gate needs is that no row belongs to a pilot who intends
to be paid.

Whether it currently returns anything is status, and lives in [`docs/STATUS.md`](../STATUS.md) §04.
