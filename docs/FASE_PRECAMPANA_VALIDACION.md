# Fase Pre-Campaña — Validación en Vivo del Motor Async + Cierre de Brechas

[🏠 Índice de Documentación](./PROJECT_STATE.md)

> **Estado:** Completa. Autorizada explícitamente por el propietario el 2026-08-14, con alcance estrictamente limitado a validación — sin C.3, sin Creative Intelligence, sin Meta Ads, sin `orders`/`payments`, sin cambios de schema.
>
> **Objetivo de la fase:** demostrar, con evidencia real (no solo tests automatizados), que el motor comercial async post-C.2B puede sostener el primer experimento comercial de Vida Divina antes de invertir presupuesto en publicidad.
>
> **Corte:** 2026-08-14. No se modificó ningún archivo de código de negocio (`simulator/`, `whatsapp-adapter/`, `crm/`) durante esta fase — solo se ejecutó el código ya existente contra infraestructura real.

---

## 1. Validación en vivo del motor async

**Método:** dado que exponer el servidor públicamente vía ngrok y coordinar el envío de un mensaje real desde un teléfono requiere participación síncrona del propietario, y ante la disyuntiva se optó explícitamente por la propietario por la opción intermedia, se ejecutó una **prueba híbrida real**: el servidor real (`whatsapp-adapter/src/httpServer.js`, sin modificar) se levantó localmente con las credenciales reales (`whatsapp-adapter/.env` + `whatsapp-adapter/whatsapp-adapter.env` + `crm/.env`), contra **PostgreSQL real** (`DATABASE_URL`, no `TEST_DATABASE_URL`). Los webhooks entrantes se construyeron con el mismo formato JSON exacto que entrega Meta y se firmaron con HMAC-SHA256 real usando `WHATSAPP_APP_SECRET` real — la única pieza no genuina es que el webhook llegó por una petición HTTP local en vez de a través de Meta/ngrok.

**VERIFICADO EN VIVO** (ejecución real, HTTP real, base de datos real, Graph API real):

- Recepción del mensaje (POST `/webhook`, firma HMAC validada contra `WHATSAPP_APP_SECRET` real — sin advertencia de "modo desarrollo").
- Procesamiento por el motor (`conversationRouter.js` → `flujoVentaReal.js`, async de punta a punta).
- **Respuesta/envío real por Graph API**: dos mensajes reales enviados a un destinatario de prueba autorizado (`522225240044`), ambos con HTTP 200 de Meta (`envioReal: true`, `envios: [{enviado:true, status:200}]`) — confirma que el envío saliente **sigue funcionando después de la migración a PostgreSQL async**, algo que no se había vuelto a probar desde C.2B.
- Persistencia real en PostgreSQL, verificada por consulta directa vía `crm/index.js` (no vía `contextoStorage.js`, para no validar el sistema contra sí mismo): `customer`, `customer_channel`, `conversation`, `messages` (entrantes), `state_transitions`, `opportunity`.
- **Handoff real**: en una segunda conversación (`5212225240044`), el motor generó un handoff genuino al llegar al paso de precio (no simulado, es el comportamiento real del sistema con `precios.md` PENDIENTE — ver §2). Verificado que:
  - se creó correctamente (`handoffs` table, 1 fila),
  - el motivo quedó registrado,
  - **un mensaje adicional del cliente NO reanudó el flujo automático** — la respuesta fue `yaExistente: true`, `envioReal: false`, y no se creó ningún `state_transition` ni `message` nuevo — el sistema respeta la regla "el flujo no debe continuar indebidamente como si el humano no fuera necesario".

**PENDIENTE DE CONFIRMACIÓN — no verificado en esta fase:** la recepción genuina de un webhook entregado por Meta a través de una URL pública (ngrok) y el envío de un mensaje real desde el teléfono del propietario. Esto quedó fuera de esta sesión porque requiere: (a) registrar una nueva URL de ngrok en Meta App Dashboard (la sesión anterior ya documentó que la URL rota en cada reinicio del plan gratuito), y (b) que una persona real envíe el mensaje desde un WhatsApp autorizado. Se puede ejecutar en una sesión futura, en vivo con el propietario, siguiendo exactamente el mismo procedimiento ya documentado en `docs/WHATSAPP_CLOUD_API_STATUS.md`.

