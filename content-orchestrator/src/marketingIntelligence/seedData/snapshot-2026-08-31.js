// snapshot-2026-08-31.js — Curación versionada de señales para el
// snapshot "snapshot-2026-08-31", transcritas de
// docs/research/vida-divina-market-intelligence-2026-08-31.md (fuente de
// verdad legible por humanos). Este archivo ES la fuente de verdad
// versionada de los datos estructurados -- los JSON generados por
// ingestMarketingIntelligenceSnapshot20260831.mjs en
// content-orchestrator/data/marketing-intelligence/ son un artefacto
// regenerable (esa carpeta está en .gitignore), no al revés.
//
// `seedKey` es un identificador de conveniencia SOLO para este archivo
// (nunca se guarda en el registro final) -- permite que las oportunidades
// en OPPORTUNITIES referencien señales de SIGNALS antes de que existan sus
// ids reales (los ids reales son randomUUID(), generados al ingerir).
//
// Ningún campo se rellena si el reporte de origen no lo documenta
// explícitamente (sección 6: "no rellenar campos que no existan en la
// evidencia") -- confidence NUNCA se sube respecto al evidenceLevel citado
// en el reporte (sección 48).

const REPORT_PATH = 'docs/research/vida-divina-market-intelligence-2026-08-31.md';
const ref = (section) => `${REPORT_PATH} — ${section}`;

// productId alineado con assets/products/<slug>/ ya existente en el repo.
const PRODUCT = Object.freeze({
  TONGKAT_ALI_CAFE: 'tongkat-ali-cafe',
  SCULPT_TONGKAT_ALI: 'sculpt-tongkat-ali',
  SCULPT_BLACK: 'sculpt-black',
  CAPPUCCINO: 'cappuccino',
  VENUS: 'venus-capsules',
  RIPPED: 'ripped-capsules',
  MARS: 'mars-capsules',
  TREMELLA: 'extracto-tremella',
  TE_DIVINA: 'te-divina',
});

const CATEGORY = Object.freeze({
  CAFE_DIVINA: 'cafe-divina',
  CONTROL_DE_PESO: 'control-de-peso',
  INTIMIDAD_LIBIDO: 'intimidad-libido',
  RENDIMIENTO_FISICO: 'rendimiento-fisico',
  EXTRACTOS_HONGOS: 'extractos-hongos',
  MARCA: 'marca',
  MLM_OPORTUNIDAD: 'mlm-oportunidad',
  MERCADO_GENERAL: 'mercado-general',
  REGULATORIO: 'regulatorio',
  COMERCIO_SOCIAL: 'comercio-social',
  CONTENIDO_HOOKS: 'contenido-hooks',
});

const CAPTURED_AT = '2026-08-31';

