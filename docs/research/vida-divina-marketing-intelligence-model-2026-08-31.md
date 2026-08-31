# Vida Divina — Modelo de Datos de Marketing Intelligence (Fase 1)

**Fecha:** 31 de agosto de 2026
**Snapshot:** `snapshot-2026-08-31`
**Estado:** capa de datos implementada y poblada. **No conectada** a Creative Director, Hook Intelligence, Claim Relevance ni Creative Structure — eso es una fase posterior explícitamente fuera de alcance aquí.
**Fuente de origen:** [`docs/research/vida-divina-market-intelligence-2026-08-31.md`](./vida-divina-market-intelligence-2026-08-31.md) (reporte de investigación completo, `last30days` v3.21.1 + WebSearch).

Este documento explica la estructura de datos construida para convertir ese reporte en inteligencia estructurada y reutilizable: entidades, schema, confidence, fuentes, snapshot, consumo futuro y gobernanza.

---

## 1. Gobernanza — por qué esta es una capa nueva, no una extensión de las existentes

Antes de implementar se auditaron dos sistemas ya existentes en el repo (ninguno documentado en `CLAUDE.md`, que solo cubre la capa de `docs/`) para evitar duplicar conocimiento:

| Sistema existente | Qué es | Por qué no es un encaje |
|---|---|---|
| `marketing-intelligence/` | "Internet Access Layer" — Fase 2 del MVP. Adapters Web/RSS/GitHub, heurísticas de **regex sobre texto crudo** (ej. detectar `?` en la apertura → hook tipo "pregunta"), pipeline Observación→Inferencia→Hipótesis. Su propio `package.json` declara explícitamente: *"No conecta X, Meta, Reddit ni LinkedIn en esta fase."* | Nunca ingirió señales sociales (justo lo que este snapshot aporta). Su modelo de confianza es un score fijo por regla de texto, no evidencia cruzada entre fuentes. Su `exports/phase9/objections.json` está vacío (`[]`); su `hooks.json` tiene solo 2 entradas, en inglés, de scraping web directo — madurez de datos muy distinta a la de este snapshot. |
| `marketing-intelligence-engine/` | Fase 8 del roadmap — motor interno de **performance/atribución** (CONTENT→PUBLICATION→PERFORMANCE→ATTRIBUTION→...). Consume Performance Analysis Engine y Attribution Engine ya existentes, no hace research externo. | Resuelve un problema distinto (medir contenido ya publicado), no research de mercado externo. |

**Decisión (confirmada explícitamente con el dueño del negocio antes de implementar):** crear una tercera capa, independiente, bajo `content-orchestrator/src/marketingIntelligence/` + `content-orchestrator/data/marketing-intelligence/`, sin modificar ninguno de los dos sistemas existentes. Los tres sistemas coexisten con responsabilidades distintas y no se duplican entre sí. Una consolidación deliberada (ej. migrar `marketing-intelligence/` para que también consuma señales sociales con este mismo schema) queda como decisión futura del dueño del negocio, no de este trabajo.

---

## 2. Las 14 entidades

13 entidades pedidas por el encargo + `CatalogDiscrepancy`, añadida porque la sección 30 del encargo pide explícitamente "registrar separadamente" las discrepancias de catálogo — estructuralmente son distintas (comparan una señal externa contra un dato interno verificado), no encajan como una señal más de las 13.

`TrendSignal` · `AudienceSignal` · `PainPoint` · `DesireSignal` · `Objection` · `HookPattern` · `ContentPattern` · `CreativeAngleSignal` · `CompetitorSignal` · `CreatorSignal` · `PurchaseTrigger` · `BrandSignal` · `RegulatoryRisk` · `CatalogDiscrepancy`

Además, `CreativeOpportunity` (sección 42 del encargo) como entidad separada de nivel superior: no es una señal observada, es un puente conceptual señal→oportunidad que referencia una o más señales por id.

---

## 3. Schema común (`content-orchestrator/src/marketingIntelligence/schema.js`)

