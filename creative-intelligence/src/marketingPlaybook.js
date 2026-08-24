// marketingPlaybook.js — capa METHODOLOGY (Fase 16, expandida en Fase de
// Creative Quality). Vocabulario de estrategia creativa/publicitaria
// reutilizable — mismo espíritu que AWARENESS_STAGES (awareness.js) y
// FORMAT_LIBRARY (format.js), que este archivo reutiliza sin duplicar. NO
// es KNOWLEDGE (no describe clientes reales) ni EXPERIMENTATION (no es una
// hipótesis concreta de un producto): es el catálogo de PRINCIPIOS a partir
// de los cuales hypothesisCreativeEngine.js (content-orchestrator/)
// construye hipótesis concretas, siempre grounded en Product Facts reales.
//
// REDACTADO A MANO para Vida Divina, inspirado en metodología publicitaria
// de dominio público (niveles de conciencia de Eugene Schwartz, distinción
// angle/mecanismo del direct-response, tipología de hooks/patrones
// scroll-stopping de creative strategy para paid social, framework
// Problem-Agitate-Solve / Before-After-Bridge) -- NINGÚN texto, prompt ni
// código copiado de ningún repositorio externo (incluido
// github.com/alirezarezvani/claude-skills, usado solo como referencia
// metodológica en la auditoría previa, nunca instalado ni copiado).
//
// REGLA NO NEGOCIABLE: nada en este archivo es un dato de cliente. Cada
// constante es una ETIQUETA + una DESCRIPCIÓN de metodología (ej. "probar
// un ángulo de conveniencia"), nunca una afirmación sobre quién compra el
// producto o por qué (eso sería fabricar Customer Evidence). Las funciones
// de "framing"/render de este archivo NUNCA inventan un hecho de producto —
// reciben como parámetro el hecho real (problema/beneficios/ingredientes/
// nombreComercial) y solo varían la FORMA en que se enmarca o redacta,
// nunca el contenido factual.

function limpiar(texto) {
  return String(texto ?? '').trim().replace(/\.+$/, '');
}

function minuscula(texto) {
  const t = limpiar(texto);
  return t ? t.charAt(0).toLowerCase() + t.slice(1) : t;
}

// ---------------------------------------------------------------------
// ANGLE STRATEGY
// ---------------------------------------------------------------------

export const ANGLE_STRATEGIES = Object.freeze({
  CONVENIENCE: { id: 'convenience', label: 'Conveniencia', description: 'Probar si "fácil de incorporar a la rutina" resuena más que el beneficio en sí.' },
  MECHANISM: { id: 'mechanism', label: 'Educación de mecanismo', description: 'Explicar por qué el producto podría funcionar, usando el mecanismo/ingrediente real documentado.' },
  ASPIRATION: { id: 'aspiration', label: 'Aspiración', description: 'Conectar el producto con una versión mejorada de la rutina diaria, sin prometer un resultado específico.' },
  COMPARISON: { id: 'comparison', label: 'Comparación', description: 'Contrastar el producto contra la forma habitual de resolver el mismo problema, sin nombrar competidores reales.' },
  DISCOVERY: { id: 'discovery', label: 'Descubrimiento', description: 'Presentar el producto como algo nuevo que el público todavía no conoce.' },
  PROBLEM_AGITATION: { id: 'problem_agitation', label: 'Agitación del problema', description: 'Nombrar el problema real documentado antes de introducir el producto — nunca exagerarlo más allá de lo documentado.' },
  ROUTINE: { id: 'routine', label: 'Rutina', description: 'Mostrar el producto integrado en un momento cotidiano real y verosímil.' },
});

export const ANGLE_TEXT_BUILDERS = Object.freeze({
  convenience: (facts) => `Incorporar ${facts.nombreComercial} a la rutina diaria sin cambios grandes.`,
  mechanism: (facts) => `Por qué ${facts.nombreComercial} está formulado así: ${buildMechanismStatement(facts)}.`,
  aspiration: (facts) => `Una versión mejorada de la rutina diaria, con ${facts.nombreComercial}.`,
  comparison: (facts) => `Qué distingue a ${facts.nombreComercial} frente a la forma habitual de resolver esto.`,
  discovery: (facts) => `Presentar ${facts.nombreComercial} a quien todavía no lo conoce.`,
  problem_agitation: (facts) => `${limpiar(facts.problema ?? facts.beneficios)}.`,
  routine: (facts) => `${facts.nombreComercial} como parte de un momento cotidiano real.`,
});

