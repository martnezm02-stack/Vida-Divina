# Seguimiento Postventa (proceso real)

[🏠 Índice de Proceso de Venta](./README.md)

> **Derivado de** [`SPRINT_5_PROCESO_COMERCIAL.md`](./SPRINT_5_PROCESO_COMERCIAL.md) §16, que permanece como fuente de verdad del proceso comercial real de Vida Divina. Este archivo no añade ni reinterpreta información — únicamente aísla y formaliza la sección 16 de ese documento como pieza propia del módulo `proceso_de_venta/`.
>
> **Relación con `docs/proceso_de_venta/seguimiento.md`:** ese archivo describe un modelo de 5 escalones (24h/3d/7d/15d/30d) que no representa el proceso operativo actual — ver la nota de compatibilidad agregada en ese mismo archivo. Este documento (`seguimiento_postventa.md`) es el que describe lo que realmente ocurre hoy.

---

## 1. Primer seguimiento — Día 3

**Cuándo se cuenta:** desde la **entrega** del producto al cliente (no desde el envío, no desde una fecha de pago) — confirmado directamente por el propietario de Vida Divina durante la auditoría de este Sprint.

**Mensaje:**

> "Hola buen día como se ha sentido con la toma del producto?"

**Fuente:** `SPRINT_5_PROCESO_COMERCIAL.md` §16.1.

## 2. Respuesta del cliente → intervención humana

La respuesta al mensaje del día 3 es atendida **siempre** por un humano, sin excepción — nunca por el motor conversacional.

**Razón documentada:** las respuestas y dudas son muy variadas y dependen de lo que cada persona manifiesta o siente.

**Regla:** Mensaje programado → respuesta del cliente → intervención humana.

**Fuente:** `SPRINT_5_PROCESO_COMERCIAL.md` §16.1.

## 3. Segundo seguimiento — una semana después

Se agenda un nuevo contacto una semana después del seguimiento del día 3. La agenda debe conservar el nombre del cliente y el objetivo es retomar lo que el cliente manifestó durante el seguimiento del día 3 — esto requiere que ese resultado quede conservado como contexto (ver `SPRINT_5_PROCESO_COMERCIAL.md` §25).

**Mensaje:**

> "Buen día nuevamente dando seguimiento a su tratamiento con el producto, nuevamente preguntando si tiene alguna duda? o si ha sentido mejora en su salud"

La conversación continúa de acuerdo con lo que el cliente manifieste.

**Fuente:** `SPRINT_5_PROCESO_COMERCIAL.md` §16.2.

## 4. Fin del seguimiento programado

Después del segundo seguimiento (+1 semana):

- no existen más seguimientos programados;
- el seguimiento termina.

**Fuente:** `SPRINT_5_PROCESO_COMERCIAL.md` §16.2.

---

## Qué NO incluye este proceso

- No incluye venta cruzada, solicitud de testimonio ni solicitud de referido — esos mecanismos, descritos en `docs/proceso_de_venta/postventa.md`, fueron confirmados como **no vigentes** en el proceso actual (ver la nota de compatibilidad de ese archivo).
- No incluye los escalones de 24h, 15 días o 30 días descritos en `docs/proceso_de_venta/seguimiento.md` — confirmados como **no vigentes**.
- No debe confundirse con el proceso de **recuperación de compra** (`recuperacion_de_compra.md`), que es un proceso nuevo aplicable únicamente a prospectos que **no compraron**, no a clientes que ya recibieron su pedido.

---
[🏠 Índice de Proceso de Venta](./README.md)