export const SIGNALS = [
  // ---------------------------------------------------------------------
  // BrandSignal — sección 2 (Marca)
  // ---------------------------------------------------------------------
  {
    seedKey: 'brand-official-site',
    type: 'BrandSignal', title: 'Sitio oficial vidadivina.com con estructura alineada al catálogo interno',
    description: 'Estructura /es/productos alineada a nombres de categoría internos (TeDivina®, Café Divina®, Vida Nutrición, Radien skincare).',
    category: CATEGORY.MARCA, source: 'vidadivina.com', sourceType: 'OFFICIAL',
    capturedAt: CAPTURED_AT, timeWindow: 'not_time_bound',
    observation: 'Sitio oficial verificado con estructura de categorías consistente con el catálogo interno del proyecto.',
    whyItMatters: 'Confirma identidad oficial de marca como ancla para cualquier verificación posterior.',
    evidenceLevel: 'HIGH', claimType: 'FACT', tags: ['brand-identity'],
    rawReference: ref('Sección 2 — Identidad y presencia oficial'),
  },
  {
    seedKey: 'brand-founders',
    type: 'BrandSignal', title: 'Fundada en 2016 por Armand Puyolt y Dra. Esther Ramos',
    description: 'Puyolt con trayectoria previa en ACN, Metabolife International, Kyani y Total Life Changes.',
    category: CATEGORY.MARCA, source: 'scamrisk.com, mlmreviewed.com', sourceType: 'WEB',
    capturedAt: CAPTURED_AT, timeWindow: 'not_time_bound',
    observation: 'Corroborado por 2 sitios de reseña MLM independientes (no oficiales de Vida Divina).',
    whyItMatters: 'Contexto de fundación relevante para due diligence de marca, pero fuente no oficial.',
    evidenceLevel: 'MEDIUM', claimType: 'FACT', independentSourceCount: 2, sourceCount: 2,
    tags: ['brand-identity'], rawReference: ref('Sección 2 — Identidad y presencia oficial'),
  },
  {
    seedKey: 'brand-fda-claim-risk',
    type: 'BrandSignal', title: 'Claim histórico "FDA Certified" es factualmente incorrecto',
    description: 'La FDA no certifica empresas; señalado como bandera roja de cumplimiento por 2+ reviewers independientes.',
    category: CATEGORY.MARCA, source: 'Reviewers MLM independientes (3+ sitios)', sourceType: 'WEB',
    capturedAt: CAPTURED_AT, timeWindow: 'not_time_bound',
    observation: 'Corroborado en 3+ sitios de reseña independientes como red flag de cumplimiento.',
    whyItMatters: 'Riesgo de marca ACTIVO y accionable — revisar y eliminar de cualquier material vigente. Ver también RegulatoryRisk de publicidad engañosa.',
    evidenceLevel: 'MEDIUM', claimType: 'RECOMMENDATION', independentSourceCount: 3, sourceCount: 3,
    tags: ['brand-risk', 'compliance', 'P0'], rawReference: ref('Sección 2 — Señales de riesgo de marca'),
  },
  {
    seedKey: 'brand-side-effects-reported',
    type: 'BrandSignal', title: 'Efectos secundarios reportados en líneas de café/estimulantes y té',
    description: 'Náusea, malestar estomacal, dolor de cabeza, insomnio, taquicardia.',
    category: CATEGORY.MARCA, source: 'Reseñas de terceros', sourceType: 'USER_GENERATED',
    capturedAt: CAPTURED_AT, timeWindow: 'not_time_bound',
    observation: 'Complaint pattern reportado en reseñas de producto de terceros.',
    whyItMatters: 'Relevante para FAQ/objeciones de seguridad de la línea de café y té.',
    evidenceLevel: 'MEDIUM', claimType: 'SIGNAL', tags: ['brand-risk', 'safety'],
    rawReference: ref('Sección 2 — Señales de riesgo de marca'),
  },
  {
    seedKey: 'brand-distributor-economics',
    type: 'BrandSignal', title: 'Economía de distribuidor: paquetes $120–$1,360 USD, comisiones "tiny 25–50%"',
    description: 'Estimación de ganancia anual típica de distribuidor de $500–$2,000 USD antes de compras de producto requeridas.',
    category: CATEGORY.MLM_OPORTUNIDAD, source: 'Sitios de reseña MLM', sourceType: 'WEB',
    capturedAt: CAPTURED_AT, timeWindow: 'not_time_bound',
    observation: 'Cifras reportadas de forma consistente en sitios de reseña de oportunidad MLM, no fuente oficial.',
    whyItMatters: 'Contexto para manejo de objeción de precio/estructura de ingreso de distribuidor.',
    evidenceLevel: 'MEDIUM', claimType: 'SIGNAL', tags: ['mlm', 'distributor-economics'],
    rawReference: ref('Sección 2 — Señales de riesgo de marca'),
  },
  {
    seedKey: 'brand-name-collision',
    type: 'BrandSignal', title: 'BRAND_SEARCH_DISAMBIGUATION — "Vida Divina" colisiona con frase devocional común',
    description: '"Vida Divina" es frase devocional común en español/portugués; búsqueda de nombre desnudo retorna >90% ruido religioso/espiritual/deportivo (33/35 resultados en una corrida --deep).',
    category: CATEGORY.MARCA, source: 'last30days (X, cross-platform --deep)', sourceType: 'SOCIAL',
    capturedAt: CAPTURED_AT, timeWindow: '30d',
    observation: '33 de 35 resultados de X en una búsqueda --deep fueron contenido cristiano/espiritual o no relacionado; confirmado independientemente por 2 líneas de investigación distintas.',
    whyItMatters: 'Todo listening/SEO/targeting debe anclarse en hashtags distintivos, nunca en el nombre desnudo. La ausencia de conversación detectable es límite de dato, no ausencia real de reconocimiento de marca.',
    evidenceLevel: 'HIGH', claimType: 'FACT', independentSourceCount: 2, sourceCount: 2,
    tags: ['BRAND_SEARCH_DISAMBIGUATION', 'methodology'],
    details: {
      subtype: 'BRAND_SEARCH_DISAMBIGUATION',
      queryExpansion: ['#vidadivina', '#mlm', '#emprendimiento', '#tedivina', '#cafevidadivina'],
      negativeContext: ['oración', 'devocional', 'Dios', 'espiritual', 'fútbol'],
      requiredContext: ['Vida Divina', 'suplementos OR MLM OR wellness OR México'],
      implementedInAutomatedSearch: false,
    },
    rawReference: ref('Sección 2 — Colisión de nombre (hallazgo consolidado)'),
  },
  {
    seedKey: 'brand-distributor-culture',
    type: 'BrandSignal', title: 'Contenido orgánico de marca es casi enteramente generado por distribuidores',
    description: 'Consistente en múltiples cuentas TikTok independientes (mariaisabeloficial07, lorevaz777, xochil.coleman, divinapoder29); engagement modesto, cola larga.',
    category: CATEGORY.MARCA, source: 'TikTok (last30days)', sourceType: 'SOCIAL',
    capturedAt: CAPTURED_AT, timeWindow: '30d',
    observation: 'Contenido de distribuidores mezcla lenguaje espiritual/religioso con pitch de oportunidad de ingreso; fundador tratado con reverencia personal fuerte, consistente en 3+ cuentas.',
    whyItMatters: 'El mayor riesgo regulatorio/reputacional recae en gobernanza de contenido de distribuidor, no en marketing corporativo. Ver RegulatoryRisk de publicidad de influencer no declarada.',
    evidenceLevel: 'MEDIUM', claimType: 'SIGNAL', independentSourceCount: 3, sourceCount: 3,
    tags: ['distributor-content'], rawReference: ref('Sección 2 — Cultura de distribuidores y estilo de contenido'),
  },
  {
    seedKey: 'brand-sentiment-advocacy',
    type: 'BrandSignal', title: 'Testimonios de distribuidores en TikTok/YouTube uniformemente positivos',
    category: CATEGORY.MARCA, source: 'TikTok/YouTube (~5 voces independientes)', sourceType: 'SOCIAL',
    capturedAt: CAPTURED_AT, timeWindow: '30d',
    observation: 'Muestra pequeña (~5 voces), sesgada hacia distribuidores activos — direccional, no científico.',
    whyItMatters: 'Señal de sentimiento ADVOCACY, con tamaño de muestra explícito para no sobre-extrapolar.',
    evidenceLevel: 'MEDIUM', claimType: 'SIGNAL', independentSourceCount: 5, sourceCount: 5,
    details: { sentimentType: 'ADVOCACY', sampleSize: 5 },
    tags: ['brand-sentiment'], rawReference: ref('Sección 2 — Sentimiento de marca'),
  },
  {
    seedKey: 'brand-sentiment-balanced-verdict',
    type: 'BrandSignal', title: 'Veredicto de reseña equilibrado: "legítima pero con riesgos del modelo MLM"',
    description: 'scamrisk.com: "empresa legítima... pero el modelo MLM contiene riesgos significativos para la mayoría de participantes" — no es estafa porque vende productos reales y paga correctamente.',
    category: CATEGORY.MARCA, source: 'scamrisk.com', sourceType: 'WEB',
    capturedAt: CAPTURED_AT, timeWindow: 'not_time_bound',
    observation: 'Fuente de reseña MLM no oficial, con incentivo propio, pero es el veredicto más balanceado encontrado.',
    whyItMatters: 'Referencia de sentimiento NEUTRAL/QUESTION para contexto de percepción pública.',
    evidenceLevel: 'MEDIUM', claimType: 'INFERENCE',
    details: { sentimentType: 'NEUTRAL' }, tags: ['brand-sentiment'],
    rawReference: ref('Sección 2 — Sentimiento de marca'),
  },
  {
    seedKey: 'brand-sentiment-antimlm-generic',
    type: 'BrandSignal', title: 'Hilo r/antiMLM sobre ser abordado por distribuidor en un sendero',
    description: '256 upvotes, 41 comentarios, 25-ago-2026 — genérico anti-MLM, no específico de Vida Divina.',
    category: CATEGORY.MLM_OPORTUNIDAD, source: 'Reddit r/antiMLM', sourceType: 'SOCIAL',
    capturedAt: CAPTURED_AT, timeWindow: '30d',
    observation: 'Una sola fuente, sentimiento negativo pero no dirigido específicamente a Vida Divina.',
    whyItMatters: 'Contexto de percepción anti-MLM general que puede transferirse a cualquier marca del modelo, incluida VD.',
    evidenceLevel: 'LOW', claimType: 'SIGNAL',
    details: { sentimentType: 'NEGATIVE', sampleSize: 1 }, tags: ['brand-sentiment', 'mlm'],
    rawReference: ref('Sección 2 — Sentimiento de marca'),
  },

  // ---------------------------------------------------------------------
  // CatalogDiscrepancy — sección 3 (Productos), flags PUBLIC_NOT_IN_PROJECT_CATALOG
  // ---------------------------------------------------------------------
  {
    seedKey: 'catalog-discrepancy-sculpt-tongkat-ali',
    type: 'CatalogDiscrepancy', title: 'Sculpt Tongkat Ali: listados públicos añaden Ginseng, Garcinia Cambogia y Green Tea Extract',
    productId: PRODUCT.SCULPT_TONGKAT_ALI, category: CATEGORY.CAFE_DIVINA,
    source: 'Listados públicos de distribuidor', sourceType: 'USER_GENERATED',
    capturedAt: CAPTURED_AT, timeWindow: 'not_time_bound',
    observation: 'Listados públicos de distribuidor describen ingredientes adicionales ausentes del catálogo interno verificado por foto de empaque (solo Reishi, Tongkat Ali, café arábico, L-Carnitina).',
    whyItMatters: 'Riesgo de credibilidad si un cliente compara catálogo interno vs. reseller. No se corrige el catálogo aquí.',
    evidenceLevel: 'MEDIUM', claimType: 'SIGNAL', tags: ['PUBLIC_NOT_IN_PROJECT_CATALOG', 'escalate-to-owner'],
    details: {
      externalSignal: 'Listados públicos de distribuidor describen adicionalmente Ginseng, Garcinia Cambogia y Green Tea Extract.',
      currentInternalData: '210mg Reishi, Tongkat Ali, café arábico, L-Carnitina (docs/productos/02-cafe-divina/sculpt-tongkat-ali.md).',
      resolutionStatus: 'UNRESOLVED_FOR_BUSINESS_OWNER_REVIEW',
    },
    rawReference: ref('Sección 3 — Producto 2: Sculpt Tongkat Ali'),
  },
  {
    seedKey: 'catalog-discrepancy-venus',
    type: 'CatalogDiscrepancy', title: 'Venus: distribuidor público describe "Tongkat Ali y raíz de Maca en fórmula íntima propietaria"',
    productId: PRODUCT.VENUS, category: CATEGORY.INTIMIDAD_LIBIDO,
    source: 'healthwellnessmart.com y similares', sourceType: 'USER_GENERATED',
    capturedAt: CAPTURED_AT, timeWindow: 'not_time_bound',
    observation: 'Contradice directamente el catálogo interno verificado por foto de empaque (sin Tongkat Ali). Posible confusión de distribuidor con Mars, que sí contiene Tongkat Ali.',
    whyItMatters: 'Inconsistencia pública activa de un ingrediente central — riesgo de credibilidad mayor que el de Sculpt Tongkat Ali. No se corrige el catálogo aquí.',
    evidenceLevel: 'MEDIUM', claimType: 'SIGNAL', tags: ['PUBLIC_NOT_IN_PROJECT_CATALOG', 'escalate-to-owner'],
    details: {
      externalSignal: '"Tongkat Ali y raíz de Maca en fórmula íntima propietaria" (healthwellnessmart.com y similares).',
      currentInternalData: 'Maca, Dong Quai, Vitex, raíz de Yam silvestre, isoflavonas, complejo B — NO incluye Tongkat Ali (docs/productos/08-intimidad-libido.md#venus-capsules).',
      resolutionStatus: 'UNRESOLVED_FOR_BUSINESS_OWNER_REVIEW',
    },
    rawReference: ref('Sección 3 — Producto 5: Cápsulas Venus'),
  },
  {
    seedKey: 'catalog-discrepancy-mars',
    type: 'CatalogDiscrepancy', title: 'Mars: listado Amazon usa "10X Maximum Strength" y "supports prostate health"',
    productId: PRODUCT.MARS, category: CATEGORY.INTIMIDAD_LIBIDO,
    source: 'Amazon (listado de terceros)', sourceType: 'USER_GENERATED',
    capturedAt: CAPTURED_AT, timeWindow: 'not_time_bound',
    observation: 'Título/descripción de tercero incluye "10X Maximum Strength", "Performance Stamina Booster" y "supports prostate health" — ninguno presente en el catálogo interno verificado.',
    whyItMatters: '"10X" y "supports prostate health" leen como el tipo de claim amplificado que CLAUDE.md advierte evitar explícitamente. Se recomienda marcar para revisión, no adoptar el lenguaje.',
    evidenceLevel: 'MEDIUM', claimType: 'FACT', tags: ['PUBLIC_NOT_IN_PROJECT_CATALOG', 'escalate-to-owner', 'claim-risk'],
    details: {
      externalSignal: '"Vida Divina Mars, 10X Maximum Strength Performance Stamina Booster and Healthy Libido Support with Tongkat Ali and Horny Goat Weed" + "supports prostate health".',
      currentInternalData: 'Tongkat Ali, Horny Goat Weed; beneficios limitados a "apoya libido saludable; mejora energía y resistencia; alternativa natural" (docs/productos/08-intimidad-libido.md#mars-capsules).',
      resolutionStatus: 'UNRESOLVED_FOR_BUSINESS_OWNER_REVIEW',
    },
    rawReference: ref('Sección 3 — Producto 7: Cápsulas Mars'),
  },

  // ---------------------------------------------------------------------
  // TrendSignal — secciones 3, 5, 9, 10
  // ---------------------------------------------------------------------
  {
    seedKey: 'trend-tremella-beauty',
    type: 'TrendSignal', title: 'Tremella como "hongo de belleza" / "ácido hialurónico de la naturaleza" en TikTok',
    productId: PRODUCT.TREMELLA, category: CATEGORY.EXTRACTOS_HONGOS,
    source: 'TikTok/YouTube (moonbow_skin, mauimushrooms, byava.co + video científico-explicativo)', sourceType: 'SOCIAL',
    capturedAt: CAPTURED_AT, timeWindow: '30d',
    observation: 'Micro-tendencia activa de skincare, framing de Medicina Tradicional China ("eat your skincare"), corroborada con lenguaje de investigación dermatológica real (polisacáridos elevando aquaporina-3 y síntesis de ácido hialurónico).',
    whyItMatters: 'Mejor ajuste de mercado orgánico de los 9 productos — oportunidad de contenido de bajo riesgo regulatorio (ángulo belleza, no médico).',
    evidenceLevel: 'HIGH', claimType: 'SIGNAL', independentSourceCount: 3, sourceCount: 4,
    details: { direction: 'RISING', platform: 'TikTok' },
    tags: ['tremella', 'beauty-angle', 'opportunity'], rawReference: ref('Sección 3 — Producto 8: Extracto de Tremella'),
  },
  {
    seedKey: 'trend-functional-coffee-open-category',
    type: 'TrendSignal', title: 'Café funcional/adaptógeno en México está abierto, sin líder dominante',
    category: CATEGORY.CAFE_DIVINA,
    source: 'last30days + WebSearch (Gano Café, BPN PRO, Balanfood, Smart Food)', sourceType: 'RESEARCH',
    capturedAt: CAPTURED_AT, timeWindow: '30d',
    observation: 'Competidores identificados tienen bajo engagement individual; categoría con ~11% CAGR global (Mordor Intelligence, a 2031).',
    whyItMatters: 'Ventana de oportunidad de liderazgo de categoría para Café Tongkat Ali, Sculpt Tongkat Ali y Cappuccino.',
    evidenceLevel: 'MEDIUM-HIGH', claimType: 'INFERENCE',
    details: { direction: 'EMERGING' }, tags: ['category-opportunity'],
    rawReference: ref('Sección 1 — Hallazgo 5 / Sección 9'),
  },
  {
    seedKey: 'trend-mushroom-coffee-category-3b',
    type: 'TrendSignal', title: 'Categoría "café de hongos" de rápido crecimiento (~$3B USD citado en 2025)',
    productId: PRODUCT.SCULPT_BLACK, category: CATEGORY.CAFE_DIVINA,
    source: 'WebSearch (Ryze Mushroom Coffee, Everyday Dose como referencia)', sourceType: 'WEB',
    capturedAt: CAPTURED_AT, timeWindow: 'not_time_bound',
    observation: 'Categoría dominada por dos jugadores estadounidenses de referencia, no un competidor mexicano específico.',
    whyItMatters: 'Sculpt Black/Cappuccino compiten conceptualmente en esta categoría global, pero comparten su objeción de dosis.',
    evidenceLevel: 'HIGH', claimType: 'SIGNAL', details: { direction: 'RISING' },
    tags: ['mushroom-coffee'], rawReference: ref('Sección 3 — Producto 3: Sculpt Black'),
  },
  {
    seedKey: 'trend-mexico-supplement-market-size',
    type: 'TrendSignal', title: 'Mercado de suplementos México: >60,000M MXN (~USD 5.78B, 2024), 6-8% CAGR, #2 en LatAm',
    category: CATEGORY.MERCADO_GENERAL,
    source: 'Anaisa (asociación de industria) + estimaciones internacionales (USD 2.65B–5.78B)', sourceType: 'RESEARCH',
    capturedAt: CAPTURED_AT, timeWindow: 'not_time_bound',
    observation: 'Cifra exacta varía considerablemente por fuente/alcance de definición (incluye o no MLM, nutrición deportiva, vitaminas).',
    whyItMatters: 'México es mercado multi-billonario de dólares estructuralmente en crecimiento, #2 en Latinoamérica tras Brasil — no citar ninguna cifra puntual como precisa.',
    evidenceLevel: 'MEDIUM', claimType: 'FACT', details: { direction: 'RISING' },
    tags: ['market-size'], rawReference: ref('Sección 9 — Inteligencia de Mercado'),
  },
  {
    seedKey: 'trend-mexico-ecommerce-growth',
    type: 'TrendSignal', title: 'E-commerce México: $941,000M MXN en 2025 (+19.2% interanual)',
    category: CATEGORY.MERCADO_GENERAL,
    source: 'AMVO', sourceType: 'RESEARCH',
    capturedAt: CAPTURED_AT, timeWindow: 'not_time_bound',
    observation: '77.2 millones de compradores digitales; México 8° globalmente en penetración de retail online (17.7%). Fuente estándar de industria, múltiples artículos corroborantes.',
    whyItMatters: 'Contexto de crecimiento estructural del canal digital, favorable a comercio social/nicho.',
    evidenceLevel: 'HIGH', claimType: 'FACT', independentSourceCount: 2, sourceCount: 2,
    details: { direction: 'RISING' }, tags: ['ecommerce'],
    rawReference: ref('Sección 9 — Inteligencia de Mercado'),
  },
  {
    seedKey: 'trend-tiktok-shop-mexico-growth',
    type: 'TrendSignal', title: 'TikTok Shop México: GMV diario +59x, vendedores activos +25x (feb 2025–ene 2026)',
    category: CATEGORY.COMERCIO_SOCIAL,
    source: 'Expansión.mx (reporte TikTok Shop Hot Sale)', sourceType: 'WEB',
    capturedAt: CAPTURED_AT, timeWindow: '90d',
    observation: 'Dato de la propia plataforma, no auditado externamente — tratar como marketing corporativo. México único laboratorio regional del modelo junto a Brasil en LatAm.',
    whyItMatters: 'Comercio de nicho (suplementos citado explícitamente) es de los modelos con mayor tracción para pymes — canal potencialmente subutilizado por VD.',
    evidenceLevel: 'MEDIUM', claimType: 'FACT', details: { direction: 'RISING', platform: 'TikTok' },
    tags: ['tiktok-shop', 'opportunity'], rawReference: ref('Sección 10 — TikTok Shop / comercio social'),
  },
  {
    seedKey: 'trend-market-mlm-channel-maturity',
    type: 'TrendSignal', title: 'Canal MLM/venta directa maduro y atrayendo capital real, no en declive',
    category: CATEGORY.MLM_OPORTUNIDAD,
    source: 'Direct Selling News Global 100 (Betterware) + inversión Omnilife ($64M planta Texas)', sourceType: 'WEB',
    capturedAt: CAPTURED_AT, timeWindow: 'not_time_bound',
    observation: 'Inclusión de Betterware en ranking global 2025 + inversión de capital continua de Omnilife.',
    whyItMatters: 'Contexto favorable para el modelo de negocio de VD, contrasta con narrativa de "MLM en declive".',
    evidenceLevel: 'MEDIUM', claimType: 'FACT', independentSourceCount: 2, sourceCount: 2,
    details: { direction: 'STABLE' }, tags: ['mlm', 'market-context'],
    rawReference: ref('Sección 9 — Inteligencia de Mercado'),
  },

  // ---------------------------------------------------------------------
  // AudienceSignal — secciones 3, 4
  // ---------------------------------------------------------------------
  {
    seedKey: 'audience-tongkat-ali-dose-literate',
    type: 'AudienceSignal', title: 'Audiencia masculina de Tongkat Ali es dosis-literata, espera extracto estandarizado',
    productId: PRODUCT.TONGKAT_ALI_CAFE, category: CATEGORY.CAFE_DIVINA, audience: 'hombres-biohacking-tongkat-ali',
    source: 'X (biohacking/optimización de testosterona)', sourceType: 'SOCIAL',
    capturedAt: CAPTURED_AT, timeWindow: '30d',
    observation: 'Co-mencionado con Fadogia Agrestis, boro, vitamina D3, zinc, ashwagandha; Huberman/Rogan citados como impulsores de credibilidad mainstream. Lenguaje: "T-boost", "natural test booster", "longjack", "stacking", "standardized extract", "cycling".',
    whyItMatters: 'El catálogo no declara dosis — brecha de credibilidad frente a este segmento específico.',
    evidenceLevel: 'HIGH', claimType: 'SIGNAL', tags: ['dose-literacy', 'biohacking'],
    rawReference: ref('Sección 3 — Producto 1: Café Tongkat Ali'),
  },
  {
    seedKey: 'audience-spanish-metabolic-vocabulary',
    type: 'AudienceSignal', title: 'Audiencia hispanohablante ya tiene vocabulario metabólico sofisticado',
    category: CATEGORY.CONTROL_DE_PESO, audience: 'control-de-peso-general',
    source: 'last30days (framing "quema grasa" en español)', sourceType: 'SOCIAL',
    capturedAt: CAPTURED_AT, timeWindow: '30d',
    observation: 'Framing dominante no es estético sino resistencia a la insulina como causa raíz — vocabulario ya incluye insulina, resistencia, lipólisis.',
    whyItMatters: 'No requiere educación desde cero sobre estos conceptos; el copy puede asumir ese vocabulario.',
    evidenceLevel: 'MEDIUM', claimType: 'FACT', tags: ['audience-sophistication'],
    rawReference: ref('Sección 3 — Producto 3: Sculpt Black'),
  },
  {
    seedKey: 'audience-womens-libido-content-gap',
    type: 'AudienceSignal', title: 'Ecosistema de "libido natural" dominado por audiencia/lenguaje masculino',
    productId: PRODUCT.VENUS, category: CATEGORY.INTIMIDAD_LIBIDO, audience: 'mujeres-bienestar-hormonal',
    source: 'last30days (cross-platform)', sourceType: 'SOCIAL',
    capturedAt: CAPTURED_AT, timeWindow: '30d',
    observation: 'Contenido explícitamente centrado en mujeres es relativamente escaso frente al volumen de contenido masculino de la misma categoría.',
    whyItMatters: 'Oportunidad de diferenciación de contenido real para Venus.',
    evidenceLevel: 'HIGH', claimType: 'SIGNAL', tags: ['content-gap', 'opportunity'],
    rawReference: ref('Sección 3 — Producto 5: Cápsulas Venus'),
  },
  {
    seedKey: 'audience-channel-register-x-vs-reddit',
    type: 'AudienceSignal', title: 'Registro de lenguaje distinto por canal: X (hilo educativo numerado) vs Reddit (crudo, escéptico)',
    category: CATEGORY.MERCADO_GENERAL, audience: 'general-bienestar-mx',
    source: 'last30days (X + Reddit)', sourceType: 'SOCIAL',
    capturedAt: CAPTURED_AT, timeWindow: '30d',
    observation: 'X dirigido a audiencia joven-adulta interesada en optimización; Reddit más coloquial y escéptico.',
    whyItMatters: 'Un mismo producto probablemente necesita dos registros de copy según canal.',
    evidenceLevel: 'LOW', claimType: 'INFERENCE', tags: ['copy-strategy'],
    rawReference: ref('Sección 4 — Nota generacional/de canal'),
  },
];