/** @param {string} angleId @param {{nombreComercial:string, problema:?string, beneficios:?string, ingredientes:?string}} facts */
export function buildAngleText(angleId, facts) {
  const builder = ANGLE_TEXT_BUILDERS[angleId];
  if (!builder) throw new Error(`buildAngleText: sin builder para angleId "${angleId}".`);
  return builder(facts);
}

export function assertValidAngleId(angleId) {
  const valid = Object.values(ANGLE_STRATEGIES).map((a) => a.id);
  if (!valid.includes(angleId)) throw new Error(`marketingPlaybook: "${angleId}" no es un AngleStrategy válido (${valid.join(', ')}).`);
}

/**
 * Entrada de "basis" tipo MARKETING_PRINCIPLE (Fase 16, Parte 8; enriquecida
 * en la fase de Creative Quality con la forma de hipótesis rigurosa de
 * ab-test-setup: "Porque [observación real], creemos que [ángulo] podría
 * resonar con [audiencia hipotética] -- sin afirmar que funcionará."
 * NUNCA Customer Evidence: "observación" siempre viene de Product Facts
 * reales, "audiencia" siempre se marca explícitamente como hipotética.
 */
export function buildMarketingPrincipleBasisEntry(angleId, { personaFramingLabel = null, factFragment = null } = {}) {
  const angle = Object.values(ANGLE_STRATEGIES).find((a) => a.id === angleId);
  if (!angle) throw new Error(`buildMarketingPrincipleBasisEntry: angleId "${angleId}" no es un AngleStrategy real.`);
  const detail = factFragment
    ? `Porque el producto documenta "${limpiar(factFragment)}", creemos que un ángulo de ${angle.label.toLowerCase()} podría resonar con una audiencia hipotética${personaFramingLabel ? ` (${personaFramingLabel})` : ''} -- esto es una hipótesis de metodología, nunca una afirmación validada de que funcionará.`
    : angle.description;
  return Object.freeze({ type: 'MARKETING_PRINCIPLE', ref: `AngleStrategy.${angleId.toUpperCase()}`, detail });
}

// ---------------------------------------------------------------------
// HOOK TAXONOMY (A-K) — hookType (categoría real) separado de hookText
// (redacción real). El tipo cambia la CONSTRUCCIÓN, no solo la palabra.
// ---------------------------------------------------------------------

export const HOOK_STRATEGIES = Object.freeze({
  VERBAL: { id: 'verbal', hookType: 'verbal', label: 'Directo verbal', emoji: null },
  VISUAL: { id: 'visual', hookType: 'visual', label: 'Apertura visual', emoji: '👇' },
  PATTERN_INTERRUPT: { id: 'pattern_interrupt', hookType: 'pattern_interrupt', label: 'Interrupción de patrón', emoji: '⚡' },
  CURIOSITY: { id: 'curiosity', hookType: 'curiosity', label: 'Vacío de curiosidad', emoji: '👀' },
  CONTRARIAN: { id: 'contrarian', hookType: 'contrarian', label: 'Contrarian', emoji: null },
  POV: { id: 'pov', hookType: 'POV', label: 'POV', emoji: null },
  DEMONSTRATION: { id: 'demonstration', hookType: 'demonstration', label: 'Demostración', emoji: null },
  PROBLEM_RECOGNITION: { id: 'problem_recognition', hookType: 'problem_recognition', label: 'Reconocimiento del problema', emoji: null },
  STORY: { id: 'story', hookType: 'story', label: 'Micro-storytelling', emoji: '✨' },
  QUESTION: { id: 'question', hookType: 'question', label: 'Pregunta', emoji: null },
  TEXT_ON_SCREEN: { id: 'text_on_screen', hookType: 'text_on_screen', label: 'Texto en pantalla', emoji: '📌' },
});

export function assertValidHookId(hookId) {
  const valid = Object.values(HOOK_STRATEGIES).map((h) => h.id);
  if (!valid.includes(hookId)) throw new Error(`marketingPlaybook: "${hookId}" no es un HookStrategy válido (${valid.join(', ')}).`);
}

export function getHookType(hookId) {
  assertValidHookId(hookId);
  return Object.values(HOOK_STRATEGIES).find((h) => h.id === hookId).hookType;
}

/**
 * Renderiza el hook real de la variante -- SOLO a partir de painFragment
 * (ya reencuadrado por PERSONA_FRAMINGS, ver más abajo) / mechanismFragment
 * / nombreComercial reales -- nunca agrega un hecho nuevo, solo cambia la
 * construcción retórica según el TIPO de hook (11 tipos reales, Fase de
 * Creative Quality Parte 4 del encargo).
 */
