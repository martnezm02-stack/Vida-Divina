# Creative Intelligence Layer — Vida Divina

Implementación de los **5 Pilares** del framework *AI Agentic Creative Ops 2026* (Persona → Pain → Angle → Format → Synthesis/CreativeCell/ProductionBrief), la taxonomía de evidencia (Data → Observation → Pattern → Learning → Recommendation) y la abstracción anti-copia de investigación competitiva. Módulo aislado, sin dependencias externas, sin conexión a ninguna API real todavía.

## 1. Arquitectura

```
Research (futuro: CustomerResearchSource / CompetitiveResearchSource)
   ↓
Persona (Pillar 1) ──→ Pain (Pillar 2) ──→ Angle (Pillar 3) ──→ Format (Pillar 4)
   ↓
CreativeCell (Pillar 5, síntesis) ──→ Hypothesis ──→ ProductionBrief
   ↓
PublishedContent (futuro: OwnPerformanceSource) ──→ PerformanceSnapshot ──→ Learning
```

## 2. Por qué es un módulo nuevo, no una carpeta dentro de `content-strategy/`

Antes de escribir código se inspeccionó `content-strategy/src/` completo. Ya existe ahí un vocabulario **distinto** que reutiliza las mismas palabras con significados diferentes:

| Palabra | En `content-strategy/` (Fase 13-14, existente) | En esta capa (5 Pilares) |
|---|---|---|
| `pillar` | `contentPillars.js` — 7 categorías editoriales (EDUCATION, FAQ...) | Los 5 Pilares del framework (Persona, Pain, Angle, Format, Synthesis) |
| `angle` | `angleVariants.js` — 7 variantes ligadas a detectores de `marketing-intelligence` | Narrative interpretation por awareness stage (Prompt 5) |
| `hook` | `hookVariants.js` — 7 variantes de apertura | 3-second opening direction dentro de `ProductionBrief` (Prompt 10) |
| `format` | `formatStructures.js` — bloques de una pieza (slideshow, static...) | La Format Library de 10 formatos del framework (Prompt 7) |

Ninguno de esos 4 archivos existentes fue tocado. Crear las entidades del framework dentro de `content-strategy/src/` habría producido dos significados distintos de "Angle"/"Format" en el mismo directorio — el riesgo real que motivó un módulo propio (`creative-intelligence/`), siguiendo el mismo patrón ya establecido en el proyecto para dominios de inteligencia aislados (`marketing-intelligence/`, `viral-content-intelligence/`, `performance-learning-intelligence/`, `website-intelligence/`).

## 3. Entidades — IMPLEMENTADO AHORA

| Entidad | Archivo | Pilar |
|---|---|---|
| Awareness (5 stages fijos) | `src/awareness.js` | 3 |
| Persona / SubPersona | `src/persona.js` | 1 (Prompt 1-2) |
| Pain | `src/pain.js` | 2 (Prompt 3-4) |
| Angle / Empty Cell | `src/angle.js` | 3 (Prompt 5-6) |
| Format Decision / Andromeda Risk | `src/format.js` | 4 (Prompt 7-8) |
| CreativeCell | `src/creativeCell.js` | 5 (Prompt 9) |
| Hypothesis | `src/hypothesis.js` | 5 (Prompt 9) |
| ProductionBrief | `src/productionBrief.js` | 5 (Prompt 10) |
| Evidence taxonomy (Data→Recommendation) | `src/evidenceTaxonomy.js` | — |
| Competitor Creative Record / Abstraction Record | `src/competitiveAbstraction.js` | — |
| Identificadores (PlatformMediaRef) | `src/identifiers.js` | — |
| Trazabilidad (Own Performance Loop) | `src/traceability.js` | — |

Todas las funciones `create*()` **validan y lanzan** ante cualquier violación de las reglas del framework — nunca construyen un objeto "silenciosamente inválido". `validate*()` revalida un objeto ya existente (útil para datos que llegan de una fuente externa futura).

## 4. FUTURO / PLACEHOLDER — nada de esto conecta con una API real

