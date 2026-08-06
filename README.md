# Business Helper 🚀

> **Gestión Inteligente de Cotizaciones, Contratos y Cobranza para PyMEs en México**

Business Helper es una plataforma SaaS web y móvil diseñada para simplificar la creación de cotizaciones profesionales, la recolección de firmas digitales OTP, el seguimiento de pagos SPEI y la facturación electrónica SAT CFDI 4.0.

---

## 🛠️ Tecnologías Principales

- **Frontend**: Next.js 15 (App Router), React 19, Tailwind CSS v4, Lucide Icons.
- **Backend & Base de Datos**: Supabase (PostgreSQL 16, Row-Level Security, Supabase Auth & Storage).
- **Facturación SAT**: Facturapi PAC CFDI 4.0 API.
- **Cobranza & Suscripciones**: Stripe Billing API & Webhooks.
- **Notificaciones**: Twilio WhatsApp Business API / Click-to-Chat deep links.
- **Inteligencia Artificial**: Google Gemini API (`@google/genai`).

---

## 🚀 Inicio Rápido (Desarrollo Local)

### 1. Clonar el repositorio e instalar dependencias:
```bash
git clone https://github.com/jesushzv/business-helper.git
cd business-helper
npm install
```

### 2. Configurar variables de entorno:
Copia el archivo `.env.example` a `.env.local`:
```bash
cp .env.example .env.local
```

Configura tus credenciales de Supabase en `.env.local`:
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### 3. Iniciar el servidor de desarrollo:
```bash
npm run dev
```
Abre [http://localhost:3000](http://localhost:3000) en tu navegador.

---

## 🧪 Pruebas y Control de Calidad

Ejecutar la suite de pruebas unitarias e integración:
```bash
npm test
```

Ejecutar verificación estática de TypeScript:
```bash
npm run typecheck
```

---

## 📄 Licencia

Propiedad privada. Todos los derechos reservados.
# Workflow test
