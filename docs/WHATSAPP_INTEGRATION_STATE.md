# Estado de Integración WhatsApp — Vida Divina

> **Propósito de este documento:** dejar persistido el estado exacto de la Fase 4 / 4.1 (integración del motor comercial con WhatsApp Cloud API de Meta), para que una conversación nueva pueda continuar sin repetir la investigación ni la configuración ya hecha.
>
> **Corte de este cierre:** sesión de configuración administrativa en Meta Business Manager. El número real de Vida Divina ya fue registrado en Meta (2026-08-08); Coexistence, plantillas de mensaje y cualquier otra configuración de producción no autorizada permanecen sin activar/crear. Ningún archivo de código fue modificado durante esta fase.
>
> **No es un documento de arquitectura técnica del Knowledge Package** (eso vive en `ARCHITECTURE_v1.md`/`PROJECT_STATE.md`, sin relación con esta integración) — es exclusivamente el registro de la integración con WhatsApp.

---

## 1. Meta Business

| Dato | Valor |
|---|---|
| Business Portfolio | Vive Vida Divina |
| App | Vive Vida Divina |
| App ID | `1308094642378428` |
| WABA de prueba | `1664876184970113` |
| Phone Number ID de prueba | `1237988146069127` |
| Número de prueba | +1 (555) 676-0656 |
| Resultado | Envío y recepción de mensajes de prueba confirmados correctamente |

## 2. System User

| Dato | Valor |
|---|---|
| Nombre | Motor Vida Divina |
| ID | `61593106499184` |
| Rol a nivel negocio | Employee |
| Acceso a la App | Acceso total (confirmado) |
| Acceso a la WABA de prueba | Acceso total (confirmado) |

## 3. Token

**Token de producción:** generado y guardado por el usuario, fuera de este chat y fuera del repositorio.

- **No se escribió en ningún archivo.**
- **No se escribió en este documento.**
- **No se mostró ni se solicitó de vuelta en ningún momento.**

Permisos confirmados: `whatsapp_business_messaging`, `whatsapp_business_management`. Duración: sin expiración, según la configuración realizada durante la sesión.

> Nota de seguridad para la siguiente conversación: si en algún punto se pide o se pega este token en un chat, debe tratarse como comprometido y regenerarse — nunca debe vivir en el repositorio, en código, ni en ningún documento de `docs/`.

## 4. Estado actual

| Elemento | Estado |
|---|---|
| Método de pago (Meta) | CONFIRMADO / ACTIVO — configurado en el portfolio/cuenta de Vida Divina, saldo $0 / sin consumo pendiente (verificado 2026-08-08; sin datos de tarjeta almacenados en este repositorio) |
| Número real de Vida Divina | REGISTRADO (verificado 2026-08-08; número completo no almacenado en este repositorio) |
| Coexistence | NO ACTIVADO |
| Plantillas de mensaje | NO CREADAS |
| Webhook | NO IMPLEMENTADO |
| Adaptador Node.js | NO IMPLEMENTADO |
| Repositorio (código) | NO MODIFICADO durante esta fase de configuración de Meta |

---

## 5. Decisiones arquitectónicas ya tomadas

- **OpenClaw fue eliminado** y no forma parte de la arquitectura.
- **Ollama** no forma parte del flujo principal de producción (permanece instalado, sin configurar, como componente opcional futuro).
- **No se utilizará Baileys** (librería no oficial — riesgo de bloqueo del número).
- **No se utilizará un MCP de WhatsApp** como intermediario (no aporta ventaja sobre llamar la Cloud API directamente desde Node.js).
- La integración prevista es **directamente con WhatsApp Cloud API de Meta**.
- Se utilizará un **adaptador Node.js** entre Meta y el motor comercial — capa nueva, no un segundo motor.
- **El motor comercial existente no debe reescribirse** para integrar WhatsApp (`flujoVentaReal.js`, `ventaRealRules.js`, `contextoStorage.js`, `recursosComerciales.js`, `stateMachine.js` se reutilizan tal cual).
- El identificador de conversación previsto es el identificador estable que entrega WhatsApp/Meta (`wa_id`, confirmado contra documentación oficial en la Fase 4/4.1), sujeto a confirmación final durante la integración real.
- La persistencia existente en `data/conversaciones/` se reutilizará sin cambios de mecanismo.
- El motor debe poder operar tanto en **modo automático** como en **modo humano** (handoff).

### Arquitectura objetivo

```
WhatsApp
  ↓
Meta WhatsApp Cloud API
  ↓
Webhook
  ↓
Adaptador Node.js
  ↓
Motor comercial Vida Divina
  ↓
Persistencia
  ↓
Adaptador Node.js
  ↓
Meta WhatsApp Cloud API
  ↓
Cliente
```

---

## 6. Regla de operación humano/automático

```
AUTOMÁTICO
  ↓
Handoff humano (requiereHumano: true, mensajeParaCliente: null)
  ↓
HUMANO (respuesta manual desde WhatsApp Business — vía Coexistence, cuando se active)
  ↓
REANUDAR AUTOMÁTICO
```