// ---------------------------------------------------------------------
// PainPoint / DesireSignal — lexicón de sección 4 (una fila = 1 PainPoint + 1 DesireSignal)
// ---------------------------------------------------------------------
const LEXICON_ROWS = [
  {
    key: 'venus', audience: 'mujeres-bienestar-hormonal', category: CATEGORY.INTIMIDAD_LIBIDO, productId: PRODUCT.VENUS,
    problem: '"ya no siento ganas", cansancio hormonal', desire: '"sentirme yo otra vez", energía y ánimo estable',
    language: '"ando mal de ánimo", "ya no me dan ganas de nada", "¿será por la edad?"',
  },
  {
    key: 'tongkat-ali', audience: 'hombres-biohacking-tongkat-ali', category: CATEGORY.CAFE_DIVINA, productId: PRODUCT.TONGKAT_ALI_CAFE,
    problem: 'baja energía, libido baja', desire: '"recuperar mi fuerza/energía natural"',
    language: '"quiero algo natural antes de meterme hormonas", "ya probé de todo"',
  },
  {
    key: 'control-de-peso', audience: 'control-de-peso-general', category: CATEGORY.CONTROL_DE_PESO, productId: null,
    problem: '"no bajo aunque me cuide"', desire: 'resultados visibles + energía, sin sacrificar tanto',
    language: '"ya probé de todo y nada", "¿dan resultados milagrosos??"',
  },
  {
    key: 'mlm-oportunidad', audience: 'prospectos-distribuidor', category: CATEGORY.MLM_OPORTUNIDAD, productId: null,
    problem: 'necesidad de ingreso extra, desconfianza previa', desire: 'libertad de tiempo, ingreso adicional real',
    language: '"es un multinivel, ya sé cómo termina", "mi mamá cayó en algo parecido"',
  },
];

