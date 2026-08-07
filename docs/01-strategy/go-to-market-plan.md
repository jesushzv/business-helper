# Go-to-Market Plan: Business Helper

> **Operational Launch & Commercial Strategy Document**
>
> An actionable, time-bound commercial execution plan for launching **Business Helper** in Mexico. Defines market sizing, positioning messaging, pricing tier economics, channel promotional tactics, accountant reseller enablement, and 30/90-day key success indicators.
>
> *Updated: August 2026 — Post Independent Product Expert Review. Incorporates CFDI pricing repositioning and paid acquisition gates.*

---

## 01 Executive Summary

Business Helper is an all-in-one business operations platform designed specifically for small and medium businesses (SMBs) in Mexico to streamline quotes, accounts receivable, and SAT CFDI 4.0 invoicing via WhatsApp. Launching in Q3 2026, we target Mexican SMB owners ($100K–$2M MXN/mo revenue) who currently rely on Excel, PDF quotes, and manual bank tracking. We will reach customers through a hyper-targeted hybrid strategy: direct WhatsApp/LinkedIn outreach, local Cámara de Comercio partnerships, and an Accountant Referral Network. **Our primary 90-day goal is to acquire 100 paying SMB customers, achieving $55,000 MXN ($3,000 USD) in Monthly Recurring Revenue (MRR) with <5% churn.**

---

## 02 Market Analysis

### Market Size (Mexico SMB Ops & Invoicing)

```
┌────────────────────────────────────────────────────────┐
│ TAM: 4.9M Mexican SMBs (INEGI 2024)                    │
│ Total Spend Potential: $32.3B MXN ($1.7B USD/yr)       │
├────────────────────────────────────────────────────────┤
│ SAM: 800,000 Tech-Adjacent Service/Distributor SMBs     │
│ Serviceable Spend: $5.2B MXN ($288M USD/yr)            │
├────────────────────────────────────────────────────────┤
│ SOM: 1,000 SMBs in Target Hubs (MTY, CDMX, GDL, QRO)   │
│ Year 1 Revenue Target: $6.6M MXN ($360K USD/yr)        │
└────────────────────────────────────────────────────────┘
```

### Target Segments

#### Segment A: Wholesale & Material Distributors ("Don Roberto")
* **Who They Are**: Owners of 5–15 employee distribution firms (construction, auto parts, food & beverage) generating $500K–$2M MXN/mo.
* **Why They Buy**: Triggered when a major client delays a $50K+ MXN payment because a quote or invoice was lost in WhatsApp chats.
* **Where They Are**: Local Cámaras de Comercio (CANACO, CANACINTRA), WhatsApp business groups, Expo PYME events, Facebook business groups.
* **Current Solution**: Paper notebooks + Excel + WhatsApp PDFs + CONTPAQi desktop software.

#### Segment B: Professional Service Agencies ("Licenciada Mariana")
* **Who They Are**: Founders & Ops Managers of 3–10 person digital agencies, consulting firms, and engineering services generating $150K–$500K MXN/mo.
* **Why They Buy**: Triggered when administrative tracking of client milestone payments consumes more than 10 hours a week.
* **Where They Are**: LinkedIn, Twitter/X, agency network Slack channels, tech meetups in CDMX/Guadalajara.
* **Current Solution**: Google Workspace + Notion + Stripe + Manual WeTransfer exports to accountants.

---

## 03 Product Positioning

### Positioning Statement

> **For** Mexican SMB owners and operational managers who are losing time and money to manual quotes and delayed payments, **Business Helper** is a mobile-first business operations platform that centralizes quotes, accounts receivable, and SAT CFDI 4.0 invoicing in one place. **Unlike** complex legacy ERPs (Odoo, SAP) or outdated accounting tools (CONTPAQi), Business Helper is 100% WhatsApp-native, setup-free in 10 minutes, and built specifically for Mexican tax compliance.

### Messaging Hierarchy

* **Primary Message**: *"Controla las operaciones de tu negocio, manda cotizaciones profesionales y cobra a tiempo por WhatsApp."*
* **Supporting Message 1 (Speed & Simplicity)**: Genera cotizaciones elegantes con tu logotipo en 2 minutos desde tu celular y ciérralas con un toque.
* **Supporting Message 2 (Cash Flow Control)**: Visualiza exactamente quién te debe, envía recordatorios automáticos por WhatsApp y concilia pagos SPEI sin llamadas incómodas.
* **Supporting Message 3 (SAT Tax Peace of Mind)**: Emite facturas electrónicas CFDI 4.0 timbradas y entrega carpetas mensuales ordenadas a tu contador con un solo clic.

