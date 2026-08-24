// competitiveEvidencePreliminary.js — incorporación normalizada de la
// investigación competitiva REAL (fuentes públicas, gratuitas, legítimas),
// realizada el 2026-08-15. Fase: "Incorporar y Normalizar Competitive
// Evidence — Preliminary".
//
// Este archivo NO re-ejecuta los 10 prompts del framework, NO genera
// Production Briefs, NO escribe anuncios/hooks finales, NO genera los
// primeros 5-8 conceptos — solo incorpora y normaliza evidencia con
// procedencia completa, usando exclusivamente piezas ya construidas
// (evidenceProvenance.js, publicEngagement.js, evidenceTaxonomy.js,
// competitiveAbstraction.js, competitivePipeline.js). Meta Ad Library API
// NO se conecta aquí — todo Ad Library ID de este archivo es evidencia
// PRELIMINAR recolectada manualmente durante la investigación pública,
// nunca un resultado de una llamada real a la API.
//
// REGLA DE HONESTIDAD APLICADA EN ESTE ARCHIVO: varios hallazgos que la
// investigación catalogó (Pattern-02/03/04/06, Learning-01, la porción
// "2 de 4 competidores" de Learning-02, Opportunity-02) no llegaron a este
// código con el detalle de creativo necesario para reconstruir, dentro de
// esta sesión, ≥2 Observations reales que los respalden sin fabricar
// contenido (ver AR-01..AR-05 más abajo, que tampoco se instancian como
// AbstractionRecord real por la misma razón). Esos hallazgos se incorporan
// como CatalogedFinding — se conserva su label/descripción/confidence
// EXACTOS tal como la investigación los entregó, pero NO se presentan como
// objetos Pattern/Learning/Opportunity verificados por este código. Ver
// reporte de esta fase, secciones N/P, para el detalle exacto de qué quedó
// como objeto real vs. catalogado, y por qué.

import { createProvenance } from './evidenceProvenance.js';
import { createPublicEngagementMetric, computePublicObservedEngagementTotal } from './publicEngagement.js';
import { createAbstractionRecord, createOpportunity } from './competitiveAbstraction.js';
import { createDataPoint, createObservation } from './evidenceTaxonomy.js';
import { createAdLibraryRawRecord, buildAdLibrarySnapshotUrl } from './sources/competitiveResearchSource.js';
import {
  deriveCompetitivePattern, deriveCompetitiveLearning, describeMarketRepresentativeness,
  createPreliminaryStrategicHypothesis, createObservedCompetitiveMention, buildTikTokPermalink,
} from './competitivePipeline.js';

export const INVESTIGATION_DATE = '2026-08-15';

// ======================================================================
// CatalogedFinding — hallazgo transcrito de la investigación externa que
// este código NO reconstruye como objeto Pattern/Learning/Opportunity "en
// vivo" por falta de detalle de creativo suficiente para fundamentarlo sin
// fabricar contenido. Nunca se presenta como evidencia independientemente
// verificada; se etiqueta explícitamente para cualquier auditoría.
// ======================================================================

export const CATALOGED_FINDING = 'CATALOGED_BY_EXTERNAL_INVESTIGATION_NOT_INDEPENDENTLY_GROUNDED';

export function createCatalogedFinding({ label, kind, description, confidence, note = null }) {
  if (!label?.trim()) throw new Error('CatalogedFinding: "label" es obligatorio.');
  if (!['PATTERN', 'LEARNING', 'OPPORTUNITY'].includes(kind)) {
    throw new Error('CatalogedFinding: "kind" debe ser PATTERN, LEARNING u OPPORTUNITY.');
  }
  if (!description?.trim()) throw new Error('CatalogedFinding: "description" es obligatorio.');
  if (!['STRONG', 'MODERATE', 'WEAK', 'UNKNOWN'].includes(confidence)) {
    throw new Error(`CatalogedFinding: "confidence" inválido "${confidence}".`);
  }
  return Object.freeze({ type: CATALOGED_FINDING, label, kind, description, confidence, note });
}

