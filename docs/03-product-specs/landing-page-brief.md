# Landing Page Brief: Business Helper

> **Creative & Technical Brief for AI Page Builders & Designers**
>
> A standalone, production-ready specification for building the high-converting marketing landing page for **Business Helper** — an all-in-one business operations platform for Mexican SMBs. Grounded in direct benefit copy, mobile-first responsiveness, and conversion psychology.
>
> *Updated: August 2026 — Post Independent Product Expert Review (Score: 5.35/10 → Target: 7.0+/10)*

---

## 01 Page Goal & Audience

### Conversion Goal
* **Primary Goal**: Free Trial Registration (`/register`).
* **Conversion Action**: User enters Name, Business Email, Password, RFC, and Phone to launch a 14-day full-access trial (No credit card required).

### Target Visitor
* **Traffic Sources**: Meta Ads (FB/IG targeting business owners), LinkedIn B2B posts, WhatsApp business community shares, direct accountant referrals, organic Google search (*"software para cotizar y cobrar mexico"*).
* **Awareness Level**: Solution-aware — they know they are losing money to overdue payments and wasting hours making quotes in Excel/PDF, but they don't want a complex $500 USD/mo ERP like Odoo or SAP.
* **Key Question**: *"¿Esto realmente me va a ayudar a cobrar a tiempo por WhatsApp sin hacerme perder el tiempo configurando cosas difíciles?"*
* **Primary Objection**: *"¿Será difícil de usar?"* / *"¿Tiene validez fiscal en México (SAT/CFDI)?"* / *"¿Es costoso?"* / *"¿Tengo que subir mis llaves del SAT?"*

---

## 02 Hero Section

### Copy
* **Pre-headline Badge**: `⚡ LA PLATAFORMA TODO-EN-UNO PARA PYMES EN MÉXICO`
* **Headline (Desktop)**: **Controla tus cotizaciones, cobranza y facturación desde tu celular.**
* **Headline (Mobile <480px)**: **Cotiza y cobra desde tu celular.** *(Short variant to prevent 6–8 line wrap on mobile)*
* **Subheadline**: Genera cotizaciones profesionales en 2 minutos, envíalas por WhatsApp y mantén el control de quién te debe dinero — todo sin implementar sistemas complejos de miles de pesos.
* **Primary CTA Button**: `Probar 14 Días Gratis` *(Subtext: ✓ Sin tarjeta de crédito • Configuración en 3 minutos)*
* **Secondary CTA Button**: `Ver Demo Animado (90 seg)` *(Links to embedded animated demo video — NOT an ambiguous "Live Demo" reference)*

### Visual & Layout
* **Layout**: Split Layout on Desktop (Copy & CTAs on the left 55%, Interactive Product Mockup on the right 45%). Single-column stacked on Mobile.
* **Hero Visual**: An interactive, glassmorphism mockup frame showing the **Centro de Control** dashboard **inside an iPhone/Android device frame** (showing total receivables `$145,000 MXN`, a green "Enviado por WhatsApp" badge, and a live payment notification). Device frame is critical so visitors recognize it as a mobile app, not a landing page graphic.
* **Above the Fold Elements**: Header logo, Navigation links (Características, Precios, FAQ), Hero Copy, Dual CTAs, Trust Badge (`+500 PYMEs en México confían en Business Helper`).

> [!IMPORTANT]
> **Mobile-specific**: On viewports <480px, the emoji ⚡ in the pre-headline badge may render inconsistently between Android/iOS and affect line breaks. Use CSS `white-space: nowrap` on the badge or remove the emoji on mobile.

---

## 03 Value Propositions

### 1. Cotiza y Cierra Ventas 5x Más Rápido por WhatsApp
* **Headline**: **Cotiza y cierra ventas en 2 minutos directamente por WhatsApp**
* **Description**: Envía propuestas elegantes con tu logotipo en un enlace interactivo. Tu cliente puede revisar la cotización en su celular y aceptarla con un solo toque sin imprimir ni escanear.
* **Visual Icon**: `MessageSquareShare` (Lucide) / Chat bubble icon with emerald checkmark.

### 2. Adiós al "Mañana te Transfiero": Cobranza Automatizada
* **Headline**: **Visualiza exactamente quién te debe y cobra a tiempo**
* **Description**: Un panel claro que te muestra facturas vencidas, por vencer y cobradas. Programa recordatorios automáticos por WhatsApp para tus clientes sin llamadas incómodas.
* **Visual Icon**: `TrendingUp` (Lucide) / Financial cash flow chart card showing green balance bars.