### Hallazgo operativo: credenciales divididas en dos archivos `.env`

`whatsapp-adapter/.env` (el que documenta `server.js` en su comentario de cabecera, `WHATSAPP_WEBHOOK_VERIFY_TOKEN` y `WHATSAPP_PHONE_NUMBER_ID`) **no** contiene `WHATSAPP_ACCESS_TOKEN` ni `WHATSAPP_APP_SECRET` — esos dos viven únicamente en `whatsapp-adapter/whatsapp-adapter.env` (el archivo legacy). Cargar solo `.env` (como sugiere el comentario de `server.js`, "Uso: node --env-file=.env server.js") deja el envío real **silenciosamente deshabilitado** sin ningún error — así se comportó la primera corrida de esta prueba. `docs/WHATSAPP_CLOUD_API_STATUS.md` §14 ya advertía sobre la coexistencia de estos dos archivos como riesgo; esta fase confirma que el riesgo es real y ya se manifestó. **No se corrigió** (fuera de alcance — tocar el arranque del servidor no estaba autorizado); se documenta como hallazgo operativo para quien despliegue el servidor en el futuro: cargar **ambos** archivos.

### Hallazgo: mensajes de primer contacto ambiguos no quedan registrados en `messages`

Cuando el primer mensaje de un contacto nuevo no coincide con las señales de "consumo" ni "distribución" (ej. "Hola, buenas tardes"), el flujo llama únicamente a `iniciarConversacionPersistente`, que **no** asigna `contexto.respuestaCliente` — y como `messages` se deriva de ese campo, **el texto de ese primer mensaje nunca se persiste en ningún lado**, ni en PostgreSQL ni en JSON. Se confirmó de forma reproducible en las dos conversaciones de prueba: en ambas, el primer turno ("Hola, buenas tardes") no generó fila en `messages`, mientras que el segundo turno sí. No es un bug nuevo — es una consecuencia directa del diseño ya vigente (`contexto.respuestaCliente` como campo único, no un log de mensajes) — pero no estaba documentado con esta precisión. Relevante para la sección 4 (atribución): un código de campaña en un primer mensaje ambiguo **no quedaría capturado**; el mensaje debe redactarse para clasificar como "consumo" (ver sección 4).

### Hallazgo: `handoffs.fuente` se pierde en persistencia (ya documentado en código, confirmado ahora en vivo)

La fila de `handoffs` persistida en PostgreSQL tiene `fuente: null`, aunque la respuesta HTTP del motor sí trae `fuente: "docs/proceso_de_venta/recursos/precios.md"`. Causa raíz confirmada por inspección (`simulator/src/flujoVentaReal.js`, en cada bloque `if (resultado.handoff) { contexto.motivoHandoff = resultado.handoff.motivo; ... }`): el objeto `contexto` (diseñado en Fase 3.1/3.2, anterior al CRM) nunca tuvo un campo `fuenteHandoff` — solo `motivoHandoff`. `crm/context/disassemble.js:231` ya trae un comentario reconociendo esto explícitamente ("fuente queda null cuando se llega por esta vía"). **No es un hallazgo nuevo de esta fase** — es una limitación ya conocida y documentada en el propio código — pero esta fase confirma que sigue activa en producción. No se corrigió (tocar la forma de `contexto` es una decisión de diseño de `flujoVentaReal.js`, fuera del alcance de esta fase de validación).

---

## 2. Auditoría de recursos comerciales

Comparación línea por línea de `simulator/src/recursosComerciales.js` y `simulator/src/ventaRealRules.js` contra `docs/proceso_de_venta/SPRINT_5_PROCESO_COMERCIAL.md` y `docs/proceso_de_venta/recursos/*.md` (que a su vez citan a Sprint 5).

