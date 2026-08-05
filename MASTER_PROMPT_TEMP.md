# Business Helper — Master Execution Prompt (UX/UI Audit Remediation - TEMP)

> **Execution Prompt for Addressing Findings in `ux_ui_audit_synthesis_aug2026.md`**
>
> Copy this prompt and substitute `[TASK_ID]` (e.g. `A7`, `A8`, `A9`, `C1`, `C6`, `C7`, `E8`, `E9`, `E10`, `E11`, `E12`, `F6`, `F7`, `F8`) with the target remediation item.
> Enforces context loading from `ux_ui_audit_synthesis_aug2026.md` and `product_readiness_workback.md` following the ECC 4-Phase execution loop.

---

## 🎯 Execution Command (Copy-Paste)

### Mode D — UX/UI Audit Remediation Execution

```
Please execute task [TASK_ID] from @[docs/04-execution-testing/ux_ui_audit_synthesis_aug2026.md] and @[docs/04-execution-testing/product_readiness_workback.md] following the full ECC protocol below.
```

---

## 00 Context Primer & Baseline Scorecard

* **Consolidated Audit Score**: **5.0 / 10** (Launch Readiness) | **4.75–5.0 / 10** (Mobile Responsiveness)
* **Gate 1 Status**: **RE-OPENED / FAILED 🔴** (Target: ≥ 7.0 / 10 before paid acquisition)
* **Target Audience**: Mexican PyMEs (Don Roberto & Lic. Mariana personas)
* **Core Rule 1**: Production Deployment Target Standard — All features, media assets, authentication flows, API endpoints, and database models MUST be targeted and architected for Production Cloud Deployment (Vercel, Supabase, Cloudflare R2 / CDN, Stripe Live API) rather than local-only setups, unless explicitly stated otherwise.
* **Core Rule 2**: Zero tolerance for stock photo duplication, leaked raw asset paths, broken routes (`/login`, `/pricing`, `/demo`), or data-loss footer form buttons.

---

## 01 Mandatory Context Loading (Read Before Execution)

> [!IMPORTANT]
> **You MUST read these documents in order before modifying UI components or writing code.**

### Tier 1 — Mandatory Remediation Context

| Priority | Document | Purpose |
|:---|:---|:---|
| 🔴 P0 | @[docs/04-execution-testing/ux_ui_audit_synthesis_aug2026.md] | Master synthesis of dual UX/UI audit findings, exact flaws, and prescribed fixes |
| 🔴 P0 | @[docs/04-execution-testing/product_readiness_workback.md] | Regressed workback schedule, task severity ratings, and Gate 1/2 criteria |
| 🔴 P0 | @[docs/AGENTS-DOCS-GUIDE.md] | Agent operating constraints and document navigation index |
| 🔴 P0 | @[docs/04-execution-testing/ecc-execution-playbook.md] | The 4-Phase ECC loop (Planning → TDD → Implementation → Verification) |
| 🔴 P0 | @[docs/01-strategy/user-personas.md] | Don Roberto mobile UX rules & Lic. Mariana multi-tenant rules |

### Tier 2 — Visual & Architecture Context

| Priority | Document | When to Consult |
|:---|:---|:---|
| 🟡 P1 | @[docs/01-strategy/brand_guidelines_spec.md] | Any UI, copy, color palette, or typography modification |
| 🟡 P1 | @[docs/02-architecture/app-architecture-plan.md] | Next.js 16 App Router component structure & client/server split |
| 🟡 P1 | @[docs/04-execution-testing/product_launch_checklist.md] | Technical pre-launch verification checklist |
| 🟡 P1 | @[docs/04-execution-testing/product_expert_review_aug2026.md] | Historical expert review analysis & background context |

---

## 02 Remediation Execution Protocol (ECC Loop)

### Phase 1: Planning & Audit Alignment
1. **Load Specific Task Context**: Look up target `[TASK_ID]` in @[docs/04-execution-testing/ux_ui_audit_synthesis_aug2026.md] and @[docs/04-execution-testing/product_readiness_workback.md].
2. **Inspect Code Surface**: Locate the target file(s) in `app/`, `components/`, or `public/`.
3. **Draft Plan**: Outline exact changes needed to resolve the visual, copy, or flow defect without breaking existing API contracts.

### Phase 2: TDD / Test Assertion (Red Phase)
1. **Add/Update Tests**: Add test assertions in `tests/components/` or `tests/unit/` checking that:
   - Avatar images are unique and distinct
   - Forms submit cleanly via POST without losing input
   - Headlines render single canonical H1 elements
   - Inputs satisfy `>= 48px` touch targets and 16px base font
2. **Verify Failure**: Run `npm run test` to confirm test assertions catch the current bug.

### Phase 3: Implementation & Polish
1. **Apply Fix**: Refactor code adhering to Tailwind dark slate theme (#090D16 base, emerald accents).
2. **Eliminate Leaks**: Ensure no raw asset paths (`/assets/demo/...`), empty-string hashes, or stray timestamps leak into DOM text.
3. **Mobile Target**: Enforce min 48px touch targets (`min-h-[48px]`, `py-3`) and thumb-friendly CTAs.

### Phase 4: Quality Gate Verification
1. **Run Static Analysis**: `npm run typecheck && npm run lint` (Must pass with 0 errors, 0 warnings).
2. **Run Test Suite**: `npm run test:coverage` (Must pass with >= 85% coverage).
3. **Sync Documentation**: Mark completed task in `ux_ui_audit_synthesis_aug2026.md` and `product_readiness_workback.md` with `☑`.

---

## 03 Quick Task Lookup Reference

| Task ID | Component / Focus Area | Primary Target File / Section |
|:---|:---|:---|
| **`A1`** / **`A7`** | Testimonial & Hero Avatar Photo Reuse | `components/landing/TestimonialsSection.tsx`, `HeroSection.tsx` |
| **`A8`** | Raw File Paths & Stray Timestamps | `components/landing/DemoSection.tsx`, `HeroSection.tsx` |
| **`A9`** | Double Concatenated H1 Bug | `components/landing/HeroSection.tsx` |
| **`A10`** | External Trust Badges (PAC, SSL) | `components/landing/TrustSection.tsx`, `Footer.tsx` |
| **`A12`** | Crypto Jargon Translation | Landing page copy strings, `HeroSection.tsx`, `FeaturesSection.tsx` |
| **`C1`** | Defer RFC to Progressive Profiling | `app/(auth)/register/page.tsx`, `app/(auth)/onboarding/page.tsx` |
| **`C6`** | Footer Form Link Data Loss Trap | `components/landing/Footer.tsx` |
| **`C7`** | Broken `/login` Auth Form | `app/(auth)/login/page.tsx` |
| **`E8`** | Missing Routes `/pricing` & `/demo` | `app/pricing/page.tsx`, `app/demo/page.tsx` |
| **`E9`** | Sticky Header Navigation | `components/landing/HeaderNav.tsx` |
| **`E10`**| Cookie Consent Banner & Terms Link | `components/common/CookieBanner.tsx`, `Footer.tsx` |
| **`E12`**| Domain Canonical Alignment | `app/layout.tsx`, `next.config.ts` |
| **`F6`** | De-risk Competitor Comparison | `components/landing/ComparisonSection.tsx` |
| **`F7`** | Move Pricing Section Higher | `app/page.tsx` (reorder landing page components) |
| **`F8`** | Standardize CTA Copy & Plan Params | `components/landing/PricingSection.tsx`, `onboarding` |

---

*Saved as `MASTER_PROMPT_TEMP.md` for UX/UI audit remediation work.*
