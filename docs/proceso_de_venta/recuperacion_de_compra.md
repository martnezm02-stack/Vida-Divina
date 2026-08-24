# Recuperación de Compra Potencial (proceso nuevo)

[🏠 Índice de Proceso de Venta](./README.md)

> **Derivado de** [`SPRINT_5_PROCESO_COMERCIAL.md`](./SPRINT_5_PROCESO_COMERCIAL.md) §19-22, que permanece como fuente de verdad del proceso comercial real de Vida Divina.
>
> **Este es un proceso NUEVO, no histórico.** Sprint 5 lo distingue explícitamente: *"Esta sección NO describe el proceso histórico actual. Es un proceso nuevo autorizado para incorporarse posteriormente al motor de ventas"* (§19). No debe mezclarse ni confundirse con el seguimiento postventa real (`seguimiento_postventa.md`), que aplica a clientes que **ya compraron**. Este proceso aplica a prospectos que **no compraron** en el momento del cierre.

---

## 1. Activación

**Condición:** última interacción comercial sin compra → esperar 5 días.

**Condición de cancelación:** si el prospecto vuelve a contactar durante esos 5 días, se considera que la conversación se reactivó por iniciativa del cliente y **no se debe enviar automáticamente** el mensaje de recuperación.

**Fuente:** `SPRINT_5_PROCESO_COMERCIAL.md` §19.

## 2. Mensaje de recuperación (día 5)

Si el prospecto no ha vuelto a contactar en 5 días desde la última interacción comercial, se envía:

> "Hola, buen día. Hace unos días te compartimos la información y promoción del [producto] que te interesó. ¿Qué te pareció? ¿Hay alguna duda o algo que te gustaría saber antes de decidirte?"

**Objetivo:** reactivar la conversación, detectar si existe una duda, identificar si existe una objeción, detectar si el cliente desea comprar.

**Regla:** no se envía automáticamente un nuevo precio, testimonio o argumento antes de recibir respuesta.

**Fuente:** `SPRINT_5_PROCESO_COMERCIAL.md` §20.

## 3. Respuestas al mensaje de recuperación

### 3.1 No responde
- No se envía segundo mensaje.
- No se programa otro seguimiento.
- Termina el proceso de recuperación.

Flujo: día 5 → mensaje → sin respuesta → FIN.

### 3.2 Dice "lo voy a pensar"
No se programa otro seguimiento. Se envía:

> "Esperamos que te animes a probar nuestro producto que estamos seguros mejoraran tu salud!"

Después: FIN DE RECUPERACIÓN.

### 3.3 Manifiesta intención de compra
No se repite el proceso comercial anterior. Se pasa directamente a:

**Definir producto/paquete → calcular total → pago → pedido** (ver `pago_y_pedido.md`).

### 3.4 Presenta duda u objeción

1. Interpretar lo que el prospecto manifestó.
2. Identificar la duda u objeción.
3. Responder de manera amable.
4. Responder específicamente a la duda concreta.
5. Utilizar únicamente información comercial autorizada.
6. No volver a preguntar inmediatamente si quiere comprar.
7. Esperar la siguiente interacción del cliente.

**Fuente:** `SPRINT_5_PROCESO_COMERCIAL.md` §21.

## 4. Conocimiento de apoyo para responder dudas u objeciones

Para el paso 3.4, el futuro motor conversacional **puede utilizar como conocimiento de apoyo** la biblioteca ya existente en [`docs/objeciones/`](../objeciones/README.md) (esta_caro, lo_voy_a_pensar, no_creo_en_suplementos, no_tengo_dinero).

Reglas confirmadas para su uso en este contexto:
- La respuesta debe ser siempre amable y específica respecto de la duda concreta del cliente — no una respuesta genérica de plantilla.
- Si el conocimiento autorizado no permite responder con seguridad, se escala a humano (ver §5).
- Después de resolver una duda, no se vuelve a presionar preguntando inmediatamente si desea comprar (regla 3.4.6 de arriba).

`docs/objeciones/` se usa aquí **como conocimiento de apoyo para el proceso de recuperación de compra** — no se convierte en una clasificación obligatoria ni en una máquina de estados del flujo comercial principal (ver la nota equivalente en `reglas_de_decision.md`).

## 5. Escalamiento a humano

Si el motor recibe una duda u objeción que no puede responder con seguridad utilizando la información autorizada:

- no debe improvisar;
- no debe inventar información;
- no debe decir al cliente que es una IA;
- no debe decir que no sabe;
- no debe proporcionar una respuesta especulativa;
- debe transferir internamente la conversación a un humano, de forma invisible para el cliente.

**Fuente:** `SPRINT_5_PROCESO_COMERCIAL.md` §22.

---
[🏠 Índice de Proceso de Venta](./README.md)