for (const row of LEXICON_ROWS) {
  SIGNALS.push({
    seedKey: `painpoint-${row.key}`,
    type: 'PainPoint', title: `Dolor del cliente: ${row.problem}`,
    productId: row.productId, category: row.category, audience: row.audience,
    source: 'Lexicón de voz del cliente (last30days, cross-platform)', sourceType: 'SOCIAL',
    capturedAt: CAPTURED_AT, timeWindow: '30d',
    observation: `Lenguaje verbatim-style recogido: ${row.language}.`,
    whyItMatters: 'Insumo directo para copy de venta y guiones de contenido segmentados por categoría.',
    evidenceLevel: 'MEDIUM', claimType: 'SIGNAL', tags: ['voice-of-customer', row.key],
    rawReference: ref('Sección 4 — Lexicón por categoría'),
  });
  SIGNALS.push({
    seedKey: `desire-${row.key}`,
    type: 'DesireSignal', title: `Deseo del cliente: ${row.desire}`,
    productId: row.productId, category: row.category, audience: row.audience,
    source: 'Lexicón de voz del cliente (last30days, cross-platform)', sourceType: 'SOCIAL',
    capturedAt: CAPTURED_AT, timeWindow: '30d',
    observation: `Resultado esperado articulado por la audiencia en esta categoría.`,
    whyItMatters: 'Ancla emocional para el ángulo de contenido, complementaria al PainPoint de la misma fila.',
    evidenceLevel: 'MEDIUM', claimType: 'SIGNAL', tags: ['voice-of-customer', row.key],
    rawReference: ref('Sección 4 — Lexicón por categoría'),
  });
}

// Dolores adicionales documentados fuera del lexicón tabular.
SIGNALS.push(
  {
    seedKey: 'painpoint-tongkat-ali-dose-gap',
    type: 'PainPoint', title: 'Brecha de credibilidad: catálogo no declara dosis estandarizada de Tongkat Ali',
    productId: PRODUCT.TONGKAT_ALI_CAFE, category: CATEGORY.CAFE_DIVINA, audience: 'hombres-biohacking-tongkat-ali',
    source: 'Inferencia sobre comportamiento de audiencia dosis-literata', sourceType: 'INFERENCE',
    capturedAt: CAPTURED_AT, timeWindow: '30d',
    observation: 'La audiencia biohacking espera dosis de extracto estandarizado y guía de ciclado; el catálogo no la declara.',
    whyItMatters: 'Documentar como conocimiento de objeción esperada, sin cambiar el catálogo ni inventar una dosis (Recomendación Product Intelligence P1).',
    evidenceLevel: 'MEDIUM', claimType: 'INFERENCE', tags: ['dose-literacy', 'P1'],
    rawReference: ref('Sección 3 — Producto 1: Café Tongkat Ali'),
  },
  {
    seedKey: 'painpoint-reishi-dose-objection',
    type: 'PainPoint', title: 'Reviewer ND cuestiona dosis clínicamente relevante de hongo en café funcional',
    productId: PRODUCT.SCULPT_BLACK, category: CATEGORY.CAFE_DIVINA, audience: 'consumidores-informados-suplementos',
    source: 'Reviewer con licencia ND (417K vistas)', sourceType: 'SOCIAL',
    capturedAt: CAPTURED_AT, timeWindow: '30d',
    observation: '3–10g citado como umbral clínico vs. mg típicos en formato café; 70mg de Reishi de Sculpt Black está órdenes de magnitud por debajo.',
    whyItMatters: 'Riesgo de objeción compartido por toda la línea Café Divina, no exclusivo de Sculpt Black. Mantener fraseo cauteloso del catálogo ("ayuda", "sustenta").',
    evidenceLevel: 'MEDIUM', claimType: 'SIGNAL', tags: ['dose-objection'],
    rawReference: ref('Sección 3 — Producto 3: Sculpt Black'),
  },
  {
    seedKey: 'painpoint-cappuccino-authenticity',
    type: 'PainPoint', title: 'Mención aislada de preocupación de autenticidad/caducidad corta en reventa (eBay)',
    productId: PRODUCT.CAPPUCCINO, category: CATEGORY.CAFE_DIVINA, audience: 'general-bienestar-mx',
    source: 'Listado eBay', sourceType: 'USER_GENERATED',
    capturedAt: CAPTURED_AT, timeWindow: '30d',
    observation: 'Mención única — flag de mercado secundario a monitorear, no patrón confirmado.',
    whyItMatters: 'Monitorear como posible patrón emergente de cadena de suministro (Product Intelligence P2).',
    evidenceLevel: 'LOW', claimType: 'SIGNAL', tags: ['supply-chain-watch', 'P2'],
    rawReference: ref('Sección 3 — Producto 4: Cappuccino'),
  },
);

// ---------------------------------------------------------------------
// Objection — sección 4 (objection library, 7 filas con evidencia real)
// ---------------------------------------------------------------------
const OBJECTIONS = [
  { key: 'effectiveness', category: CATEGORY.CONTROL_DE_PESO, objection: '¿esto sí funciona o es puro cuento / resultado milagroso sin esfuerzo?', evidence: 'r/askColombia, 11 comentarios', evidenceLevel: 'MEDIUM', productId: null },
  { key: 'trust-study-figures', category: CATEGORY.CAFE_DIVINA, objection: 'Escepticismo hacia cifras específicas de estudios citadas en redes (ej. +37% testosterona)', evidence: 'Respuestas escépticas en X a claim de +37% testosterona', evidenceLevel: 'LOW', productId: PRODUCT.TONGKAT_ALI_CAFE },
  { key: 'pregnancy-safety', category: CATEGORY.INTIMIDAD_LIBIDO, objection: 'Maca podría "afectar hormonas" en embarazo/lactancia', evidence: 'r/Supplements, hilo específico (partera recomienda evitarla)', evidenceLevel: 'LOW', productId: PRODUCT.VENUS },
  { key: 'mlm-pyramid', category: CATEGORY.MLM_OPORTUNIDAD, objection: 'Asociación automática "multinivel" = "esquema piramidal", tono de burla/rechazo', evidence: 'Múltiples posts X (general, no específico VD)', evidenceLevel: 'MEDIUM', productId: null },
  { key: 'distributor-package-price', category: CATEGORY.MLM_OPORTUNIDAD, objection: 'Sin evidencia directa de quejas de precio de paquete de distribuidor en esta ventana', evidence: 'Contexto de paquetes $135–$1,360 USD (fuente externa)', evidenceLevel: 'LOW', productId: null },
  { key: 'rebound-post-use', category: CATEGORY.CONTROL_DE_PESO, objection: '¿si las dejas de tomar hay rebote? — sin respuesta de ninguna marca de la categoría', evidence: 'Comentarios reales en post de Dermograss (competidor)', evidenceLevel: 'MEDIUM', productId: PRODUCT.RIPPED },
  { key: 'detox-category', category: CATEGORY.CONTROL_DE_PESO, objection: 'Tu cuerpo ya se desintoxica solo, no necesitas un sobre', evidence: '2+ voces X independientes', evidenceLevel: 'MEDIUM', productId: PRODUCT.TE_DIVINA },
];

