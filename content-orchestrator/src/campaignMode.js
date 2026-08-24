// campaignMode.js — Parte 3. Resuelve un ContentRequest en modo
// CAMPAIGN_MODE contra Creative Intelligence REAL ya persistido (ver
// creative-intelligence/orchestrator/cycleStore.js) -- nunca crea una
// Persona/Pain/Angle/Format/CreativeCell nueva, nunca ejecuta un segundo
// cycleOrchestrator.
//
// HALLAZGO ARQUITECTÓNICO REAL (documentado, no asumido antes de
// verificarlo): un CycleOutput real de Creative Intelligence NO tiene
// ningún campo productId -- Persona/Pain/Angle/CreativeCell son agnósticos
// de producto por diseño (ver creative-intelligence/data/cycles/*.json).
// Emparejar una CreativeCell con un producto real es exactamente el
// trabajo de juicio que un humano ya hizo manualmente en la fase anterior
// (TéDivina <-> CreativeCell daa63e82..., por el pain de estreñimiento).
// Esta función AUTOMATIZA esa búsqueda de forma determinista y honesta:
// compara por solapamiento de palabras clave el painAnchor/angle/mechanism
// real de cada CreativeCell contra el Problema/Beneficios reales del
// producto (docs/productos/, vía productFactsLoader.js) -- NUNCA pretende
// ser comprensión semántica genuina (eso requeriría un LLM, fuera de
// alcance, igual que en directInstructionMode.js). Si ningún candidato
// supera el umbral mínimo, se rechaza explícitamente en vez de adivinar.

import { listCycles, getCycle } from '../../creative-intelligence/orchestrator/cycleStore.js';
import { getGateStatusValue } from '../../creative-intelligence/schemas/cycleOutput.schema.js';
import { loadProductFacts } from './productFactsLoader.js';

export const MIN_MATCH_SCORE = 2; // al menos 2 palabras clave reales en común -- umbral bajo pero no cero, para no aceptar coincidencias puramente accidentales.

const STOPWORDS = new Set([
  'de', 'la', 'el', 'en', 'un', 'una', 'y', 'o', 'a', 'que', 'no', 'se', 'del',
  'al', 'con', 'para', 'por', 'su', 'sus', 'lo', 'las', 'los', 'es', 'como',
  'mas', 'más', 'sin', 'the', 'and',
]);