export function renderHook(hookId, { painFragment, mechanismFragment, nombreComercial }) {
  assertValidHookId(hookId);
  const pain = limpiar(painFragment);
  const mech = limpiar(mechanismFragment);
  const emoji = Object.values(HOOK_STRATEGIES).find((h) => h.id === hookId)?.emoji ?? '';
  const sufijo = emoji ? ` ${emoji}` : '';
  switch (hookId) {
    case 'verbal': return `Si ${minuscula(pain)}, esto te interesa.${sufijo}`;
    case 'visual': return `Mira esto.${sufijo}`;
    case 'pattern_interrupt': return `Olvida lo que has probado antes — esto parte de otro lugar.${sufijo}`;
    // Deliberadamente NO cita mechanismFragment literal aquí -- un hook de
    // curiosidad genuino NO revela la respuesta de inmediato (si lo
    // hiciera, además, repetiría literalmente el mismo campo que la
    // sección "mechanism" del cuerpo cita después -- root cause real
    // detectado por creativeQualityGate.js#checkClaimRepetition durante
    // las pruebas de esta fase). El mecanismo real se revela en el cuerpo.
    case 'curiosity': return `Hay algo sobre cómo está formulado ${nombreComercial} que pocas personas conocen.${sufijo}`;
    case 'contrarian': return `No, no necesitas cambiar toda tu rutina para esto.${sufijo}`;
    case 'pov': return `POV: ${minuscula(pain)}.${sufijo}`;
    case 'demonstration': return `Así es como ${nombreComercial} se integra en tu día a día.${sufijo}`;
    case 'problem_recognition': return `¿${pain}? No eres la única persona a la que le pasa.${sufijo}`;
    case 'story': return `Ok, esto llamó mi atención...${sufijo}`;
    case 'question': return `¿${pain}?${sufijo}`;
    case 'text_on_screen': return `ESTO CAMBIA LA RUTINA.${sufijo}`;
    default: throw new Error(`renderHook: hookId "${hookId}" sin plantilla implementada.`);
  }
}

// ---------------------------------------------------------------------
// SCROLL_STOPPING_PATTERNS — biblioteca de patrones visuales reales (Fase
// de Creative Quality, Parte 5 del encargo). Cada patrón aporta info
// utilizable por Visual Direction (firstFrame + por qué detiene el
// scroll) -- NUNCA implica un resultado del producto, NUNCA before/after
// corporal. split_screen se documenta explícitamente restringido a eso.
// ---------------------------------------------------------------------

export const SCROLL_STOPPING_PATTERNS = Object.freeze({
  CLOSE_UP_UNEXPECTED_OBJECT: { id: 'close_up_unexpected_object', firstFrame: 'Plano macro de un objeto cotidiano, fuera de contexto por un instante antes de revelar de qué se trata.', visualHook: 'Genera curiosidad inmediata sobre qué se está mostrando.' },
  PRODUCT_REVEAL: { id: 'product_reveal', firstFrame: 'El producto real aparece de golpe en cuadro, sin introducción previa.', visualHook: 'El producto mismo es la sorpresa del primer fotograma.' },
  TEXT_ON_SCREEN_CONTRADICTION: { id: 'text_on_screen_contradiction', firstFrame: 'Texto en pantalla que contrasta con lo que se ve en la imagen (ej. una rutina calmada + texto inesperado).', visualHook: 'El contraste entre texto e imagen detiene el scroll.' },
  HANDHELD_POV: { id: 'handheld_pov', firstFrame: 'Cámara en mano, punto de vista de quien sostiene el producto real.', visualHook: 'Sensación de cercanía/autenticidad, no producción de estudio.' },
  DIRECT_TO_CAMERA_OPENING: { id: 'direct_to_camera_opening', firstFrame: 'Apertura hablando directo a cámara, sin cortes previos.', visualHook: 'Contacto visual inmediato con quien mira.' },
  QUESTION_ON_SCREEN: { id: 'question_on_screen', firstFrame: 'Una pregunta aparece como texto en pantalla antes de cualquier otra imagen.', visualHook: 'Invita a responder mentalmente antes de seguir viendo.' },
  OBJECT_IN_HAND: { id: 'object_in_hand', firstFrame: 'El producto real en la mano, en primer plano, desde el primer fotograma.', visualHook: 'Ancla visual inmediata al producto real, sin ambigüedad.' },
  POV_FORMAT: { id: 'pov_format', firstFrame: 'Formato "POV:" -- la cámara actúa como los ojos de quien protagoniza la escena.', visualHook: 'Formato nativo de plataformas sociales, invita a proyectarse en la escena.' },
  LISTICLE_OPENING: { id: 'listicle_opening', firstFrame: 'Apertura tipo lista ("3 cosas que...") con texto numerado en pantalla.', visualHook: 'Promesa de estructura clara, reduce la fricción de seguir viendo.' },
  INGREDIENT_MACRO: { id: 'ingredient_macro', firstFrame: 'Plano macro de los ingredientes reales del producto (nunca inventados).', visualHook: 'Transparencia visual sobre qué contiene realmente.' },
  ROUTINE_INTERRUPTION: { id: 'routine_interruption', firstFrame: 'Una rutina cotidiana en curso se interrumpe por un instante inesperado.', visualHook: 'El quiebre de un patrón esperado capta la atención.' },
  // NUNCA un antes/después de resultado corporal -- solo contextos/momentos
  // simultáneos (ej. rutina caótica vs. rutina simple), jamás una
  // afirmación visual de transformación física no demostrada.
  SPLIT_SCREEN: { id: 'split_screen', firstFrame: 'Pantalla dividida mostrando dos contextos o momentos simultáneos (nunca un antes/después de resultado corporal).', visualHook: 'La comparación de contexto (no de resultado) crea tensión visual segura.' },
});

