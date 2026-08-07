# Roadmap

[🏠 Índice de Agente IA](./README.md)

Cómo se espera que evolucione **este módulo específico** — no el roadmap general del proyecto (esos módulos futuros, `agente_ia/` incluido como ya construido, están en [`CLAUDE.md#roadmap`](../../CLAUDE.md#roadmap)). Aquí se documenta cómo el Motor Cognitivo mismo puede profundizarse una vez que otras piezas de la arquitectura existan.

## Evolución prevista

- **Cuando exista `docs/casos_reales/`:** las reglas de [`reglas_de_decision.md`](./reglas_de_decision.md) y los ejemplos de [`ejemplos.md`](./ejemplos.md) podrán ampliarse con patrones observados en conversaciones reales — siempre verificando primero que no dupliquen una regla ya existente (ver [`aprendizaje.md`](./aprendizaje.md)).
- **Cuando exista `docs/crm/`:** los principios de [`memoria.md`](./memoria.md) (qué recordar dentro de una conversación) podrán formalizarse en un modelo de datos persistente entre conversaciones — este archivo seguiría siendo la fuente de los principios; el CRM sería la implementación técnica.
- **Cuando exista `docs/automatizaciones/`:** [`herramientas.md`](./herramientas.md) podrá dejar de ser conceptual y convertirse en la referencia directa de funciones/tools reales implementadas — sin cambiar su responsabilidad (seguir definiendo *cuándo* usar cada una).
- **Cuando exista `docs/embudos/`:** [`reglas_de_decision.md`](./reglas_de_decision.md) podría necesitar nuevas categorías de postura cognitiva si aparecen campañas o flujos de marketing con dinámicas distintas a la venta consultiva 1 a 1 ya cubierta.
- **Métricas en producción:** una vez que [`metricas.md`](./metricas.md) se pueda medir con datos reales (no solo definir conceptualmente), sus resultados son la señal principal para decidir qué archivo de este módulo — o de `docs/clientes/`, `docs/productos/`, `docs/conversaciones/`, `docs/objeciones/` — necesita ajuste.
- **Multi-idioma / multi-mercado:** si Vida Divina se expande a otro idioma o mercado, este módulo (identidad, principios, reglas de seguridad) es candidato a mantenerse como núcleo común, mientras que `docs/conversaciones/` y `docs/clientes/` podrían necesitar variantes localizadas — a evaluar cuando ese escenario sea real, no antes.

## Qué NO cambia con esta evolución

Los [`principios.md`](./principios.md) y las [`reglas_de_seguridad.md`](./reglas_de_seguridad.md) son la parte más estable de este módulo por diseño — cualquier futura versión de `docs/agente_ia/` debería poder cambiar sus herramientas, sus métricas o su flujo de razonamiento sin tocar estos dos archivos, salvo decisión humana explícita y deliberada.

## Principio de esta evolución

Igual que el resto del proyecto, este módulo crece por necesidad real, no por anticipación — ningún ítem de esta lista se construye hasta que la pieza de la que depende (casos reales, CRM, automatizaciones, embudos) exista primero.

---
[🏠 Índice de Agente IA](./README.md)