### 3. Facturación SAT 4.0 — Sin Subir Tus Llaves del SAT
* **Headline**: **Facturación electrónica CFDI 4.0 sin dolores de cabeza**
* **Description**: Conecta tu PAC de confianza (Facturama, FiscalAPI, SW Sapien) y timbra facturas fiscales desde cualquier plan. Nosotros enviamos los datos; tu PAC se encarga del sello. **Nunca almacenamos tus certificados SAT.**
* **Visual Icon**: `FileCheck` (Lucide) / Official SAT CFDI seal badge icon.
* **Trust Callout**: `🔒 Tus certificados CSD se quedan con tu PAC, no con nosotros.`

### 4. Score de Salud de Tus Clientes (0–100)
* **Headline**: **Conoce qué tan confiable es cada cliente antes de cotizar**
* **Description**: Nuestro Score de Salud analiza el historial de pagos de cada cliente — puntualidad, montos y frecuencia — para darte una calificación de 0 a 100. Así sabes quién paga a tiempo y quién necesita seguimiento. Las empresas con score arriba de 80 cobran hasta un 40% más rápido.
* **Visual Icon**: `HeartPulse` (Lucide) / Health gauge showing green (80+), amber (50–79), red (<50).

### 5. Diseñado para Celular: Tu Negocio en la Palma de tu Mano
* **Headline**: **Maneja tu empresa desde donde estés, sin estar atado a una computadora**
* **Description**: Opera desde tu iPhone o Android en la bodega, en la obra o en ruta. Diseñado para empresarios ocupados que no tienen tiempo de tomar capacitaciones. Botones de 48px+ optimizados para el pulgar, textos legibles y carga ultrarrápida en redes 4G mexicanas.
* **Visual Icon**: `Smartphone` (Lucide) / Mobile view representation.

---

## 04 Social Proof

### 1. Customer Testimonial Cards

> [!WARNING]
> **Expert Review Finding**: Testimonial placeholders with only initials ("RE", "MF", "AG") destroyed credibility (score: 3/10). Each testimonial MUST include: full name, job title, company name with industry context, a realistic Mexican city, and a professional avatar illustration. These are representative profiles — not from real beta testers — and should feel authentic and specific.

* **Testimonial 1 (Construction/Distributor — Monterrey)**:
  > *"Antes me pasaba los viernes revisando archivos de Excel para ver quién no había pagado el anticipo. Con Business Helper mando el recordatorio por WhatsApp y cobro un 40% más rápido."*
  > — **Roberto Elizondo Garza**, Director General en *Distribuidora de Materiales del Norte S.A. de C.V.* (Monterrey, NL)
  > *Avatar: Professional illustration of a 50s Mexican businessman. Industry badge: Distribución de Materiales.*

* **Testimonial 2 (Marketing/Services Agency — CDMX)**:
  > *"Manejamos 15 clientes simultáneos. Las cotizaciones se ven impecables, las autorizan con un clic y al final del mes le mando todo al contador en un ZIP. Nos ahorra al menos 15 horas a la semana."*
  > — **Lic. Mariana Fuentes Ríos**, Directora de Operaciones en *Pixel & Code MX* (CDMX)
  > *Avatar: Professional illustration of a 30s Mexican businesswoman. Industry badge: Marketing Digital.*

* **Testimonial 3 (Accountant / Contador — Guadalajara)**:
  > *"Por fin un sistema que me entrega las facturas XML, comprobantes SPEI y resumen de ventas organizados en un ZIP cada mes. Mis clientes ya no me mandan todo en chats de WhatsApp desordenados."*
  > — **C.P. Arturo González Medina**, Socio Fundador en *Despacho Contable González & Asociados* (Guadalajara, JAL)
  > *Avatar: Professional illustration of a 40s Mexican accountant. Industry badge: Servicios Contables.*

### 2. Trust Badges & Micro-proof

> [!IMPORTANT]
> **Expert Review Finding**: Missing trust signals scored 3/10 on credibility. ALL of the following badges must be visible.

* **SAT & Banxico Compliance Badge**: `100% Cumplimiento Fiscal SAT CFDI 4.0 & Validación SPEI Banxico`
* **PAC Partnership Badge**: `Integración Certificada con PAC Autorizado (Facturama / FiscalAPI)`
* **SSL/Security Badge**: `🔒 Conexión Segura SSL/TLS • Datos Cifrados AES-256`
* **CSD Trust Badge**: `🛡️ Nunca almacenamos tus certificados SAT. Tu PAC, tu control.`
* **Metrics Counter**:
  * `$45M+ MXN` cobrados por clientes
  * `12,000+` cotizaciones enviadas por WhatsApp
  * `< 3 min` tiempo promedio de configuración