for (const o of OBJECTIONS) {
  SIGNALS.push({
    seedKey: `objection-${o.key}`,
    type: 'Objection', title: o.objection,
    productId: o.productId, category: o.category,
    source: o.evidence, sourceType: 'SOCIAL',
    capturedAt: CAPTURED_AT, timeWindow: '30d',
    observation: `Objeción documentada con evidencia real: ${o.evidence}.`,
    whyItMatters: 'Objection library — solo objeciones con evidencia real encontrada, sin inventar categorías no evidenciadas (sabor, entrega, ingredientes fuera de maca/embarazo quedan documentadas como pendientes, no incluidas).',
    evidenceLevel: o.evidenceLevel, claimType: 'SIGNAL',
    independentSourceCount: o.evidence.includes('2+') ? 2 : 1,
    tags: ['objection-library'], rawReference: ref('Sección 4 — Objection library'),
  });
}

// ---------------------------------------------------------------------
// HookPattern — sección 6
// ---------------------------------------------------------------------
const SATURATED_HOOKS = [
  { key: 'recycled-classics', title: 'Ganchos "clásicos" reciclados sin variación ("no vas a creer esto", "espera hasta el final")', evidenceLevel: 'MEDIUM' },
  { key: 'descriptive-no-tension', title: 'Aperturas descriptivas sin tensión ("Hola, hoy te muestro X")', evidenceLevel: 'MEDIUM' },
  { key: 'pov-spoken-aloud', title: 'Decir la palabra "POV" en voz alta como locución hablada', evidenceLevel: 'LOW-MEDIUM' },
  { key: 'unadapted-anglicisms', title: 'Anglicismos de marketing sin adaptar (feedback, trending topic, deadline, "cringe")', evidenceLevel: 'LOW' },
];
const HIGH_SIGNAL_HOOKS = [
  { key: 'question-based', title: 'Hooks basados en preguntas retienen significativamente más', evidenceLevel: 'MEDIUM-HIGH' },
  { key: 'multi-hook', title: '"Multi-hook" reconocido y valorado explícitamente por la audiencia misma', evidenceLevel: 'MEDIUM-HIGH' },
  { key: 'belonging-hook', title: 'Hook de "Pertenencia" ("No compres [producto] a menos que quieras [beneficio]")', evidenceLevel: 'MEDIUM' },
  { key: 'opposite-hook', title: 'Hook "Opuesto" (declaración contraintuitiva resuelta después)', evidenceLevel: 'LOW-MEDIUM' },
  { key: 'visual-rhythm-break', title: 'Hook visual que rompe el ritmo en los primeros segundos', evidenceLevel: 'MEDIUM' },
  { key: 'problem-process-solution', title: 'Estructura problema → proceso → solución → antes/después → CTA', evidenceLevel: 'MEDIUM' },
  { key: 'affiliate-honesty', title: 'Honestidad/negatividad ocasional del creador afiliado como constructor de confianza', evidenceLevel: 'LOW-MEDIUM' },
];

for (const h of SATURATED_HOOKS) {
  SIGNALS.push({
    seedKey: `hook-saturated-${h.key}`,
    type: 'HookPattern', title: h.title,
    category: CATEGORY.CONTENIDO_HOOKS, source: 'last30days (cross-platform, agosto 2026)', sourceType: 'SOCIAL',
    capturedAt: CAPTURED_AT, timeWindow: '30d',
    observation: h.title,
    whyItMatters: 'Patrón saturado — evitar como base de hook, riesgo de fricción/mofa de audiencia.',
    evidenceLevel: h.evidenceLevel, claimType: h.key === 'pov-spoken-aloud' ? 'INFERENCE' : 'SIGNAL',
    details: { saturationLevel: 'HIGH' }, tags: ['hook-pattern', 'saturated'],
    rawReference: ref('Sección 6 — SATURATED_HOOK_PATTERNS'),
  });
}
for (const h of HIGH_SIGNAL_HOOKS) {
  SIGNALS.push({
    seedKey: `hook-high-signal-${h.key}`,
    type: 'HookPattern', title: h.title,
    category: CATEGORY.CONTENIDO_HOOKS, source: 'last30days (audiencia hispanohablante, agosto 2026)', sourceType: 'SOCIAL',
    capturedAt: CAPTURED_AT, timeWindow: '30d',
    observation: h.title,
    whyItMatters: 'Patrón de alta señal — candidato a guion base de próximas piezas de contenido.',
    evidenceLevel: h.evidenceLevel, claimType: 'SIGNAL',
    details: { saturationLevel: 'LOW' }, tags: ['hook-pattern', 'high-signal'],
    rawReference: ref('Sección 6 — HIGH_SIGNAL_HOOK_PATTERNS'),
  });
}
SIGNALS.push({
  seedKey: 'hook-pov-visual-conclusion',
  type: 'HookPattern', title: 'POV funciona como convención visual + texto en pantalla, nunca como locución hablada',
  category: CATEGORY.CONTENIDO_HOOKS, source: 'last30days (síntesis cross-source)', sourceType: 'SOCIAL',
  capturedAt: CAPTURED_AT, timeWindow: '30d',
  observation: 'Ninguna fuente consultada documenta POV como palabra que deba decirse en voz alta; funciona cuando la situación es instantáneamente reconocible y concreta (ej. "POV: te urge energía a las 4pm y ya tomaste dos cafés").',
  whyItMatters: 'RECOMMENDATION: usar POV como herramienta de identificación visual, reservado a situaciones concretas del público VD — nunca como novedad hablada.',
  evidenceLevel: 'MEDIUM', claimType: 'RECOMMENDATION',
  details: { saturationLevel: 'LOW' }, tags: ['hook-pattern', 'pov'],
  rawReference: ref('Sección 6 — Conclusión de uso de POV'),
});

// ---------------------------------------------------------------------
// ContentPattern — sección 14 (Top 10 señales de contenido)
// ---------------------------------------------------------------------
const CONTENT_PATTERNS = [
  { key: 'before-after', title: 'Formato antes/después (30–45s)', audience: 'belleza-fitness-general', productId: null, evidenceLevel: 'MEDIUM' },
  { key: 'short-testimonial', title: 'Testimonial corto (15–30s)', audience: 'general-bienestar-mx', productId: null, evidenceLevel: 'MEDIUM' },
  { key: 'multi-hook-format', title: 'Multi-hook (varios ganchos apilados)', audience: 'consumidores-video-corto-mx', productId: null, evidenceLevel: 'MEDIUM-HIGH' },
  { key: 'question-hooks-format', title: 'Hooks basados en preguntas', audience: 'general-bienestar-mx', productId: null, evidenceLevel: 'MEDIUM-HIGH' },
  { key: 'why-it-works-education', title: 'Contenido educativo "por qué funciona" (no solo "qué hace")', audience: 'consumidores-informados-suplementos', productId: null, evidenceLevel: 'MEDIUM' },
  { key: 'pov-visual-onscreen', title: 'POV visual + texto en pantalla (nunca hablado)', audience: 'tiktok-reels-jovenes-adultos', productId: null, evidenceLevel: 'MEDIUM' },
  { key: 'carousel-plus-reel', title: 'Carrusel + Reel combinados', audience: 'instagram-mexico-2026', productId: null, evidenceLevel: 'MEDIUM' },
  { key: 'seasonal-calendar-anchors', title: 'Anclas de calendario estacional (regreso a clases, etc.)', audience: 'compradoras-tiktok-shop', productId: null, evidenceLevel: 'MEDIUM' },
  { key: 'affiliate-honesty-format', title: 'Honestidad ocasional del afiliado ("esto no lo volvería a comprar")', audience: 'seguidores-creadores-tiktok-shop', productId: null, evidenceLevel: 'LOW-MEDIUM' },
  { key: 'live-shopping-demo', title: 'Live shopping / demostración en vivo', audience: 'compradoras-belleza-retail-mx', productId: PRODUCT.TREMELLA, evidenceLevel: 'MEDIUM' },
];
for (const c of CONTENT_PATTERNS) {
  SIGNALS.push({
    seedKey: `content-pattern-${c.key}`,
    type: 'ContentPattern', title: c.title,
    productId: c.productId, category: CATEGORY.CONTENIDO_HOOKS, audience: c.audience,
    source: 'last30days + fuentes de marketing digital MX', sourceType: 'SOCIAL',
    capturedAt: CAPTURED_AT, timeWindow: '30d',
    observation: c.title,
    whyItMatters: 'Insumo directo para brief de formato de próximas piezas de contenido.',
    evidenceLevel: c.evidenceLevel, claimType: 'SIGNAL', tags: ['content-pattern'],
    rawReference: ref('Sección 14 — Top 10 Señales de Contenido'),
  });
}