Toda señal comparte estos campos de gobernanza (sección 6 del encargo):

```
id, dedupeKey, type, title, description, productId, category, audience,
source, sourceUrl, sourceType, capturedAt, timeWindow, signalStrength,
evidenceLevel, confidence, claimType, engagement, recency, observation,
whyItMatters, tags, sourceCount, independentSourceCount,
crossSourceConfirmed, rawReference, details, createdAt
```

Campos que la evidencia real no cubre quedan en `null`/`[]` — nunca se rellenan por completitud (sección 6: "no rellenar campos que no existan en la evidencia").

### `claimType` vs. `evidenceLevel` — ejes distintos, ambos obligatorios
- **`claimType`**: `FACT` / `SIGNAL` / `INFERENCE` / `RECOMMENDATION` — qué tipo de afirmación es.
- **`evidenceLevel`**: `HIGH` / `MEDIUM-HIGH` / `MEDIUM` / `LOW-MEDIUM` / `LOW` — qué tan bien respaldada está (se conservan las combinaciones intermedias tal como las asignaron los agentes de investigación, no se fuerzan a solo tres valores).

`createSignal()` lanza si falta cualquiera de los dos — nunca se guarda una señal sin declarar ambos ejes explícitamente.

### `sourceType`
`OFFICIAL` / `SOCIAL` / `WEB` / `USER_GENERATED` / `RESEARCH` / `INTERNAL` / `INFERENCE`.

### `confidence` — mapeo fijo, no precisión inventada

Sección 9 del encargo: *"no inventar precisión falsa."* En vez de que cada señal reciba un número de confianza juzgado caso por caso (lo cual sería inventar precisión), `confidenceFromEvidenceLevel()` aplica una conversión **fija y documentada**, igual para las 105 señales del snapshot:

| evidenceLevel | confidence |
|---|---|
| HIGH | 0.8 |
| MEDIUM-HIGH | 0.65 |
| MEDIUM | 0.5 |
| LOW-MEDIUM | 0.35 |
| LOW | 0.2 |

Cambiar este mapeo cambia la confidence de **todas** las señales por igual — nunca se ajusta una señal individual.

### `signalStrength` — etiqueta relativa, no score científico

Sección 10: *"no presentarlo como métrica científica."* `deriveSignalStrength()` deriva una etiqueta `LOW`/`MEDIUM`/`HIGH` de forma transparente a partir de `evidenceLevel` + `crossSourceConfirmed` (¿2+ fuentes independientes?) — nunca un cálculo con pesos arbitrarios.

### Deduplicación (`upsertSignal`, sección 32)

Un `dedupeKey` estable (hash de `type::title` normalizado) permite que la misma señal encontrada por más de una fuente **se fusione** en vez de duplicarse: `sourceCount` e `independentSourceCount` se incrementan, `crossSourceConfirmed` se recalcula, y **`evidenceLevel`/`confidence` del registro original nunca se elevan** al fusionar — probado explícitamente en `test/marketingIntelligenceSignalStore.test.js`.

---

## 4. Snapshot y almacenamiento

```
content-orchestrator/
├── src/marketingIntelligence/
│   ├── schema.js                    -- contrato + validación + confidence/signalStrength
│   ├── signalStore.js               -- persistencia de señales, dedup, query, index
│   ├── snapshotStore.js             -- manifest de snapshot (inmutable, histórico)
│   ├── creativeOpportunityStore.js  -- CreativeOpportunity (referencia señales existentes)
│   └── seedData/snapshot-2026-08-31.js  -- FUENTE DE VERDAD VERSIONADA (curada del reporte)
├── ingestMarketingIntelligenceSnapshot20260831.mjs  -- puebla data/ desde seedData/
└── data/marketing-intelligence/snapshots/snapshot-2026-08-31/
    ├── manifest.json
    ├── index.json
    ├── signals/<uuid>.json          -- 105 archivos
    └── opportunities/<uuid>.json    -- 10 archivos
```