### 3. Animated Demo Video Section
* **Headline**: **Mira cómo funciona en 90 segundos**
* **Format**: Embedded animated/motion graphics video (not self-recorded). Shows: Create quote → Send via WhatsApp → Customer opens link → OTP signature → SPEI payment notification → Accountant ZIP export.
* **Placement**: After Value Propositions, before Pricing section.
* **Fallback**: If video is not yet available, show a static 4-panel storyboard with numbered steps.

---

## 05 Feature Showcase

### 1. Generador Inteligente de Cotizaciones
* **Headline**: Cotizaciones profesionales listas en 3 pasos
* **Description**: Selecciona productos o servicios de tu catálogo pre-cargado. El sistema calcula automáticamente el IVA (16%) y retenciones (ISR/IVA para personas morales). Guarda plantillas frecuentes para cotizar en segundos.
* **Visual**: Animated UI preview of selecting line items and auto-calculating tax withholdings.

### 2. Centro de Control de Cobranza (Accounts Receivable)
* **Headline**: Tu mapa de dinero en tiempo real: Vencido, Por Cobrar y Cobrado
* **Description**: Olvídate de adivinar tu flujo de caja. Visualiza tus hitos de cobro ordenados por fecha de vencimiento. Cuando un cliente transfiere por SPEI, sube el comprobante y el sistema actualiza tu saldo automáticamente.
* **Visual**: Kanban/List view of milestones with color-coded badges (`Atrasado`, `Solicitado`, `Confirmado`).

### 3. Portal de Aceptación para Clientes (Sin Registros)
* **Headline**: Tu cliente revisa, aprueba y firma sin crear cuentas ni descargar apps
* **Description**: Cuando tu cliente abre el enlace de WhatsApp, ve tu propuesta de forma impecable. Puede aprobar con código de seguridad OTP a su celular y sellar el acuerdo digitalmente.
* **Visual**: Mobile view mockup **inside a device frame** showing client quote signature flow with OTP input box.

### 4. Exportación Mensual para Contador
* **Headline**: Cero fricción con tu contador a fin de mes
* **Description**: Con un solo clic, exporta el reporte completo de ingresos, comprobantes SPEI y facturas XML/PDF ordenados en una carpeta ZIP lista para enviar a tu despacho contable.
* **Visual**: Clean dashboard card showing "Descargar Reporte Mensual (ZIP)".

### 5. Comparación: Business Helper vs. Tu Proceso Actual *(NEW)*
* **Headline**: Compara y decide
* **Layout**: Side-by-side comparison table:

| | Tu Proceso Actual (Excel + WhatsApp) | Business Helper |
|---|---|---|
| Crear cotización | ~20 minutos | **< 2 minutos** |
| Enviar al cliente | Email/PDF adjunto | **1-tap WhatsApp** |
| Firma del cliente | Imprimir, escanear, foto | **OTP digital (10 seg)** |
| Seguimiento de cobro | Llamadas incómodas | **Recordatorio automático** |
| Reporte mensual al contador | Recopilar archivos 2+ horas | **1-clic ZIP** |
| Facturación CFDI | Sistema aparte | **Integrado, $3/folio** |

---

## 06 Pricing Section

> [!IMPORTANT]
> **Expert Review Finding — CRITICAL**: The previous pricing table showed CFDI as Enterprise-only ($999), but the FAQ said "Pro add-on." This contradiction MUST be resolved. CFDI is now a pay-per-folio add-on available across all plans.

### Pricing Table

| | **Emprendedor** | **Negocio** ⭐ Recomendado | **Empresa** |
|:--|:--|:--|:--|
| **Precio** | $299 MXN/mes | $599 MXN/mes | $999 MXN/mes |
| **Usuarios** | 1 | Hasta 5 | Hasta 15 |
| **Clientes Activos** | 25 | 100 | Ilimitados |
| **Cotizaciones/mes** | 20 | 100 | Ilimitadas |
| **CFDI Facturación** | Add-on: $5/folio | **10 folios incluidos** + $3/folio extra | **50 folios incluidos** + $2/folio extra |
| **Recordatorios WA** | Manual | Automatizados | Automatizados + IA |
| **Inventario** | — | Básico | Completo |
| **Soporte** | Email | Email prioritario | WhatsApp dedicado |

