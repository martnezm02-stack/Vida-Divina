# Base de Conocimiento — Objeciones Vida Divina

> Módulo de referencia sobre **por qué surgen las objeciones y cómo abordarlas estratégicamente** — el "por qué" y el "cómo pensar" detrás de cada resistencia de venta. Complementa a [`docs/conversaciones/objeciones/`](../conversaciones/objeciones/index.md), que contiene el diálogo de ejemplo completo (Cliente/Asesor) para cada una.
>
> ¿Buscas cuándo se activa este módulo dentro de una venta? Ver [`docs/proceso_de_venta/manejo_de_objeciones.md`](../proceso_de_venta/manejo_de_objeciones.md) y la tabla de señales en [`docs/proceso_de_venta/reglas_de_decision.md`](../proceso_de_venta/reglas_de_decision.md).

---

## Diferencia con `docs/conversaciones/objeciones/`

Este proyecto ya tenía un módulo de objeciones dentro de Conversaciones, con formato de guion (`Objetivo / Momento del embudo / Conversación ejemplo / Variantes / Qué hacer después / Qué NO decir / Notas comerciales`). Ese módulo sigue siendo la fuente de los **diálogos reales**.

`docs/objeciones/` es una capa distinta y complementaria: un análisis más profundo de **cada objeción como fenómeno** — por qué el cliente la plantea, cómo pensar la estrategia de respuesta, y qué productos tienen sentido ofrecer según el caso. Sirve como "por qué detrás del guion", útil tanto para entrenar a un asesor nuevo como para que una IA entienda el razonamiento, no solo la frase a repetir.

| | `docs/objeciones/` (este módulo) | `docs/conversaciones/objeciones/` |
|---|---|---|
| Enfoque | Por qué surge, cómo pensarla, qué evitar | Diálogo de ejemplo Cliente/Asesor |
| Formato | Reference (análisis) | Script (conversación) |
| Uso típico | Entender la objeción antes de responder | Copiar el tono/estructura de una respuesta real |

Cada archivo de este módulo enlaza al diálogo correspondiente, y viceversa.

---

## Reglas de este módulo (heredadas de Conversaciones)

Para no duplicar contenido, las reglas generales (sin afirmaciones médicas, sin técnicas de presión, precios no especificados en el catálogo, tono consultivo) están centralizadas en [`docs/conversaciones/README.md#reglas-generales-aplican-a-todo-el-módulo`](../conversaciones/README.md#reglas-generales-aplican-a-todo-el-módulo) y aplican íntegramente aquí también.

---

## Metodología de priorización

Igual que en Conversaciones, no se construyeron todas las objeciones posibles de una sola vez. Esta primera versión prioriza las 4 objeciones más transversales y frecuentes, pedidas explícitamente: **está caro, lo voy a pensar, no creo en suplementos, no tengo dinero**. El resto queda documentado como pendiente, con la misma estructura lista para completarse.

## 📑 Índice de objeciones

| Objeción | Naturaleza | Archivo | Diálogo de ejemplo |
|---|---|---|---|
| "Está caro" | Percepción de valor | [esta_caro.md](./esta_caro.md) | [conversaciones/objeciones/esta_caro.md](../conversaciones/objeciones/esta_caro.md) |
| "Lo voy a pensar" | Postergación / objeción oculta | [lo_voy_a_pensar.md](./lo_voy_a_pensar.md) | [conversaciones/objeciones/lo_voy_a_pensar.md](../conversaciones/objeciones/lo_voy_a_pensar.md) |
| "No creo en suplementos" | Escepticismo de categoría | [no_creo_en_suplementos.md](./no_creo_en_suplementos.md) | [conversaciones/objeciones/no_creo_en_suplementos.md](../conversaciones/objeciones/no_creo_en_suplementos.md) |
| "No tengo dinero" | Limitación económica real | [no_tengo_dinero.md](./no_tengo_dinero.md) | [conversaciones/objeciones/no_tengo_dinero.md](../conversaciones/objeciones/no_tengo_dinero.md) |

## Pendientes (estructura lista, no construidas aún)

| Objeción | Ya tiene diálogo en Conversaciones | Nota |
|---|---|---|
| "Ya probé otros productos" | Sí — [ver diálogo](../conversaciones/objeciones/ya_probe_otros_productos.md) | Construir el análisis siguiendo la misma plantilla que los 4 archivos ya hechos. |
| "Mi médico no me deja" | Sí — [ver diálogo](../conversaciones/objeciones/mi_medico_no_me_deja.md) | Prioridad alta cuando se retome — es la objeción de mayor riesgo (no médica) del módulo. |
| "No tengo tiempo" | No | Construir ambos archivos (este + el diálogo) a la vez. |
| "No me gustan las ventas" | No | Específica de la rama [Emprendimiento](../conversaciones/emprendimiento/index.md). |
| "No quiero emprender" | No | Específica de la rama [Emprendimiento](../conversaciones/emprendimiento/index.md). |

---

## Formato de cada archivo

```
# Objeción — "..."
## La objeción
## Por qué suele surgir
## Cómo abordarla
## Qué evitar decir
## Posibles respuestas
## Enlaces a productos relevantes
## Cómo integrarlo en las conversaciones existentes
## Notas comerciales
```

## Notas de mantenimiento

- Al construir una objeción pendiente, crear primero (o verificar que exista) su diálogo en `docs/conversaciones/objeciones/`, y enlazar en ambos sentidos — este módulo nunca debe apuntar a un diálogo inexistente.
- Actualizar esta tabla y la de [`docs/conversaciones/objeciones/index.md`](../conversaciones/objeciones/index.md) cada vez que se agregue una objeción nueva.
- Ningún archivo de este módulo hace afirmaciones médicas ni promete resultados — ver [reglas generales](../conversaciones/README.md#reglas-generales-aplican-a-todo-el-módulo).
