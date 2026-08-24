# Content Generation Engine

Punto de entrada superior único para producir contenido en Vida Divina, en tres modos: **CREATE**, **EDIT_ENHANCE**, **ADAPT**. Vive en `content-orchestrator/src/contentGenerationEngine.js` y coordina exclusivamente lo que ya existe — no es un segundo cerebro estratégico, ni un segundo renderer, ni un segundo motor de voz.

## 1. Arquitectura

```
USER CONTENT REQUEST
        ↓
contentGenerationRequest.js — clasifica CREATE / EDIT_ENHANCE / ADAPT
        ↓
contentGenerationEngine.js#generateContent() — dispatch explícito
        ↓
   ┌────────────┬──────────────────┬────────────┐
   │  CREATE    │  EDIT_ENHANCE    │   ADAPT    │
   └────────────┴──────────────────┴────────────┘
        ↓                ↓                ↓
  campaignMode.js   postProduction.js  contentOrchestrator.js
  /directInstruction  (sobre un MP4    #deriveOutputsForProfiles
  Adapter.js +         YA existente)   (sobre un MP4 YA existente)
  contentOrchestrator.js
  #renderAndPostProduce
  (HyperFrames real +
   Voice Engine real)
        ↓                ↓                ↓
              assetLineage.js — trazabilidad real
              productIntegrity.js — integridad de producto
        ↓
   Final Asset Package (status explícito, nunca oculto)
```

Separación de responsabilidades sin excepción:
- **Creative Intelligence** sigue siendo el cerebro estratégico (`creative-intelligence/`) — el motor nunca reimplementa Persona/Pain/Angle/CreativeCell/Hypothesis/ProductionArtifact/VisualProductionPackage.
- **Content Orchestrator** sigue siendo el coordinador (`content-orchestrator/src/contentOrchestrator.js`) — el motor lo reutiliza, no lo reemplaza.
- **HyperFrames** sigue siendo el único renderer (`video-production/src/hyperframesRenderer.js`) — solo se invoca en CREATE, nunca en EDIT/ADAPT.
- **Voice Engine** sigue siendo el único motor de voz — solo se invoca (indirectamente, vía el Audio Asset ya generado) en CREATE.
- **PostProduction** (`postProduction.js`, backend `local_ffmpeg`) es el único "acabado" — EDIT y ADAPT operan exclusivamente a través de él.

## 2. Request Contract

`content-orchestrator/src/contentGenerationRequest.js#parseContentGenerationRequest()`:

```js
{
  requestId, mode,               // 'CREATE' | 'EDIT_ENHANCE' | 'ADAPT'
  rawText, sourceAsset,          // {type, path} — null en CREATE, obligatorio en EDIT/ADAPT
  productId, platforms,
  outputProfiles,                // string[] o 'ALL_VIDEO_PROFILES'
  campaignContext, productionPreferences, requestedChanges,
  missingFields,                 // NUNCA se rellenan solos — se reportan
  createdAt,
}
```

Clasificación determinista (mismo criterio que `contentRequest.js`/`directInstructionMode.js`, sin LLM):
- Sin `sourceAsset` → siempre **CREATE**.
- Con `sourceAsset` + verbo de mejora ("mejora", "normaliza", "agrega", "corrige"...) → **EDIT_ENHANCE**.
- Con `sourceAsset` + mención de plataformas ("convierte para Facebook", "genera Stories") → **ADAPT**.
- `forcedMode` explícito siempre gana sobre el clasificador de texto.

**Limitación real y documentada**: la palabra "Reel" referida al propio asset fuente ("convierte *este Reel*...") puede confundirse con una mención de perfil de destino (INSTAGRAM_REEL). Mitigación: pasar `outputProfiles` explícito en vez de depender solo del texto libre.

## 3. CREATE

`runCreate(request, exec)` — requiere que quien llama ya haya resuelto la estrategia:

```js
generateContent(request, {
  renderArgs, productId,
  audioSourcePath, audioDurationSeconds, imageAssetSourcePath,
  productionArtifact, visualProductionPackage,   // objetos reales, opcionales — se persisten si se proveen
  outputProfileNames, postProductionOperations,
  projectDir, ffmpegBinDir,
})
```

