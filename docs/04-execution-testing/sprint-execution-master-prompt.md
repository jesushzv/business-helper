# Sprint & Workstream Execution Master Prompt: Business Helper

> **Quick Usage Guide for the MASTER_PROMPT.md Template**
>
> The root-level [`MASTER_PROMPT.md`](../../MASTER_PROMPT.md) is the gold template for all AI agent execution. This document provides quick-reference usage instructions.

---

## 📋 Mode A — Sprint Execution (Feature Development)

Substitute `[N]` with the target sprint number (1–16+):

```
Please execute Sprint [N] following the full ECC protocol in @[MASTER_PROMPT.md].
```

**Examples:**
- `"Please execute Sprint 2 following the full ECC protocol in @[MASTER_PROMPT.md]."`
- `"Please execute Sprint 7 following the full ECC protocol in @[MASTER_PROMPT.md]."`

---

## 📋 Mode B — Workback Workstream Execution (Post-Expert-Review)

Substitute `[WS-X]` with the target workstream ID (WS-A through WS-I):

```
Please execute WS-[X] of @[docs/04-execution-testing/product_readiness_workback.md] following the full ECC protocol in @[MASTER_PROMPT.md].
```

**Examples:**
- `"Please execute WS-B of @[docs/04-execution-testing/product_readiness_workback.md] following the full ECC protocol in @[MASTER_PROMPT.md]."`
- `"Please execute WS-D of @[docs/04-execution-testing/product_readiness_workback.md] following the full ECC protocol in @[MASTER_PROMPT.md]."`

---

## 📋 Mode C — Bug Fix / Hotfix

Describe the issue and reference the master prompt:

```
Please investigate and fix [ISSUE_DESCRIPTION] following the ECC protocol in @[MASTER_PROMPT.md].
```

---

## 🔑 Key Principle

The `MASTER_PROMPT.md` template is designed to **maximize context injection** by forcing the agent to load the right documentation in the right order before writing any code. It eliminates the need to manually reference individual doc files in your prompt — the template handles all document routing.

---

*Document maintained under `docs/04-execution-testing/sprint-execution-master-prompt.md` per [AGENTS-DOCS-GUIDE.md](../../docs/AGENTS-DOCS-GUIDE.md).*