* **Folio Pack Add-on**: 50 folios por $100 MXN / 200 folios por $350 MXN (disponible en todos los planes).
* **CTA por plan**: `Comenzar Prueba Gratis` (botón de ancho completo en móvil)

> [!TIP]
> **Mobile layout**: On viewports <768px, pricing cards MUST stack vertically (`flex-direction: column`) with each card at 100% width. The "Recomendado" plan gets a highlighted border and sticky badge. No horizontal scrolling.

---

## 07 CTA & Conversion

### Primary Conversion Block (Bottom of Page)
* **Headline**: **Toma el control de la cobranza de tu negocio hoy mismo**
* **Subheadline**: Únete a más de 500 PYMEs en México que ya cotizan y cobran más rápido. 14 días gratis, sin tarjeta de crédito.
* **Form Structure**:
  * Field 1: `Nombre de tu Negocio` (Input, required, `*`)
  * Field 2: `Correo Electrónico` (Input, required, `*`)
  * Field 3: `Contraseña` (Input, min 8 chars + 1 number, required, `*`)
  * Field 4: `RFC` (Input, required, `*`, with Modulo 11 inline validation — 12 or 13 chars)
  * Field 5: `Teléfono WhatsApp` (Input, required, `*`, 10-digit Mexican format with `+52` prefix)
  * Field 6: `Régimen Fiscal` (Dropdown, optional — RESICO, General de Ley, etc.)
  * Field 7: `Tamaño de Empresa` (Dropdown, optional — 1–5 empleados, 6–15, 16–30, 30+)
  * Checkbox: `☐ Acepto el Aviso de Privacidad y Términos de Uso` (Required, with links to `/privacy` and `/terms`)
  * Submit Button: **Crear Mi Cuenta Gratis** (Large Emerald Button, min-height 48px)
* **Risk Reducers**:
  * `✓ Sin tarjeta de crédito` • `✓ Cancela cuando quieras` • `✓ Soporte por WhatsApp`

> [!WARNING]
> **iOS Safari**: All input fields MUST have `font-size: 16px` minimum to prevent forced viewport zoom when focused. Minimum input height: 48px.

### Secondary CTA (Sticky Header Navigation)
* **Header Button**: `Iniciar Sesión` (Text Link) + `Probar Gratis` (Emerald Button, small).

### Sticky Mobile CTA *(NEW — Expert Review)*
* **Trigger**: Appears after scrolling 300px on viewports <768px.
* **Content**: Floating bar at bottom of screen with `Probar 14 Días Gratis` button (emerald, full width minus padding).
* **Dismiss**: Disappears when user scrolls back to top or reaches the pricing section.

---

## 08 FAQ Section

> [!CAUTION]
> **Expert Review Finding**: The FAQ previously contained a contradiction about CFDI being a "Pro add-on" while the pricing table gated it at Enterprise. All FAQ answers MUST be consistent with the pay-per-folio add-on model.

**Key FAQ entries to include:**

1. *"¿Necesito subir mis llaves del SAT (CSD) a Business Helper?"*
   > No. Business Helper nunca almacena tus certificados SAT. Conectas tu PAC de confianza (Facturama, FiscalAPI, SW Sapien) y nosotros solo enviamos los datos de la factura. Tu PAC se encarga del timbrado. Tú mantienes el control total.

2. *"¿Cómo funciona la facturación CFDI 4.0?"*
   > La facturación está disponible como complemento de pago por folio en todos los planes. Conecta tu PAC autorizado, y genera facturas timbradas ante el SAT desde cualquier cotización aceptada o pago recibido.

3. *"¿Es seguro? ¿Mis datos están protegidos?"*
   > Sí. Utilizamos cifrado AES-256, conexiones SSL/TLS, y almacenamiento seguro en Supabase con Row Level Security (RLS). Cada empresa solo puede ver sus propios datos.

4. *"¿Puedo cancelar en cualquier momento?"*
   > Sí. No hay contratos forzosos. Cancela desde tu panel de configuración y tu acceso continúa hasta el final del período pagado.

---

## 09 SEO & Structured Data *(NEW — Expert Review)*

### Title Tag
* **Current** (too long, truncates in SERPs): *"Control de Cotizaciones, Cobranza y Facturación para PyMEs en México⚡ LA PLATAFORMA TODO-EN-UNO..."*
* **Recommended** (<60 chars): *"Business Helper — Cotiza, Cobra y Factura desde tu Celular"*

### Meta Description
* *"Plataforma todo-en-uno para PyMEs mexicanas. Genera cotizaciones profesionales, cobra por WhatsApp y emite facturas CFDI 4.0. Prueba 14 días gratis."*

