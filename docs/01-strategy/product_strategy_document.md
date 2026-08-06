# Product Strategy Document: Business Helper

> **Long-Term Product Vision & Strategic Positioning**
>
> Overarching strategic document for **Business Helper** defining our 5-year vision, core strategic bets, build vs. buy choices, channel distribution model, and roadmap sequencing.

---

## 01 Product Vision & Mission

### Vision
> **"Every small business in Mexico operates with financial clarity, closing sales faster and collecting payments effortessly from their phone."**

### Mission
> **"We build mobile-first, WhatsApp-native business operations tools for Mexican SMBs that replace complex legacy software with fast, automated quote-to-cash workflows."**

---

## 02 Strategic Bets & Core Choices

| Strategic Bet | Rationale | Alternatives Rejected |
|:---|:---|:---|
| **WhatsApp-First UX** | 95%+ of Mexican business transactions happen over WhatsApp. Meeting users where they live eliminates adoption friction. | Rejecting proprietary client mobile app installs. |
| **Mobile-First App Router** | Business owners manage operations on the floor, in route, or at job sites — not at a desktop PC. | Rejecting desktop-only native software. |
| **Zero-Consultant Self-Serve** | SMBs can't afford $2,000+ USD implementation fees or 6-week onboarding cycles. | Rejecting enterprise partner-led implementations. |
| **Accountant Channel Strategy** | Accountants are trusted advisors to 10–50 SMB clients each. Making accounting exports 1-click turns them into resellers. | Rejecting traditional direct enterprise sales reps. |

---

## 03 Build vs. Buy Strategy

* **Build (Core IP)**: Quote creation wizard, WhatsApp link generator, Accounts Receivable Kanban, Client CRM health score, contract SHA-256 cryptoseal.
* **Buy / Partner (Infrastructure)**:
  * **Auth & DB**: Supabase (PostgreSQL + RLS)
  * **Payments**: Stripe Subscriptions
  * **CFDI 4.0 Stamping**: Facturapi PAC API
  * **Email**: Resend API
  * **Hosting**: Vercel Platform

---

## 04 Roadmap Sequencing Rationale

```
[Phase 1: Quotes + AR + CRM] ──> [Phase 2: SAT CFDI 4.0 Invoicing] ──> [Phase 3: Stock & AI Assistant]
       (Validate PMF)                    (Drive Expansion ARPU)                  (Defensive Moat)
```

1. **Why Quotes + AR First?**: Solving cash flow anxiety creates immediate daily habit loops.
2. **Why CFDI Invoicing Second?**: Captures expansion revenue ($599 & $999 tiers require invoicing).
3. **Why AI Assistant Third?**: Acts as a retention moat after establishing core relational data.