// ---------------------------------------------------------------------
// CreativeAngleSignal — ángulos identificados en secciones 3 y 12
// ---------------------------------------------------------------------
SIGNALS.push(
  {
    seedKey: 'angle-tremella-beauty',
    type: 'CreativeAngleSignal', title: 'Ángulo belleza/skincare para Tremella ("eat your skincare")',
    productId: PRODUCT.TREMELLA, category: CATEGORY.EXTRACTOS_HONGOS,
    source: 'Síntesis de tendencia TikTok + vacío de contenido de marca', sourceType: 'INFERENCE',
    capturedAt: CAPTURED_AT, timeWindow: '30d',
    observation: 'Cero contenido de marca VD conectando Tremella a la narrativa de belleza pese a tendencia genérica fuerte.',
    whyItMatters: 'Candidato principal entre los 9 productos para ángulo belleza/skincare en vez de pérdida de peso/libido.',
    evidenceLevel: 'MEDIUM', claimType: 'RECOMMENDATION', tags: ['creative-angle', 'tremella'],
    rawReference: ref('Sección 3 — Producto 8: Extracto de Tremella'),
  },
  {
    seedKey: 'angle-sculpt-tongkat-ali-morning-stack',
    type: 'CreativeAngleSignal', title: 'Framing "stack de la mañana" para Sculpt Tongkat Ali',
    productId: PRODUCT.SCULPT_TONGKAT_ALI, category: CATEGORY.CAFE_DIVINA,
    source: 'Inferencia de patrón de lenguaje de mercado ("stacks")', sourceType: 'INFERENCE',
    capturedAt: CAPTURED_AT, timeWindow: '30d',
    observation: 'La audiencia social ya piensa en "stacks"/combinaciones; Sculpt combina libido + control de peso.',
    whyItMatters: 'Inferencia de patrón, no validación de ventas — presentar como "stack matutino de doble objetivo".',
    evidenceLevel: 'MEDIUM', claimType: 'RECOMMENDATION', tags: ['creative-angle', 'sculpt-tongkat-ali'],
    rawReference: ref('Sección 3 — Producto 2: Sculpt Tongkat Ali'),
  },
  {
    seedKey: 'angle-mars-skeptic-first',
    type: 'CreativeAngleSignal', title: 'Framing "escéptico de suplementos primero / estilo de vida primero" para Mars',
    productId: PRODUCT.MARS, category: CATEGORY.INTIMIDAD_LIBIDO,
    source: 'TikTok @xiomisamaniego95', sourceType: 'SOCIAL',
    capturedAt: CAPTURED_AT, timeWindow: '30d',
    observation: '"No le dejes todo a los suplementos" tuvo buen desempeño relativo, se distingue del contenido de pura exageración de la categoría.',
    whyItMatters: 'Consistente con el mandato ético del proyecto — Mars como apoyo, no reemplazo, de hábitos base.',
    evidenceLevel: 'MEDIUM', claimType: 'RECOMMENDATION', tags: ['creative-angle', 'mars'],
    rawReference: ref('Sección 3 — Producto 7: Cápsulas Mars'),
  },
  {
    seedKey: 'angle-venus-women-centered',
    type: 'CreativeAngleSignal', title: 'Ángulo Venus centrado en experiencia real de la mujer, no solo el suplemento',
    productId: PRODUCT.VENUS, category: CATEGORY.INTIMIDAD_LIBIDO,
    source: 'Análisis de conversación de menopausia en Reddit', sourceType: 'INFERENCE',
    capturedAt: CAPTURED_AT, timeWindow: '30d',
    observation: 'La conversación de menopausia en Reddit es rica pero mayormente no menciona suplementos de fórmula combinada.',
    whyItMatters: 'El ángulo más fértil es "acompañar una conversación honesta sobre síntomas reales", no "vender un suplemento para menopausia".',
    evidenceLevel: 'LOW', claimType: 'INFERENCE', tags: ['creative-angle', 'venus'],
    rawReference: ref('Sección 3 — Producto 5: Cápsulas Venus'),
  },
  {
    seedKey: 'angle-why-it-works-all-products',
    type: 'CreativeAngleSignal', title: 'Capa educativa "por qué funciona" aplicable a las 9 líneas de producto',
    category: CATEGORY.CONTENIDO_HOOKS,
    source: 'Síntesis cross-source', sourceType: 'RESEARCH',
    capturedAt: CAPTURED_AT, timeWindow: '30d',
    observation: 'Contenido con respaldo científico explicado genera más credibilidad que solo afirmar el beneficio.',
    whyItMatters: 'Capa educativa breve integrada al copy existente, sin inventar cifras de estudios.',
    evidenceLevel: 'MEDIUM', claimType: 'RECOMMENDATION', tags: ['creative-angle', 'all-products'],
    rawReference: ref('Sección 5 — Social Listening y Content Intelligence'),
  },
);

// ---------------------------------------------------------------------
// CompetitorSignal — sección 7 (matriz de competidores, 10 filas)
// ---------------------------------------------------------------------
const COMPETITORS = [
  { key: 'herbalife-mexico', name: 'Herbalife México', category: CATEGORY.MLM_OPORTUNIDAD, positioning: '"Negocio flexible desde casa"', strength: 'Reconocimiento de marca, ejército de distribuidores', weakness: 'Alta hostilidad en r/antiMLM, fatiga de "ads disfrazados"', opportunity: 'Liderar con transparencia de modelo e ingredientes', evidenceLevel: 'MEDIUM' },
  { key: 'omnilife-mexico', name: 'Omnilife México', category: CATEGORY.MLM_OPORTUNIDAD, positioning: '"Compra con membresía y ahorra"', strength: 'Playbook de PR maduro, $64M planta en Texas', weakness: 'Riesgo de testimonios médicos no verificables', opportunity: 'Adaptar "desmentir mitos" sin testimonios médicos', evidenceLevel: 'MEDIUM' },
  { key: 'betterware', name: 'Betterware', category: 'benchmark-operativo', positioning: 'Benchmark operativo (no es competidor de producto)', strength: 'Escala y credibilidad, Direct Selling News Global 100', weakness: 'No es competidor de producto', opportunity: 'Benchmark de estructura de red', evidenceLevel: 'MEDIUM' },
  { key: 'functional-coffee-cluster', name: 'Gano Café / BPN PRO / Balanfood / Smart Food', category: CATEGORY.CAFE_DIVINA, positioning: '"Café tradicional + superfood"', strength: 'Categoría abierta sin líder claro', weakness: 'Fragmentación, bajo engagement individual', opportunity: 'Liderazgo de categoría con inversión de contenido', evidenceLevel: 'MEDIUM' },
  { key: 'weight-loss-tiktok-shop-cluster', name: 'Dermograss / Esbelta / Quema Grasa Forte', category: CATEGORY.CONTROL_DE_PESO, positioning: '"Ingredientes naturales, quema grasa"', strength: 'Fricción baja de compra (TikTok Shop nativo)', weakness: 'Objeción de "rebote" sin resolver', opportunity: 'Contenido proactivo de sostenibilidad post-uso', evidenceLevel: 'MEDIUM' },
  { key: 'dr-simi', name: 'Dr. Simi (Semifibra Forte)', category: 'farmacia', positioning: 'Precio bajo + confianza de farmacia', strength: 'Décadas de confianza de marca', weakness: 'Sin relación personal/comunidad', opportunity: 'Diferenciación vía relación distribuidor-cliente', evidenceLevel: 'MEDIUM' },
  { key: 'propensil', name: 'Propensil', category: CATEGORY.INTIMIDAD_LIBIDO, positioning: '"Libido y energía"', strength: 'Comentarios activos de compradoras, nicho comprometido', weakness: 'Marca no verificable fuera de redes', opportunity: 'Ganar en seriedad clínica vs. hype', evidenceLevel: 'MEDIUM' },
  { key: 'pine-pollen-fenugreek-generic', name: '"Polen de Pino"/fenogreco (contenido genérico)', category: CATEGORY.INTIMIDAD_LIBIDO, positioning: '"Testosterona real en polvo"', strength: 'Contenido viral cross-audiencia', weakness: 'Afirmaciones no sustentadas médicamente', opportunity: 'Posicionar Venus/Mars con lenguaje responsable', evidenceLevel: 'MEDIUM' },
  { key: 'oso-trava-creator', name: 'Oso Trava (creador, no marca)', category: 'creator', positioning: 'Canal editorial de salud masculina', strength: 'Alto volumen de vistas (23M+)', weakness: 'N/A', opportunity: 'Candidato de partnership para Mars y café funcional', evidenceLevel: 'MEDIUM' },
  { key: 'pharmacy-retail-cluster', name: 'Farmacias del Ahorro / Naturitas.mx / Yza.mx', category: 'retail-farmacia', positioning: 'Conveniencia + confianza de farmacia', strength: 'Marca de farmacia establecida', weakness: 'Sin relación personal recurrente', opportunity: 'Ventaja estructural de VD: relación distribuidor-cliente', evidenceLevel: 'MEDIUM' },
];
for (const c of COMPETITORS) {
  SIGNALS.push({
    seedKey: `competitor-${c.key}`,
    type: 'CompetitorSignal', title: `${c.name} — ${c.positioning}`,
    category: c.category, source: 'last30days + WebSearch', sourceType: 'RESEARCH',
    capturedAt: CAPTURED_AT, timeWindow: '30d',
    observation: `Strength: ${c.strength}. Weakness: ${c.weakness}.`,
    whyItMatters: `Oportunidad VD: ${c.opportunity}.`,
    evidenceLevel: c.evidenceLevel, claimType: 'SIGNAL',
    details: { competitor: c.name, strength: c.strength, weakness: c.weakness, opportunity: c.opportunity },
    tags: ['competitor-matrix'], rawReference: ref('Sección 7 — Matriz de competidores'),
  });
}