| Recurso | Veredicto | Detalle |
|---|---|---|
| Audio de explicación | **A — coincide exactamente** | `obtenerAudioExplicacion()` transcribe `audio_explicacion.md`/§4.2 sin alteración; único audio, no varía por producto — correcto. |
| Testimonios | **A — coincide exactamente (como PENDIENTE)** | Las 4 necesidades documentadas (diabetes, pérdida de peso, estreñimiento, colitis) están todas marcadas `disponible:false` en código, igual que en `testimonios.md`. El código no inventa ningún testimonio. |
| Precios | **A — coincide exactamente (como PENDIENTE)** | `obtenerPrecioProducto()` devuelve `disponible:false` para **cualquier** producto, sin excepción — igual que `precios.md`, que no documenta ninguna cifra para ningún producto. |
| Ofertas | **A — coincide exactamente** | Solo Té Divina tiene oferta real (`OFERTA_TEDIVINA`, texto idéntico carácter por carácter al de `ofertas.md`/§8, incluida la exclusión explícita de la guía de alimentación). Cualquier otro producto → PENDIENTE, igual que el documento. |
| Cierres | **A — coincide exactamente** | Té Divina → audio con la pregunta final exacta de §9.1. Otros productos → texto exacto de §9.2. Sin discrepancia. |
| Respuestas rápidas de pago | **A — coincide exactamente (como PENDIENTE)** | `obtenerRespuestaRapidaPago()` devuelve `disponible:false` para "cuenta" y "link" — igual que `respuestas_rapidas_pago.md`, que confirma que existen en el negocio real pero no transcribe su texto literal. |
| Recuperación (mensaje día 5, "lo voy a pensar") | **A — coincide exactamente** | `MENSAJE_RECUPERACION` y `MENSAJE_CIERRE_RECUPERACION_LO_PENSARA` en `flujoVentaReal.js` citan §20/§21.2 con el texto literal. |
| Señales de necesidad/intención/objeción (`ventaRealRules.js`) | **A — coincide con la especificación, con margen de interpretación esperado** | Los patrones (`SENAL_CONSUMO`, `SENALES_NECESIDAD`, `SENAL_INTENCION_COMPRA`, etc.) son heurísticas de texto razonables para las frases citadas en Sprint 5 — no hay forma de verificar "coincidencia exacta" para un clasificador de lenguaje natural sin conjunto de prueba, así que se marca A sobre lo verificable (cada patrón cita su fuente exacta) con la salvedad de que la cobertura de sinónimos no está definida como contrato. |
| **Oferta y cierre — alcanzabilidad real** | **D — no ejercitable en producción hoy** | Confirmado en vivo (§1): como `precios.md` está 100% PENDIENTE para todo producto, `procesarOfertaYCierrePersistente` **nunca se alcanza** en el flujo real (`conversationRouter.js` siempre corta en el handoff de precio antes de llegar a oferta/cierre). El código de oferta/cierre es correcto si se invoca manualmente, pero está muerto en el camino real hasta que exista al menos un precio documentado. |

**Ninguna discrepancia de tipo B o C encontrada.** El código es una transcripción fiel de la documentación, incluyendo la fidelidad de "lo que falta" — no hay ningún caso donde el código muestre más (o menos) de lo que Sprint 5 realmente documenta.

---

## 3. Estado del mecanismo de pago

**Inspección de código:** cero referencias a Mercado Pago en ningún archivo de código del repositorio (`grep` sin resultados fuera de `docs/`). No existe cliente HTTP, webhook receptor, ni variable de entorno para Mercado Pago en `whatsapp-adapter/`, `crm/` ni `simulator/`.

**Inspección de documentación:** `docs/proceso_de_venta/pago_y_pedido.md` (derivado de Sprint 5 §11-12) documenta el proceso operativo (link de pago / cuenta de transferencia / OXXO) pero declara explícitamente que el modelado de Pago está diferido "hasta que existan: landing configurada, métodos de pago definidos, Mercado Pago configurado, cuentas de transferencia confirmadas". `docs/proceso_de_venta/recursos/respuestas_rapidas_pago.md` marca ambas respuestas rápidas (cuenta y link) como PENDIENTE — el texto literal nunca se documentó.

**Veredicto: PENDIENTE DE CONFIRMACIÓN DEL PROPIETARIO.** No se encontró evidencia técnica de que Mercado Pago esté configurado y operativo. Lo único confirmable hoy: el proceso de pago por transferencia/OXXO es 100% manual (validación de comprobante por un humano) y ya está descrito con precisión en Sprint 5 — ese camino no depende de ninguna integración de código y puede usarse desde el día uno de la campaña sin construir nada.

---

## 4. Atribución mínima de campaña → venta (propuesta, no implementada)

