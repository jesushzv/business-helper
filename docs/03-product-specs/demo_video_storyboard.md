# Demo Video Storyboard & Animated Walkthrough Plan (Task A3)

> **Business Helper Product Readiness — 60-90 Second Animated Demo Video Specification**
>
> *Document created for Workstream WS-A (Task A3) under @[docs/04-execution-testing/product_readiness_workback.md].*

---

## 01 Executive Overview

* **Video Title**: *Business Helper: De Cotización a Cobro por WhatsApp en 60 Segundos*
* **Target Audience**: Dueños de PyMEs, Directores Comerciales y Administradores en México (Don Roberto & Lic. Mariana).
* **Length**: 75 Segundos (1:15 min).
* **Format**: Frame de teléfono móvil (iPhone/Android) animado en 2D/3D con motion graphics sobre fondo oscuro elegante (`slate-950`), texto en español claro, efectos de sonido de notificaciones de WhatsApp y voz en off profesional con acento neutro mexicano.
* **Core Value Proposition**: Demostrar la fluidez de crear una cotización, enviarla por WhatsApp, recibir la firma digital OTP del cliente y confirmar el pago SPEI sin instalar apps pesadas ni usar computadoras.

---

## 02 Scene-by-Scene Storyboard & Timeline

```mermaid
gantt
    title Plan de Video Demostrativo (75 Segundos)
    dateFormat  SS
    axisFormat %S sec
    section Escenas
    01. Intro & El Problema PyME       :00, 10s
    02. Creación de Cotización Táctil   :10, 25s
    03. Envío 1-Tap por WhatsApp       :25, 40s
    04. Autorización OTP & Cryptoseal  :40, 58s
    05. Pago SPEI & Cierre de Caja     :58, 75s
```

### Scene 1: Intro & El Problema del Cash Flow (00s – 10s)
* **Visual**: Animación de un escritorio saturado de hojas de papel, facturas traspapeladas y archivos de Excel con celdas rojas. Aparece un smartphone con una notificación tintineante.
* **Voz en Off (Locución)**: *"¿Cansado de perder cotizaciones en archivos de Excel o de pasar los viernes persiguiendo cobros por teléfono? Hay una forma más inteligente de operar tu negocio en México."*
* **On-Screen Text**: *"Cotiza, cobra y factura desde tu celular"*

---

### Scene 2: Creación de Cotización Profesional (10s – 25s)
* **Visual**: Zoom in al smartphone dentro de Business Helper. Se muestra a un usuario agregando 2 artículos del catálogo (ej. 20 Ton. Cemento + Varilla). Los impuestos SAT (IVA 16%) se desglosan automáticamente en pantalla. Se aplica la plantilla con el logo "Materiales Elizondo".
* **Voz en Off (Locución)**: *"Con Business Helper, seleccionas tus productos o servicios y el sistema calcula automáticamente los impuestos del SAT. En menos de 2 minutos tienes una propuesta impecable con tu propio logotipo."*
* **On-Screen Text**: *"Cálculo automático de IVA 16% y retenciones SAT"*

---

### Scene 3: Envío Directo por WhatsApp en 1 Tap (25s – 40s)
* **Visual**: El usuario presiona el botón verde fosforescente *"Enviar por WhatsApp"*. Transición fluida a la app de WhatsApp con un mensaje pre-redactado cordial y un enlace interactivo seguro (`https://businesshelper.app/q/cot-2026-088`).
* **Voz en Off (Locución)**: *"Con un solo toque, envías el enlace directamente al WhatsApp de tu cliente. Sin pagar APIs costosas ni complicadas."*
* **On-Screen Text**: *"Enlaces interactivos 1-Tap Click-to-Chat"*

---

### Scene 4: Revisión del Cliente & Firma Digital OTP (40s – 58s)
* **Visual**: Cambio de perspectiva al celular del cliente (Construcciones Maya). El cliente abre la propuesta interactiva sin necesidad de descargar apps ni crear cuenta. Hace clic en *"Aceptar Cotización"*, recibe un código de 6 dígitos por WhatsApp (OTP: `482-910`) y confirma. Aparece en pantalla un sello verde de validación: `"Sello Digital Cryptoseal SHA-256 Registrado"`.
* **Voz en Off (Locución)**: *"Tu cliente revisa la cotización en su navegador, aprueba con un código OTP y el sistema genera un sello digital criptográfico SHA-256 para máxima validez legal y transparencia."*
* **On-Screen Text**: *"Firma Digital OTP + Sello Cryptoseal SHA-256"*

---

### Scene 5: Notificación SPEI & Panel de Cobranza (58s – 75s)
* **Visual**: El cliente adjunta su comprobante SPEI con Clave de Rastreo Banxico. En el celular del dueño llega una notificación push con sonido dinámico: *"¡Pago de $97,440.00 MXN Recibido!"*. La cotización pasa a estado *"Cobrada"* en el panel Kanban de cobranza. Finaliza con la pantalla de llamada a la acción.
* **Voz en Off (Locución)**: *"Tu cliente sube su comprobante SPEI y tú recibes una alerta al instante en tu celular. Empieza hoy tu prueba de 14 días gratis sin tarjeta de crédito."*
* **Call To Action On-Screen**: *"Prueba 14 Días Gratis — www.businesshelper.app"*

---

## 03 Production & Technical Specifications

1. **Resolution**: 1920x1080 (Horizontal / Web Landing) + 1080x1920 (Vertical / Mobile Social Media Reels & WhatsApp Stories).
2. **Audio Track**: Música de fondo estilo Corporate Tech motivadora (120 BPM, tono inspirador) mezclada a -18dB bajo la locución.
3. **Subtítulos**: Subtítulos dinámicos integrados estilo open-captions para reproducción sin sonido en dispositivos móviles.
4. **Integration**: Embebido en la landing page a través de `DemoVideoPlayer.tsx` con soporte para reproducción interactiva escena por escena.
