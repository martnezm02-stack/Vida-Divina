# Ejemplos

[🏠 Índice de Agente IA](./README.md)

Ejemplos del razonamiento interno del agente aplicado a casos concretos. **No se muestra la cadena de pensamiento ni el texto final de la respuesta** — solo el flujo de decisiones: qué pasos de [`flujo_de_razonamiento.md`](./flujo_de_razonamiento.md) se ejecutaron y qué archivo se consultó en cada uno. El texto real de la respuesta se construye con `docs/conversaciones/`, que no se duplica aquí.

---

## Ejemplo 1 — Necesidad clara

**Cliente:** "Tengo 52 años y siempre estoy cansado."

**Motor:**
- ✔ Comprender la intención → menciona edad y cansancio persistente
- ✔ Identificar objetivo → busca más energía en el día a día
- ✔ Identificar perfil → coincide con [`docs/clientes/energia.md`](../clientes/energia.md)
- ✔ Consultar proceso_de_venta → estado `En descubrimiento`, avanza a `Perfil identificado`
- ✔ Consultar clientes → abre la ficha de Energía
- ✔ Consultar productos → 1-2 productos recomendados por esa ficha
- — Consultar objeciones → *omitido, no hay resistencia todavía*
- ✔ Consultar conversaciones → tono de [`docs/conversaciones/recomendacion/energia.md`](../conversaciones/recomendacion/energia.md)
- ✔ Construir respuesta
- ✔ Validar seguridad → sin afirmaciones médicas, sin precios inventados
- ✔ Responder

---

## Ejemplo 2 — Perfil ambiguo

**Cliente:** "Hola, quería ver qué me recomiendan, la verdad no sé bien qué necesito."

**Motor:**
- ✔ Comprender la intención → interés genuino, sin necesidad puntual expresada
- ✔ Identificar objetivo → no está claro todavía
- ✖ Identificar perfil → información insuficiente
- ✔ Aplicar [`reglas_de_decision.md`](./reglas_de_decision.md), sección "Perfil desconocido" → hacer una pregunta adicional antes de continuar
- *(el flujo se detiene aquí en este turno — no se avanza a productos sin perfil, ver [`principios.md`](./principios.md))*
- ✔ Construir respuesta → una pregunta abierta, no una recomendación
- ✔ Validar seguridad
- ✔ Responder

---

## Ejemplo 3 — Objeción de precio

**Cliente:** "Me interesa, pero se me hace un poco caro."

**Motor:**
- ✔ Comprender la intención → interés confirmado, con resistencia de precio
- ✔ Identificar objetivo → decidir si continuar con la compra
- ✔ Identificar perfil → ya estaba identificado en un turno anterior (ver [`memoria.md`](./memoria.md))
- ✔ Consultar proceso_de_venta → activa [`docs/proceso_de_venta/manejo_de_objeciones.md`](../proceso_de_venta/manejo_de_objeciones.md)
- — Consultar clientes / productos → *no se repite, ya se consultaron en un turno anterior*
- ✔ Consultar objeciones → [`docs/objeciones/esta_caro.md`](../objeciones/esta_caro.md)
- ✔ Consultar conversaciones → [`docs/conversaciones/objeciones/esta_caro.md`](../conversaciones/objeciones/esta_caro.md)
- ✔ Construir respuesta
- ✔ Validar seguridad → sin descuentos inventados, sin presión
- ✔ Responder

---

## Ejemplo 4 — Señal médica (el flujo se detiene)

**Cliente:** "Tomo pastillas para la presión, ¿puedo tomar el café con Reishi igual?"

**Motor:**
- ✔ Comprender la intención → pregunta sobre interacción con medicamento
- ✔ Aplicar [`prioridades.md`](./prioridades.md) → Seguridad, nivel 1, gana sobre cualquier otro paso
- ✖ Identificar perfil / consultar clientes / consultar productos → *se omiten deliberadamente, no aplica continuar la venta*
- ✔ Aplicar [`reglas_de_seguridad.md`](./reglas_de_seguridad.md) → remitir a un profesional de salud
- ✔ Consultar conversaciones → tono de [`docs/conversaciones/objeciones/mi_medico_no_me_deja.md`](../conversaciones/objeciones/mi_medico_no_me_deja.md)
- ✔ Construir respuesta → derivación, no recomendación de producto
- ✔ Validar seguridad → confirma que no hay ninguna afirmación médica ni indicación implícita
- ✔ Responder

---

## Ejemplo 5 — Señal de emprendimiento

**Cliente:** "Ya llevo un mes tomando el té y me encantó, se lo recomendé a mi hermana. ¿Cómo le hago para vender yo también?"

**Motor:**
- ✔ Comprender la intención → satisfacción confirmada + pregunta directa sobre el negocio
- ✔ Identificar objetivo → interés en la oportunidad, no en otro producto
- ✔ Consultar proceso_de_venta → evalúa contra [`docs/proceso_de_venta/emprendimiento.md`](../proceso_de_venta/emprendimiento.md); la señal es válida (pregunta directa + recomendación espontánea)
- ✔ Consultar clientes → [`docs/clientes/emprendimiento.md`](../clientes/emprendimiento.md)
- — Consultar productos → *no aplica, esta rama no es de producto*
- ✔ Consultar conversaciones → [`docs/conversaciones/emprendimiento/invitacion_cliente_satisfecho.md`](../conversaciones/emprendimiento/invitacion_cliente_satisfecho.md)
- ✔ Construir respuesta
- ✔ Validar seguridad → sin cifras de ingreso inventadas (ver [`reglas_de_seguridad.md`](./reglas_de_seguridad.md))
- ✔ Responder

---

## Qué mostrar y qué no mostrar en la práctica

Estos ejemplos son para quien diseña o revisa el comportamiento del agente — **no es el formato en que el agente piensa de cara al cliente.** El cliente nunca ve esta lista de pasos; solo ve la respuesta final construida en el paso 9.

---
[🏠 Índice de Agente IA](./README.md)
