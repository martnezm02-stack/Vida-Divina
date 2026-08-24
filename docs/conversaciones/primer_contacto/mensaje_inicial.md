# Primer Contacto — Mensaje Inicial Oficial (proceso real, Sprint 5)

> **Derivado de** [`docs/proceso_de_venta/SPRINT_5_PROCESO_COMERCIAL.md`](../../proceso_de_venta/SPRINT_5_PROCESO_COMERCIAL.md) §3, que permanece como fuente de verdad del proceso comercial real de Vida Divina.
>
> **Este es el guion de apertura vigente**, sin importar el canal de origen (WhatsApp directo, redes sociales, referido, o cualquier otro) — confirmado explícitamente: existe un único saludo comercial, no se crean variantes por canal.
>
> **Actualización (Fase Pre-E2E, 2026-08-14):** el texto y el comportamiento de este mensaje fueron corregidos por instrucción explícita del propietario, a partir de un hallazgo de la Fase Pre-Campaña (`docs/FASE_PRECAMPANA_VALIDACION.md`): el primer mensaje de un contacto nuevo debía generar siempre una bienvenida comercial, y el texto anterior (versión Sprint 5 original, ver historial de este archivo) se reemplaza por el texto aprobado abajo — confirmado directamente por el propietario, no derivado de ningún otro documento. **Cambio de comportamiento asociado:** ahora la bienvenida se envía SIEMPRE en el primer mensaje de cualquier contacto nuevo, sin excepción, incluso si ese primer mensaje ya expresa una intención de consumo clara — la clasificación de esa intención ya no ocurre en el mismo turno; se resuelve en el mensaje siguiente del cliente. Ver `docs/FASE_PRECAMPANA_VALIDACION.md` y el código de `simulator/src/flujoVentaReal.js`/`whatsapp-adapter/src/conversationRouter.js` para el detalle técnico.

# Objetivo
Saludar personalmente a todo contacto nuevo y preguntar su interés (producto o distribución) en el primer mensaje, antes de clasificar automáticamente cualquier intención expresada en ese mismo mensaje.

# Momento del embudo
Primer Contacto → el mensaje siguiente del cliente determina: interés en producto (continúa con `docs/proceso_de_venta/SPRINT_5_PROCESO_COMERCIAL.md` §4, identificación del producto de interés) o interés en distribución (fuera de alcance de este Sprint, ver §2 de ese documento).

# Mensaje oficial

> "Hola gracias por ponerte en contacto con Vive Vida divina, Soy Manuel y es un gusto atenderte; me puedes indicar en que estas interesado?, en alguno de nuestros productos o en formar parte de nuestra red de distribuidores?"

# Contexto
Los prospectos que llegan a WhatsApp normalmente provienen de campañas y ya presentan intención de compra (`SPRINT_5_PROCESO_COMERCIAL.md` §3). El mensaje se envía igual sin importar el origen del contacto — no varía por canal, y se envía siempre, sin importar el contenido del primer mensaje del cliente.

# Qué NO hacer
- No cambiar este texto por iniciativa propia — es contenido aprobado explícitamente por el propietario.
- No agregar claims, precios ni promociones a este mensaje.
- No asumir que el cliente quiere comprar solo porque su primer mensaje lo sugiera — la bienvenida se envía igual, y la clasificación ocurre en el mensaje siguiente.
- No usar la plantilla genérica de [`docs/conversaciones/plantillas/saludos.md`](../plantillas/saludos.md) como saludo comercial principal de primer contacto.

# Historial
- **2026-08-14 (Fase Pre-E2E):** texto reemplazado por la versión aprobada arriba; comportamiento corregido para que la bienvenida se envíe siempre en el primer mensaje, sin clasificar en el mismo turno.
- **Versión anterior (Sprint 5 original):** *"Hola, buen día. 😊 Bienvenido(a) a Vida Divina. ¿Estás interesado(a) en alguno de nuestros productos o te gustaría conocer la oportunidad de distribución?"* — se conserva aquí como registro histórico, no como texto vigente.

# Relación con los archivos de canal existentes
Los archivos [`whatsapp_directo.md`](./whatsapp_directo.md), [`redes_sociales.md`](./redes_sociales.md), [`referido.md`](./referido.md) y [`pregunta_precio.md`](./pregunta_precio.md) documentan guiones de apertura distintos por canal, con un principio de "saludo cálido sin clasificar todavía". Ese enfoque no representa el proceso real confirmado en Sprint 5. Esos archivos se conservan íntegros como referencia de contexto (información sobre el canal de origen, variantes de conversación posteriores), pero **el mensaje de apertura vigente es el de este archivo**, no el de cada uno de ellos — ver la nota agregada al inicio de cada uno.

---
[⬅ Primer Contacto](./index.md) · [🏠 Índice general](../README.md)