Regla no negociable: cuando el motor determine `requiereHumano: true` / `mensajeParaCliente: null`, el sistema **no debe enviar una respuesta automática**. El contexto debe conservarse (ya implementado — `handoffPendiente`, `motivoHandoff`, `fechaHandoff` en `contextoStorage.js`/`flujoVentaReal.js`). Un humano debe poder continuar manualmente la conversación sin que el motor reinicie ni interfiera.

---

## 7. Estado del proceso comercial (motor)

El motor comercial Sprint 5 ya está implementado, y la persistencia conversacional ya fue implementada y probada, en fases previas a esta integración con WhatsApp:

- 31/31 pruebas de `simulator` exitosas después de la Fase 3.3.
- `simulator/main.js` sin regresión.
- `decision-engine` sin regresión.
- Persistencia JSON (`data/conversaciones/`) funcionando.
- Wrappers persistentes para los 8 pasos del flujo comercial funcionando.
- `data/conversaciones/` excluido de Git (`.gitignore`).
- Sin dependencia de OpenClaw en ningún componente.

Fuente de verdad del proceso comercial: `docs/proceso_de_venta/SPRINT_5_PROCESO_COMERCIAL.md`.

---

## 8. Próximo paso exacto

**EL PROCESO ESTÁ PAUSADO EN: "Punto 3 — Condiciones de producción restantes"** (Fase 4.1), con el número real ya registrado.

1. ✅ Revisar si "Vive Vida Divina" tiene método de pago configurado en Meta — **confirmado 2026-08-08: método de pago activo, saldo $0 / sin consumo pendiente. No se agregó ninguno nuevo.**
2. ✅ Decidir si se agrega uno — **no fue necesario, ya existía uno activo.**
3. Continuar con las condiciones de producción restantes del Punto 3 — **verificado 2026-08-08, ver Sección 9 para el detalle.** Resumen: verificación empresarial sin verificar, App en modo Desarrollo, permisos "Listo para la prueba" (sin indicación de Standard/Advanced Access en la interfaz), 1 sola WABA existente.
4. Revisar las condiciones de Coexistence para el número real (Punto 4) — **pendiente. Coexistence NO activado.**
5. Crear las plantillas de mensaje — seguimiento día 3, recuperación día 5, seguimiento +1 semana (Punto 5) — **pendiente. NO creadas.**
6. Vincular el número real (Punto 6) — **✅ el número real ya fue registrado en Meta (2026-08-08), acción realizada por el usuario fuera de este chat. Número completo no almacenado en el repositorio. Registrar el número no equivale a activar Coexistence, que sigue pendiente y requiere autorización explícita aparte.**
7. Implementar el webhook/adaptador Node.js (fase posterior, fuera de la configuración administrativa de Meta) — **pendiente. NO implementado.**
8. Probar una conversación real de punta a punta — **pendiente.**

**Importante para quien continúe:**
- No asumir que Coexistence está aprobado o activado (sigue sin activar).
- No asumir que las plantillas existen (siguen sin crear).
- No generar un token nuevo sin autorización explícita — el token actual sigue vigente, no se generó ninguno nuevo en esta actualización.
- No asumir que el método de pago requiere cambios (ya está configurado).
- No asumir ninguna configuración de producción adicional no descrita explícitamente en este documento.

---

## 9. Verificación de condiciones de producción — Punto 3 (2026-08-08)

Resultado de inspección directa en la interfaz de Meta, reportado por el usuario. Ninguno de estos puntos fue inferido — donde la interfaz no mostró un dato explícito, se documenta como tal.

| Requisito | Resultado |
|---|---|
| Verificación empresarial (Business Verification) | **PENDIENTE / SIN VERIFICAR** — diferida intencionalmente hasta disponer de documentación oficial adecuada para acreditar "Vive Vida Divina" como entidad/negocio ante Meta. No se envió solicitud, no se subió documentación (2026-08-08). |
| Modo de la App (`1308094642378428`) | **EN DESARROLLO** |
| Permiso `whatsapp_business_management` | **LISTO PARA LA PRUEBA** (la interfaz no muestra nivel Standard/Advanced Access; no se infiere ninguno) |
| Permiso `whatsapp_business_messaging` | **LISTO PARA LA PRUEBA** (la interfaz no muestra nivel Standard/Advanced Access; no se infiere ninguno) |
| Número de WABAs en el portfolio | **1** — "Test WhatsApp Business Account" (no se observa una segunda WABA) |

Ninguna de estas condiciones fue modificada durante esta verificación (no se inició verificación empresarial, no se cambió el modo de la App, no se tocaron permisos).

---

## CONTINUACIÓN DEL TRABAJO

El siguiente chat que retome este proyecto debe:

- Leer este documento completo antes de hacer cualquier otra cosa.
- Revisar el estado actual del repositorio (`git status`) para confirmar que sigue coincidiendo con lo aquí descrito.
- **No repetir** las auditorías generales, la investigación arquitectónica de WhatsApp, ni la configuración ya completada (Puntos 1 y 2 de la Fase 4.1).
- Continuar exactamente desde el **Punto 3 de la Fase 4.1** (método de pago de Meta).
- Pedir al usuario que verifique el estado actual del método de pago de Meta antes de proponer cualquier acción.
- No modificar nada de producción (Meta, número real, Coexistence, plantillas) ni el repositorio sin autorización explícita del usuario en esa nueva conversación.