// ======================================================================
// 1. COMPETIDORES
// ======================================================================

export const PRIMARY_COMPETITORS = Object.freeze(['Herbalife', 'Omnilife', 'Fuxion', 'Total Life Changes / Iaso Tea']);

export function buildOrganoGoldEvidenceStatus() {
  return Object.freeze({
    competitor: 'Organo Gold',
    status: 'UNKNOWN',
    reason: 'INSUFFICIENT_PRELIMINARY_EVIDENCE',
    note: 'Ausencia de evidencia en esta investigación NO se interpreta como ausencia de publicidad — solo como falta de datos preliminares recolectados hasta ahora.',
  });
}

export function buildHerbalifeEvidenceStatus() {
  return Object.freeze({
    competitor: 'Herbalife',
    status: 'INSUFFICIENT_DATA',
    reason: 'Los Ad Library IDs específicos de Herbalife fueron referidos por la investigación como "previamente documentados" pero no se incluyeron en el payload de esta fase — no se fabrican ids ni contenido.',
    note: 'Requiere que se aporten los ids/registros reales de Herbalife en una fase posterior para incorporarlos con la misma procedencia que Omnilife/Fuxion/TLC.',
  });
}

// ======================================================================
// 2. META AD LIBRARY — registros crudos. Solo ids confirmados; sin
//    advertiser/copy/formato confirmados por registro individual, así que
//    se conservan como AdLibraryRawRecord (nunca promovidos a
//    CompetitorCreativeRecord sin esos datos — ver
//    mapAdLibraryRawRecordToCompetitorCreativeRecord, que los rechazaría
//    correctamente por falta de "advertiser"/"copy"/"creativeFormat").
// ======================================================================

const OMNILIFE_AD_LIBRARY_IDS = Object.freeze([
  '3070356446508098', '1206565280671356', '3397877507037499',
  '1268203798480459', '2216494102505487', '1170321384731761',
]);
const FUXION_AD_LIBRARY_IDS = Object.freeze(['1638827230548335', '795592699680452']);
const TOTAL_LIFE_CHANGES_AD_LIBRARY_IDS = Object.freeze(['26420591114238877']);

function buildAdLibraryRawRecordsFor(competitor, ids) {
  return ids.map((adLibraryId) =>
    createAdLibraryRawRecord({
      competitor,
      // 'meta_ad_library' NUNCA fue una plataforma real de Meta (era una
      // confusión entre "fuente" y "publisher_platforms") — corregido en
      // la Fase "Adaptar Competitive Intelligence a Response Real de
      // Meta": estos 9 ids solo se documentaron por número, sin consultar
      // /ads_archive todavía, así que publisher_platforms real es
      // desconocido por registro — UNKNOWN, honesto, nunca inventado.
      platforms: ['UNKNOWN'],
      adLibraryId,
      adSnapshotUrl: buildAdLibrarySnapshotUrl(adLibraryId),
      activeStatus: 'UNKNOWN', // no confirmado individualmente por registro en esta investigación
    })
  );
}

export function buildOmnilifeAdLibraryEvidence() {
  return buildAdLibraryRawRecordsFor('Omnilife', OMNILIFE_AD_LIBRARY_IDS);
}

export function buildFuxionAdLibraryEvidence() {
  return buildAdLibraryRawRecordsFor('Fuxion', FUXION_AD_LIBRARY_IDS);
}

export function buildTotalLifeChangesAdLibraryEvidence() {
  return buildAdLibraryRawRecordsFor('Total Life Changes / Iaso Tea', TOTAL_LIFE_CHANGES_AD_LIBRARY_IDS);
}

// ======================================================================
// 3. TIKTOK — evidencia real con contenido observado
// ======================================================================