### Tone & Voice
* **Approachable & Direct**: Uses authentic Mexican business terminology (*cotizaciones, cobranza, anticipos, timbrado, comprobantes SPEI, SAT*).
* **High-Contrast Professional**: Confident, modern, zero corporate jargon, zero fluff.

---

## 04 Pricing Strategy

### Pricing Model & Tiers

We use a **Freemium 14-Day Full-Access Trial** transitioning to flat per-business monthly subscriptions (no per-user penalties):

| Tier Name | Price (MXN) | Target Customer | Included Capabilities |
|:---|:---|:---|:---|
| **Emprendedor** | **$299 MXN/mo** (~$17 USD) | Solo business owners & micro-vendors | 1 User, 25 Active Clients, 20 Quotes/mo, Manual WhatsApp Reminders, SPEI Tracking, CFDI add-on ($5/folio) |
| **Negocio** *(Recommended)* | **$599 MXN/mo** (~$33 USD) | Established SMBs (2–5 employees) | Up to 5 Users, 100 Active Clients, 100 Quotes/mo, **10 CFDI folios included** + $3/folio extra, Automated WhatsApp Reminders |
| **Empresa** | **$999 MXN/mo** (~$55 USD) | Growing SMBs & Agencies (5–15 employees) | Up to 15 Users, Unlimited Clients & Quotes, **50 CFDI folios included** + $2/folio extra, Dedicated WhatsApp Support |

> [!IMPORTANT]
> **CFDI Pricing Repositioned (Expert Review):** CFDI invoicing was previously gated behind the $999 Empresa plan. This created a $700 upgrade barrier for a $3 invoice. CFDI is now a pay-per-folio add-on available across all plans. Users connect their own PAC (Facturama, FiscalAPI, SW Sapien) — Business Helper never stores CSD certificates. See [cfdi_integration_architecture.md](../../docs/02-architecture/cfdi_integration_architecture.md).

### Competitive Anchoring

```
Odoo Enterprise ($20-$50 USD/user/mo + $5,000 USD Implementation)
       ▲
       │ [High Barrier]
Flexio ($3,000-$8,000/mo Enterprise Collections)
       │
Prayser ($1,199/mo Quotes Only)
       ▲
CONTPAQi Desktop ($500-$1,500 MXN/mo + Tech Install Fee)
       ▲
       │
★ BUSINESS HELPER ★ ($299 - $999 MXN/mo Flat, $0 Setup + CFDI from $3/folio)
       │
SenHub ($79/mo CFDI-only, no quotes/collections)
```

### Commercial Metrics Targets

* **Trial-to-Paid Conversion**: >25% of users who create 2+ quotes during trial.
* **Blended Target ARPU**: ~$550 MXN/mo ($30 USD).
* **Expansion Path**: Users upgrade from *Emprendedor* ($299) to *Negocio* ($599) when adding team members or needing included CFDI folios. CFDI pay-per-folio eliminates the old $299→$999 cliff.

---

## 05 Promotional Plan

### Gate 0: Expert Review Pre-Acquisition Gate *(NEW)*

> [!CAUTION]
> **Do NOT launch paid acquisition campaigns until Gate 0 passes.** The independent expert review scored launch readiness at 5.35/10 and mobile responsiveness at 4.75/10. Paid campaigns with these scores will waste budget due to credibility and conversion gaps.

| Gate Criterion | Current Score | Required Score |
|---|---|---|
| Launch Readiness | 5.35 / 10 | ≥ 7.0 / 10 |
| Mobile Responsiveness | 4.75 / 10 | ≥ 6.0 / 10 |
| Credibility / Social Proof | 3 / 10 | ≥ 7 / 10 |

**Until Gate 0 passes:** Focus exclusively on organic channels (LinkedIn, WhatsApp communities, accountant referrals) and beta testimonial collection. See [product_readiness_workback.md](../99-archive/product_readiness_workback.md) for the remediation timeline.

### Launch Channels & Tactics Matrix

