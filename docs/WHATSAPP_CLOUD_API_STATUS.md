# Estado de la Integración WhatsApp Cloud API — Punto de Referencia

> **Propósito de este documento:** dejar preservado, con evidencia verificable, el estado exacto en que quedó la integración de WhatsApp Cloud API tras validar el flujo completo de extremo a extremo con el **número de prueba** de Meta. Es el punto de partida para la futura migración al **número real**, cuando se completen los requisitos pendientes de Meta (sección 9).
>
> **Corte de este documento:** 2026-08-09, tras una sesión de pruebas end-to-end reales (no simuladas) usando el número de prueba de Meta, con el servidor local (`whatsapp-adapter/server.js`) expuesto por ngrok y conectado de verdad a Graph API.
>
> **Relación con otros documentos:** complementa a [`docs/WHATSAPP_INTEGRATION_STATE.md`](WHATSAPP_INTEGRATION_STATE.md) (que documentó la fase de configuración administrativa en Meta, previa a que existiera código) — ese documento describe cómo se llegó hasta aquí; este documento describe **dónde estamos ahora** y **qué falta para producción**. No repite su contenido, lo continúa.

---

## 1. Arquitectura actualmente validada

Validada en vivo, de punta a punta, sin intervención manual en el tramo automático:

```
WhatsApp (número de prueba)
  → Meta WhatsApp Cloud API
  → Webhook (POST /webhook, firmado HMAC vía WHATSAPP_APP_SECRET)
  → ngrok (túnel público → localhost:3000)
  → Node.js (whatsapp-adapter/server.js)
  → motor comercial (simulator/src/flujoVentaReal.js — SIN MODIFICAR)
  → whatsapp-adapter/src/graphApiSender.js
  → Graph API de Meta (POST /{PHONE_NUMBER_ID}/messages)
  → WhatsApp (mismo número de prueba, mensaje recibido por el destinatario autorizado)
```

Componentes de código involucrados (todos dentro de `whatsapp-adapter/`, ninguno nuevo desde el cierre de esta sesión):

| Archivo | Responsabilidad |
|---|---|
| `server.js` | Punto de entrada; levanta el servidor HTTP nativo |
| `src/httpServer.js` | Recibe el webhook (GET verificación, POST eventos), orquesta envío real opt-in |
| `src/webhookParser.js` | Clasifica el payload crudo de Meta en tipos de evento |
| `src/conversationRouter.js` | Traduce el evento a llamadas al motor comercial existente |
| `src/outboundBuilder.js` | Traduce el resultado del motor a recursos estructurados |
| `src/graphApiSender.js` | Envío real a Graph API — solo texto, nunca fabrica contenido |
| `main.js` | Punto de entrada único al motor (`procesarEventoWebhook`) |

---

## 2. IDs de PRUEBA (los que están validados y en uso)

| Dato | Valor |
|---|---|
| App | Vive Vida Divina |
| App ID | `1021640294034754` |
| WABA de prueba | `1664876184970113` |
| Phone Number ID de prueba | `1237988146069127` |
| Número de prueba | +1 (555) 676-0656 |
| Destinatario de prueba autorizado | `5212225240044` (agregado y verificado durante esta sesión, en el formato correcto de móvil mexicano — ver sección 4) |

---

## 3. IDs REALES (sin tocar, solo como referencia)

| Dato | Valor |
|---|---|
| App | Vive Vida Divina (misma app — no hay una app separada para el número real) |
| App ID | `1021640294034754` |
| WABA real | `1058755243214295` ("Tienda Vive Vida Divina") |
| Phone Number ID real | `1240340249168075` |
| Número real | +52 1 222 907 1277 |

---

## 4. Estado actual de cada componente

| Componente | Estado |
|---|---|
| Servidor Node (`whatsapp-adapter/server.js`) | ✅ Funcional, probado con conexión real a Meta |
| Webhook (GET verificación + POST eventos) | ✅ Funcional — probado local y vía ngrok público |
| Firma HMAC de solicitudes entrantes (`WHATSAPP_APP_SECRET`) | ✅ Habilitada y validada |
| ngrok | ✅ Funcional (URL dinámica del plan gratuito — ver sección 10, cambia en cada reinicio) |
| Suscripción de la app a la WABA de prueba (`POST /{WABA_ID}/subscribed_apps`) | ✅ Agregada durante esta sesión — ver sección 6 |
| Lista de destinatarios de prueba autorizados | ✅ `5212225240044` agregado y verificado — ver sección 6 |
| Envío saliente real (`graphApiSender.js`) | ✅ Funcional — confirmado con HTTP 200 y `wamid` real |
| Motor comercial (`simulator/`) | ✅ Sin cambios, sin regresión — 31/31 pruebas |
| Número real en Cloud API | ❌ No conectado — `DISCONNECTED` (ver sección 8) |
| Coexistence / `whatsapp_business_app_onboarding` | ❌ No disponible todavía — bloqueado por Business Verification (ver sección 9) |
| Business Verification | ❌ Sin verificar (ver sección 9) |
| Tech Provider | ❌ Not verified (ver sección 9) |