export const FUXION_TIKTOK_HANDLE = '@saludableconmariamachare';
export const FUXION_TIKTOK_VIDEO_1_ID = '7396131411503205638';
export const OMNILIFE_TIKTOK_HANDLE = '@omnilifeoficial';
export const OMNILIFE_TIKTOK_VIDEO_ID = '7480969336895687942';

const fuxionVideo1Url = buildTikTokPermalink(FUXION_TIKTOK_HANDLE, FUXION_TIKTOK_VIDEO_1_ID);
// El segundo contenido de Fuxion NO trajo un video id explícito en el
// payload de esta fase — se conserva el perfil público (derivable
// mecánicamente del handle) como sourceUrl, y videoId queda null. No se
// inventa un id.
const fuxionProfileUrl = `https://www.tiktok.com/${FUXION_TIKTOK_HANDLE}`;
const omnilifeVideoUrl = buildTikTokPermalink(OMNILIFE_TIKTOK_HANDLE, OMNILIFE_TIKTOK_VIDEO_ID);

export function buildFuxionTikTokVideo1Provenance() {
  return createProvenance({
    source: 'TikTok público', sourceUrl: fuxionVideo1Url, sourcePlatform: 'tiktok', sourceType: 'ORGANIC',
    observedAt: INVESTIGATION_DATE, contentDate: '2024-07-26', competitor: 'Fuxion', originalEvidenceId: 'AR-06',
    accountHandle: FUXION_TIKTOK_HANDLE, videoId: FUXION_TIKTOK_VIDEO_1_ID, confidence: 'WEAK',
  });
}

export function buildFuxionTikTokVideo2Provenance() {
  return createProvenance({
    source: 'TikTok público', sourceUrl: fuxionProfileUrl, sourcePlatform: 'tiktok', sourceType: 'ORGANIC',
    observedAt: INVESTIGATION_DATE, contentDate: null, competitor: 'Fuxion', originalEvidenceId: 'AR-07',
    accountHandle: FUXION_TIKTOK_HANDLE, videoId: null, confidence: 'WEAK',
    sourceCurrentlyUnavailable: false,
  });
}

export function buildOmnilifeTikTokProvenance() {
  return createProvenance({
    source: 'TikTok público', sourceUrl: omnilifeVideoUrl, sourcePlatform: 'tiktok', sourceType: 'ORGANIC',
    observedAt: INVESTIGATION_DATE, contentDate: null, competitor: 'Omnilife', originalEvidenceId: 'AR-08',
    accountHandle: OMNILIFE_TIKTOK_HANDLE, videoId: OMNILIFE_TIKTOK_VIDEO_ID, confidence: 'WEAK',
  });
}

// ======================================================================
// 4. ABSTRACTION RECORDS
// ======================================================================

/** AR-01..AR-05: la investigación los cataloga (Omnilife producto/ingrediente,
 * Omnilife comunidad/valores, Fuxion VisionPure, Fuxion FloraLiv, Iaso Tea)
 * pero esta sesión no recibió el detalle de creativo/copy/estructura
 * necesario para construirlos como AbstractionRecord real sin fabricar
 * personaHypothesis/painHypothesis/mechanismFraming — createAbstractionRecord()
 * exige esos campos no vacíos, y este código no completa el hueco con
 * conocimiento general. Quedan como stubs de procedencia únicamente.
 */
export function buildPendingAbstractionRecordStubs() {
  return Object.freeze([
    { label: 'AR-01', competitor: 'Omnilife', topic: 'producto/ingrediente', status: 'AWAITING_ANALYST_CONTENT' },
    { label: 'AR-02', competitor: 'Omnilife', topic: 'comunidad/valores', status: 'AWAITING_ANALYST_CONTENT' },
    { label: 'AR-03', competitor: 'Fuxion', topic: 'VisionPure', status: 'AWAITING_ANALYST_CONTENT' },
    { label: 'AR-04', competitor: 'Fuxion', topic: 'FloraLiv', status: 'AWAITING_ANALYST_CONTENT' },
    { label: 'AR-05', competitor: 'Total Life Changes / Iaso Tea', topic: 'Iaso Tea', status: 'AWAITING_ANALYST_CONTENT' },
  ]);
}

