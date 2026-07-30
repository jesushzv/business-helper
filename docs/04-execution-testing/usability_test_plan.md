# Usability Test Plan: Business Helper

> **Operational UX Validation & Task Performance Plan**
>
> A structured usability testing blueprint for evaluating **Business Helper** with real Mexican SMB owners and agency managers. Designed to measure task completion, friction points, mental model alignment, and pass/fail launch criteria.

---

## 01 Test Overview

### Purpose
To validate whether non-technical Mexican SMB owners (Don Roberto) and busy agency managers (Lic. Mariana) can create quotes, share them via WhatsApp, and confirm SPEI receivables in under 3 minutes without assistance or training.

### Scope
* **In Scope**: Mobile quote creation wizard, WhatsApp link generation, client public quote view (`/q/[token]`), client OTP signing flow, SPEI receipt upload portal, and Accounts Receivable dashboard (`/dashboard/receivables`).
* **Out of Scope**: Multi-tenant billing settings, Stripe checkout, Facturapi PAC credentials setup.

### Stakeholders
| Role | Person | Responsibility |
|:---|:---|:---|
| Test Facilitator | Founder / Product Lead | Moderates sessions, asks neutral probing questions |
| Note-Taker | UX Engineer | Captures time-on-task, errors, and verbatim quotes |
| Decision Maker | Founder | Approves UI redesigns based on critical pass/fail metrics |

---

## 02 Test Design

### Methodology
* **Type**: Moderated Remote (via Zoom / Google Meet with mobile screen share) and In-Person (Monterrey & CDMX local visits).
* **Format**: Task-based, think-aloud protocol.
* **Duration**: 45 minutes per session.
* **Participants**: 8 participants (5 Traditional SMB Owners, 3 Agency Ops Managers).

### Participant Criteria
* **Include**: Mexican SMB owners/managers operating for >= 1 year, generating >$100K MXN/mo, using WhatsApp daily for business.
* **Exclude**: Software developers, corporate IT staff, non-Mexican businesses.
* **Incentive**: $500 MXN Starbucks gift card or 3 months free Business Helper subscription.

### Test Environment
* **Devices**: Participant's own mobile device (iPhone iOS 16+ or Android 12+).
* **Environment**: Production Staging Sandbox with realistic demo data.

---

## 03 Tasks & Scenarios

### Scenario 1: The Urgent WhatsApp Quote (Don Roberto)
> *"Un cliente te acaba de pedir por WhatsApp la cotización de 10 bultos de cemento y 5 varillas. Quieres mandarle una propuesta formal por WhatsApp en menos de 3 minutos desde tu celular."*

* **Task 1.1**: Open app, create a new quote for "Construcciones Maya", add 2 line items with prices, and generate the WhatsApp link.
* **Success Criteria**: Reaches WhatsApp link preview in `< 180 seconds` without asking for help.
* **Post-Task Rating**: *"En una escala del 1 al 7, ¿qué tan fácil fue crear y enviar esta cotización?"*

### Scenario 2: The Overdue Payment Follow-Up (Lic. Mariana)
> *"Tienes 3 pagos vencidos esta semana. Quieres revisar quién te debe y mandarle un recordatorio de cobro por WhatsApp a un cliente atrasado."*

* **Task 2.1**: Navigate to the Accounts Receivable screen, identify the overdue client, and trigger a pre-filled WhatsApp reminder.
* **Success Criteria**: Locates the overdue card and opens WhatsApp in `< 60 seconds`.

---

## 04 Metrics & Success Criteria

### Quantitative Thresholds

| Metric | Target Threshold | Pass/Fail Limit |
|:---|:---|:---|
| **Task Completion Rate** | **> 85%** | Fail if < 70% |
| **Quote Creation Time-on-Task** | **< 2.5 minutes** | Fail if > 4 minutes |
| **System Usability Scale (SUS)** | **> 80 / 100** | Conditional if 65–79 |
| **Single Ease Question (SEQ)** | **> 6.0 / 7.0** | Fail if < 5.0 |

### Decision Framework
* **Critical Issue**: Task completion rate drops below 70% on quote creation → **MUST FIX BEFORE BETA LAUNCH**.
* **Major Issue**: Users hesitate >15 seconds finding the WhatsApp share button → **Fix in next 3-day sprint**.
* **Minor Issue**: Typography scaling issue on smaller Android screens → Add to polish backlog.

---

## 05 Session Guide & Script

1. **Intro (5 min)**: Explain think-aloud protocol ("We are testing the app, not you").
2. **Warm-Up (5 min)**: Ask how they currently send quotes and track payments.
3. **Tasks (30 min)**: Run Scenarios 1 & 2. Observe without intervening when they hit friction.
4. **Debrief (5 min)**: Collect System Usability Scale (SUS) survey answers and overall feedback.