function normalizarPalabras(texto) {
  return String(texto ?? '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOPWORDS.has(w));
}

function palabrasClave(texto) {
  return new Set(normalizarPalabras(texto));
}

function overlapScore(setA, setB) {
  let n = 0;
  for (const w of setA) if (setB.has(w)) n += 1;
  return n;
}

export class MissingStrategicMatchError extends Error {
  constructor(productId, candidatesTried, { gatedCandidate = null } = {}) {
    const nota = gatedCandidate
      ? ` Nota: el CreativeCell "${gatedCandidate.creativeCellId}" (cycle ${gatedCandidate.cycleId}) sí alcanza el umbral (score ${gatedCandidate.score}), pero su ciclo tiene gateStatus.strategyAndBriefApproval = "${gatedCandidate.strategyAndBriefApproval}" — no puede usarse hasta que un humano lo apruebe (ver Fase 4B, Creative Gate Enforcement).`
      : '';
    super(`campaignMode: ningún CreativeCell real APROBADO de los ciclos persistidos alcanza el umbral mínimo de coincidencia (${MIN_MATCH_SCORE}) con los hechos reales de "${productId}" — no se inventa un emparejamiento. Candidatos evaluados: ${candidatesTried.length}.${nota}`);
    this.name = 'MissingStrategicMatchError';
    this.productId = productId;
    this.candidatesTried = candidatesTried;
    this.gatedCandidate = gatedCandidate;
  }
}

/**
 * Fase 4B (Creative Gate Enforcement) — distinta de MissingStrategicMatchError:
 * el CreativeCell solicitado explícitamente (preferredCreativeCellId) SÍ
 * existe y SÍ fue evaluado, pero su ciclo no tiene
 * gateStatus.strategyAndBriefApproval === 'APPROVED'. Nunca se usa para
 * "no encontré nada" (ese es MissingStrategicMatchError) -- este error dice
 * "lo encontré, pero un humano todavía no lo aprobó para producción".
 */
export class CreativeCellNotApprovedError extends Error {
  constructor(productId, candidate) {
    super(`campaignMode: el CreativeCell "${candidate.creativeCell.creativeCellId}" (cycle ${candidate.cycleId}) es real y fue evaluado para "${productId}", pero su ciclo tiene gateStatus.strategyAndBriefApproval = "${candidate.strategyAndBriefApproval}" — una CreativeCell no aprobada nunca puede usarse para una Creative Proposal. Aprueba el ciclo (gateStatus.strategyAndBriefApproval = 'APPROVED') antes de reintentar.`);
    this.name = 'CreativeCellNotApprovedError';
    this.productId = productId;
    this.creativeCellId = candidate.creativeCell.creativeCellId;
    this.cycleId = candidate.cycleId;
    this.strategyAndBriefApproval = candidate.strategyAndBriefApproval;
  }
}

/**
 * Busca, entre TODOS los ciclos reales ya persistidos, la CreativeCell cuyo
 * painAnchor + angle + mechanism reales mejor coincidan (por solapamiento
 * de palabras clave) con el Problema/Beneficios reales del producto. Nunca
 * fabrica una CreativeCell ni un ciclo -- solo lee lo que ya existe en
 * creative-intelligence/data/cycles/.
 *
 * @param {{productId:string, preferredCreativeCellId?:string}} args
 *   preferredCreativeCellId: opcional -- cuando varios CreativeCell reales
 *   son emparejamientos válidos (mismo score o distintos, todos por encima
 *   del umbral) para el mismo producto, permite que quien llama (un
 *   operador humano, o un ContentRequest con esa preferencia ya resuelta)
 *   elija cuál de los REALES usar, en vez de forzar siempre el de mayor
 *   score. Nunca acepta un id que no sea un candidato real ya evaluado.
 * @returns {{
 *   cycleId:string, creativeCell:object, persona:object, pain:object,
 *   angle:object, formatDecision:object, productionBrief:object,
 *   productFacts:object, matchScore:number, candidatesTried:Array,
 * }}
 */
export function resolveCampaignCreativeCell({ productId, preferredCreativeCellId = null }) {
  if (!productId?.trim()) throw new Error('resolveCampaignCreativeCell: "productId" es obligatorio.');
  const productFacts = loadProductFacts(productId);
  const productKeywords = palabrasClave(`${productFacts.problema ?? ''} ${productFacts.beneficios ?? ''}`);

  const resumenes = listCycles();
  if (resumenes.length === 0) {
    throw new Error('resolveCampaignCreativeCell: no hay ningún ciclo real de Creative Intelligence persistido (creative-intelligence/data/cycles está vacío) — no se puede ejecutar Campaign Mode sin al menos 1 ciclo real.');
  }

  const candidatesTried = [];
  const evaluados = [];

  for (const resumen of resumenes) {
    const cycle = getCycle(resumen.cycleId);
    // Fase 4B (Creative Gate Enforcement): "¿la dirección estratégica +
    // ProductionBrief de este ciclo ya fueron aprobados por un humano?".
    // Deliberadamente NO contentApproval (aprobación del copy ya generado,
    // una etapa posterior del pipeline de content-orchestrator) ni
    // publicationApproval (aprobación previa a publicar, más posterior
    // todavía) -- resolveCampaignCreativeCell() ocurre ANTES de que exista
    // copy o publicación, exactamente en el momento "¿puedo usar esta
    // dirección estratégica para producir una Creative Proposal?".
    // Fase 4D: getGateStatusValue() lee ambos formatos (legado string, o
    // nuevo {status, reviewedBy, reviewedAt}) -- único cambio necesario
    // aquí para soportar el formato nuevo; la regla de negocio (solo
    // 'APPROVED' habilita selección) no cambia en absoluto.
    const strategyAndBriefApproval = getGateStatusValue(cycle.gateStatus?.strategyAndBriefApproval);
    for (const cell of cycle.priorityCreativeCells ?? []) {
      const pain = cycle.pains.find((p) => p.painId === cell.painId);
      const angle = cycle.angles.find((a) => a.angleId === cell.angleId);
      const persona = cycle.personas.find((p) => p.personaId === cell.personaId);
      const formatDecision = cycle.formatDecisions.find((f) => f.formatId === cell.formatId);
      const productionBrief = cycle.productionBriefs.find((b) => b.creativeCellId === cell.creativeCellId);

      const cellText = `${pain?.painPoint ?? ''} ${angle?.angleText ?? ''} ${cell.mechanism ?? ''}`;
      const score = overlapScore(palabrasClave(cellText), productKeywords);
      // strategyAndBriefApproval viaja en candidatesTried/evaluados siempre
      // -- diagnóstico transparente (nunca un fallo silencioso), aunque el
      // candidato quede fuera de la selección más abajo por no estar
      // aprobado.
      candidatesTried.push({ cycleId: cycle.cycleId, creativeCellId: cell.creativeCellId, personaName: persona?.name ?? null, painPoint: pain?.painPoint ?? null, score, strategyAndBriefApproval });
      evaluados.push({ cycleId: cycle.cycleId, creativeCell: cell, persona, pain, angle, formatDecision, productionBrief, score, strategyAndBriefApproval });
    }
  }

  let mejor = null;
  if (preferredCreativeCellId) {
    const candidato = evaluados.find((e) => e.creativeCell.creativeCellId === preferredCreativeCellId) ?? null;
    if (!candidato) {
      throw new Error(`resolveCampaignCreativeCell: "preferredCreativeCellId" ("${preferredCreativeCellId}") no corresponde a ningún CreativeCell real evaluado para "${productId}" — no se acepta un id que no exista.`);
    }
    // Un CreativeCell real y explícitamente solicitado, pero cuyo ciclo no
    // está aprobado, NO es "no encontré nada" -- es un caso distinto y más
    // preciso (ver CreativeCellNotApprovedError).
    if (candidato.strategyAndBriefApproval !== 'APPROVED') {
      throw new CreativeCellNotApprovedError(productId, candidato);
    }
    mejor = candidato;
  } else {
    // Gate real: solo los candidatos de ciclos con strategyAndBriefApproval
    // === 'APPROVED' entran al pool de selección -- una CreativeCell no
    // aprobada nunca puede ganar la búsqueda automática por mejor score,
    // sin importar cuán alto sea (ver §7/§8 de la auditoría, Fase 4).
    const aprobados = evaluados.filter((e) => e.strategyAndBriefApproval === 'APPROVED');
    for (const e of aprobados) if (!mejor || e.score > mejor.score) mejor = e;
  }

  if (!mejor || mejor.score < MIN_MATCH_SCORE) {
    // Diagnóstico honesto: si algún candidato NO aprobado sí alcanzaba el
    // umbral, se reporta explícitamente en el mensaje/objeto del error --
    // nunca se confunde "no hay evidencia estratégica suficiente" con
    // "hay evidencia suficiente, pero falta aprobación humana".
    const pendienteConScoreSuficiente = evaluados.find((e) => e.strategyAndBriefApproval !== 'APPROVED' && e.score >= MIN_MATCH_SCORE) ?? null;
    throw new MissingStrategicMatchError(productId, candidatesTried, {
      gatedCandidate: pendienteConScoreSuficiente
        ? { cycleId: pendienteConScoreSuficiente.cycleId, creativeCellId: pendienteConScoreSuficiente.creativeCell.creativeCellId, score: pendienteConScoreSuficiente.score, strategyAndBriefApproval: pendienteConScoreSuficiente.strategyAndBriefApproval }
        : null,
    });
  }

  return Object.freeze({
    cycleId: mejor.cycleId,
    creativeCell: mejor.creativeCell,
    persona: mejor.persona,
    pain: mejor.pain,
    angle: mejor.angle,
    formatDecision: mejor.formatDecision,
    productionBrief: mejor.productionBrief,
    productFacts,
    matchScore: mejor.score,
    strategyAndBriefApproval: mejor.strategyAndBriefApproval,
    candidatesTried: Object.freeze(candidatesTried),
  });
}

/**
 * Verifica que un ContentRequest en CAMPAIGN_MODE realmente pueda
 * resolverse contra Creative Intelligence real, y devuelve el
 * emparejamiento -- capa fina sobre resolveCampaignCreativeCell() que solo
 * añade la validación de modo/productId del ContentRequest.
 */
export function resolveCampaignForContentRequest(contentRequest) {
  if (contentRequest.mode !== 'CAMPAIGN_MODE') {
    throw new Error(`resolveCampaignForContentRequest: el ContentRequest tiene mode "${contentRequest.mode}", no CAMPAIGN_MODE.`);
  }
  if (!contentRequest.productId) {
    throw new Error('resolveCampaignForContentRequest: el ContentRequest no tiene "productId" resuelto — no se puede ejecutar Campaign Mode sin saber a qué producto real corresponde (ver contentRequest.missingFields).');
  }
  return resolveCampaignCreativeCell({ productId: contentRequest.productId });
}