export function assertValidScrollStoppingPattern(patternId) {
  const valid = Object.values(SCROLL_STOPPING_PATTERNS).map((p) => p.id);
  if (!valid.includes(patternId)) throw new Error(`marketingPlaybook: "${patternId}" no es un ScrollStoppingPattern válido (${valid.join(', ')}).`);
}

// ---------------------------------------------------------------------
// CTA STRATEGIES — reemplaza la CTA única (Fase de Creative Quality,
// Parte 8). Todas terminan en el canal real y disponible (WhatsApp) --
// nunca inventan descuento/promoción/urgencia/disponibilidad.
// ---------------------------------------------------------------------

export const CTA_STRATEGIES = Object.freeze({
  CURIOSITY: { id: 'curiosity', build: (n) => `¿Quieres conocer cómo está formulado ${n}? Escríbenos por WhatsApp.` },
  CONVERSATIONAL: { id: 'conversational', build: (n) => `Si quieres saber más, mándanos un WhatsApp y te contamos sobre ${n}.` },
  SOFT: { id: 'soft', build: (n) => `Conoce más sobre ${n} por WhatsApp.` },
  QUESTION: { id: 'question', build: (n) => `¿Quieres saber si ${n} encaja en tu rutina? Escríbenos por WhatsApp.` },
  DIRECT: { id: 'direct', build: (n) => `Escríbenos por WhatsApp para conocer más sobre ${n}.` },
});

export function assertValidCtaStrategy(ctaStrategyId) {
  const valid = Object.values(CTA_STRATEGIES).map((c) => c.id);
  if (!valid.includes(ctaStrategyId)) throw new Error(`marketingPlaybook: "${ctaStrategyId}" no es un CtaStrategy válido (${valid.join(', ')}).`);
}

export function buildCta(ctaStrategyId, nombreComercial) {
  assertValidCtaStrategy(ctaStrategyId);
  const strategy = Object.values(CTA_STRATEGIES).find((c) => c.id === ctaStrategyId);
  return strategy.build(nombreComercial);
}

// ---------------------------------------------------------------------
// COPY STYLE — dimensión real que afecta la redacción, no solo metadata
// (Fase de Creative Quality, Parte 4/7 y Parte 11 del encargo). Cada
// estilo define, por sección de CopyStructure, CÓMO se redacta esa
// sección -- todas parten de los mismos fragmentos reales
// (problema/beneficios/ingredientes/nombreComercial/painFragment), nunca
// agregan un hecho nuevo, solo cambian ritmo/voz/estructura.
// ---------------------------------------------------------------------

export const COPY_STYLES = Object.freeze({
  UGC_CONVERSATIONAL: { id: 'UGC_CONVERSATIONAL', label: 'UGC conversacional', toneLabel: 'cercano y conversacional' },
  EDUCATIONAL: { id: 'EDUCATIONAL', label: 'Educativo', toneLabel: 'curioso y educativo' },
  STORYTELLING: { id: 'STORYTELLING', label: 'Storytelling', toneLabel: 'narrativo y cercano' },
  POV: { id: 'POV', label: 'POV', toneLabel: 'directo en segunda persona' },
  LIFESTYLE: { id: 'LIFESTYLE', label: 'Lifestyle', toneLabel: 'aspiracional' },
  DIRECT_RESPONSE: { id: 'DIRECT_RESPONSE', label: 'Direct response', toneLabel: 'directo y persuasivo' },
});

export function assertValidCopyStyle(copyStyleId) {
  if (!Object.keys(COPY_STYLES).includes(copyStyleId)) {
    throw new Error(`marketingPlaybook: "${copyStyleId}" no es un CopyStyle válido (${Object.keys(COPY_STYLES).join(', ')}).`);
  }
}