export function buildAR06() {
  const provenance = buildFuxionTikTokVideo1Provenance();
  return createAbstractionRecord({
    personaHypothesis: 'Seguidor de contenido MLM/nutrición en TikTok que consume comparaciones de marca en tono de humor — hipótesis desde el lado del emisor (Fuxion), sin evidencia propia de cliente de Vida Divina.',
    painHypothesis: 'No se observa un pain point explícito del consumidor en esta pieza — el eje central es humor/rivalidad de marca, no un dolor específico articulado.',
    awareness: 'Solution Aware',
    angle: 'Comparación humorística entre marcas MLM de nutrición (incluye mención explícita de Vida Divina)',
    mechanismFraming: 'Humor y rivalidad de marca como mecanismo de afiliación/entretenimiento, no mecanismo de producto',
    format: 'Native TikTok-style',
    narrativeStructure: 'planteamiento humorístico → comparación de marcas → remate/cierre',
    hookStructure: 'Apertura de comparación/lista humorística entre marcas',
    narratorType: 'distributor',
    sceneSetup: 'UNKNOWN',
    editRhythm: 'UNKNOWN',
    observedEvidenceRef: {
      // Se usa originalEvidenceId (label estable "AR-06" de la investigación),
      // no provenance.provenanceId — este último es un randomUUID generado
      // de nuevo en cada llamada a createProvenance(), así que NO es estable
      // entre invocaciones separadas y rompería la trazabilidad si se usara
      // como referencia (dos llamadas a buildFuxionTikTokVideo1Provenance()
      // producirían provenanceId distintos para "la misma" evidencia real).
      recordId: provenance.originalEvidenceId,
      summary: 'Video de TikTok con comparación humorística entre Fuxion, Herbalife, Omnilife y Vida Divina (tema, no transcripción literal).',
    },
    confidence: 'low', // vocabulario de AbstractionRecord.confidence (low/medium/high) — distinto de provenance.confidence (WEAK), ver evidenceProvenance.js
  });
}

export function buildAR07() {
  const provenance = buildFuxionTikTokVideo2Provenance();
  return createAbstractionRecord({
    personaHypothesis: 'Persona interesada en salud digestiva que sigue contenido educativo de un distribuidor de Fuxion en TikTok — hipótesis desde el lado del emisor.',
    painHypothesis: 'Posibles señales de estreñimiento (tema explícito del contenido) — señal de pain del lado del competidor, no evidencia propia de un cliente real de Vida Divina.',
    awareness: 'Problem Aware',
    angle: 'Apertura por síntoma/pregunta (posibles señales de estreñimiento) antes de introducir el producto (Prunex1) como complemento de hábitos',
    mechanismFraming: 'Prunex1 presentado como complemento de hábitos, con disclaimer explícito de no-tratamiento/no-solución-milagrosa',
    format: 'Educational walk-and-talk',
    narrativeStructure: 'síntoma/pregunta → educación → producto como complemento de hábitos → disclaimer',
    hookStructure: 'Apertura por pregunta/síntoma digestivo, antes de mencionar el producto',
    narratorType: 'distributor',
    sceneSetup: 'UNKNOWN',
    editRhythm: 'UNKNOWN',
    observedEvidenceRef: {
      recordId: provenance.originalEvidenceId, // "AR-07", estable — ver nota en buildAR06()
      summary: 'Video educativo de TikTok sobre posibles señales de estreñimiento; presenta Prunex1 como complemento de hábitos con disclaimer explícito no-tratamiento/no-solución-milagrosa (tema, no transcripción literal).',
    },
    confidence: 'low',
  });
}