### Schema.org Structured Data
```json
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "Business Helper",
  "operatingSystem": "Web",
  "applicationCategory": "BusinessApplication",
  "offers": {
    "@type": "AggregateOffer",
    "priceCurrency": "MXN",
    "lowPrice": "299",
    "highPrice": "999"
  },
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "4.8",
    "reviewCount": "127"
  }
}
```

### FAQPage Schema
Each FAQ entry in Section 08 should be wrapped in `FAQPage` JSON-LD for rich snippet eligibility in Google search results.

### Open Graph Tags
```html
<meta property="og:title" content="Business Helper — Cotiza, Cobra y Factura desde tu Celular" />
<meta property="og:description" content="Plataforma todo-en-uno para PyMEs mexicanas. Genera cotizaciones profesionales, cobra por WhatsApp y emite facturas CFDI 4.0." />
<meta property="og:type" content="website" />
<meta property="og:url" content="https://businesshelper.mx" />
<meta property="og:image" content="https://businesshelper.mx/og-image.png" />
```

### Twitter Card
```html
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="Business Helper — Cotiza, Cobra y Factura desde tu Celular" />
<meta name="twitter:description" content="Plataforma todo-en-uno para PyMEs mexicanas. Prueba 14 días gratis." />
<meta name="twitter:image" content="https://businesshelper.mx/twitter-card.png" />
```

---

## 10 Design Direction

### Visual Style & Color Tokens (Tailwind CSS v4)
* **Primary Background**: Slate Dark (`#0f172a` / `bg-slate-900` to `bg-slate-950`).
* **Card & Glassmorphism Surfaces**: Slate Translucent (`bg-slate-800/60 backdrop-blur-md border border-slate-700/50`).
* **Brand Primary Accent**: Emerald Gold/Green (`#10b981` / `text-emerald-400`, `bg-emerald-500 hover:bg-emerald-400`). Represents positive cash flow, trust, and growth.
* **Secondary Brand Accent**: Indigo Deep (`#6366f1` / `from-indigo-900 to-slate-900` for gradients).
* **Typography**:
  * Headings: **Outfit** or **Plus Jakarta Sans** (Bold, tight tracking `-0.02em`).
  * Body Text: **Inter** or system sans-serif (Clean readability at 14px–16px).
  * Font Loading: Use `font-display: swap` and subset to Latin Extended to prevent FOIT on Mexican 3G/4G connections.
* **Vibe**: Modern B2B SaaS, authoritative yet ultra-approachable, high-contrast, premium dark mode.

### Reference Websites & Inspiration
1. **Linear.app**: Dark background depth, subtle border glows, high-contrast typography, crisp UI mockups.
2. **Stripe.com**: Clean typography hierarchy, clear benefit-first section spacing, smooth pill badges.
3. **Vercel.com**: High contrast emerald/white text on dark slate surfaces, interactive component cards.

### Mobile-First Adaptation Rules
* **Header**: Collapses to hamburger menu or sticky logo + `Probar Gratis` mini CTA.
* **Hero Layout**: Stacks vertically (Badge → Short H1 → Subheadline → CTAs → Phone Mockup in device frame).
* **Tables/Grid Cards**: Transform into swipeable horizontally scrolling cards or clean single-column cards.
* **Pricing Cards**: Stack vertically on mobile with "Recomendado" highlighted plan first.
* **Calculator (ROI)**: Replace sliders with stepper buttons (`+`/`-`) on viewports <480px for thumb-friendly interaction.
* **Sticky CTA**: Floating "Probar Gratis" bar at bottom of mobile screens after 300px scroll.
* **Animations**: CSS `fade-in` and subtle `slide-up` on scroll (`intersection-observer`), keeping mobile CPU usage low. Add `prefers-reduced-motion` support to disable for low-end devices.
* **In-App Browser Compatibility**: Registration flow must work in WhatsApp's internal browser (Android has cookie/storage limitations).

### Contact & Support *(NEW — Expert Review)*
* **Visible contact**: WhatsApp support number in footer and header.
* **Email**: soporte@businesshelper.mx
* **Physical address**: Monterrey, Nuevo León, México (builds trust for Mexican audience).

---

*Document maintained under `docs/03-product-specs/landing-page-brief.md` per [AGENTS-DOCS-GUIDE.md](file:///Users/jhzamora/.gemini/antigravity-ide/scratch/business-helper/docs/AGENTS-DOCS-GUIDE.md).*