/** El tone ya no se calcula por separado y queda sin usar (bug real corregido) -- es SIEMPRE una etiqueta derivada del copyStyle real que efectivamente redactó el copy. */
export function deriveToneLabel(copyStyleId) {
  assertValidCopyStyle(copyStyleId);
  return COPY_STYLES[copyStyleId].toneLabel;
}

// Redactores reales por sección x copyStyle. Cada función recibe el
// fragmento factual YA extraído (nunca el objeto facts completo) y
// devuelve una oración -- nunca inventa contenido, solo la forma.
export const COPY_STYLE_SECTION_RENDERERS = Object.freeze({
  problem: {
    UGC_CONVERSATIONAL: (fragment) => `¿Te ha pasado? ${limpiar(fragment)}.`,
    EDUCATIONAL: (fragment) => `${limpiar(fragment)}.`,
    STORYTELLING: (fragment) => `Imagina esto: ${minuscula(fragment)}.`,
    POV: (fragment) => `POV: ${minuscula(fragment)}.`,
    LIFESTYLE: (fragment) => `${limpiar(fragment)}.`,
    DIRECT_RESPONSE: (fragment) => `${limpiar(fragment)}.`,
  },
  mechanism: {
    UGC_CONVERSATIONAL: (fragment, n) => `Resulta que ${n} tiene ${minuscula(fragment)}.`,
    EDUCATIONAL: (fragment, n) => `${n} incluye ${minuscula(fragment)}.`,
    STORYTELLING: (fragment, n) => `Ahí es donde entra ${n}, con ${minuscula(fragment)}.`,
    POV: (fragment, n) => `Encuentras ${n}, formulado con ${minuscula(fragment)}.`,
    LIFESTYLE: (fragment, n) => `${n} está hecho con ${minuscula(fragment)}.`,
    DIRECT_RESPONSE: (fragment, n) => `${n} está formulado con ${minuscula(fragment)}.`,
  },
  productReveal: {
    UGC_CONVERSATIONAL: (fragment, n) => `Y sí — ${minuscula(fragment)}.`,
    EDUCATIONAL: (fragment, n) => `Documentado para: ${minuscula(fragment)}.`,
    STORYTELLING: (fragment, n) => `Con el tiempo, ${n} apunta a esto: ${minuscula(fragment)}.`,
    POV: (fragment, n) => `${n}: ${minuscula(fragment)}.`,
    LIFESTYLE: (fragment, n) => `${n} — ${minuscula(fragment)}.`,
    DIRECT_RESPONSE: (fragment, n) => `${n}: ${minuscula(fragment)}.`,
  },
});

export function renderCopyStyleSection(section, copyStyleId, fragment, nombreComercial) {
  assertValidCopyStyle(copyStyleId);
  const renderers = COPY_STYLE_SECTION_RENDERERS[section];
  if (!renderers) throw new Error(`renderCopyStyleSection: sección "${section}" sin redactores de copyStyle definidos.`);
  const renderer = renderers[copyStyleId];
  if (!renderer) throw new Error(`renderCopyStyleSection: copyStyle "${copyStyleId}" sin redactor para la sección "${section}".`);
  return renderer(fragment, nombreComercial);
}

// ---------------------------------------------------------------------
// MechanismStrategy: reglas, no texto pre-escrito. Nunca inventa un
// mecanismo -- solo ensambla, a partir de campos reales de Product Facts,
// una frase que explica POR QUÉ, usando exclusivamente lo documentado.
// Sigue usándose para angleText/CreativeVariant.mechanism (campos
// estratégicos internos) -- para el COPY visible, hypothesisCopyProvider.js
// ya NO usa esta combinación (ver corrección de duplicación, Fase de
// Creative Quality Parte 3): mechanism-en-copy usa solo ingredientes,
// productReveal-en-copy usa solo beneficios, nunca ambos el mismo campo.
// ---------------------------------------------------------------------

/** @param {{ingredientes:?string, beneficios:?string}} facts */
export function buildMechanismStatement(facts) {
  const ingredientes = limpiar(facts?.ingredientes);
  const beneficios = limpiar(facts?.beneficios);
  if (!ingredientes && !beneficios) {
    throw new Error('buildMechanismStatement: se requiere al menos "ingredientes" o "beneficios" reales -- nunca se inventa un mecanismo.');
  }
  if (ingredientes && beneficios) return `${ingredientes}, documentado para: ${beneficios}`;
  return ingredientes || beneficios;
}