| Contrato | Archivo | Motor real de esta fase |
|---|---|---|
| `CompetitiveResearchSource` (Meta Ad Library) | `src/sources/competitiveResearchSource.js` | `NullCompetitiveResearchSource` — siempre devuelve `[]` |
| `CustomerResearchSource` (sales calls, reviews, Reddit, TikTok...) | `src/sources/customerResearchSource.js` | `NullCustomerResearchSource` — siempre devuelve vacío |
| `OwnPerformanceSource` (Instagram, Facebook, Meta Ads) | `src/sources/ownPerformanceSource.js` | `NullOwnPerformanceSource` — siempre devuelve `[]` |

Ninguno de los tres importa `fetch`, ninguno crea credenciales, ninguno toca `content-strategy/src/instagram*.js` (que permanecen exactamente como estaban, verificado por timestamp de archivo — ver reporte final). Conectar un motor real detrás de cada interfaz es un paso aislado y bien acotado para una fase futura autorizada — mismo patrón ya usado en el proyecto (`PerformanceSource`/`ManualPerformanceSource` en `performance-learning-intelligence`, `PublicationAdapter`/`MockPublicationBackend` en `content-strategy`).

`OwnPerformanceSnapshotShape` (documentado en `ownPerformanceSource.js`) ya es compatible campo por campo con lo que `instagramInsightsReader.js` devuelve hoy: `reach, likes, comments, saved, shares, total_interactions, views` — nunca `impressions`.

## 5. Evidence taxonomy

`src/evidenceTaxonomy.js` implementa `DATA → OBSERVATION → PATTERN → LEARNING → RECOMMENDATION`, con dos guardas centrales:

1. **Nunca se infiere** `sales`, `roas`, `cpa`, `conversions`, `realAudience` de un competidor — `createDataPoint()` lo rechaza salvo que el valor sea explícitamente `UNKNOWN`; `sanitizeCompetitiveMetrics()` sanea un registro que ya trae esos campos poblados.
2. **Competitive evidence nunca se convierte automáticamente en sales evidence** — `assertNoUnverifiedBusinessClaim()` rechaza un `Learning` que afirme un resultado de negocio basado únicamente en evidencia `COMPETITIVE`. El único camino sancionado para producir un `STRATEGIC_LEARNING` es `crossValidateWithOwnPerformance()`, que exige un `Pattern` de dominio `COMPETITIVE` **y** uno de dominio `OWN_PERFORMANCE` juntos — nunca uno solo.

## 6. Abstracción anti-copia (síntesis ciega)

`src/competitiveAbstraction.js` separa `CompetitorCreativeRecord` (evidencia cruda, con `caption`/`transcript`/`hook` literales) de `AbstractionRecord` (estructurado — `personaHypothesis`, `painHypothesis`, `mechanismFraming`, etc.). **`AbstractionRecord` no tiene, en su forma, ningún campo para texto literal** — `abstractFromRawRecord()` nunca copia `caption`/`transcript`/`hook` hacia el resultado, solo conserva una referencia (`observedEvidenceRef: { recordId, summary }`) al registro crudo. Verificado en tests: el caption/hook original nunca aparece en la serialización del `AbstractionRecord`.

## 7. Traceability

`src/traceability.js` responde las tres preguntas pedidas para el Own Performance Loop:

- **¿Qué hipótesis originó esta pieza?** → `traceOriginHypothesis(chain)`.
- **¿Qué resultado produjo? ¿Qué aprendimos?** → `traceOutcome(chain)`.

`buildTraceChain()` valida que cada eslabón referencia correctamente al anterior (una `Hypothesis`/`ProductionBrief` que no pertenece a la `CreativeCell` dada se rechaza) — nunca acepta una cadena con un hueco silencioso.

## 8. Pipeline competitivo — PREPARADO, no conectado (Fase: Preparar Competitive Intelligence para activación)