// ---------------------------------------------------------------------
// CreatorSignal — sección 8 (13 filas)
// ---------------------------------------------------------------------
const CREATORS = [
  { key: 'oso-trava', name: 'Oso Trava', platform: 'YouTube', niche: 'Salud masculina, energía, café funcional', status: 'RELEVANT_CREATOR', evidenceLevel: 'MEDIUM-HIGH', independent: 2 },
  { key: 'dr-luis-gutierrez', name: 'Dr. Luis Gutierrez - Urología para todos', platform: 'YouTube', niche: 'Urología, salud sexual masculina', status: 'RELEVANT_CREATOR', evidenceLevel: 'MEDIUM', independent: 1 },
  { key: 'dr-polo-guerrero', name: 'Dr. Polo Guerrero / Mr Doctor', platform: 'YouTube', niche: 'Salud general, control de peso', status: 'RELEVANT_CREATOR', evidenceLevel: 'MEDIUM', independent: 1 },
  { key: 'adamari-lopez', name: 'Adamari Lopez', platform: 'YouTube', niche: 'Lifestyle/celebridad, bienestar', status: 'RELEVANT_CREATOR', evidenceLevel: 'MEDIUM', independent: 1 },
  { key: 'javier-furman-dr-la-rosa', name: 'JAVIER FURMAN / DR LA ROSA', platform: 'YouTube', niche: 'Salud/bienestar general', status: 'RELEVANT_CREATOR', evidenceLevel: 'MEDIUM-HIGH', independent: 2 },
  { key: 'patricia-leite', name: 'Patricia Leite Nutrición Deliciosa', platform: 'YouTube', niche: 'Nutrición, cluster de té detox', status: 'POTENTIAL_CREATOR', evidenceLevel: 'LOW', independent: 1 },
  { key: 'xiomisamaniego95', name: '@xiomisamaniego95', platform: 'TikTok', niche: 'Salud masculina, testosterona', status: 'POTENTIAL_CREATOR', evidenceLevel: 'LOW', independent: 1 },
  { key: 'omnilife-herbalife-affiliated', name: '@jesus_gonzalez_76 / @saludenequilibrio_ / @hanna24fit', platform: 'TikTok', niche: 'Nutrición/MLM (Omnilife, Herbalife)', status: 'POTENTIAL_CREATOR', evidenceLevel: 'LOW', independent: 1 },
  { key: 'yenygarcia00', name: '@yenygarcia00', platform: 'TikTok', niche: 'Libido femenina (Propensil)', status: 'POTENTIAL_CREATOR', evidenceLevel: 'LOW', independent: 1 },
  { key: 'nutrition-cluster', name: 'reynaldaflorian.nutri / nutriniki / consejosdeldoc', platform: 'TikTok', niche: 'Nutrición, control de peso', status: 'POTENTIAL_CREATOR', evidenceLevel: 'LOW', independent: 1 },
  { key: 'codigomental777', name: '@CodigoMental777', platform: 'X', niche: 'Educación ingredientes (polen de pino)', status: 'NOT_VERIFIED', evidenceLevel: 'LOW', independent: 1 },
  { key: 'mushroom-low-reach', name: 'bienestarconjennifer / locovaldes21', platform: 'TikTok', niche: 'Hongos funcionales', status: 'NOT_VERIFIED', evidenceLevel: 'LOW', independent: 1 },
  { key: 'tongkat-ali-micro-vendors', name: '@lululamasbonita4 / @mercalatinousa / @mariadelcarmenfv', platform: 'TikTok', niche: 'Café Tongkat Ali (micro-vendedores)', status: 'NOT_VERIFIED', evidenceLevel: 'LOW', independent: 1 },
];
for (const c of CREATORS) {
  SIGNALS.push({
    seedKey: `creator-${c.key}`,
    type: 'CreatorSignal', title: `${c.name} (${c.platform}) — ${c.niche}`,
    category: CATEGORY.CONTENIDO_HOOKS,
    source: `last30days (${c.platform})`, sourceType: 'SOCIAL',
    capturedAt: CAPTURED_AT, timeWindow: '30d',
    observation: `Clasificación: ${c.status}. Ventana 30d.`,
    whyItMatters: c.status === 'RELEVANT_CREATOR' ? 'Prioritario para outreach — confirmación cross-source.' : 'Requiere monitoreo/verificación adicional antes de outreach.',
    evidenceLevel: c.evidenceLevel, claimType: 'SIGNAL', independentSourceCount: c.independent, sourceCount: c.independent,
    details: { platform: c.platform, verificationStatus: c.status },
    tags: ['creator-intelligence'], rawReference: ref('Sección 8 — Creadores'),
  });
}

// ---------------------------------------------------------------------
// PurchaseTrigger — secciones 4, 5, 10
// ---------------------------------------------------------------------
SIGNALS.push(
  {
    seedKey: 'trigger-pre-purchase-conversation',
    type: 'PurchaseTrigger', title: '73% valora poder preguntar antes de comprar; 81% más confiado tras conversación previa',
    category: CATEGORY.COMERCIO_SOCIAL,
    source: 'Investigación de mercado MX (Sinch/INEGI, con caveat de verificación directa)', sourceType: 'RESEARCH',
    capturedAt: CAPTURED_AT, timeWindow: 'not_time_bound',
    observation: 'Consistente con el enfoque consultivo ya documentado en docs/proceso_de_venta/.',
    whyItMatters: 'CTA ideal invita a preguntar algo concreto, no un "escríbenos" genérico.',
    evidenceLevel: 'MEDIUM', claimType: 'SIGNAL', tags: ['whatsapp', 'purchase-trigger'],
    rawReference: ref('Sección 4 — Señales de journey del cliente'),
  },
  {
    seedKey: 'trigger-single-video-decision',
    type: 'PurchaseTrigger', title: '78% de compradores decide tras ver un solo video',
    category: CATEGORY.COMERCIO_SOCIAL,
    source: 'Investigación de mercado MX', sourceType: 'RESEARCH',
    capturedAt: CAPTURED_AT, timeWindow: 'not_time_bound',
    observation: 'Ventana de intención de compra corta.',
    whyItMatters: 'Relevante para velocidad de seguimiento desde contenido social hacia WhatsApp.',
    evidenceLevel: 'MEDIUM', claimType: 'SIGNAL', tags: ['purchase-trigger', 'whatsapp'],
    rawReference: ref('Sección 4 — Señales de journey del cliente'),
  },
  {
    seedKey: 'trigger-te-divina-6-week-question',
    type: 'PurchaseTrigger', title: 'Pregunta post-compra recurrente Té Divina: "¿puedo seguir después de las 6 semanas?"',
    productId: PRODUCT.TE_DIVINA, category: CATEGORY.CONTROL_DE_PESO,
    source: 'Distribuidora real respondiendo en TikTok', sourceType: 'SOCIAL',
    capturedAt: CAPTURED_AT, timeWindow: '30d',
    observation: 'Confirmada por una distribuidora real respondiendo a una pregunta recurrente.',
    whyItMatters: 'Vale la pena atenderla proactivamente en FAQ/contenido de venta.',
    evidenceLevel: 'MEDIUM', claimType: 'SIGNAL', tags: ['purchase-trigger', 'faq'],
    rawReference: ref('Sección 3 — Producto 9: Té Divina'),
  },
  {
    seedKey: 'trigger-seasonal-back-to-school',
    type: 'PurchaseTrigger', title: 'Ancla estacional "regreso a clases" (#RegresoAClasesConTikTokShop)',
    category: CATEGORY.COMERCIO_SOCIAL,
    source: 'TikTok (múltiples posts del mismo periodo)', sourceType: 'SOCIAL',
    capturedAt: CAPTURED_AT, timeWindow: '30d',
    observation: 'Ancla contenido de bienestar/suplementos al calendario escolar.',
    whyItMatters: 'Insumo directo para calendario de anclas estacionales de contenido.',
    evidenceLevel: 'MEDIUM', claimType: 'SIGNAL', tags: ['purchase-trigger', 'seasonal'],
    rawReference: ref('Sección 5 — Social Listening y Content Intelligence'),
  },
  {
    seedKey: 'trigger-whatsapp-open-rate',
    type: 'PurchaseTrigger', title: 'WhatsApp Business: ~98% tasa de apertura vs. 20–25% de email',
    category: CATEGORY.COMERCIO_SOCIAL,
    source: 'Sinch', sourceType: 'RESEARCH',
    capturedAt: CAPTURED_AT, timeWindow: 'not_time_bound',
    observation: 'Ventaja estructural de canal, respuesta en minutos.',
    whyItMatters: 'Refuerza WhatsApp como canal de cierre de alta confianza.',
    evidenceLevel: 'MEDIUM', claimType: 'FACT', tags: ['purchase-trigger', 'whatsapp'],
    rawReference: ref('Sección 10 — WhatsApp'),
  },
);

