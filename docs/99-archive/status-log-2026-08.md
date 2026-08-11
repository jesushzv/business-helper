

## Recently landed (2026-08-07 → 2026-08-08) — moved here from `docs/STATUS.md`

*Moved 2026-08-09 when `docs/STATUS.md` hit its 32 KB budget. Every row was settled history by
then; it is reproduced verbatim because five of its six commit SHAs are recorded nowhere else.*


*Every row below is merged to `main` — the commit is the verification, checked with `git log` on
2026-08-08. The reasoning for each change, and what was checked against what, is preserved in the
frozen log at [`99-archive/status-log-2026-08.md`](99-archive/status-log-2026-08.md).*

| What landed | Issues | PR | Commit |
|:---|:---|:---|:---|
| Five fail-loud fixes across auth, onboarding, quotes, OTP and tooling — including `/q/[token]` rendering the client's real quote instead of one hardcoded fixture for every token | #39 #43 #44 #48 #49 #50 #58 | #57 | `4c565ff` |
| Payment links refused before a CLABE exists — server-side 409, non-dismissable banner, disabled share actions | #64 | #75 | `870090e` |
| Every `/pay/` link resolvable or none offered — the token comes from `quotes.public_token`, never a milestone or contract id | #72 #73 #74 #78 | #80 | `0a4ddad` |
| Zero-warning lint gate made real — 22 warnings cleared, `--max-warnings=0` enforced, failure confirmed with a planted warning | #46 | #83 | `64deeef` |
| One Spanish coded error envelope across the three public routes | #65 | #86 | `c671ce5` |
| Build fails on a `SECURITY DEFINER` function without a per-role revoke | #76 | #92 | `7d4617d` |
| `clients.phone` validated server-side on write, failing closed when it cannot be dialed | #40 | #102 | `a378c7e` |
| Production migrations applied and confirmed by inspecting the live schema (an ops action, no commit) | #62 | — | 2026-08-08 |

> [!IMPORTANT]
> **What none of the above changed.** Every row was verified by `typecheck` + `lint` + the vitest
> suite against **mocked** providers. Not one constitutes a live third-party round-trip. The P0 items
> in §03 that need a real handset, a real card, a real PAC stamp or a deployed database are untouched
> by all of it — merging is not verification.

---


## #95's production verification (2026-08-09)

