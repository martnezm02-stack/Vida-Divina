# Vida Divina — Marketing Intelligence MVP (Query + Ranking + Traceability)

**Fecha:** 31 de agosto de 2026
**Alcance:** capa de CONSULTA y RANKING sobre la inteligencia ya almacenada en `snapshot-2026-08-31`. **No se ejecutó ninguna investigación externa en esta tarea** — ver la sección "Confirmación" al final.

---

## 1. Qué existe y dónde vive

Nada nuevo se investigó ni se almacenó como dato. Esta capa **lee** lo que ya existía tras la Fase 1 (commit `f2e9507`, "Create marketing intelligence data foundation"):

```
docs/research/vida-divina-market-intelligence-2026-08-31.md          -- investigación legible por humanos
docs/research/vida-divina-marketing-intelligence-model-2026-08-31.md -- diseño del schema/store (Fase 1)
content-orchestrator/data/marketing-intelligence/snapshots/snapshot-2026-08-31/  -- 105 señales + 10 oportunidades (gitignored, regenerable)
content-orchestrator/src/marketingIntelligence/seedData/snapshot-2026-08-31.js  -- fuente de verdad versionada
```

Esta tarea añade una capa de **funciones sobre esos mismos datos**, sin tocar el store ni el schema de la Fase 1:

```
content-orchestrator/src/marketingIntelligence/
├── productCatalog.js    -- mapeo productId -> category (9 productos), reutilizado por ranking
├── staleness.js          -- classifySignalStaleness(): ACTIVE / STALE / ARCHIVED
├── rankingConfig.js       -- marketingIntelligenceRankingConfig (única fuente de pesos)
├── ranking.js             -- determineProductFit(), computeIntelligenceScore()
└── queryService.js        -- API interna: getMarketingIntelligence, getProductIntelligence,
                              getAudienceIntelligence, getTrendIntelligence,
                              getCreativeOpportunities, listSnapshots, getSnapshot, compareSnapshots
```

---

## 2. Qué significa "API" aquí

**Interfaz interna del módulo** — funciones JS exportadas que otro código de Vida Divina puede importar y llamar directamente (`import { getProductIntelligence } from '.../queryService.js'`), **no** un endpoint HTTP. No se creó ningún servidor ni ruta nueva — ver sección 8 ("Dashboard opcional — decisión: no implementado").

```js
import { getProductIntelligence } from 'content-orchestrator/src/marketingIntelligence/queryService.js';
const venus = getProductIntelligence('venus-capsules');
```

---

## 3. Schema — sin cambios respecto a la Fase 1

`claimType` (FACT/SIGNAL/INFERENCE/RECOMMENDATION), `evidenceLevel` (HIGH..LOW) y su mapeo fijo a `confidence` (0.8/0.65/0.5/0.35/0.2) se mantienen **exactamente** como se definieron en `schema.js` de la Fase 1 — ninguna función de consulta los recalcula ni los eleva. Ver `vida-divina-marketing-intelligence-model-2026-08-31.md` para el detalle completo del schema de las 14 entidades.

---

## 4. Query interface

### `getMarketingIntelligence(filters)`
Función base — todas las demás se apoyan en ella.

```js
getMarketingIntelligence({ productId: 'venus-capsules' })
getMarketingIntelligence({ category: 'intimidad-libido' })
getMarketingIntelligence({ audience: 'women-35-plus' })
getMarketingIntelligence({ productId: 'tongkat-ali-cafe', limit: 10 })
```

Filtros soportados: `snapshotId` (por defecto, el más reciente), `productId`, `category`, `audience`, `type`, `source`, `evidenceLevel`, `minConfidence`, `timeWindow`, `signalStrength`, `staleness`, `tag`, `limit`. Resultado: señales rankeadas por `intelligenceScore` descendente, cada una con `staleness`, `productFit`, `relevance` e `intelligenceScore` añadidos (además de todos sus campos originales — nunca se pierde trazabilidad).

### `getProductIntelligence(productId, opts)`
Devuelve, rankeado, un bucket por tipo de señal relevante al producto: `trends`, `audienceSignals`, `painPoints`, `desires`, `objections`, `hookPatterns`, `contentPatterns`, `creativeAngleSignals`, `competitorSignals`, `creatorSignals`, `purchaseTriggers`, `brandSignals`, `regulatoryRisks`, `catalogDiscrepancies`, `creativeOpportunities`.