| Channel | Specific Tactic | Launch Timing | Owner | Budget (MXN) | Expected Outcome |
|:---|:---|:---|:---|:---|:---|
| **Accountant Network** | Direct partnership pitch to 30 boutique accounting firms in MTY/CDMX | Week 1–4 | Founder | $0 | 5 Accountant Partners (referring 25+ SMB clients) |
| **LinkedIn Organic** | Founder content series: "5 errores de cobranza en WhatsApp que le cuestan $50k a tu PYME" | Week 1–8 (2x/wk) | Founder | $0 | 500 profile visits/mo, 30 trial signups |
| **WhatsApp Communities** | High-value sharing of free Excel/PDF quote templates in CANACO groups | Week 2–6 | Growth Lead | $0 | 40 trial signups from template downloads |
| **Meta Paid Ads (FB/IG)** | Direct-response animated demo ads showcasing mobile quote creation flow | **After Gate 0** | Growth Lead | $10,000 MXN | 100 trial signups @ $100 MXN CAC |
| **Expo PYME Outreach** | On-the-ground demo visits at local SMB fairs in Monterrey & CDMX | **After Gate 0** | Founder | $3,000 MXN | 20 direct pilot onboardings |

### Content & Collateral Calendar

* **Launch Announcement**: "Por qué las PYMEs mexicanas están dejando Excel y WhatsApp para cotizar y cobrar."
* **90-Second Animated Demo**: Generated motion graphics walkthrough showing: *Create quote → Send via WhatsApp → Customer OTP sign → SPEI payment → Accountant ZIP export*. NOT a self-recorded screen capture.
* **Free Resource Magnet**: *"Plantilla de Cotización Fiscal SAT 2026 + Calculadora de Retenciones ISR/IVA (Excel & App)"*.

---

## 06 Sales Strategy

### Hybrid Sales Motion

```
[Inbound Traffic / Ads / LinkedIn] ──> Self-Serve 14-Day Trial ──> In-App Self Upgrade ($299-$599 MXN)
                                             │
[Accountant Referrals / Larger Accounts] ────┴─> Founder WhatsApp Demo ──> Custom Enterprise ($999 MXN)
```

### Sales Enablement Assets

1. **The 1-Page Battlecard**: *Business Helper vs. CONTPAQi vs. Odoo* (Comparison table highlighting $0 setup fee and WhatsApp speed).
2. **Objection Handling Playbook**:
   * *Objection*: "¿Mi contador aceptará esto?"
   * *Answer*: "Sí. Tu contador no tiene que cambiar de sistema. Business Helper le entrega una carpeta ZIP mensual con todas las facturas XML, PDFs y comprobantes SPEI organizados con un solo clic."
3. **Founder WhatsApp Demo Script**: 3-step interactive script used during direct WhatsApp chat demos.

### Accountant Partner Program (Reseller Channel)

Accountants act as our primary trusted distribution channel:
* **Incentive**: Accountants receive a **Free Accountant Portal** to view all client transactions, plus a **20% recurring revenue share** or free Business Helper access for their firm for every 5 referred SMB clients.

---

## 07 Success Metrics & Tracking

### 30-Day Launch Targets (Beta & Initial Cohort)

* **Traffic & Signups**: 500 Unique Website Visitors → 50 Trial Signups.
* **Activation**: 35 Users (70%) create at least 1 client profile and 1 quote.
* **Revenue**: 15 Paid Subscriptions ($8,250 MXN MRR).

### 90-Day Commercial Targets (Scale Phase)

* **Paying Customers**: **100 Active SMB Accounts**.
* **Monthly Recurring Revenue**: **$55,000 MXN MRR** ($3,000 USD).
* **Retention**: >85% Month-3 Retention Rate (<5% monthly churn).
* **Accountant Partnerships**: 5 Firm Partnerships signed.

### Tracking & Escalation Triggers

* **Analytics Stack**: Mixpanel / PostHog (In-app funnel tracking), Stripe Dashboard (MRR/Churn), Supabase Logs.
* **Weekly Review**: Founder & Growth Lead review Activation Rate every Monday.
* **Pivot Trigger**: If 30-day Trial-to-Paid conversion is below 10%, we pause ad spend and conduct 15 qualitative exit interviews with trial drop-offs to adjust pricing or onboarding flows.
