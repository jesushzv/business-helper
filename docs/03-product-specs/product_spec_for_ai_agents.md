# Product Spec for AI Agents: [Spec Name]

<!-- STATUS-AUTHORITY: docs/STATUS.md -->

> [!NOTE]
> **Live status lives in [`docs/STATUS.md`](../STATUS.md) — not here.** The lifecycle states listed here are a **workflow vocabulary**, not claims about any specific feature.

> **AI Agent Executable Specification & Evaluation Framework**
>
> A structured product spec format optimized for processing by autonomous AI coding agents (AGY, Claude Code, Cursor, Replit). Connects problem evidence, falsifiable bets, success signals, and build-readiness checks.

---

## 01 Spec Header

| Field | Value |
|:---|:---|
| **Spec Name** | [e.g., Accounts Receivable Kanban & WhatsApp Reminder Engine] |
| **Owner** | Product Lead |
| **Target Agent** | AGY / Claude Code / TypeScript-Reviewer |
| **Status** | `Draft` | `Approved for Build` | `In Execution` | `Completed` |

---

## 02 The Problem & Falsifiable Bet

### Problem Statement
Mexican SMB owners lose an estimated $45,000+ MXN annually due to forgotten or uncollected milestone payments. Current accounting tools require manual bank statement checks and lack instant WhatsApp communication links.

### Falsifiable Bet
> **If we** implement a mobile-first Accounts Receivable Kanban with pre-filled 1-tap WhatsApp payment reminder links, **then** pilot SMB owners will collect overdue payments `40% faster` and achieve a `>70% daily engagement rate` on the receivables dashboard within 30 days of launch.

---

## 03 Success Criteria & AI Evaluation

| Metric / Signal | Target Threshold | Anti-Signal (Fail Warning) |
|:---|:---|:---|
| **Dashboard Load Latency** | `< 1.5s` on mobile 4G | Waterfall requests causing `> 3.0s` load |
| **WhatsApp Link Assembly** | Instant `wa.me/` pre-filled URL | Unsanitized special characters breaking URL |
| **Database Multi-Tenancy** | 100% RLS policy enforcement | Missing `organization_id` in SQL query |

---

## 04 Build-Readiness Checklist

- [x] Problem statement backed by empirical user interview data.
- [x] Falsifiable bet clearly defined with quantitative metrics.
- [x] Data schema extensions written with additive SQL syntax.
- [x] RLS security policies defined for all new tables.
- [x] Acceptance criteria independently testable via Playwright E2E suites.