Incluye señales de tres niveles (ver `ranking.js#determineProductFit`, sección 18 del encargo):
- **DIRECT_PRODUCT** — la señal ya tiene ese `productId` exacto.
- **CATEGORY** — la señal no tiene `productId`, pero su `category` coincide con la del producto (ej. una tendencia de "café funcional" aplica a los 4 productos de `cafe-divina`).
- **GENERAL** — señales transversales por diseño (regulatorio, marca, patrones de hook/contenido genéricos) — aplican a cualquier producto, con menor peso en el ranking.

Nunca inventa una relación producto-señal que no exista en los datos — una señal de `cafe-divina` nunca aparece en la consulta de `venus-capsules` (verificado en `test/marketingIntelligenceQuery.test.js`).

### `getAudienceIntelligence(audience, opts)`
`painPoints`, `desires`, `objections`, `relevantTrends`, `contentPatterns`, `creativeOpportunities` — filtrados por coincidencia exacta de `audience`.

### `getTrendIntelligence(filters)`
Tendencias con `direction` (RISING/STABLE/DECLINING/EMERGING, tomado de `details.direction` ya guardado en la Fase 1 — nunca inferido de nuevo), `confidence`, `evidence`, productos/categorías afectados.

### `getCreativeOpportunities(opts)`
Las 10 oportunidades de la Fase 1, rankeadas por `intelligenceScore`, cada una con una `explanation`:

```js
{ what, why, forWhom, product, evidence /* señales resueltas con source+evidenceLevel+rawReference */, confidence, creativeUse /* angle, hookPattern, contentPattern -- YA EXISTENTES, no generados aquí */ }
```

**No genera copy creativo** (sección 21 del encargo) — `creativeUse` reexpone campos que ya existían en la `CreativeOpportunity` desde la Fase 1.

### `listSnapshots()` / `getSnapshot(snapshotId)` / `compareSnapshots(a?, b?)`
`getSnapshot` agrega conteos por tipo sin recalcular el store. `compareSnapshots` diffea dos snapshots por `dedupeKey` (NEW / DISAPPEARED / RISING / DECLINING / STABLE) — con un solo snapshot existente hoy, responde honestamente:

```json
{ "comparisonAvailable": false, "reason": "comparison unavailable — only one snapshot exists", "snapshotsFound": ["snapshot-2026-08-31"] }
```

---

## 5. Ranking — `intelligenceScore` (0.0–1.0, no es una métrica científica)

Pesos centralizados en `rankingConfig.js` (sección 14 del encargo — un único lugar, nunca repartidos):

| Componente | Peso | Fuente |
|---|---|---|
| relevance | 0.30 | `productFit` si hay `productId` objetivo; 1.0 en otro caso (el filtro previo ya decidió la coincidencia) |
| confidence | 0.25 | `signal.confidence` tal cual (nunca recalculado) |
| recency | 0.15 | `staleness` → ACTIVE=1.0 / STALE=0.5 / ARCHIVED=0.15 |
| signalStrength | 0.15 | LOW/MEDIUM/HIGH → 0.3/0.6/1.0 |
| productFit | 0.15 | DIRECT_PRODUCT=1.0 / CATEGORY=0.6 / GENERAL=0.3 |

Determinista: mismos inputs (incluida la fecha `now`, inyectable) → mismo score siempre. Verificado en tests (`marketingIntelligenceQuery.test.js`).

### Recency / Staleness (`staleness.js`)
`ACTIVE` / `STALE` / `ARCHIVED` según edad de `capturedAt` relativa a `timeWindow` (30d/90d decaen rápido; `not_time_bound` — hechos estructurales como marco regulatorio o fundación de la empresa — decae mucho más lento). **Nunca borra señales** — solo las clasifica; se pueden seguir consultando explícitamente con `staleness: 'ARCHIVED'`.

### Cross-source (`crossSourceConfirmed`, `independentSourceCount`, `sourceCount`)
Heredados de la Fase 1 (deduplicación en `upsertSignal`) — se usan tal cual en `signalStrength`, nunca se inventa una confirmación cruzada que no exista.

### Deduplicación
No se crean señales nuevas en esta tarea — la deduplicación por `dedupeKey` ya ocurrió al ingerir el snapshot en la Fase 1. Esta capa de consulta lo verifica (`test`: "no hay dos señales con el mismo dedupeKey en el resultado") pero no vuelve a fusionar nada.

---

## 6. Governance (sin cambios)