---

## 5. Pruebas realizadas y resultados

### Pruebas automatizadas
- `whatsapp-adapter/`: **42/42 pasan** (`node --test test/**/*.test.js`), incluye pruebas de `graphApiSender.js` con `fetch` simulado (ninguna toca la red real) y una prueba de integración HTTP end-to-end con envío simulado.
- `simulator/`: **31/31 pasan** (`npm test`) — sin regresión en el motor comercial.

### Prueba end-to-end real (número de prueba), checklist completo:

```
[x] mensaje entrante recibido por Cloud API
[x] webhook recibido por ngrok
[x] Node procesó el mensaje
[x] motor comercial generó respuesta
[x] Graph API aceptó el envío automático saliente → HTTP 200
[x] respuesta llegó a WhatsApp del destinatario de prueba
[x] Meta confirmó los tres estados de entrega: sent → delivered → read
[x] wamid real confirmado por Meta: wamid.HBgNNTIxMjIyNTI0MDA0NBUCABEYEkUxNzRCNEI0MDc3NDBGQTAwMgA=
[x] el envío automático lo ejecutó el servidor (httpServer.js → graphApiSender.js), no un script manual
```

### Comportamientos del motor comercial observados durante la prueba (correctos, no defectos)

- **Segundo mensaje genérico ("Hola, buenas tardes") con el contexto ya en estado `MensajeInicialEnviado`:** el motor **no repitió el saludo** — lo clasificó como intención ambigua tras el saludo inicial y generó un **handoff a humano**, tal como exige `docs/proceso_de_venta/SPRINT_5_PROCESO_COMERCIAL.md §3`. No fue un error de WhatsApp, ngrok, Node ni Graph API — es la regla de negocio funcionando como está documentada: el bot no debe insistir indefinidamente con el mismo saludo.
- **Mensaje con necesidad de producto, sin precio disponible:** el motor generó handoff citando `docs/proceso_de_venta/recursos/precios.md` (100% PENDIENTE para todos los productos, límite ya conocido del proyecto, no nuevo). El motor **no inventó una cifra** — comportamiento esperado según el principio "nunca fabricar un recurso pendiente" ya vigente en todo `simulator/`.

---

## 6. Cambios realizados en Meta durante esta sesión

Todos aditivos y reversibles. Ninguno afecta al número real.

1. **Suscripción de la app a la WABA de prueba** — `POST /{WABA_ID_PRUEBA}/subscribed_apps` con `WABA_ID = 1664876184970113`. Antes de este cambio, la WABA de prueba solo estaba suscrita a una app interna de Meta ("WA DevX Webhook Events 1P App", `2202427980234937`); nuestra app nunca recibía sus eventos. Después del cambio, ambas apps quedan suscritas — no se eliminó la suscripción preexistente.
2. **Número de destinatario de prueba agregado**: `+52 12225240044` (formato con el prefijo "1" de móvil mexicano — necesario porque el `wa_id` real que entrega el webhook usa ese formato, distinto del que ya estaba registrado como `+52 222 524 0044`, sin el "1"). Verificado con código OTP enviado por WhatsApp. El registro previo sin el "1" **no se eliminó**, sigue existiendo también.
3. **Webhook registrado** en App Dashboard → WhatsApp → Configuration, apuntando a la URL de ngrok activa en el momento de la prueba (ver sección 10 — esa URL cambia en cada reinicio de ngrok en el plan gratuito).

**Nada de esto tocó**: el número real, la WABA real, el Phone Number ID real, ni ejecutó `request_code`, `verify_code` o `register` sobre ningún número.

---

## 7. Cambios realizados en el código durante esta sesión

Todos dentro de `whatsapp-adapter/`, ninguno en `simulator/` (el motor comercial permanece exactamente igual):