// ---------------------------------------------------------------------
// Persona/Pain Framing — varían la FORMA (life situation / relationship /
// painFragment), nunca inventan contenido -- siempre reciben el hecho real
// como parámetro. buildPainFragment (Fase de Creative Quality, Parte 6) es
// lo que antes faltaba: el mismo Product Fact reencuadrado de forma
// distinta por variante, siempre marcado como hipótesis en
// hypothesisCreativeEngine.js (nunca aquí, este archivo no construye
// PainHypothesis, solo el fragmento de texto que la alimenta).
// ---------------------------------------------------------------------

export const PERSONA_FRAMINGS = Object.freeze({
  routine_seeker: {
    label: 'orientada a simplicidad de rutina',
    buildName: () => 'La que busca simplicidad en su rutina (hipótesis)',
    buildLifeSituation: (problema) => `Enfrenta, en su día a día, algo relacionado con: ${limpiar(problema)}.`,
    buildRelationship: () => 'Busca una opción que no le exija cambiar toda su rutina de golpe.',
    buildPainFragment: (facts) => `fricción para mantener una rutina consistente frente a "${limpiar(facts.problema ?? facts.beneficios)}"`,
    // Fragmento CORTO para el HOOK (Fase de Creative Quality, corrección de
    // hook demasiado largo): nunca repite el fact completo entre comillas
    // -- el fact real sigue apareciendo, grounded, en la sección "problem"
    // del cuerpo y en painHypothesis.painPoint (buildPainFragment arriba).
    // El hook solo necesita el ENCUADRE corto, no la cita literal.
    buildPainHookFragment: () => 'mantener una rutina consistente',
  },
  wellness_curious: {
    label: 'curiosa de bienestar',
    buildName: () => 'La curiosa de bienestar (hipótesis)',
    buildLifeSituation: (problema) => `Está atenta a productos relacionados con: ${limpiar(problema)}.`,
    buildRelationship: () => 'Quiere entender primero cómo funciona algo antes de probarlo.',
    buildPainFragment: (facts) => `interés en apoyar su rutina con algo relacionado a "${limpiar(facts.beneficios ?? facts.problema)}"`,
    buildPainHookFragment: () => 'apoyar tu rutina con algo real',
  },
  aspirational: {
    label: 'aspiracional',
    buildName: () => 'La aspiracional (hipótesis)',
    buildLifeSituation: (problema) => `Piensa en mejorar su rutina en torno a: ${limpiar(problema)}.`,
    buildRelationship: () => 'Se imagina una versión de sí misma con mejores hábitos.',
    buildPainFragment: (facts) => `interés en bienestar y consistencia a largo plazo, en el contexto de "${limpiar(facts.problema ?? facts.beneficios)}"`,
    buildPainHookFragment: () => 'una rutina con mejores hábitos',
  },
  evaluator: {
    label: 'que compara antes de decidir',
    buildName: () => 'La que compara antes de decidir (hipótesis)',
    buildLifeSituation: (problema) => `Ya probó más de una alternativa relacionada con: ${limpiar(problema)}.`,
    buildRelationship: () => 'Quiere entender qué la diferencia antes de elegir.',
    buildPainFragment: (facts) => `necesidad de comparar antes de decidir, frente a "${limpiar(facts.problema ?? facts.beneficios)}"`,
    buildPainHookFragment: () => 'elegir entre tantas opciones',
  },
  newcomer: {
    label: 'nueva en el tema',
    buildName: () => 'La que recién se entera (hipótesis)',
    buildLifeSituation: (problema) => `Todavía no conoce bien las opciones para: ${limpiar(problema)}.`,
    buildRelationship: () => 'Está en una etapa temprana de considerar el problema, no de buscar solución.',
    buildPainFragment: (facts) => `desconocimiento inicial sobre opciones para "${limpiar(facts.problema ?? facts.beneficios)}"`,
    buildPainHookFragment: () => 'por dónde empezar',
  },
});

export function assertValidPersonaFraming(framingId) {
  if (!Object.keys(PERSONA_FRAMINGS).includes(framingId)) {
    throw new Error(`marketingPlaybook: "${framingId}" no es un PersonaFraming válido (${Object.keys(PERSONA_FRAMINGS).join(', ')}).`);
  }
}

// ---------------------------------------------------------------------
// CopyStructure: esqueleto estructural por awareness stage -- remapeado
// (Fase de Creative Quality, Parte 2/Fase 2) al framework de 3 fases de
// intención de copy (Awareness: Problem->Amplify->Hint; Consideration:
// Solution->Mechanism->Proof; Decision: Proof->Risk Removal->CTA),
// conservando los 5 awareness stages REALES de awareness.js sin tocar ese
// archivo -- solo cambia qué estructura usa cada uno. "Proof" en este
// proyecto SOLO puede significar Product Fact/mecanismo documentado,
// NUNCA testimonio/review/estadística inventada (Fase 2 del encargo).
// ---------------------------------------------------------------------