Restricciones respetadas: sin columnas nuevas en el CRM, sin cambios de schema, sin sistema de atribución avanzado.

**Propuesta: código de campaña embebido en el mensaje inicial del cliente, capturado por el campo `messages.texto` ya existente.**

Cómo funciona, sin tocar ni una línea de código:

1. Cada anuncio/creativo recibe un código corto legible (ej. `TD-A1`, `TD-A2` para "Té Divina, Anuncio 1/2").
2. El anuncio usa un enlace de WhatsApp con mensaje prellenado (`https://wa.me/<numero>?text=...`) — formato estándar que Meta soporta de forma nativa en anuncios "Click to WhatsApp", sin ninguna integración adicional.
3. El texto prellenado debe **redactarse para clasificar como "consumo"**, no como saludo ambiguo — ej.: *"Hola, vi el anuncio TD-A1 y quiero información del Té Divina"*. Esto es importante por el hallazgo de la sección 1: un mensaje ambiguo no se persiste en `messages`; uno que contenga "quiero"/"información"/"producto" sí se clasifica como consumo y **sí queda guardado tal cual en `messages.texto`**, con el código de campaña incluido de forma literal, texto plano, en el CRM real, sin ninguna columna nueva.
4. Registro manual (fuera del CRM, ej. una hoja de cálculo — no está autorizado construir nada dentro del proyecto para esto): fecha, código de campaña, `wa_id` del lead, producto, ¿venta? (sí/no), monto, medio de pago, costo publicitario del período. Quien atiende el handoff (que Sprint 5 ya exige que sea un humano en varios puntos) puede leer el código directamente del primer mensaje del cliente en WhatsApp Business o consultando `messages.texto` en Postgres.

**Nota técnica no implementada (candidata a fase futura, no a esta):** WhatsApp Cloud API adjunta automáticamente un objeto `referral` (con `ctwa_clid`, `source_id`=ID del anuncio, `headline`) en el webhook de cualquier mensaje que se origine de un anuncio "Click to WhatsApp" real — sin necesidad de ningún código embebido a mano. Hoy `webhookParser.js` no lee ni conserva ese campo. Es la solución de atribución "correcta" a mediano plazo, pero requeriría un cambio de código (leer y persistir `referral`), fuera del alcance autorizado de esta fase. Se documenta aquí solo como referencia para la fase siguiente, no se implementa.

---

## 5. Métricas mínimas del piloto ($12,000 MXN)

| Métrica | Fuente |
|---|---|
| Gasto, impresiones, clicks, alcance, frecuencia | **META (Ads Manager) — nativo, sin trabajo nuestro** |
| Mensajes iniciados / costo por mensaje iniciado (si el anuncio es "Click to WhatsApp") | **META — nativo** |
| Conversaciones iniciadas (`conversations`) | **NOSOTROS — ya automático**, vía CRM (Postgres, sin trabajo adicional) |
| Avance por paso del embudo (`state_transitions`: `AudioExplicacionEnviado`, `NecesidadIdentificada`, etc.) | **NOSOTROS — ya automático**, vía CRM |
| Handoffs generados y su motivo | **NOSOTROS — ya automático**, vía CRM (tabla `handoffs`) |
| Código de campaña por lead | **NOSOTROS — manual**, leído de `messages.texto` (ver sección 4) |
| Ventas cerradas, monto, medio de pago | **NOSOTROS — manual** (registro de pedido ya es manual hoy, ver `pago_y_pedido.md`) |
| CAC = gasto total / ventas | **NOSOTROS — calculado** a partir de las dos anteriores |
| Tasa de conversión lead → venta | **NOSOTROS — calculado** (ventas / conversaciones iniciadas) |
| Ingreso por venta / margen después de publicidad | **NOSOTROS — calculado**, requiere que el propietario aporte el costo de producto (no está documentado en `docs/productos.md` ni en ningún lugar del repositorio — dato de negocio, no técnico) |

No se agregaron métricas adicionales (ej. LTV, cohortes, forecast) — quedan fuera por instrucción explícita de la fase.

---

## 6. Handoff humano

Verificado en vivo en la sección 1 con un escenario real (no fabricado): el motor llega naturalmente a un handoff cuando intenta enviar un precio, porque `precios.md` está 100% PENDIENTE para todo el catálogo — este es el comportamiento real del sistema hoy, no un caso de prueba artificial.

