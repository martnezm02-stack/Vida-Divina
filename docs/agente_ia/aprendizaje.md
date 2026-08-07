# Aprendizaje

[🏠 Índice de Agente IA](./README.md)

**Aclaración importante:** "aprendizaje" aquí no significa entrenamiento o ajuste estadístico de un modelo. Este agente no re-entrena pesos ni aprende automáticamente de cada conversación. "Aprendizaje" se refiere a cómo **evoluciona la base de conocimiento curada en `docs/`** con el tiempo — un proceso humano (o asistido por IA bajo supervisión humana), no un proceso de machine learning.

## Cómo se incorporan nuevos módulos

Siguiendo el procedimiento ya definido en [`CLAUDE.md#convenciones-del-proyecto`](../../CLAUDE.md#convenciones-del-proyecto), sección "Cómo deben crearse nuevos módulos": definir su responsabilidad única, verificar que no exista ya en otro módulo, conectarlo a `docs/proceso_de_venta/`, y agregar enlaces cruzados. Este archivo no repite ese procedimiento — solo confirma que `agente_ia/` debe actualizarse si el nuevo módulo cambia algo del ciclo de razonamiento (por ejemplo, si se agrega una nueva herramienta de búsqueda en [`herramientas.md`](./herramientas.md)).

## Cómo se integran nuevos productos

Un producto nuevo se agrega primero a `docs/productos/`, y solo después se evalúa si algún perfil de `docs/clientes/` debe actualizar su lista de "Productos recomendados" para incluirlo. El agente no necesita cambiar su razonamiento por esto — [`flujo_de_razonamiento.md`](./flujo_de_razonamiento.md) y [`herramientas.md`](./herramientas.md) siguen funcionando igual; solo cambia el contenido que consultan.

## Cómo se integran nuevos casos reales

Cuando exista el módulo `docs/casos_reales/` (ver roadmap de [`CLAUDE.md`](../../CLAUDE.md#roadmap)), los patrones que surjan de conversaciones reales (nuevas objeciones frecuentes, nuevas variantes de perfil) deberán primero **verificarse contra la arquitectura existente** — si ya hay un archivo que los cubre, se amplía ese archivo; si es genuinamente nuevo, se crea siguiendo las convenciones ya establecidas. Los casos reales nunca se usan para modificar directamente [`principios.md`](./principios.md) o [`reglas_de_seguridad.md`](./reglas_de_seguridad.md) sin revisión humana explícita — esos dos archivos son los más sensibles del sistema.

## Cómo evitar degradar la arquitectura

- Antes de agregar contenido nuevo, buscar primero si ya existe (regla ya establecida en [`CLAUDE.md#instrucciones-para-claude`](../../CLAUDE.md#instrucciones-para-claude)).
- Nunca agregar contenido de negocio (productos, perfiles, diálogos) dentro de `docs/agente_ia/` — si ocurre, es una señal de que el archivo se está usando incorrectamente y el contenido debe moverse a su módulo correspondiente.
- Cada cambio a un archivo de este módulo debe revisarse contra [`principios.md`](./principios.md) — un cambio que contradiga un principio inmutable no se acepta sin antes discutir si el principio mismo debe cambiar (lo cual es una decisión humana, no automática).
- Mantener la tabla de "Estado Actual del Proyecto" en `CLAUDE.md` sincronizada con la realidad — un módulo marcado como completo que ya no lo está es una forma silenciosa de degradación.

---
[🏠 Índice de Agente IA](./README.md)