**Importante:** `content-orchestrator/data/` está en `.gitignore` (mismo patrón que `content-planning/data/`, `creative-intelligence/data/`, `marketing-intelligence/data/`, etc. en este repo — son artefactos regenerables, no fuente de verdad versionada). Por eso la fuente de verdad real y **versionada en git** de este snapshot es `seedData/snapshot-2026-08-31.js` — un módulo JS legible y revisable en diffs de git, no un blob de datos opaco. Correr `node ingestMarketingIntelligenceSnapshot20260831.mjs` regenera `data/marketing-intelligence/` desde ahí, de forma idempotente (verificado con dos corridas consecutivas: la segunda no duplica nada).

### Snapshots históricos (sección 37-38)

`snapshotId` sigue el patrón obligatorio `snapshot-YYYY-MM-DD`. `createSnapshot()` es idempotente por id (nunca sobrescribe uno existente) y `listSnapshots()` permite que futuros snapshots (`snapshot-2026-09-30`, etc.) coexistan para comparación 30d vs. 90d vs. histórico — probado en `test/marketingIntelligenceSignalStore.test.js`.

---

## 5. Consultas soportadas hoy (sección 36)

`querySignals(snapshotId, { type, productId, category, audience, sourceType, minConfidence, timeWindow, platform, tag })` — proyección en memoria sobre las señales de un snapshot. Responde directamente preguntas como:

- *"¿Qué tendencias recientes existen para Venus?"* → `querySignals('snapshot-2026-08-31', { productId: 'venus-capsules', type: 'TrendSignal' })`
- *"¿Qué objeciones existen sobre suplementos de bienestar femenino?"* → `querySignals(..., { productId: 'venus-capsules', type: 'Objection' })`
- *"¿Qué hooks tienen alta señal para café funcional masculino?"* → `querySignals(..., { productId: 'tongkat-ali-cafe', type: 'HookPattern', tag: 'high-signal' })`
- *"¿Qué competidores están ocupando este territorio?"* → `querySignals(..., { type: 'CompetitorSignal', category: 'cafe-divina' })`

No se implementó (deliberadamente, sección 36: *"no implementar todavía el motor de consulta completo si no es necesario"*) un lenguaje de consulta más rico (rangos de fecha, búsqueda de texto libre, agregaciones custom) — `querySignals` + `buildIndex()`/`index.json` son suficientes para el volumen actual (105 señales) y dejan la estructura preparada para crecer.

---

## 6. Contenido del snapshot `snapshot-2026-08-31`

105 señales + 10 oportunidades creativas + 3 discrepancias de catálogo, todas trazables a una sección específica del reporte de origen vía `rawReference`.

| Tipo | Cantidad |
|---|---|
| CreatorSignal | 13 |
| HookPattern | 12 |
| CompetitorSignal | 10 |
| ContentPattern | 10 |
| BrandSignal | 10 |
| RegulatoryRisk | 8 |
| TrendSignal | 7 |
| PainPoint | 7 |
| Objection | 7 |
| CreativeAngleSignal | 5 |
| PurchaseTrigger | 5 |
| AudienceSignal | 4 |
| DesireSignal | 4 |
| CatalogDiscrepancy | 3 |
| **Total señales** | **105** |
| CreativeOpportunity | 10 |

**Cobertura deliberadamente no exhaustiva:** este snapshot prioriza las secciones estructuradas y de mayor confianza del reporte (tablas de competidores/creadores/regulatorio/objeciones, top 10 de oportunidades/riesgos/señales de contenido, hallazgos de marca y producto con evidencia clara). No transcribe cada oración del reporte — la sección 15 del reporte ("Top 10 Señales de Inteligencia de Mercadeo", meta-señales sobre cómo mejorar el propio proceso de research) se documenta como texto en el reporte original y no como registros de datos, porque son recomendaciones sobre el proceso de research, no señales de mercado observadas.

---

## 7. Confianza y limitaciones (preservadas del reporte, no elevadas)