- `claimType` nunca se degrada ni se asciende al consultar — una señal `INFERENCE` sigue siendo `INFERENCE` en cualquier resultado de `getMarketingIntelligence`.
- Ninguna señal de mercado ("la gente busca X") se convierte en claim autorizado ("Vida Divina puede afirmar X") — esta capa **solo almacena y ordena inteligencia**, no autoriza nada. Esa distinción es responsabilidad de quien consuma la señal, no de esta capa.
- `CatalogDiscrepancy` y `RegulatoryRisk` se mantienen consultables tal cual, sin tocar `docs/productos/` ni Claim Safety.
- La señal de colisión de nombre "Vida Divina" con contenido religioso sigue almacenada como `BrandSignal` con `tags: ['BRAND_SEARCH_DISAMBIGUATION']` y `details.subtype: 'BRAND_SEARCH_DISAMBIGUATION'` — consultable vía `getMarketingIntelligence({ type: 'BrandSignal', tag: 'BRAND_SEARCH_DISAMBIGUATION' })`. No se implementó en ningún buscador externo.

---

## 7. Limitaciones (heredadas, no elevadas)

Ningún hallazgo alcanza HIGH confidence en sentido estricto (heredado de la Fase 1 — ver sección 20 del reporte de investigación). Esta capa de ranking **no cambia esa realidad**: `intelligenceScore` alto significa "bien rankeado dentro de lo disponible", no "certeza científica". El `manifest.json` del snapshot sigue documentando qué fuentes de `last30days` funcionaron y cuáles no.

---

## 8. Dashboard opcional — decisión: no implementado

El encargo permite (opcionalmente) una vista mínima de lectura si ya existe una ubicación administrativa adecuada, sin construir un dashboard nuevo. Existe `dashboard/` (Operation Dashboard), pero es una **single-page app** (`public/app.js`, un solo archivo grande con el enrutado de pestañas del cliente) — no páginas HTML independientes por feature. Añadir una vista ahí exigiría editar ese archivo compartido y grande sin poder verificarlo visualmente en este entorno (herramienta de navegador controlado deshabilitada por preferencia del usuario). Dado que la vista es explícitamente opcional y el objetivo central de esta tarea es la capa de consulta (sección 56 del encargo), se decidió **no implementarla** para no arriesgar una regresión en un archivo compartido grande a cambio de una entrega opcional. Por la misma razón (sección 38: "no crear endpoints HTTP solo para cumplir la palabra API" — sin una UI real que los necesite), tampoco se agregó una ruta HTTP nueva en `dashboard/server/routes/`. Nota para evitar colisión futura: `/api/intelligence` ya está tomado por `marketing-intelligence-engine/` (Marketing Insight derivado de performance/atribución) — un futuro endpoint de esta capa debería usar un path distinto, ej. `/api/marketing-research`.

---

## 9. Actualización futura — SOLO documentado, no implementado

En una fase posterior e independiente:

```
last30days → nuevo snapshot (snapshot-YYYY-MM-DD) → ingest (mismo patrón que
ingestMarketingIntelligenceSnapshot20260831.mjs) → dedupe (upsertSignal, ya
implementado) → ranking (ya implementado, funciona sobre cualquier snapshot)
→ compareSnapshots(snapshotAnterior, snapshotNuevo) para ver qué señales son
NEW / RISING / DECLINING / DISAPPEARED
```

Todo el código de ranking/consulta ya funciona para múltiples snapshots (`compareSnapshots`, `listSnapshots`) — lo único que falta para esa fase futura es el script de ingesta del nuevo snapshot, que **no se crea en esta tarea** (secciones 2, 50 del encargo).

---

## 10. Tests

32 tests nuevos en `content-orchestrator/test/marketingIntelligenceQuery.test.js` (además de los 42 de la Fase 1 — 74 en total para el módulo), cubriendo: filtros por producto/audiencia/categoría/tipo, determinismo y límites del ranking, preservación exacta de confidence, staleness/recency, cross-source, product fit (incluida la exclusión de señales de otro producto), deduplicación a nivel de consulta, `getProductIntelligence` para Venus y Tongkat Ali con datos reales, `getAudienceIntelligence`, `getTrendIntelligence`, `getCreativeOpportunities` con explicación y trazabilidad completas, snapshots, `compareSnapshots` (caso honesto de "solo un snapshot"), gobernanza de `claimType`, y trazabilidad de toda señal a `source`/`rawReference`.

```
node --test "test/marketingIntelligence*.test.js"
# 74 passing
```

---

## Confirmación

- **last30days executed in this task:** NO
- **external research executed in this task:** NO
- **new snapshot created:** NO — todo se consulta sobre `snapshot-2026-08-31`, sin modificarlo.

*No se conectó esta capa a Creative Director, Hook Intelligence, Claim Relevance, Creative Structure ni Visual Scene Brief. No se modificó `docs/productos/`, Claim Safety, `marketing-intelligence/` ni `marketing-intelligence-engine/`.*