export const COPY_STRUCTURE_BY_AWARENESS = Object.freeze({
  // Fase AWARENESS del framework: problem -> amplify(mechanism, como
  // contexto) -> hint at solution (productReveal, sin CTA todavía de
  // "compra", solo introducción).
  Unaware: ['hook', 'problem', 'mechanism', 'productReveal', 'cta'],
  'Problem Aware': ['hook', 'problem', 'mechanism', 'productReveal', 'cta'],
  // Fase CONSIDERATION: solution(=hook ya asume que conoce la categoría) ->
  // mechanism -> proof(=productReveal, el Product Fact real como "prueba").
  'Solution Aware': ['hook', 'mechanism', 'productReveal', 'cta'],
  // Fase DECISION: proof(=productReveal) -> cta directo, sin agitar el
  // problema (ya lo conoce) ni re-explicar el mecanismo completo.
  'Product Aware': ['hook', 'productReveal', 'cta'],
  'Most Aware': ['hook', 'cta'],
});

export function copyStructureFor(awarenessStage) {
  const structure = COPY_STRUCTURE_BY_AWARENESS[awarenessStage];
  if (!structure) throw new Error(`copyStructureFor: sin CopyStructure definida para el awareness stage "${awarenessStage}".`);
  return structure;
}

// ---------------------------------------------------------------------
// VisualStyle -- expandido (Fase de Creative Quality, Parte 6/9/12) con
// motionDirection/textOverlayStyle. firstFrame/visualHook por variante
// vienen de SCROLL_STOPPING_PATTERNS (combinado en
// hypothesisCreativeEngine.js), no de aquí -- este archivo solo declara
// ESTILOS de escena/cámara/luz, nunca genera ni llama a ningún proveedor
// de imagen.
// ---------------------------------------------------------------------

export const VISUAL_STYLES = Object.freeze({
  ugc_lifestyle: {
    sceneDescription: 'Ambiente cotidiano real, luz natural, cámara en mano, estilo espontáneo.',
    cameraDirection: 'Encuadre cercano, ligero movimiento de cámara en mano.',
    lightingDirection: 'Luz natural de interior, sin iluminación de estudio.',
    motionDirection: 'Movimiento leve e imperfecto de cámara en mano, sin estabilización de estudio.',
    textOverlayStyle: 'Texto mínimo, estilo subtítulo casual, aparece y desaparece rápido.',
  },
  educational_product: {
    sceneDescription: 'Fondo limpio y neutro, producto en primer plano, estilo editorial.',
    cameraDirection: 'Encuadre cenital o frontal, cámara estática.',
    lightingDirection: 'Luz uniforme y difusa, sin sombras duras.',
    motionDirection: 'Cámara estática, foco progresivo hacia el producto/ingrediente.',
    textOverlayStyle: 'Etiquetas de texto claras, tipo infografía, alineadas a cada elemento mostrado.',
  },
  aspirational_lifestyle: {
    sceneDescription: 'Espacio luminoso y cuidado, composición amplia.',
    cameraDirection: 'Plano medio, cámara estática, ligera profundidad de campo.',
    lightingDirection: 'Luz cálida de mañana.',
    motionDirection: 'Movimiento lento y fluido, sin cortes bruscos.',
    textOverlayStyle: 'Tipografía grande y espaciada, aparición suave (fade in).',
  },
  clean_comparison: {
    sceneDescription: 'Fondo neutro, composición de comparación estructurada.',
    cameraDirection: 'Encuadre frontal simétrico, cámara estática.',
    lightingDirection: 'Luz uniforme, sin sombras marcadas.',
    motionDirection: 'Sin movimiento de cámara -- el contraste lo aporta la composición, nunca una animación de "resultado".',
    textOverlayStyle: 'Texto comparativo en columnas o lados opuestos de la pantalla.',
  },
  demo_everyday: {
    sceneDescription: 'Cocina o espacio doméstico real.',
    cameraDirection: 'Encuadre cercano sobre la encimera, cámara estática.',
    lightingDirection: 'Luz natural de mañana.',
    motionDirection: 'Movimiento natural de manos usando el producto, cámara estática.',
    textOverlayStyle: 'Texto numerado breve (estilo lista), sincronizado con la acción.',
  },
});