Internamente reutiliza `campaignMode.js`/`directInstructionAdapter.js` (resueltos por el llamador) + `contentOrchestrator.js#renderAndPostProduce()` (HyperFrames real + Voice Engine real vía Audio Asset ya generado + `productionArtifactStore`/`visualProductionPackageStore`). Nunca redacta copy — mismo límite documentado desde `directInstructionMode.js` (requeriría un LLM).

Si falta `productId` → `MISSING_PRODUCT_FACTS`. Si falta el Audio Asset real → `SOURCE_ASSET_REQUIRED`.

## 4. EDIT_ENHANCE

`runEdit(request, exec)` — toma un video **ya existente** y aplica operaciones locales reales, **nunca vuelve a invocar HyperFrames ni Voice Engine** (verificado, ver §8):

```js
generateContent(request, {
  operations: ['LOUDNESS_NORMALIZATION', 'TEXT_OVERLAY', ...],
  operationParams: { TEXT_OVERLAY: { text, position } },
  outputDir, ffmpegBinDir,
})
```

El original **nunca se sobrescribe** — se escribe siempre a un `outputPath` nuevo, y se verifica en runtime que el hash del archivo fuente no cambió durante la operación (si cambiara, se reporta `VALIDATION_FAILED`, nunca se ignora).

## 5. ADAPT

`runAdapt(request, exec)` — deriva N Output Profiles reales de UN video ya existente, reutilizando `contentOrchestrator.js#deriveOutputsForProfiles()` (la misma función que usa CREATE internamente, extraída para reuso — no duplicada):

```js
generateContent(request, {
  postProductionOperations: ['LOUDNESS_NORMALIZATION', 'RESIZE_TO_PROFILE'],
  outputDir, ffmpegBinDir,
})
```

`request.outputProfiles` puede ser un arreglo explícito o el literal `'ALL_VIDEO_PROFILES'` (detectado de frases como "genera todas las versiones").

## 6. Asset Lineage

`content-orchestrator/src/assetLineage.js` — responde de forma real y recuperable: ¿de qué asset salió este asset?, ¿con qué operación?, ¿para qué plataforma?, ¿de qué ProductionArtifact/VisualProductionPackage?

Registros content-addressed (`derivedAssetId` = hash sha256 real del archivo derivado, mismo idioma que `assetRegistry.js`), persistidos en `content-orchestrator/data/lineage/<hash>.json`. `traceLineageChain(id)` recorre hacia atrás hasta los orígenes reales (assets sin lineage propio — una fotografía o un audio nunca "derivados" de otra cosa). `listLineageBySourceAsset(id)` responde la pregunta inversa: "¿qué se derivó de este asset?".

Dos operaciones deterministas sobre el mismo insumo pueden producir un archivo byte-idéntico (mismo hash) — el registro es idempotente (mismo id, no se duplica en disco), y el Final Asset Package deduplica la lista `lineage` devuelta por `derivedAssetId`.

## 7. Persistencia

Reutiliza `productionArtifactStore.js`/`visualProductionPackageStore.js` (fase anterior) tal cual — `persistProductionAssets()` (`contentOrchestrator.js`) los persiste solo si CREATE recibe los objetos reales, de forma idempotente (`alreadyExisted: true` en vez de lanzar si ya existían). EDIT y ADAPT no crean `ProductionArtifact`/`VisualProductionPackage` nuevos — no aplica.

## 8. Minimal Reprocessing

Verificado, no solo declarado:
- `runEdit()`/`runAdapt()` **nunca importan** `hyperframesRenderer.js` ni `audioAssetAdapter.js` (confirmado por test que inspecciona el código fuente real de `contentGenerationEngine.js`).
- Prueba real: EDIT (loudness + CTA + silence trim) sobre un MP4 real de 28s tomó **10.3s**; ADAPT (4 Output Profiles) tomó **36.9s** — ambos órdenes de magnitud por debajo de una regeneración de voz real (~300s) o un render HyperFrames real (~15-20s cada uno).

## 9. Output Profiles

Sin cambios respecto a la fase anterior (`outputProfiles.js`) — los 13 perfiles multiplataforma (`INSTAGRAM_REEL/STORY/FEED`, `FACEBOOK_REEL/STORY/FEED`, `YOUTUBE_SHORT/VIDEO`, `WHATSAPP_VIDEO`, `GENERIC_VERTICAL/SQUARE/LANDSCAPE`, `CAROUSEL`) se reutilizan tal cual, sin una segunda lista.