- **Nuevo:** `whatsapp-adapter/src/graphApiSender.js` — envío real a Graph API, opt-in (deshabilitado por defecto salvo que `WHATSAPP_ACCESS_TOKEN` y `WHATSAPP_PHONE_NUMBER_ID` estén definidas).
- **Modificado:** `whatsapp-adapter/src/httpServer.js` — integra el sender; `envioReal` ahora refleja la realidad en vez de ser siempre `false`.
- **Modificado:** `whatsapp-adapter/server.js` — log de arranque indica si el envío real está habilitado.
- **Nuevo:** `whatsapp-adapter/test/graphApiSender.test.js` — 13 pruebas, `fetch` simulado.
- **Modificado:** `whatsapp-adapter/test/httpServer.test.js` — +1 prueba de integración con envío simulado.
- **Nuevo:** `whatsapp-adapter/.env.example` — plantilla de variables, sin secretos (si versionado).
- **Modificado:** `.gitignore` (raíz) — ahora excluye `**/*.env` (cubre `.env` y `whatsapp-adapter.env`).

No se modificó ninguna regla de negocio, ningún archivo de `docs/`, ni el Knowledge Compiler/Package.

---

## 8. Estado del número real (sin modificar)

| Dato | Valor |
|---|---|
| Phone Number ID | `1240340249168075` |
| Número | +52 1 222 907 1277 |
| WABA | `1058755243214295` |
| `status` (Graph API) | `DISCONNECTED` — registrado pero no activo en ninguna plataforma de mensajería de Meta |
| `code_verification_status` | `NOT_VERIFIED` — nunca pasó el flujo de verificación por código OTP (esperado: coexistence no lo requiere) |
| `is_pin_enabled` | `false` |
| `platform_type` | `ON_PREMISE` — valor por defecto/legado de un número nunca provisionado en Cloud API, no significa infraestructura on-premise real |
| Estado en WhatsApp Business App | **Activo y funcionando con normalidad** en el teléfono del negocio |

Sobre este número **no se ejecutó** en ningún momento de todo el proyecto: `request_code`, `verify_code`, `register`, ni ninguna operación destructiva o de desconexión.

---

## 9. Requisitos pendientes de Meta (el bloqueo real, confirmado con evidencia)

Confirmado directamente en Meta Business Suite → Configuración → Información del negocio (no es una suposición ni un dato de memoria de sesiones anteriores):

```
Estado de la verificación del negocio: Sin verificar
"Meta no verificó los datos de este negocio."

Access verification status (Tech Provider): Not verified
"Your business was not verified as a Tech Provider and API calls to
certain permissions and features in advanced access will begin to
be blocked."
```

Campos de identidad legal del negocio, actualmente vacíos en Meta:

| Campo | Valor actual |
|---|---|
| Nombre legal del negocio | Sin nombre |
| Dirección | Sin dirección |
| Sitio web | Sin sitio web |

La documentación oficial de Meta para el flujo `whatsapp_business_app_onboarding` (nombre técnico actual de "Coexistence") exige explícitamente: *"You must already be a Solution Partner or Tech Provider."* Convertirse en Tech Provider exige, como primer paso: *"Your business must be verified before you can start the app review process."*

**Conclusión:** el bloqueo es 100% de identidad/cuenta de negocio ante Meta, no de código, no de arquitectura, no del adaptador. No hay ninguna ruta alternativa documentada por Meta que permita saltarse este requisito.

---

## 10. Qué NO debe tocarse

- El número real `+52 1 222 907 1277` y su presencia activa en WhatsApp Business App.
- La WABA real `1058755243214295` y el Phone Number ID real `1240340249168075`.
- No ejecutar `request_code`, `verify_code` ni `register` sobre el número real bajo ninguna circunstancia, salvo que se haya confirmado explícitamente que corresponde al flujo de Coexistence (no al flujo estándar de registro, que desconectaría el número de WhatsApp Business App).
- El motor comercial (`simulator/src/flujoVentaReal.js`, `stateMachine.js`, `ventaRealRules.js`, `contextoStorage.js`, `recursosComerciales.js`) — no reescribir para la integración de WhatsApp.
- Los archivos `whatsapp-adapter/.env` y `whatsapp-adapter/whatsapp-adapter.env` — nunca deben versionarse (ya protegidos en `.gitignore`), nunca deben pegarse en un chat ni en ningún documento.
- La suscripción existente de "WA DevX Webhook Events 1P App" a la WABA de prueba — no eliminarla, no interfiere con la nuestra.
- El registro de destinatario de prueba sin el prefijo "1" (`+52 222 524 0044`) — dejarlo existir, no genera conflicto con el nuevo.

---

## 11. Procedimiento futuro para pasar de prueba a real