export function assertValidVisualStyle(styleId) {
  if (!Object.keys(VISUAL_STYLES).includes(styleId)) {
    throw new Error(`marketingPlaybook: "${styleId}" no es un VisualStyle válido (${Object.keys(VISUAL_STYLES).join(', ')}).`);
  }
}

// ---------------------------------------------------------------------
// VariantBlueprints -- 5 combinaciones curadas a mano, deterministas, cada
// una distinta en TODAS las dimensiones reales: personaFraming, angle,
// hook(type), copyStyle, ctaStrategy, awareness, format, visualStyle,
// scrollStoppingPattern (Fase de Creative Quality, Parte 13 del encargo
// original + benchmark de esta fase).
// ---------------------------------------------------------------------

export const VARIANT_BLUEPRINTS = Object.freeze([
  Object.freeze({
    id: 'A', personaFraming: 'routine_seeker', angle: ANGLE_STRATEGIES.CONVENIENCE.id, hook: HOOK_STRATEGIES.QUESTION.id,
    copyStyle: COPY_STYLES.UGC_CONVERSATIONAL.id, ctaStrategy: CTA_STRATEGIES.CONVERSATIONAL.id,
    awareness: 'Problem Aware', format: 'Native TikTok-style', visualStyle: 'ugc_lifestyle',
    scrollStoppingPattern: SCROLL_STOPPING_PATTERNS.DIRECT_TO_CAMERA_OPENING.id,
  }),
  Object.freeze({
    id: 'B', personaFraming: 'wellness_curious', angle: ANGLE_STRATEGIES.MECHANISM.id, hook: HOOK_STRATEGIES.CURIOSITY.id,
    copyStyle: COPY_STYLES.EDUCATIONAL.id, ctaStrategy: CTA_STRATEGIES.CURIOSITY.id,
    awareness: 'Solution Aware', format: 'Educational walk-and-talk', visualStyle: 'educational_product',
    scrollStoppingPattern: SCROLL_STOPPING_PATTERNS.INGREDIENT_MACRO.id,
  }),
  Object.freeze({
    id: 'C', personaFraming: 'aspirational', angle: ANGLE_STRATEGIES.ASPIRATION.id, hook: HOOK_STRATEGIES.PATTERN_INTERRUPT.id,
    copyStyle: COPY_STYLES.LIFESTYLE.id, ctaStrategy: CTA_STRATEGIES.SOFT.id,
    awareness: 'Product Aware', format: 'POV personal story', visualStyle: 'aspirational_lifestyle',
    scrollStoppingPattern: SCROLL_STOPPING_PATTERNS.POV_FORMAT.id,
  }),
  Object.freeze({
    // Most Aware (fase DECISION del framework: proof -> cta directo) casa
    // naturalmente con DIRECT_RESPONSE + hook contrarian -- también deja
    // los 5 blueprints cubriendo los 5 awareness stages reales sin
    // repetir ninguno (antes B y D compartían "Solution Aware").
    id: 'D', personaFraming: 'evaluator', angle: ANGLE_STRATEGIES.COMPARISON.id, hook: HOOK_STRATEGIES.CONTRARIAN.id,
    copyStyle: COPY_STYLES.DIRECT_RESPONSE.id, ctaStrategy: CTA_STRATEGIES.DIRECT.id,
    awareness: 'Most Aware', format: 'Static comparison frames', visualStyle: 'clean_comparison',
    scrollStoppingPattern: SCROLL_STOPPING_PATTERNS.SPLIT_SCREEN.id,
  }),
  Object.freeze({
    id: 'E', personaFraming: 'newcomer', angle: ANGLE_STRATEGIES.DISCOVERY.id, hook: HOOK_STRATEGIES.STORY.id,
    copyStyle: COPY_STYLES.STORYTELLING.id, ctaStrategy: CTA_STRATEGIES.QUESTION.id,
    awareness: 'Unaware', format: 'Skit conversation', visualStyle: 'demo_everyday',
    scrollStoppingPattern: SCROLL_STOPPING_PATTERNS.ROUTINE_INTERRUPTION.id,
  }),
]);

/**
 * Selecciona N blueprints deterministas (siempre los mismos N primeros, sin
 * aleatoriedad) -- mismo criterio de determinismo que todo el resto del
 * proyecto (ej. computeGenerationFingerprint en image-generation/).
 */
export function selectVariantBlueprints(count) {
  if (!Number.isInteger(count) || count < 2 || count > VARIANT_BLUEPRINTS.length) {
    throw new Error(`selectVariantBlueprints: "count" debe ser un entero entre 2 y ${VARIANT_BLUEPRINTS.length} (recibido ${count}).`);
  }
  return Object.freeze(VARIANT_BLUEPRINTS.slice(0, count));
}