## 10. Brand System

Sin cambios (`brandVisualSystem.js`) — los 6 colores oficiales siguen siendo la única fuente de verdad, `assertBrandAvoidCompliance()` sigue activo en CREATE (vía `contentOrchestrator.js`).

## 11. Product Integrity

`productIntegrity.js`, ampliado esta fase con verificación real de 8 puntos (`assertAssetEntryIntegrity()`): `assetId`, `sourcePath`, existencia física, `role`, `type` válido, correspondencia producto-asset (`productId` esperado vs. declarado), RAW vs. GENERATED, y **un asset `GENERATED_IMAGE`/`GRAPHIC` nunca puede llevar un `role` reservado a fotografía oficial de producto** (`PRODUCT_PRIMARY`/`PRODUCT_SECONDARY_REFERENCE`). `captureProductImageState()`/`assertProductImageUnchanged()` verifican por hash real que ninguna operación alteró el archivo RAW de una fotografía de producto.

## 12. Vocabulario de errores (Final Asset Package)

```
COMPLETED | PARTIAL | MISSING_PRODUCT_FACTS | SOURCE_ASSET_REQUIRED |
UNSUPPORTED_LOCAL_OPERATION | RENDER_FAILED | POSTPRODUCTION_FAILED | VALIDATION_FAILED
```

Nunca se oculta un error — cada modo devuelve `errors`/`warnings` explícitos junto con lo que sí se logró (ej. `PARTIAL` cuando algunos Output Profiles se completan y otros no).

## 13. Ejemplos de uso reales

```js
// CREATE
const req = parseContentGenerationRequest({ rawText: 'Crear un Reel de Té Divina para Instagram...', productId: 'te-divina' });
const resolved = resolveCampaignCreativeCell({ productId: 'te-divina' });
generateContent(req, { renderArgs, productId: 'te-divina', audioSourcePath, audioDurationSeconds, imageAssetSourcePath, outputProfileNames: ['INSTAGRAM_REEL', 'WHATSAPP_VIDEO'], projectDir, ffmpegBinDir });

// EDIT_ENHANCE
const req = parseContentGenerationRequest({ rawText: 'Mejora este video: normaliza el audio y agrega un CTA.', sourceAsset: { type: 'VIDEO', path: mp4Path } });
generateContent(req, { operations: ['LOUDNESS_NORMALIZATION', 'TEXT_OVERLAY'], operationParams: { TEXT_OVERLAY: { text: 'Escríbenos por WhatsApp' } }, outputDir, ffmpegBinDir });

// ADAPT
const req = parseContentGenerationRequest({ rawText: 'Convierte este video para Facebook, YouTube Short y WhatsApp.', sourceAsset: { type: 'VIDEO', path: mp4Path }, outputProfiles: ['FACEBOOK_REEL', 'YOUTUBE_SHORT', 'WHATSAPP_VIDEO'] });
generateContent(req, { outputDir, ffmpegBinDir });
```

## 14. Limitaciones reales

1. CREATE requiere que el copy/producción estratégica ya esté resuelta por el llamador — no genera hook/script/CTA autónomamente (mismo límite de todas las fases anteriores, requeriría un LLM).
2. El clasificador de modo puede confundir "Reel" como referencia al asset fuente con una mención de plataforma destino (§2).
3. `SCENE_TIMING_CHANGE`, `REORDER`, `AUTO_SUBTITLE_GENERATION`, `AI_VISUAL_ENHANCEMENT` son `UNSUPPORTED_LOCAL_OPERATION` explícitos — requerirían recomponer desde el proyecto fuente de HyperFrames, transcripción automática (whisper-cpp, no instalado) o un modelo de upscaling (no instalado, sin GPU relevante).
4. `INTRO_OUTRO` requiere que los clips ya compartan codec/resolución/fps con el video principal — no reescala automáticamente.

## 15. Recursos locales utilizados

Solo `ffmpeg` (ya instalado, cero dependencias nuevas), Voice Engine ya existente (solo en CREATE), HyperFrames ya existente (solo en CREATE). Ninguna herramienta externa nueva instalada esta fase.