```
COMPETITOR RESEARCH (Meta Ad Library, futuro)
   ↓
OBSERVED DATA ──→ OBSERVATION ──→ PATTERN ──→ LEARNING ──→ RECOMMENDATION   (src/competitivePipeline.js, domain='COMPETITIVE')
   ↓ (síntesis ciega, en paralelo — ver §6)
Competitor Creative Record ──→ Abstraction Record ──→ (informedByPattern) ──→ Opportunity
   ↓
CreativeCell.evidence  (Persona/Pain/Awareness/Angle/Format siguen siendo REALES de Vida Divina — nunca fabricados desde evidencia competitiva)
   ↓
Hypothesis ──→ ProductionBrief
```

- **`src/sources/competitiveResearchSource.js`**: `createAdLibraryRawRecord()` representa los 12 campos mínimos que Meta Ad Library puede entregar (competitor, advertiser, platform, ad library id, creative id, start date, active/inactive status, spend range, impression range, creative format, copy, landing destination, media reference) — ausentes quedan `null`/`UNKNOWN`. `mapAdLibraryRawRecordToCompetitorCreativeRecord()` lo traduce a `CompetitorCreativeRecord`, y lanza explícitamente (nunca fabrica) si falta lo mínimo indispensable (advertiser, permalink, copy, formato). `MetaAdLibraryCompetitiveResearchSource` es el adaptador preparado: exige `overrides.fetchImpl` inyectado, nunca llama `fetch` por defecto, no lee ni genera credenciales — conectarlo cuando Meta Ad Library se autorice es solo inyectar un `fetchImpl` real.
- **`src/competitiveAbstraction.js`**: `AbstractionRecord` ahora también abstrae `hookStructure`/`narratorType`/`sceneSetup`/`editRhythm` (opcionales, validados contra los enums de `format.js` cuando se proveen — nunca inventados si el anuncio no aplica, ej. un anuncio estático no tiene `editRhythm`). `CompetitorCreativeRecord` acepta los campos de Ad Library (`landingDestination`, `spendRange`, `impressionRange`, `activeStatus`, `mediaReference`), todos `OBSERVED_OR_UNKNOWN` en `FIELD_KIND`. `createOpportunity()` acepta `informedByPattern` opcional (debe ser un `Pattern` real de dominio `COMPETITIVE`), cerrando el eslabón Pattern → Opportunity.
- **`src/competitivePipeline.js`** (nuevo): pegamento del pipeline, sin redefinir ninguna pieza existente — `deriveCompetitiveObservation/Pattern/Learning/Recommendation` fijan `domain='COMPETITIVE'` y aplican el guard anti-claim de negocio automáticamente; `deriveDataPointFromCompetitorRecord` rechaza construir un DataPoint desde un campo `INFERRED`; `buildCreativeCellEvidenceFromOpportunity` empaqueta una `Opportunity` como evidencia de una `CreativeCell` (que sigue exigiendo Persona/Pain/Angle/Format reales); `computeStrategicPriority` (checklist cualitativo, no un score) y `summarizeEvidenceAndPriority` mantienen Evidence Strength y Strategic Priority como dos ejes separados y documentados, nunca multiplicados; `selectPriorityCreativeCells` selecciona hasta 5-8 `CreativeCell` candidatas etiquetadas `PRIORITY_HYPOTHESIS_FOR_TESTING` — nunca `WINNER`, y nunca fabrica candidatos si no hay evidencia real.

## 9. Competitive Evidence Preliminary (Fase: Incorporar y Normalizar Competitive Evidence)

Incorporación normalizada de una investigación competitiva REAL (fuentes públicas, gratuitas, legítimas — Meta Ad Library, TikTok, sitios/perfiles públicos), realizada el 2026-08-15. Meta Ad Library API sigue sin conectarse; todo Ad Library ID de esta sección es evidencia preliminar recolectada manualmente, nunca resultado de una llamada real a la API.

