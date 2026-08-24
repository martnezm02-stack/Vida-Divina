# Pago y Pedido (proceso operativo real)

[🏠 Índice de Proceso de Venta](./README.md)

> **Derivado de** [`SPRINT_5_PROCESO_COMERCIAL.md`](./SPRINT_5_PROCESO_COMERCIAL.md) §10-15, que permanece como fuente de verdad del proceso comercial real de Vida Divina.
>
> **Nota de alcance:** este documento describe el **proceso operativo** de pago y pedido tal como ocurre hoy. **No modela Pago como entidad de `docs/KNOWLEDGE_MODEL.md`.** Esa decisión de arquitectura queda explícitamente diferida hasta que existan: landing configurada, métodos de pago definidos, Mercado Pago configurado, cuentas de transferencia confirmadas, y certeza del flujo real de recepción y validación de pagos. Mientras tanto, Pago se documenta aquí únicamente como **dependencia operativa pendiente de modelado**, no como esquema de datos.

---

## PAGO MANUAL POR WHATSAPP — PILOTO

**Decisión de negocio confirmada por el propietario (Fase Pre-E2E, 2026-08-14):** para el piloto de la primera campaña, **no se integra Mercado Pago ni ningún mecanismo de pago automatizado.** El motor puede llegar hasta un punto de cierre/handoff donde el humano entrega manualmente al cliente el código o las instrucciones de pago (link de pago o datos de cuenta para transferencia), exactamente como ya describe el proceso operativo de este documento (secciones 2-3, sin cambios). Esta decisión es explícitamente **temporal, acotada al piloto** — no descarta una integración automatizada futura, solo confirma que no es requisito para las primeras ventas.

No se implementó ninguna integración de pagos, ningún webhook de pago, ni `orders`/`payments` como parte de esta decisión — sigue vigente el bloqueo de Fase A (`docs/CRM_FASE_A_DATA_MODEL.md` §16-17).

---

## 1. Definición del producto o paquete

Cuando el cliente manifiesta intención de comprar:

- Si ya indica directamente qué producto/paquete quiere, se toma esa información.
- Si no lo especifica, se pregunta: *"¿Qué paquete/producto está interesado en comprar?"*

Una vez definido producto y cantidad, se calcula el total correspondiente.

**Fuente:** §10.

## 2. Cierre y medio de pago

**Si el cliente indica una cantidad** (ej. "Quiero 2 tratamientos"): se identifica producto y cantidad, se calcula el total, se comunica el total, se envía el link de pago.

**Si solicita cuenta para transferencia** (ej. "Pásame la cuenta para transferir"): se envían los datos de cuenta/medio de pago mediante las respuestas rápidas disponibles (ver [`recursos/respuestas_rapidas_pago.md`](./recursos/respuestas_rapidas_pago.md), contenido pendiente). También existe un link de pago disponible como respuesta rápida.

**Fuente:** §11.

## 3. Pago

### 3.1 Pago mediante establecimiento (ej. OXXO) o transferencia

1. El cliente realiza el pago.
2. Se solicita comprobante de pago.
3. Se valida el pago en la cuenta — **proceso manual, intervención humana** (ver `docs/proceso_de_venta/SPRINT_5_PROCESO_COMERCIAL.md` §22, Human Handoff).
4. Una vez validado, se solicitan datos de entrega.
5. Se realiza manualmente el pedido en el sistema de Vida Divina.

### 3.2 Pago mediante Mercado Pago

1. El cliente realiza el pago mediante el link.
2. Mercado Pago envía una notificación de recepción del pago.
3. La notificación incluye el pedido y los datos de entrega.
4. Se realiza el pedido en el sistema de Vida Divina.
5. Si el producto está disponible en stock, no se genera nuevamente una solicitud de producto.
6. Se inicia el proceso de llevar el producto a paquetería.

**Fuente:** §12.

## 4. Datos de entrega

Datos necesarios para un pedido: nombre, dirección, código postal, ciudad, estado, teléfono. El teléfono no se solicita adicionalmente porque queda registrado en WhatsApp.

**Diferencia por medio de pago:**
- Pago en establecimiento/transferencia: los datos se solicitan al cliente **después** de validar el pago.
- Mercado Pago: los datos vienen **incluidos** en la notificación del pago.

**Fuente:** §13.

## 5. Procesamiento del pedido

Actualmente el procesamiento del pedido en el sistema de Vida Divina es **manual**.

Si existe stock: no se solicita nuevamente el producto en el sistema; se inicia el proceso de preparación y entrega mediante paquetería.

**Inventario actual:** la consulta de existencia se realiza manualmente.
**Inventario futuro (dependencia, no implementado):** se prevé que el motor consulte una base de datos de inventario, para conocer disponibilidad, responder automáticamente consultas de existencia, evitar ofrecer productos sin stock, y activar avisos cuando vuelva a existir un producto.

**Fuente:** §14.

## 6. Envío

Una vez enviado el producto:
1. Se notifica al cliente que el producto ya fue enviado.
2. Se informa el nombre de la paquetería que realizará la entrega.

Actualmente no se ha definido, como parte del proceso documentado, el envío automático de número de guía.

**Fuente:** §15.

---

## Dependencia pendiente: modelado de Pago

Documentado aquí como recordatorio explícito, sin resolverse en esta fase:

- ¿Pago debe ser una entidad independiente en `docs/KNOWLEDGE_MODEL.md`, o un atributo de una futura entidad Pedido?
- Esta decisión se toma **posteriormente**, cuando la landing, los métodos de pago, Mercado Pago y las cuentas de transferencia estén confirmados y exista certeza del flujo real de recepción/validación.
- Hasta entonces, `docs/KNOWLEDGE_MODEL.md` **no se modifica** por este motivo.

---
[🏠 Índice de Proceso de Venta](./README.md)