Sección 48 del encargo: la limitación de confianza del reporte original se preserva sin cambios. **Ningún hallazgo de este snapshot alcanza HIGH confidence en sentido estricto** (3+ fuentes primarias completamente independientes) — los vacíos de Instagram y el rate-limit de Reddit capan lo alcanzable en esta ronda. Ver la sección 20 del reporte de investigación para el detalle completo; el manifest del snapshot (`manifest.json`) conserva un resumen de qué fuentes funcionaron y cuáles no.

---

## 8. Consumo futuro (sección 40) — quién podría leer esto después

Explícitamente **no conectado todavía**:

- **Hook Intelligence** — podría leer `querySignals(..., { type: 'HookPattern' })`, filtrando por `details.saturationLevel` para evitar patrones saturados.
- **Creative Angle Selector** — `CreativeAngleSignal` + `CreativeOpportunity` ya están estructurados para alimentar selección de ángulo por producto/audiencia.
- **Claim Relevance** — `RegulatoryRisk` y `CatalogDiscrepancy` son candidatos a señal de entrada, pero **nunca deben interpretarse como cambios al Claim Safety existente** sin revisión humana explícita.
- **Creative Structure** — `ContentPattern` (formato) + `HookPattern` (apertura) juntos podrían informar una estructura de guion.
- **Content Calendar** — `PurchaseTrigger` con anclas estacionales (ej. "regreso a clases").
- **Marketing Intelligence Engine** (`marketing-intelligence-engine/`) — en una consolidación futura deliberada, podría incorporar `BrandSignal`/`CompetitorSignal` como una fuente más de contexto, sin que esto implique fusionar los sistemas ahora.

## 9. Qué NO debe alimentar nada automáticamente (sección 43)

Excluido de cualquier consumo automático futuro: rumores, claims médicos no verificados, opiniones aisladas de baja confianza, contenido de competidores (solo como contexto, nunca como plantilla a copiar), y cualquier dato no corroborado. `claimType: 'INFERENCE'` y señales con `evidenceLevel: 'LOW'` requieren revisión humana explícita antes de influir cualquier pieza de contenido — el schema los distingue pero no los filtra automáticamente; ese filtro es responsabilidad de quien consuma la señal, no de esta capa de almacenamiento.

---

## 10. Puente conceptual señal → oportunidad creativa (secciones 41-42)

```
Research (last30days + WebSearch)
  → Insight (reporte docs/research/..., etiquetado FACT/SIGNAL/INFERENCE/RECOMMENDATION)
  → Signal (esta capa: 105 registros estructurados y consultables)
  → CreativeOpportunity (10 registros, cada uno referenciando 1+ señales reales)
  → [Estrategia Creativa / Variante / Producción / Performance / Aprendizaje -- FUERA DE ALCANCE AQUÍ]
```

`CreativeOpportunity` nunca se crea sin al menos una señal real de respaldo (`saveOpportunity()` lanza si `signalIds` está vacío o referencia una señal inexistente) — la trazabilidad fuente→evidencia→señal→recomendación (sección 51) es una invariante de código, no solo una convención de documentación.

---

## 11. Tests (sección 50)

42 pruebas en `content-orchestrator/test/marketingIntelligence*.test.js`, cubriendo: validación de schema (los 14 tipos, campos obligatorios, enums), preservación de confidence (nunca se eleva), deduplicación, metadata de fuente, asociación por producto/categoría/audiencia, snapshots históricos coexistentes, y una prueba de integración que ingiere el dataset curado real completo y valida su integridad estructural (trend signals, hook patterns, objections, regulatory risks, catalog discrepancies, opportunities, idempotencia).

```
node --test "test/marketingIntelligence*.test.js"
# 42 passing
```

---

*Documento de diseño e implementación de Fase 1. No conecta esta capa a ningún sistema creativo existente — esa integración es una fase posterior explícitamente fuera de alcance. No se modificó `docs/productos/`, no se modificó el sistema de Claim Safety, no se modificaron `marketing-intelligence/` ni `marketing-intelligence-engine/`.*