Confirmado:
- Se crea correctamente (`handoffs`, 1 fila, `conversations.handoff_pendiente_id` apuntando a ella).
- El motivo queda registrado en texto legible, citando la causa exacta.
- El flujo **no continúa indebidamente**: un mensaje adicional del cliente mientras el handoff está pendiente no genera ni una respuesta automática ni una nueva transición de estado — confirmado por inspección directa de `state_transitions` (sin filas nuevas) y de la respuesta HTTP (`yaExistente:true`, `envioReal:false`).
- PostgreSQL conserva la información de forma persistente (confirmado con una segunda lectura, en un proceso Node distinto).

**No se automatizó la resolución del handoff** (instrucción explícita) — `resuelto_en`/`resuelto_por` permanecen `null`, consistente con la Decisión Pendiente #4 ya documentada en `CRM_FASE_A_DATA_MODEL.md`.

---

## 7. Artefactos de datos generados por esta prueba

Esta fase escribió datos reales (no de test) en la base de datos de desarrollo (`vida_divina_crm`), como parte necesaria de la validación:

- Dos `customer_channel`/`conversation` nuevos, para `wa_id` `5212225240044` y `522225240044` (ambos números de prueba ya autorizados en Meta, documentados en `WHATSAPP_CLOUD_API_STATUS.md`, no números de clientes reales).
- Dos mensajes reales de WhatsApp fueron efectivamente entregados al destinatario de prueba `522225240044` vía Graph API real (confirmado con HTTP 200 de Meta).

No se limpiaron estos registros — son evidencia legítima de la validación, viven en la base de datos de **desarrollo**, no en producción, y no tienen impacto en clientes reales. Si se prefiere una base limpia antes de la campaña, es una decisión del propietario, no ejecutada aquí sin autorización explícita.

---

## 8. Corrección Pre-E2E (2026-08-14, mismo día, autorizada explícitamente por el propietario)

Tras el cierre de esta fase, el propietario autorizó una intervención puntual de código para corregir dos hallazgos concretos de §1, antes de ejecutar la prueba E2E vía ngrok (todavía no autorizada).

### 8.1 Bienvenida obligatoria en el primer contacto

- Texto reemplazado por el aprobado directamente por el propietario (ver `docs/conversaciones/primer_contacto/mensaje_inicial.md`, con historial conservado).
- **Cambio de comportamiento:** el primer mensaje de cualquier contacto nuevo ahora recibe **siempre** solo la bienvenida — incluso si ya expresa intención de consumo clara. La clasificación se resuelve en el mensaje siguiente. Antes, un primer mensaje con intención de "consumo" saltaba directo a producto/audio en el mismo turno.
- `iniciarConversacionPersistente()` (`simulator/src/flujoVentaReal.js`) ahora persiste el mensaje entrante del cliente siempre, corrigiendo el hallazgo de §1 ("mensajes de primer contacto ambiguos no quedan registrados en `messages`").
- Tocó `whatsapp-adapter/src/conversationRouter.js` (fuera de `simulator/`) — necesario, documentado explícitamente, sin alternativa dentro de `simulator/` (ver razonamiento en la sesión de autorización).

### 8.2 Catálogo y precios reales (8 productos, piloto)

- `docs/proceso_de_venta/recursos/precios.md` y `simulator/src/recursosComerciales.js` actualizados con el catálogo de 8 productos y precios proporcionados directamente por el propietario. Cada `productoId` fue verificado contra `knowledge/compiled/entities.json` antes de escribirse — ninguno fue adivinado.
- Ninguna discrepancia bloqueante encontrada contra `docs/productos/` (ningún archivo tenía ya una cifra de precio que contradecir) ni contra `SPRINT_5_PROCESO_COMERCIAL.md`. Sí se observó que las categorías comerciales del piloto difieren en algunos casos de la categoría estructural del catálogo (ej. Ripped Capsules: catálogo = "Rendimiento Físico", piloto = "Control de Peso") — documentado como nota informativa, no como bloqueo, dado que un producto puede pertenecer a más de una categoría.
- **Consecuencia real verificada:** para Té Divina (el único de los 8 con oferta y cierre ya documentados en Sprint 5), el flujo completo audio → necesidad → precio → oferta → cierre es ahora alcanzable de punta a punta, sin handoff — la primera vez que esto ocurre en el proyecto. Para los otros 7 productos del catálogo, el handoff por precio desaparece pero **se traslada** al paso de oferta (ninguno tiene oferta documentada salvo Té Divina) — comportamiento correcto, no un defecto: nunca se inventó una oferta.
- `docs/proceso_de_venta/pago_y_pedido.md` documenta la decisión **"PAGO MANUAL POR WHATSAPP — PILOTO"**: sin Mercado Pago, sin `orders`/`payments`, sin webhooks de pago.