*Moved from `docs/STATUS.md` on 2026-08-09 (PR #137) when the file hit its 32 KB budget. #95 is
closed and the checks are settled; reproduced verbatim because the transcript is recorded nowhere
else. For live status read [`../STATUS.md`](../STATUS.md).*

**#95's save verified against production on 2026-08-09.** The shell in a remote session cannot
reach `businesshelper.app` (egress policy), so the checks ran from inside the database over the
`http` extension — the same in-Postgres route CLAUDE.md documents for `*.supabase.co`. Against
`https://businesshelper.app`: `PUT /api/organization` → **405** (the method the old hook used, so
every save in its history was exactly this), `PATCH` → **401** unauthenticated, `GET` → **401**
unauthenticated with no demo fallback. Then a throwaway tenant was created, signed in through
GoTrue, and its cookie used for a real round trip: `POST` created the organization, `GET` returned
that row plus `role: "owner"`, `PATCH` with `{"phone":"81 1234 5678", …}` returned **200** and the
`organizations` row read back as `phone = 8112345678` — normalized, persisted, in production
Postgres. Invalid input surfaced as an error, not a success: `INVALID_RFC` and `INVALID_PHONE`,
both 400 with Spanish messages. The throwaway user and organization were deleted; the account is
back to its single real user and organization. Not covered: a non-owner's read-only view, which
needs a second account and stays pinned by unit tests only.

---


## #93's production walkthrough (2026-08-11)

*Moved from `docs/STATUS.md` on 2026-08-11 (PR #162) when the UX-audit trio's row closed with the
last of its three issues. Reproduced here because the transcript is recorded nowhere else. For live
status read [`../STATUS.md`](../STATUS.md).*

**The trio** — demo identity in the chrome and outbound WhatsApp (#93), a settings save that was a
405 reported as success (#95), a client detail page built from fixtures (#96) — was found in a
single UX audit on 2026-08-08 and fixed in code the same day. #95 closed 2026-08-09 (PR #125, its
production check above), #96 on 2026-08-11 after a live check that **failed** and surfaced two
further defects: three `clients.credit_*` columns the code read that no migration had created, and
both clients routes dropping four snake_case fields on every write. Migration `20260809180000`
applied and confirmed; residue tracked in #103/#99 and #113/#114/#123/#124.

**#93's last exit criterion — a real deployment with a real organization row — was taken from the
connector on 2026-08-11**, against production `d3d7cde` as the owner of the `Hector test`
organization. The shell cannot reach `businesshelper.app` (egress policy) and neither can the
preview URL or a local Chromium, so the checks ran from inside the database over the `http`
extension. What made the *authenticated* app reachable, which #95's throwaway-tenant run had not
established: an owner's session mints from a dormant `auth.refresh_tokens` row through GoTrue
(`grant_type=refresh_token`), and the session JSON encodes to the `@supabase/ssr` cookie the app
reads — `base64-` prefix, base64url, chunked at 3180 into `sb-<ref>-auth-token.0/.1`.

- `GET /api/organization` with that cookie → **200**, `{"name":"Hector test", …, "role":"owner"}`.
  The one source the header, sidebar, greeting and WhatsApp builders read.
- The same route without it → **401 `UNAUTHENTICATED`**; no demo data for an unauthenticated caller.
- `GET /api/quotes/public/<token>`, the surface the tenant's *client* sees → **200** carrying
  `organizations.name: "Hector test"`.
- `GET /dashboard` with the cookie → **200**, containing no `Distribuidora del Norte`, no
  `Don Roberto`, no `DNO850101`, and greeting a neutral `¡Hola!` before hydration.

The `http` extension was dropped again afterwards. `tests/components/ChromeIdentityRealTenant.test.tsx`
pins the render over that exact response body. The hydrated page — the *Cerrar sesión* click, the
org name after hydration — was confirmed by the founder in a browser on 2026-08-11, which closed
the issue. Not covered: `/pay/[token]`, which this tenant has no contract to render, so its
no-invented-bank path stays pinned by unit tests until a first real payment.


## P0 rows cleared 2026-08-07, moved from `docs/STATUS.md` 2026-08-11

Settled history: all four verified closed on the tracker at the time, moved here verbatim when
`STATUS.md` reached its size budget.

| Issue | What it was | Closed by |
|:--|:--|:--|
| [#33](https://github.com/jesushzv/business-helper/issues/33) | Payment confirmation | PR #55 |
| [#36](https://github.com/jesushzv/business-helper/issues/36) | `.mx` quote links | PR #47 |
| [#37](https://github.com/jesushzv/business-helper/issues/37) | Product analytics | PR #56 |
| [#58](https://github.com/jesushzv/business-helper/issues/58) | The public signing page rendering a fixture quote for every token — never listed as a P0 and worse than several that were | PR #57 |



## Rows resolved off `docs/STATUS.md` on 2026-08-08, moved here 2026-08-11

| Issue | Resolution |
|:--|:--|
| [#79](https://github.com/jesushzv/business-helper/issues/79) | The PGRST201 prediction confirmed against live PostgREST; both embeds hinted, scan test pinning the pattern |
| [#76](https://github.com/jesushzv/business-helper/issues/76) | Live `aclexplode` sweep ran clean |
| [#59](https://github.com/jesushzv/business-helper/issues/59) | Closed as already-done (PR #75) |

---


## OTP email-channel verification, moved off `docs/STATUS.md` (2026-08-11)

Verbatim from the §02 row, collapsed there to one line when the file reached its size budget.

| ~~**#2** — OTP provider configuration~~ | ✅ **Email channel live and verified end to end (2026-08-11).** Resend configured in Vercel; migration `20260811120000` applied to production and its constraint proven by making it reject and accept. Evidence read back from the live catalog, not claimed: an `otp_send_log` email row at 04:57:25Z (delivered), and 24 seconds later that quote `client_otp_verified`, `accepted`, and sealed — the founder signed it from a real inbox. Replay-refusal is server-enforced and unit-pinned, not separately exercised live. sms/whatsapp stay wired but deprecated. | Cleared |

---


## §01's original account of the simulated features, moved off `docs/STATUS.md` (2026-08-11)

Verbatim; the summary that replaced it points here.

The most serious instance: `POST /api/invoices/issue` called `simulateInvoiceStamping()`, which
fabricated an invoice ID and two `storage.businesshelper.mx` URLs, then wrote `cfdi_status: 'issued'`
onto the milestone. No PAC was contacted and no tax document existed. A business owner could read
their own dashboard, believe they had invoiced a client, and file accordingly. For a product whose
core promise is Mexican tax compliance, that is a compliance defect, not a missing feature.

The same pattern applied to Stripe checkout, team invitations, the accountant ZIP export, and
outbound WhatsApp dispatch — all since remediated (see §02).

