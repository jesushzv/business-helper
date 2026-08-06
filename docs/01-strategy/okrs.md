# OKRs: Business Helper (Q3 – Q4 2026)

> **Objectives and Key Results Framework**
>
> A structured performance and alignment framework for tracking product-market fit (PMF) validation, commercial revenue growth, user retention, and strategic execution for **Business Helper** during the Q3–Q4 2026 launch phase.

---

## 01 Objectives

### Objective 1 (Product-Market Fit & Activation — Q3 2026)
> **"Establish proven Product-Market Fit with Mexican SMBs by delivering an indispensable, mobile-first quote-to-cash platform."**

### Objective 2 (Commercial Growth & Accountant Distribution — Q4 2026)
> **"Build a scalable, accountant-backed commercial distribution engine to achieve sustainable MRR growth in Mexico."**

---

## 02 Key Results

### KRs for Objective 1 (PMF & Activation)

* **KR 1.1**: Increase active **paying SMB customer accounts** from `0` to `100` by September 30, 2026.
* **KR 1.2**: Increase 14-day **trial-to-paid conversion rate** from `0%` to `>25%` by September 30, 2026.
* **KR 1.3**: Increase **onboarding completion rate** (signup → create first quote) from `0%` to `>80%` by August 31, 2026.
* **KR 1.4**: Maintain **monthly customer churn rate** below `5.0%` for paid accounts through Q3 2026.

### KRs for Objective 2 (Growth & Distribution)

* **KR 2.1**: Scale **Monthly Recurring Revenue (MRR)** from `$0 MXN` to `$55,000 MXN` (~$3,000 USD) by December 31, 2026.
* **KR 2.2**: Sign and onboard **accounting firm partners** from `0` to `5 firms` (referring 25+ SMB clients) by November 30, 2026.
* **KR 2.3**: Achieve a **Net Promoter Score (NPS)** of `>50` among active business owners at Day 30 post-onboarding.

---

## 03 Initiatives

### Initiatives for Objective 1 (PMF & Activation)

| Initiative | Drives KR | Owner | Effort Estimate |
|:---|:---|:---|:---:|
| **3-Step Mobile Quote Wizard**: Build a streamlined, high-speed mobile quote generator with SAT IVA/ISR auto-calc and 1-tap WhatsApp sharing. | KR 1.3, KR 1.2 | Lead Dev | **M** |
| **Accounts Receivable Kanban & Reminders**: Implement the "Quién me debe" dashboard with one-click pre-filled WhatsApp payment reminder links. | KR 1.2, KR 1.4 | Lead Dev | **M** |
| **Client SPEI Receipt Upload Portal**: Create a public, zero-login link for clients to upload SPEI transfer vouchers and tracking keys (*Claves de Rastreo*). | KR 1.2, KR 1.4 | Frontend Dev | **S** |
| **P0 Onboarding Redesign**: Remove unneeded fields; implement 10-minute setup wizard (Business Name → RFC → First Quote). | KR 1.3 | Product Owner | **S** |

### Initiatives for Objective 2 (Growth & Distribution)

| Initiative | Drives KR | Owner | Effort Estimate |
|:---|:---|:---|:---:|
| **Accountant Partner Reseller Portal**: Build a 1-click monthly export tool (XMLs, PDFs, SPEI receipts in a structured ZIP) and referral dashboard for accounting firms. | KR 2.2, KR 2.1 | Lead Dev | **L** |
| **Facturapi SAT CFDI 4.0 Integration**: Complete Facturapi PAC integration for 1-click electronic invoice timbrado from accepted quotes. | KR 2.1, KR 2.3 | Backend Dev | **M** |
| **Meta Paid Direct-Response Campaign**: Run targeted FB/IG video ads demonstrating 30-sec mobile quote creation to MX business owners ($10K MXN budget). | KR 1.1, KR 2.1 | Growth Lead | **S** |
| **Founder Direct WhatsApp Outreach**: Execute direct outreach to 30 pilot SMB owners in Monterrey and CDMX for high-touch onboarding feedback. | KR 1.1, KR 2.3 | Founder | **M** |

---

## 04 Alignment