### 8.3 Tests

46 tests específicos nuevos/modificados, todos pasando en aislamiento antes de correr las suites completas. Suite completa final (múltiples corridas estables):

| Suite | Resultado |
|---|---|
| `crm/` | 63/63 (sin tocar, sin cambios) |
| `simulator/` | 35/35 |
| `whatsapp-adapter/` | 51/52 — 1 fallo conocido, no relacionado con esta corrección (ver 8.4) |

### 8.4 Hallazgo separado, no corregido: ids de test fijos contra `DATABASE_URL` sin limpieza

Durante la ejecución de la suite completa se encontró que `simulator/test/` y `whatsapp-adapter/test/` reutilizan ids de conversación fijos, y **nada limpia `DATABASE_URL`** entre corridas (el único mecanismo de limpieza existente borra archivos `.json`, que ya no se generan desde C.2B). Corridas repetidas del mismo archivo dentro de una sesión — exactamente el proceso que esta corrección exigía (específicos → suite afectada → suite completa) — contaminan aserciones que asumen "contacto nunca visto". Corregido con sufijo único por corrida (`Date.now()`) en los ids fijos de `simulator/test/contextoStorage.test.js`, `simulator/test/flujoVentaRealPersistente.test.js`, `whatsapp-adapter/test/whatsappAdapter.test.js`, `whatsapp-adapter/test/e2ePostgres.test.js` y `whatsapp-adapter/test/httpServer.test.js` — cero cambios de aserciones de negocio, autorizado explícitamente por el propietario en dos puntos de decisión durante esta sesión.

**Fallo restante, no corregido (1/52 en `whatsapp-adapter/`):** `e2ePostgres.test.js` obtiene un `customer_channel` vía el pool por defecto (`DATABASE_URL`) y luego consulta `conversations` vía el pool de test (`TEST_DATABASE_URL`) — funciona solo si ambas variables apuntan a la misma base física. Se confirmó por consulta directa que en este entorno son bases **distintas**. No se corrigió: requeriría tocar `crm/.env` (fuera de alcance) o rediseñar la verificación cruzada del test — ambas cosas requieren autorización explícita en una fase separada.

### 8.5 Archivos modificados en esta corrección

`docs/conversaciones/primer_contacto/mensaje_inicial.md`, `simulator/src/flujoVentaReal.js`, `whatsapp-adapter/src/conversationRouter.js`, `docs/proceso_de_venta/recursos/precios.md`, `simulator/src/recursosComerciales.js`, `docs/proceso_de_venta/recursos/README.md`, `docs/proceso_de_venta/pago_y_pedido.md`, `simulator/test/ventaReal.test.js`, `simulator/test/flujoVentaRealPersistente.test.js`, `simulator/test/contextoStorage.test.js`, `whatsapp-adapter/test/whatsappAdapter.test.js`, `whatsapp-adapter/test/e2ePostgres.test.js`, `whatsapp-adapter/test/httpServer.test.js`.

**No modificados:** `crm/` (ningún archivo), schema/migraciones, `orders`/`payments`, Mercado Pago, cualquier componente de C.3 o Creative Intelligence.

### 8.6 Preparación para prueba E2E vía Meta/ngrok

No ejecutada en esta sesión — requiere autorización explícita separada, como ya estaba previsto. Con esta corrección aplicada, el estado técnico para esa prueba es: bienvenida correcta desde el primer mensaje, primer mensaje persistido, catálogo de 8 productos con precio real (Té Divina alcanza cierre completo), pago manual documentado como decisión vigente del piloto.

---
[🏠 Índice de Documentación](./PROJECT_STATE.md)