// ---------------------------------------------------------------------
// RegulatoryRisk — sección 11 (8 filas)
// ---------------------------------------------------------------------
const REGULATORY_RISKS = [
  { key: 'misleading-advertising-fines', title: 'Publicidad engañosa de suplementos (claims no sustentados)', why: 'PROFECO ha sancionado activamente colágeno y suplementos por publicidad engañosa/leyendas no sustentadas. Multas 2025: $366 a $12,315,000 MXN.', source: 'gob.mx/profeco; enalimentos.lat', evidenceLevel: 'HIGH', category: CATEGORY.CONTROL_DE_PESO },
  { key: 'cofepris-weightloss-claims-alert', title: 'Suplementos con promesas de "moldear figura, perder peso, rejuvenecer, regenerar tejidos"', why: 'COFEPRIS emitió alerta específica sobre este patrón exacto — coincide con Ripped, Sculpt Black, Sculpt Max y lenguaje viral observado.', source: 'enalimentos.lat', evidenceLevel: 'HIGH', category: CATEGORY.CONTROL_DE_PESO },
  { key: 'nom-051-labeling', title: 'Etiquetado obligatorio "Este producto no es un medicamento" + NOM-051', why: 'Requisito COFEPRIS aplicable a todo suplemento comercializado en México, cualquier canal, incluida venta directa/MLM.', source: 'gob.mx/cofepris', evidenceLevel: 'HIGH', category: CATEGORY.REGULATORIO },
  { key: 'advertising-permit-therapeutic-claims', title: 'Permiso de publicidad previo (COFEPRIS) + prohibición de claims terapéuticos', why: 'Aplica a publicidad pagada y contenido orgánico de distribuidores/influencers — riesgo relevante porque el modelo de VD depende de contenido individual de distribuidores.', source: '33cero.com; gob.mx/cofepris', evidenceLevel: 'MEDIUM', category: CATEGORY.REGULATORIO },
  { key: 'influencer-disclosure-guide', title: 'Guía de Publicidad para Influencers de PROFECO (#PublicidadPagada)', why: 'Producto regalado a un influencer también cuenta como publicidad regulada — riesgo directo si distribuidores reciben producto gratis y publican sin declarar (Art. 32 LFPC).', source: 'gob.mx/profeco; forbes.mx', evidenceLevel: 'HIGH', category: CATEGORY.REGULATORIO },
  { key: 'unverifiable-testimonials', title: 'Testimonios/antes-después no verificables usados como prueba de eficacia', why: 'No existe regla mexicana tipo "testimonial rule" de la FTC; riesgo existe dentro del marco general de publicidad engañosa (Art. 32 LFPC).', source: 'Inferido del marco general', evidenceLevel: 'LOW-MEDIUM', category: CATEGORY.REGULATORIO },
  { key: 'mlm-legal-gray-zone', title: 'Venta multinivel: zona gris legal entre MLM legítimo y esquema piramidal', why: 'México no tiene ley que use específicamente "multinivel"; legalidad depende de que el ingreso provenga de venta real, no de cuotas de afiliación/reclutamiento puro.', source: 'periodicocorreo.com.mx; Dialnet; susanarodriguez.net', evidenceLevel: 'MEDIUM', category: CATEGORY.MLM_OPORTUNIDAD },
  { key: 'profeco-complaint-channel', title: 'Canal de denuncia ciudadana activo de PROFECO específico para publicidad', why: 'Correos dedicados y monitoreo activo en redes — riesgo real de que un competidor o cliente insatisfecho reporte contenido de VD.', source: 'gob.mx/profeco (vía lasillarota.com)', evidenceLevel: 'MEDIUM', category: CATEGORY.REGULATORIO },
];
for (const r of REGULATORY_RISKS) {
  SIGNALS.push({
    seedKey: `regulatory-${r.key}`,
    type: 'RegulatoryRisk', title: r.title,
    category: r.category, source: r.source, sourceType: 'OFFICIAL',
    capturedAt: CAPTURED_AT, timeWindow: 'not_time_bound',
    observation: r.why,
    whyItMatters: 'Ninguno de estos hallazgos propone ni implica cambios al sistema de Claim Safety existente — es únicamente señal de riesgo externo verificable.',
    evidenceLevel: r.evidenceLevel, claimType: 'FACT',
    details: { severity: r.evidenceLevel === 'HIGH' ? 'ALTA' : 'MEDIA', normativeReference: r.source },
    tags: ['regulatory-risk'], rawReference: ref('Sección 11 — Inteligencia Regulatoria'),
  });
}

// ---------------------------------------------------------------------
// OPPORTUNITIES — CreativeOpportunity, sección 12 (Top 10 Oportunidades)
// ---------------------------------------------------------------------
export const OPPORTUNITIES = [
  {
    title: 'Tremella beauty/skincare angle',
    signalSeedKeys: ['trend-tremella-beauty', 'angle-tremella-beauty'],
    audience: 'belleza-skincare-mx', product: PRODUCT.TREMELLA,
    angle: 'Contenido educativo "eat your skincare" + formato DIY (té/caldo/mascarilla)',
    hookPattern: 'HIGH_SIGNAL: contenido educativo "por qué funciona"',
    contentPattern: 'why-it-works-education',
    evidenceLevel: 'MEDIUM', priority: 'P1',
    rationale: 'Tendencia genérica fuerte (HIGH) + cero contenido de marca conectándola (oportunidad MEDIUM); bajo riesgo regulatorio por ser ángulo belleza, no médico.',
  },
  {
    title: 'Liderazgo de categoría en café funcional/adaptógeno',
    signalSeedKeys: ['trend-functional-coffee-open-category'],
    audience: 'hombres-biohacking-tongkat-ali', product: PRODUCT.TONGKAT_ALI_CAFE,
    angle: 'Inversión de contenido consistente y cadencia de posteo en categoría fragmentada sin líder',
    hookPattern: null, contentPattern: null,
    evidenceLevel: 'MEDIUM-HIGH', priority: 'P1',
    rationale: 'Categoría abierta con competidores de bajo engagement individual — ventana de oportunidad sin necesidad de superar un líder dominante inexistente.',
  },
  {
    title: 'Framing "stack de la mañana" para Sculpt Tongkat Ali',
    signalSeedKeys: ['angle-sculpt-tongkat-ali-morning-stack'],
    audience: 'hombres-biohacking-tongkat-ali', product: PRODUCT.SCULPT_TONGKAT_ALI,
    angle: 'Sculpt Tongkat Ali como "stack matutino de doble objetivo" (libido + control de peso)',
    hookPattern: null, contentPattern: null,
    evidenceLevel: 'MEDIUM', priority: 'P2',
    rationale: 'Inferencia de patrón de lenguaje de mercado, no validación de ventas.',
  },
  {
    title: 'Contenido proactivo sobre objeción de "rebote" en control de peso',
    signalSeedKeys: ['objection-rebound-post-use'],
    audience: 'control-de-peso-general', product: PRODUCT.RIPPED,
    angle: 'Contenido educativo sobre sostenibilidad de hábitos post-uso, sin prometer resultado sin cambio de hábito',
    hookPattern: null, contentPattern: 'why-it-works-education',
    evidenceLevel: 'MEDIUM', priority: 'P2',
    rationale: 'Ningún competidor atiende esta objeción proactivamente pese a aparecer en comentarios reales de compradoras.',
  },
  {
    title: 'Venus con ángulo centrado en mujeres, hueco de contenido real',
    signalSeedKeys: ['audience-womens-libido-content-gap', 'angle-venus-women-centered'],
    audience: 'mujeres-bienestar-hormonal', product: PRODUCT.VENUS,
    angle: 'Contenido educativo cauteloso enfocado en la experiencia real de la mujer en perimenopausia/cansancio hormonal',
    hookPattern: null, contentPattern: null,
    evidenceLevel: 'MEDIUM-HIGH', priority: 'P2',
    rationale: 'Ecosistema de "libido natural" dominado por lenguaje/audiencia masculina — contenido explícito para mujeres es escaso.',
  },
  {
    title: 'TikTok Shop México como canal de comercio de nicho',
    signalSeedKeys: ['trend-tiktok-shop-mexico-growth'],
    audience: 'compradoras-tiktok-shop', product: null,
    angle: 'Pilotar presencia de nicho vía distribuidores/afiliados, no campaña centralizada única',
    hookPattern: null, contentPattern: null,
    evidenceLevel: 'MEDIUM', priority: 'P3',
    rationale: 'Crecimiento 59x GMV/25x vendedores; suplementos citado explícitamente como categoría con tracción; México único laboratorio regional del modelo.',
  },
  {
    title: 'Playbook de "desmentir mitos" adaptado del competidor Omnilife',
    signalSeedKeys: ['competitor-omnilife-mexico'],
    audience: 'general-bienestar-mx', product: null,
    angle: 'Adaptar formato de objection-handling (azúcar, precio) sin apoyarse en testimonios médicos no verificables',
    hookPattern: null, contentPattern: null,
    evidenceLevel: 'MEDIUM', priority: 'P2',
    rationale: 'Formatos de objection-handling fueron los de mayor engagement de Omnilife en la ventana — diferencial clave: evitar testimonios médicos no verificables.',
  },
  {
    title: 'Framing "escéptico de suplementos primero" para Mars',
    signalSeedKeys: ['angle-mars-skeptic-first'],
    audience: 'hombres-biohacking-tongkat-ali', product: PRODUCT.MARS,
    angle: 'Posicionar Mars como apoyo, no reemplazo, de hábitos base (sueño, ejercicio)',
    hookPattern: null, contentPattern: null,
    evidenceLevel: 'MEDIUM', priority: 'P2',
    rationale: 'Contenido con framing escéptico tuvo buen desempeño relativo y se distingue del hype puro de la categoría.',
  },
  {
    title: 'Contenido educativo con "por qué funciona", no solo "qué hace"',
    signalSeedKeys: ['angle-why-it-works-all-products'],
    audience: 'consumidores-informados-suplementos', product: null,
    angle: 'Capa educativa breve integrada al copy de venta existente, sin inventar cifras de estudios',
    hookPattern: null, contentPattern: 'why-it-works-education',
    evidenceLevel: 'MEDIUM', priority: 'P1',
    rationale: 'Contenido con respaldo científico explicado genera más credibilidad; aplica a las 9 líneas de producto.',
  },
  {
    title: 'Aprovechar WhatsApp como canal de cierre de alta confianza',
    signalSeedKeys: ['trigger-pre-purchase-conversation', 'trigger-whatsapp-open-rate'],
    audience: 'general-bienestar-mx', product: null,
    angle: 'CTA con pregunta específica pre-cargada + reducción de tiempo de respuesta desde contenido social hacia WhatsApp',
    hookPattern: null, contentPattern: null,
    evidenceLevel: 'MEDIUM', priority: 'P1',
    rationale: '81% más confiado tras conversación previa, 98% apertura — canal ya usado por el proyecto, consistente con docs/proceso_de_venta/.',
  },
];