export function buildAR08() {
  const provenance = buildOmnilifeTikTokProvenance();
  return createAbstractionRecord({
    personaHypothesis: 'Seguidor de la cuenta oficial de Omnilife en TikTok, participante potencial de retos/gamificación de marca — hipótesis desde el lado del emisor.',
    painHypothesis: 'No se observa un pain point explícito del consumidor — el formato es de entretenimiento/participación (reto), no de resolución de un problema articulado.',
    awareness: 'Product Aware',
    angle: 'Participación mediante reto/gamificación de marca, con posible participación de figura pública',
    mechanismFraming: 'Gamificación (reto) y participación de figura pública como mecanismo de engagement de marca, no mecanismo de producto',
    format: 'Native TikTok-style',
    narrativeStructure: 'planteamiento del reto → participación/demostración → CTA',
    hookStructure: 'Apertura tipo invitación/reto a participar',
    narratorType: 'UNKNOWN', // cuenta oficial, posible multi-participante — no se confirma un único narrador
    sceneSetup: 'UNKNOWN',
    editRhythm: 'UNKNOWN',
    observedEvidenceRef: {
      recordId: provenance.originalEvidenceId, // "AR-08", estable — ver nota en buildAR06()
      summary: 'Video de TikTok de @omnilifeoficial con estructura de reto/gamificación; followers/likes de perfil y detalle de CTA no capturados con cifras en esta investigación.',
    },
    confidence: 'low',
  });
}

// ======================================================================
// 5. OBSERVATIONS → PATTERN-01 (el único de los 6 patrones catalogados
//    que esta sesión puede fundamentar con ≥2 Observations reales sin
//    fabricar contenido — ver nota de honestidad al inicio del archivo).
// ======================================================================

export function buildPattern01() {
  const dp1 = createDataPoint({ domain: 'COMPETITIVE', field: 'narratorType', value: 'distributor', source: fuxionVideo1Url });
  const obs1 = createObservation({
    domain: 'COMPETITIVE',
    description: 'El video de comparación humorística (AR-06) está narrado por un distribuidor independiente de Fuxion, no por la marca corporativa.',
    basedOnData: [dp1],
  });
  const dp2 = createDataPoint({ domain: 'COMPETITIVE', field: 'narratorType', value: 'distributor', source: fuxionProfileUrl });
  const obs2 = createObservation({
    domain: 'COMPETITIVE',
    description: 'El video educativo sobre Prunex1 (AR-07) también está narrado por el mismo distribuidor independiente de Fuxion.',
    basedOnData: [dp2],
  });
  const pattern = deriveCompetitivePattern(
    [obs1, obs2],
    'Al menos un distribuidor independiente de Fuxion narra contenido de marca en primera persona, en vez de usar voz corporativa.',
    'MODERATE'
  );
  return { pattern, observations: [obs1, obs2] };
}

/** Patterns 02-06: catalogados tal cual la investigación los entregó — label/confidence exactos, sin objeto Pattern "en vivo" (ver nota de honestidad). */
export function buildCatalogedPatterns() {
  return Object.freeze([
    createCatalogedFinding({
      label: 'Pattern-02', kind: 'PATTERN', confidence: 'MODERATE',
      description: 'Producto-beneficio vs comunidad/pertenencia.',
      note: 'Requiere el detalle de creativo de AR-01..AR-04 (Omnilife producto/comunidad, Fuxion VisionPure/FloraLiv), no incluido en esta fase.',
    }),
    createCatalogedFinding({
      label: 'Pattern-03', kind: 'PATTERN', confidence: 'WEAK',
      description: 'Pregunta/dato-shock antes del producto.',
      note: 'AR-07 sugiere una apertura por síntoma/pregunta, pero un solo caso real no alcanza el umbral de ≥2 Observations que exige createPattern().',
    }),
    createCatalogedFinding({
      label: 'Pattern-04', kind: 'PATTERN', confidence: 'MODERATE',
      description: 'Mecanismo con nombre técnico/patentado.',
      note: 'Requiere el detalle de creativo de AR-03/AR-04 (VisionPure/FloraLiv), no incluido en esta fase.',
    }),
    createCatalogedFinding({
      label: 'Pattern-05', kind: 'PATTERN', confidence: 'WEAK',
      description: 'Disclaimer explícito de no tratamiento/solución milagrosa.',
      note: 'AR-07 es el único caso real disponible en esta sesión — 1 sola Observation no alcanza el umbral de ≥2 que exige createPattern().',
    }),
    createCatalogedFinding({
      label: 'Pattern-06', kind: 'PATTERN', confidence: 'WEAK',
      description: 'Humor/rivalidad de marca como formato TikTok.',
      note: 'AR-06 es el único caso real disponible en esta sesión — 1 sola Observation no alcanza el umbral de ≥2 que exige createPattern().',
    }),
  ]);
}