**Esto NO es una guía de ejecución inmediata — es el mapa de pasos para cuando los requisitos de la sección 9 estén resueltos.**

### FUTURA MIGRACIÓN A NÚMERO REAL

#### Pasos PREVIOS (condición de entrada — nada de esto se hace hoy)

1. Completar en Meta Business Suite → Configuración → Información del negocio: nombre legal del negocio, dirección, sitio web.
2. Iniciar y completar la Verificación del negocio (Business Verification) — Meta indica una respuesta típica de ~5 días hábiles.
3. Completar el proceso de Tech Provider (`App Dashboard → Casos de uso → Personalizar → "Tech Provider onboarding"`), que incluye:
   - Advanced Access aprobado para `whatsapp_business_management` y `whatsapp_business_messaging`.
   - App Review (incluye video de demostración del uso de mensajería/plantillas).
4. Una vez aprobado el Tech Provider, **verificar en la interfaz de Meta** (no asumir) si el asistente de "Facebook Login for Business → Configuraciones → Crear configuración → Variación de inicio de sesión" ya ofrece una opción distinta de "General" relacionada con WhatsApp Business App / Coexistence / `whatsapp_business_app_onboarding`. En la última revisión (antes de completar los requisitos de la sección 9), solo existía la variante "General".
5. **DETENERSE Y VERIFICAR EL FLUJO DE META ANTES DE EJECUTAR CUALQUIER OPERACIÓN DE REGISTRO.**
6. Confirmar explícitamente que el flujo disponible es el de **Coexistence** (conserva WhatsApp Business App) y no el flujo estándar de registro de número (que lo desconectaría de WhatsApp Business App). Si no es evidente en la interfaz, consultar a Meta Business Support antes de continuar.

#### Pasos DE MIGRACIÓN (solo después de que los pasos previos estén 100% completos y confirmados)

1. Lanzar el flujo de Embedded Signup con `extras.featureType: 'whatsapp_business_app_onboarding'` y `extras.sessionInfoVersion: '3'` (ver documentación oficial: [Onboard WhatsApp Business app users](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users/)) usando el número real `+52 1 222 907 1277`.
2. Verificar en el propio flujo de Meta que el número conserva su historial y su presencia en WhatsApp Business App (esa es la propiedad definitoria de Coexistence).
3. Suscribir la app a la WABA real (`POST /1058755243214295/subscribed_apps`) — mismo procedimiento aditivo ya validado con la WABA de prueba en esta sesión.
4. Registrar/actualizar el webhook en Meta con la URL pública de producción (no ngrok — a esta altura ya debería existir un despliegue estable, ver Riesgos, sección 14).
5. Actualizar `whatsapp-adapter.env` (o su equivalente de producción):
   ```
   WHATSAPP_PHONE_NUMBER_ID=1240340249168075
   ```
   **Esto se hace SOLO después de que los pasos previos 1-6 estén confirmados** — cambiar únicamente esta variable sin haber completado Coexistence intentaría enviar mensajes desde un número que Graph API seguiría reportando como `DISCONNECTED`, y no resuelve ni sustituye el requisito de Business Verification / Tech Provider.
6. Ejecutar la lista de comprobación de la sección 12 antes de considerar la migración completa.

---

## 12. Lista de comprobaciones antes de cambiar el Phone Number ID

- [ ] Business Verification: estado "Verificado" confirmado en Meta Business Suite (no "en proceso").
- [ ] Tech Provider: estado "Verified" confirmado (no "Not verified").
- [ ] Flujo de Coexistence confirmado como disponible en el Embedded Signup para esta app (no asumido).
- [ ] Confirmado con Meta/documentación que el flujo a ejecutar **no** es el registro estándar (`request_code`/`verify_code`/`register`) sino Coexistence.
- [ ] Backup del `.env`/`whatsapp-adapter.env` actual (el que apunta al número de prueba) guardado localmente, fuera del repositorio.
- [ ] Confirmado que el número real sigue mostrando su historial de WhatsApp Business App intacto tras el onboarding (antes de dar por completada la migración).
- [ ] Webhook de producción registrado y verificado (handshake GET) contra la URL real, no ngrok.
- [ ] Suscripción de la app a la WABA real (`subscribed_apps`) confirmada, igual que se hizo con la de prueba.
- [ ] Pruebas automatizadas (`whatsapp-adapter/` y `simulator/`) siguen en verde tras el cambio de variable.
- [ ] Una prueba end-to-end real ejecutada con el número real, replicando el checklist de la sección 5, antes de considerar la migración cerrada.

---