- **`src/evidenceProvenance.js`** (nuevo): envelope de procedencia (`createProvenance`) — source/sourceUrl/sourcePlatform/sourceType/observedAt/contentDate/competitor/originalEvidenceId + ids específicos de plataforma (adLibraryId/videoId/mediaId/postId/creativeId/advertiserId/accountHandle), todos null cuando la fuente no los entrega. Vocabulario de confianza `STRONG/MODERATE/WEAK/UNKNOWN` — **coexiste, deliberadamente sin unificarse**, con el vocabulario `low/medium/high` que ya usaba `AbstractionRecord.confidence` desde la fase anterior. `assertNotCompetitiveSourceForCustomerEvidence()` es el guard estructural para la regla "Competitive ≠ Customer" (ver §11).
- **`src/publicEngagement.js`** (nuevo): `PUBLIC_OBSERVED_ENGAGEMENT` por métrica + `computePublicObservedEngagementTotal()` — suma solo componentes numéricos reales, nunca infiere un componente ausente. Ningún campo "score" de ningún tipo existe en la forma de estos objetos — regla "Public Engagement ≠ Sales" cumplida por ausencia estructural.
- **`src/evidenceTaxonomy.js`** y **`src/competitiveAbstraction.js`**: `createPattern()`/`createLearning()` y `createOpportunity()` ahora aceptan `confidence` opcional (mismo vocabulario STRONG/MODERATE/WEAK/UNKNOWN); `createOpportunity()` también acepta `customerEvidenceRequired`/`sourcePatternIds`; nuevo `assertOpportunityReadyForCreativeCell()` lanza `CUSTOMER_EVIDENCE_REQUIRED` si la Opportunity lo exige y no se proveen `realPersonaId`/`realPainId`.
- **`src/format.js`**: `NARRATOR_TYPES`/`SCENE_SETUPS`/`EDIT_RHYTHMS` extendidos aditivamente (`distributor`, `celebrity`, `product environment`, `handheld`, `UNKNOWN`) — necesarios para representar structural signatures reales de competidores; ningún valor existente se quitó ni renombró.
- **`src/competitivePipeline.js`**: `describeMarketRepresentativeness()` (reglas "una cuenta no representa el mercado" / "un competidor no monopoliza la síntesis" — descriptivo, no bloqueante), `createPreliminaryStrategicHypothesis()` (status `PRIORITY_HYPOTHESIS_FOR_TESTING` fijo, sin parámetro para sobrescribirlo con WINNER/VALIDATED/PROVEN), `createObservedCompetitiveMention()` (tipo `OBSERVED_COMPETITIVE_DATA`, sin campos de awareness/percepción/cuota de mercado), `buildTikTokPermalink()`.
- **`src/competitiveEvidencePreliminary.js`** (nuevo, el archivo principal de esta incorporación): competidores (Herbalife/Omnilife/Fuxion/Total Life Changes-Iaso Tea, Organo Gold `UNKNOWN`), Ad Library raw records (Omnilife ×6, Fuxion ×2, TLC ×1 — Herbalife `INSUFFICIENT_DATA`, ids no incluidos en el payload de esta fase), evidencia TikTok con contenido real (2 videos de Fuxion + 1 de Omnilife), 3 AbstractionRecords reales (AR-06/07/08) + 5 stubs `AWAITING_ANALYST_CONTENT` (AR-01..05, sin detalle de creativo suficiente para construirlos sin fabricar), 1 Pattern real (Pattern-01, grounded en 2 Observations reales) + 5 Patterns catalogados (Pattern-02..06, confidence exacta conservada, sin objeto "en vivo" por falta de grounding), 1 Learning real (grounded en Pattern-01) + su reclamo completo original conservado aparte como hallazgo declarado, 2 Opportunities reales + 1 catalogada, H1/H2/H3 como hipótesis preliminares, la mención de Vida Divina en contenido de Fuxion, y el engagement público de ambos videos de Fuxion.

**Regla de honestidad aplicada**: varios hallazgos que la investigación catalogó no llegaron a esta sesión con el detalle de creativo necesario para reconstruirlos como objetos Pattern/Learning/Opportunity verificados sin fabricar contenido — se incorporan como `CatalogedFinding` (label/confidence exactos, sin inflar), nunca presentados como evidencia independientemente verificada por este código. Ver el reporte de la fase para el detalle completo.

## 10. Ejecutar las pruebas

```
cd creative-intelligence
npm test
```

178/178 pruebas, sin APIs externas, sin red, sin PostgreSQL.