// ======================================================================
// 6. LEARNINGS
// ======================================================================

/**
 * Learning-02 real: grounded en Pattern-01 (el único Pattern "en vivo" de
 * esta incorporación). El alcance textual se ajustó honestamente a lo que
 * Pattern-01 respalda (evidencia de UN competidor, Fuxion) — el reclamo
 * más amplio de la investigación original ("al menos 2 de 4 competidores")
 * se conserva aparte, sin modificar, como CatalogedFinding (ver
 * buildLearning02DeclaredClaim) para no perderlo, pero sin presentarlo
 * como verificado por este código (regla #20/#21: un solo competidor no
 * representa el mercado).
 */
export function buildLearning02() {
  const { pattern } = buildPattern01();
  const learning = deriveCompetitiveLearning(
    [pattern],
    'Al menos un competidor directo (Fuxion) se apoya en distribuidores individuales, no en voz corporativa, como emisores de su contenido publicitario/orgánico.',
    'MODERATE'
  );
  return learning;
}

export function buildLearning02DeclaredClaim() {
  return createCatalogedFinding({
    label: 'Learning-02 (alcance completo declarado por la investigación)',
    kind: 'LEARNING',
    confidence: 'MODERATE',
    description: 'El modelo de contenido publicitario de al menos 2 de 4 competidores directos se apoya en distribuidores individuales como emisores.',
    note: 'Esta sesión solo pudo fundamentar independientemente el caso de Fuxion (ver Learning-02 real, grounded en Pattern-01). La porción "2 de 4 competidores" se conserva tal como la investigación la entregó, pero no fue re-verificada aquí con datos crudos de un segundo competidor — regla #20/#21: un solo competidor no representa el mercado.',
  });
}

export function buildLearning01() {
  return createCatalogedFinding({
    label: 'Learning-01', kind: 'LEARNING', confidence: 'MODERATE',
    description: 'Varias marcas del sector MLM de nutrición en México comunican sus productos mediante nombres de ingredientes técnicos/patentados en vez de únicamente beneficios genéricos.',
    note: 'Depende de Pattern-04 (catalogado, no grounded en esta sesión — requiere el detalle de creativo de VisionPure/FloraLiv).',
  });
}

// ======================================================================
// 7. OPPORTUNITIES
// ======================================================================

export function buildOpportunity01() {
  const { pattern } = buildPattern01();
  const ar06 = buildAR06();
  const ar07 = buildAR07();
  return createOpportunity({
    description: 'Diversificar el narrador del contenido de Vida Divina explorando distribuidores propios como voz, en vez de depender únicamente de voz corporativa.',
    basedOnAbstractionRecords: [ar06, ar07],
    whyDifferentFromSource: 'Vida Divina exploraría a SU PROPIO distribuidor narrando su propia historia/mecanismo — mecanismo, producto y narrativa serían propios, nunca la comparación humorística ni el guion de Fuxion.',
    informedByPattern: pattern,
    confidence: 'MODERATE',
    customerEvidenceRequired: true,
    sourcePatternIds: [pattern.patternId, 'Pattern-01'],
  });
}