## 13. Cómo revertir la migración si algo falla

1. Revertir `whatsapp-adapter.env` (o su equivalente de producción) a:
   ```
   WHATSAPP_PHONE_NUMBER_ID=1237988146069127
   ```
   (vuelve a apuntar al número de prueba, arquitectura ya validada en este documento).
2. No es necesario ni recomendable ejecutar ninguna operación de desconexión sobre el número real solo por revertir esta variable — el cambio de `WHATSAPP_PHONE_NUMBER_ID` no afecta el estado de conexión del número real en Meta.
3. Si el problema está en el lado de Meta (p. ej. Coexistence se activó mal y el número real muestra comportamiento inesperado en WhatsApp Business App), **detenerse y contactar a Meta Business Support** antes de intentar cualquier corrección manual — no ejecutar `register` como "solución rápida": eso sí podría desconectar el número de WhatsApp Business App de forma difícil de revertir.
4. Restaurar el webhook de Meta a la configuración de prueba si es necesario continuar validando en desarrollo mientras se investiga la falla.

---

## 14. Riesgos conocidos

- **ngrok (plan gratuito) genera una URL nueva en cada reinicio** — cualquier despliegue de producción real necesitará un túnel/dominio estable o un hosting propio antes de depender de este flujo de forma continua; no es apto para producción tal cual.
- **Node's `--env-file` no sobreescribe variables de entorno ya definidas en la shell** — si una terminal tiene variables viejas exportadas (de pruebas anteriores), el servidor las usará en vez de las del archivo `.env`/`whatsapp-adapter.env`. Verificar siempre en una terminal nueva al depurar comportamiento inesperado de variables.
- **Formato de número móvil mexicano:** el `wa_id` que entrega el webhook usa el prefijo "1" adicional (`521XXXXXXXXXX`), mientras que algunas interfaces de Meta muestran/registran el número sin ese prefijo (`+52 XXX XXX XXXX`). Cualquier lista de destinatarios, integración externa, o comparación de números debe tener en cuenta esta discrepancia — ya causó un HTTP 400 (`131030`) durante esta sesión.
- **Precios y otros recursos comerciales siguen 100% PENDIENTE** (`docs/proceso_de_venta/recursos/precios.md`) — la migración al número real no resuelve esta limitación; conversaciones reales que lleguen a la etapa de precio seguirán generando handoff a humano hasta que ese contenido se documente.
- **La suscripción de la app a una WABA es aditiva pero no fue probada en reversa** (no se ejecutó `DELETE /{WABA_ID}/subscribed_apps` en esta sesión) — si se necesita desuscribir en el futuro, confirmar el comportamiento exacto antes de asumirlo.

---

## 15. Credenciales que NUNCA deben documentarse

Ninguno de los siguientes valores debe aparecer en este documento, en ningún otro archivo de `docs/`, en commits, ni pegarse en una conversación:

- `WHATSAPP_ACCESS_TOKEN` (token de acceso de Meta / System User)
- `WHATSAPP_APP_SECRET` (clave secreta de la app)
- `WHATSAPP_WEBHOOK_VERIFY_TOKEN` (aunque de bajo riesgo, se trata con el mismo cuidado)
- Cualquier código de verificación OTP recibido por WhatsApp durante el proceso de autorización de destinatarios

Estos valores viven **exclusivamente** en `whatsapp-adapter/.env` y `whatsapp-adapter/whatsapp-adapter.env`, ambos excluidos por `.gitignore` (`**/*.env`). Si alguno de estos valores se expone accidentalmente (pegado en un chat, en un commit, en un log), debe tratarse como comprometido y regenerarse de inmediato — mismo criterio ya establecido en `docs/WHATSAPP_INTEGRATION_STATE.md`.

---

## Continuación del trabajo

Quien retome este proyecto para la migración al número real debe:

1. Leer este documento completo antes de tocar cualquier configuración de Meta o de código.
2. Releer `docs/WHATSAPP_INTEGRATION_STATE.md` para el contexto administrativo previo.
3. Verificar el estado actual de Business Verification y Tech Provider en Meta Business Suite — **no asumir que sigue igual que en la sección 9**, el tiempo pudo haber cambiado el estado.
4. Ejecutar `git status` para confirmar que el repositorio sigue coincidiendo con lo aquí descrito.
5. Seguir la sección 11 ("Futura migración a número real") en orden, sin saltarse los pasos previos.
6. **DETENERSE Y VERIFICAR EL FLUJO DE META ANTES DE EJECUTAR CUALQUIER OPERACIÓN DE REGISTRO.**