### Strategic Context
Following the Mi Pacto post-mortem (696 visitors, 0 signups), our strategic priority is shifting from solo freelancers to established SMB owners ($100K–$2M MXN/mo revenue). This segment has higher willingness to pay, higher daily engagement, and acute operational pain around cash flow and WhatsApp quote management.

### Cross-Team Dependencies

```
┌───────────────────────────┐      ┌───────────────────────────┐
│ Product & Engineering     │ ---> │ Growth & Sales            │
│ (Delivers Quote + AR App) │      │ (Launches Ads & Outreach) │
└─────────────┬─────────────┘      └─────────────┬─────────────┘
              │                                  │
              └───────────────┬──────────────────┘
                              ▼
               ┌─────────────────────────────┐
               │ Accountant Partner Channel  │
               │ (Drives Organic Referrals)  │
               └─────────────────────────────┘
```

* **Product ↔ Growth**: Ad campaigns depend on the 3-Step Mobile Quote Wizard (Initiative 1.1) landing page demo.
* **Engineering ↔ Accountant Partners**: Reseller acquisition depends on the 1-Click Monthly ZIP Export tool (Initiative 2.1).

---

## 05 Key Stakeholders

| Role | Responsibility |
|:---|:---|
| **OKR Owner / Founder** | Overall accountability for company Objectives, MRR growth, and pilot business outreach |
| **Lead Developer** | Drives engineering Initiatives (Quote Wizard, AR Kanban, Accountant Export tool) |
| **Growth Lead** | Drives KR 1.1, KR 1.2, and Meta ad campaign performance |
| **Product / UX Lead** | Drives KR 1.3 (Onboarding completion) and NPS user feedback loops |

### Escalation Path
If any Key Result falls into "Off Track" status (scoring <0.4 at mid-quarter checkpoint), the Founder calls a mandatory 1-hour strategy meeting to re-allocate engineering hours or pause non-performing ad channels.

---

## 06 Timeline & Checkpoints

```
  Week 2           Month 1           Mid-Quarter (Week 6)     End of Q3/Q4
┌─────────┐      ┌─────────┐      ┌─────────────────────┐    ┌─────────────┐
│ Core App│ ---> │ Beta    │ ---> │ PMF Validation Gate │ -> │ Full Scoring│
│ Scaffolding     Pilot (20)       50+ Users / >20% Conv     & Retrospective
└─────────┘      └─────────┘      └─────────────────────┘    └─────────────┘
```

### Cadence
* **Weekly (Mondays)**: 15-minute standing OKR review — update metrics on whiteboard/dashboard (`On Track`, `At Risk`, `Off Track`).
* **Monthly**: Deep-dive review of Trial-to-Paid conversion and MRR progress.
* **End of Quarter**: Formal scoring (0.0 to 1.0) and retrospective strategy update.

---

## 07 Risks & Mitigations

| Risk | Likelihood | Impacted KRs | Mitigation Strategy | Contingency Plan |
|:---|:---:|:---:|:---|:---|
| **Low Trial-to-Paid Conversion (<15%)** | Medium | KR 1.2, KR 2.1 | Offer a 10-minute personal WhatsApp onboarding call with founder for every sign-up | Extend free trial by 7 days in exchange for a feedback interview |
| **Accountant Friction** *(Accountants tell clients not to use new software)* | Medium | KR 2.2, KR 1.4 | Build the 1-Click ZIP Export feature first so accountants see Business Helper as a tool that helps *them* | Offer accountants 20% recurring revenue share for referred clients |
| **Meta Ad CAC Spike (> $150 MXN)** | Low | KR 1.1, KR 2.1 | Focus spend on high-converting lookalike audiences and direct WhatsApp group shares | Shift 100% of acquisition effort to organic LinkedIn content + accountant referrals |

---

## 08 Review & Scoring

### Scoring Scale

* **0.7 – 0.8 (Target / Sweet Spot)**: Strong stretch achievement.
* **0.4 – 0.6**: FAILED stretch target, but meaningful operational progress.
* **0.0 – 0.3**: Critical failure — requires immediate strategy pivot.

### Retrospective Questions (End of Q3)

1. *Did our 1-tap WhatsApp quote feature drive the expected >25% trial conversion rate?*
2. *Are accountants adopting the 1-Click Monthly ZIP export tool or rejecting it?*
3. *What is the primary feature request from active paid accounts in their first 30 days?*