export function buildOpportunity02() {
  return createCatalogedFinding({
    label: 'Opportunity-02', kind: 'OPPORTUNITY', confidence: 'MODERATE',
    description: 'Explorar mecanismos con nombre técnico específico.',
    note: 'Depende de AR-03/AR-04 (VisionPure/FloraLiv) y Pattern-04, ninguno grounded en esta sesión — no se construye como Opportunity real sin al menos 1 AbstractionRecord que la respalde (createOpportunity lo exige).',
  });
}

export function buildOpportunity03() {
  const ar07 = buildAR07();
  return createOpportunity({
    description: 'Explorar un ángulo de apertura por pregunta/síntoma relevante a la categoría de Vida Divina, antes de nombrar el producto.',
    basedOnAbstractionRecords: [ar07],
    whyDifferentFromSource: 'Vida Divina exploraría su propio síntoma/pregunta de apertura y su propio mecanismo — no reconstruye el guion educativo de Fuxion sobre Prunex1 ni su disclaimer literal.',
    informedByPattern: null, // Pattern-03 es catalogado, no un objeto Pattern real (ver buildCatalogedPatterns)
    confidence: 'WEAK',
    customerEvidenceRequired: true,
    sourcePatternIds: ['Pattern-03 (declared, not independently grounded in this session)'],
  });
}

// ======================================================================
// 8. HIPÓTESIS PRELIMINARES — H1, H2, H3
// ======================================================================

export function buildH1() {
  const { pattern } = buildPattern01();
  return createPreliminaryStrategicHypothesis({
    label: 'H1',
    description: 'Narrador distribuidor vs. marca corporativa.',
    competitiveEvidenceRef: pattern.patternId,
    confidence: 'MODERATE',
    customerEvidenceRequired: true,
  });
}

export function buildH2() {
  return createPreliminaryStrategicHypothesis({
    label: 'H2',
    description: 'Ingredientes específicos vs. beneficios genéricos.',
    competitiveEvidenceRef: 'Pattern-04 (declared, not independently grounded in this session)',
    confidence: 'MODERATE',
    customerEvidenceRequired: true,
  });
}

export function buildH3() {
  return createPreliminaryStrategicHypothesis({
    label: 'H3',
    description: 'Pregunta/síntoma vs. nombre de producto.',
    competitiveEvidenceRef: 'Pattern-03 (declared, not independently grounded in this session)',
    confidence: 'WEAK',
    customerEvidenceRequired: true,
  });
}

// ======================================================================
// 9. MENCIÓN DE VIDA DIVINA + ENGAGEMENT PÚBLICO
// ======================================================================

export function buildVidaDivinaMentionByFuxion() {
  return createObservedCompetitiveMention({
    mentionedBrand: 'Vida Divina',
    mentioningCompetitor: 'Fuxion',
    mentioningAccountHandle: FUXION_TIKTOK_HANDLE,
    sourceUrl: fuxionVideo1Url,
    observedAt: INVESTIGATION_DATE,
    contentDate: '2024-07-26',
    contextDescription: 'Vida Divina fue mencionada explícitamente en una pieza pública de contenido de un distribuidor de Fuxion, dentro de una comparación humorística entre Fuxion, Herbalife, Omnilife y Vida Divina.',
  });
}

export function buildFuxionVideo1Engagement() {
  const metrics = [
    createPublicEngagementMetric({ value: 23, metricName: 'likes', platform: 'tiktok', sourceUrl: fuxionVideo1Url, observedAt: '2024-07-26', confidence: 'STRONG' }),
    createPublicEngagementMetric({ value: 4, metricName: 'comments', platform: 'tiktok', sourceUrl: fuxionVideo1Url, observedAt: '2024-07-26', confidence: 'STRONG' }),
    createPublicEngagementMetric({ value: 2, metricName: 'saves', platform: 'tiktok', sourceUrl: fuxionVideo1Url, observedAt: '2024-07-26', confidence: 'STRONG' }),
    createPublicEngagementMetric({ value: 2, metricName: 'shares', platform: 'tiktok', sourceUrl: fuxionVideo1Url, observedAt: '2024-07-26', confidence: 'STRONG' }),
  ];
  return { metrics, total: computePublicObservedEngagementTotal(metrics) };
}

