# Business Helper — Project Execution & System Guidelines

## Core Execution Rule: Production-First Architecture Standard

> [!IMPORTANT]
> **Production Deployment Target Standard**:
> All future feature implementations, media asset delivery pipelines, authentication controls, API endpoints, database models, and legal compliance structures **MUST BE TARGETED AND ARCHITECTED FOR PRODUCTION CLOUD DEPLOYMENT** (Vercel, Supabase Cloud, Cloudflare R2 / CDN, Stripe Live API) rather than local-only, mock-only, or sandbox-only setups, unless explicitly specified otherwise by the user.

---

## Technical Standards Summary

### 1. Media & CDN Infrastructure
- All media assets (videos, WebM, MP4, screenshots, posters, avatars) MUST use the `getAssetUrl(path)` helper from [`lib/url.ts`](file:///Users/jhzamora/.gemini/antigravity-ide/scratch/business-helper/lib/url.ts).
- `NEXT_PUBLIC_CDN_URL` controls production CDN asset routing (e.g. `https://cdn.businesshelper.mx`), gracefully falling back to root paths when unconfigured.

### 2. Mexican PyME UX Standards
- **Dark Theme Palette**: Dark Slate (`#090D16`), Emerald (`emerald-500`), and Indigo (`indigo-600`) accents.
- **Mobile Responsiveness**: Enforce $\ge 48\text{px}$ touch targets (`min-h-[48px]`, `py-3`) and $16\text{px}$ minimum font size on inputs to prevent automatic iOS Safari zoom.
- **Plain Legal & Financial Copy**: No developer jargon (`RLS`, `sha256:e3b0c442...`, `multitenant`); use clear PyME benefit claims (*"Evidencia Legal Certificada"*).

### 3. Execution-Centric Control (ECC) Protocol
- Every change follows the 4-Phase loop: Planning & Audit Alignment $\rightarrow$ TDD (Red Phase) $\rightarrow$ Implementation & Polish $\rightarrow$ Quality Gate Verification (`npm run typecheck`, `npm run build`, `npm run test`).
- **Build & Type Validation**: Because Vitest strips TypeScript annotations for speed, `npm run typecheck` (`tsc --noEmit`) and `npm run build` MUST be run as standalone quality gates to catch full static interface mismatches before deployment.