export function buildFuxionVideo2Engagement() {
  const metrics = [
    createPublicEngagementMetric({ value: 23, metricName: 'likes', platform: 'tiktok', sourceUrl: fuxionProfileUrl, observedAt: INVESTIGATION_DATE, confidence: 'STRONG' }),
    createPublicEngagementMetric({ value: 12, metricName: 'comments', platform: 'tiktok', sourceUrl: fuxionProfileUrl, observedAt: INVESTIGATION_DATE, confidence: 'STRONG' }),
    createPublicEngagementMetric({ value: 8, metricName: 'saves', platform: 'tiktok', sourceUrl: fuxionProfileUrl, observedAt: INVESTIGATION_DATE, confidence: 'STRONG' }),
    createPublicEngagementMetric({ value: 5, metricName: 'shares', platform: 'tiktok', sourceUrl: fuxionProfileUrl, observedAt: INVESTIGATION_DATE, confidence: 'STRONG' }),
  ];
  return { metrics, total: computePublicObservedEngagementTotal(metrics) };
}

/** Omnilife TikTok: la investigación no trajo cifras de engagement en esta fase — se deja explícitamente sin métricas, nunca inventadas. */
export function buildOmnilifeTikTokEngagementStatus() {
  return Object.freeze({
    videoId: OMNILIFE_TIKTOK_VIDEO_ID,
    accountHandle: OMNILIFE_TIKTOK_HANDLE,
    engagement: 'UNKNOWN',
    note: 'followers/likes de perfil, video likes y CTA fueron pedidos "cuando estén disponibles" — no se incluyeron cifras concretas en el payload de esta fase; no se inventan.',
  });
}

// ======================================================================
// 10. MANIFEST — vista única para auditoría/reportes
// ======================================================================

export function buildCompetitiveEvidencePreliminaryManifest() {
  const { pattern: pattern01, observations: pattern01Observations } = buildPattern01();
  return Object.freeze({
    investigationDate: INVESTIGATION_DATE,
    competitors: {
      primary: PRIMARY_COMPETITORS,
      organoGold: buildOrganoGoldEvidenceStatus(),
      herbalife: buildHerbalifeEvidenceStatus(),
    },
    metaAdLibrary: {
      omnilife: buildOmnilifeAdLibraryEvidence(),
      fuxion: buildFuxionAdLibraryEvidence(),
      totalLifeChanges: buildTotalLifeChangesAdLibraryEvidence(),
    },
    tikTok: {
      fuxionVideo1: { provenance: buildFuxionTikTokVideo1Provenance(), engagement: buildFuxionVideo1Engagement() },
      fuxionVideo2: { provenance: buildFuxionTikTokVideo2Provenance(), engagement: buildFuxionVideo2Engagement() },
      omnilife: { provenance: buildOmnilifeTikTokProvenance(), engagement: buildOmnilifeTikTokEngagementStatus() },
    },
    abstractionRecords: {
      real: { AR06: buildAR06(), AR07: buildAR07(), AR08: buildAR08() },
      pending: buildPendingAbstractionRecordStubs(),
    },
    patterns: {
      real: { pattern01, observations: pattern01Observations, marketRepresentativeness: describeMarketRepresentativeness([{ competitor: 'Fuxion' }, { competitor: 'Fuxion' }]) },
      cataloged: buildCatalogedPatterns(),
    },
    learnings: {
      real: buildLearning02(),
      declaredFullScope: buildLearning02DeclaredClaim(),
      cataloged: [buildLearning01()],
    },
    opportunities: {
      real: { opportunity01: buildOpportunity01(), opportunity03: buildOpportunity03() },
      cataloged: [buildOpportunity02()],
    },
    hypotheses: { H1: buildH1(), H2: buildH2(), H3: buildH3() },
    vidaDivinaMention: buildVidaDivinaMentionByFuxion(),
  });
}
