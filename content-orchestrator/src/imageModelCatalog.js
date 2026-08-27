// imageModelCatalog.js — Modelo Sugerido + Selección Manual (2026-08-27).
// Catálogo real de modelos de imagen disponibles en este entorno + lógica
// real de recomendación. El sistema recomienda, el usuario decide (regla
// central del encargo) -- este archivo SOLO calcula QUÉ recomendar y CON
// QUÉ modelos reales puede el usuario reemplazar esa recomendación; NUNCA
// decide por sí solo sin dar al llamador (dashboard) la posibilidad real
// de sobrescribir (selectionMode, ver buildModelSelection()).
//
// NO reemplaza a providerRouter.js (ese sigue siendo quien decide, dado UN
// modelo ya elegido -- recomendado o seleccionado -- si el provider real
// que lo sirve está configurado). Este catálogo es la capa de ARRIBA: "qué
// modelos existen y cuál conviene", providerRouter.js sigue siendo "¿está
// configurado, o caigo al fallback tipográfico real?".
//
// REGLA DE PRODUCTO (Paso "regla de producto" del encargo): un modelo con
// requiresProductReference:true SOLO se considera disponible cuando la
// escena/campaña real ya tiene un asset de producto real
// (productReferenceAvailable) -- nunca se ofrece como opción real si no
// hay nada real que referenciar (Validación D del encargo). Hoy es
// "runway-gen4" (vía Krea MCP, ver kreaMcpImageProvider.js) -- verificado
// real 2026-08-27, preservó forma/colores/logo/nombre "RIPPED" del
// producto real de Cápsulas Ripped.
//
// KREA MCP (2026-08-27, reemplaza a KreaImageProvider REST, retirado --
// KREA_API_TOKEN fue revocado): los 4 modelos reales "krea-2-turbo",
// "krea-2-medium", "krea-2-large", "runway-gen4" ahora se sirven vía
// kreaMcpImageProvider.js -- un puente real hacia el Krea MCP YA
// autenticado por OAuth con la cuenta Krea real (nunca REST, nunca
// KREA_API_TOKEN). Ver ese archivo para el límite real documentado
// (requiere el binario real "claude" en PATH + el servidor MCP real
// "krea" Connected para este proyecto).
//
// NUNCA se agrega aquí un modelo sin un provider real que lo respalde
// (ver buildProvider() de cada entrada) -- ni siquiera como placeholder.

import { OpenAIImageProvider } from '../../image-generation/src/providers/openAIImageProvider.js';
import { KreaMcpImageProvider } from '../../image-generation/src/providers/kreaMcpImageProvider.js';

export const COST_TIERS = Object.freeze(['LOW', 'BALANCED', 'HIGH', 'PREMIUM']);
export const COST_TIER_LABELS = Object.freeze({
  LOW: 'Bajo costo', BALANCED: 'Equilibrado', HIGH: 'Mayor costo', PREMIUM: 'Premium',
});
const COST_TIER_RANK = Object.freeze({ LOW: 0, BALANCED: 1, HIGH: 2, PREMIUM: 3 });

export const SPEED_TIERS = Object.freeze(['FAST', 'STANDARD', 'SLOW']);
export const SPEED_TIER_LABELS = Object.freeze({ FAST: 'Rápido', STANDARD: 'Estándar', SLOW: 'Lento' });

// Los 4 formatos reales de Vida Divina (outputProfiles.js) -- un modelo
// real que no soporte uno de estos NUNCA se recomienda para ese formato
// (Paso 12 del encargo Krea MCP), nunca se traduce a un vocabulario
// paralelo.
export const SUPPORTED_ASPECT_RATIOS = Object.freeze(['9:16', '4:5', '1:1', '16:9']);

// Treatments (visualTreatments.js) donde el producto real es protagonista
// visual real de la escena -- señal real usada por recommendImageModel()
// para decidir si esta generación real "requiere identidad visual del
// producto" (regla de producto del encargo). Nunca decide por sí sola: se
// combina siempre con productAssetAvailable real (sin asset real, no hay
// nada que referenciar, sin importar el treatment).
const PRODUCT_PROMINENT_TREATMENTS = Object.freeze(['PRODUCT_DEMO', 'CINEMATIC', 'PRODUCT_HUMAN']);

// Catálogo real -- CADA entrada mapea 1:1 a un modelo real invocable (ver
// openAIImageProvider.js / kreaMcpImageProvider.js). displayName/
// shortComment/description son EXACTAMENTE el vocabulario real pedido por
// el encargo (nunca nombres técnicos de endpoint/modelo en la UI).
// "modelId" es el identificador real interno del provider (lineage/
// depuración) -- nunca se muestra en la UI (ver toUiShape()).
export const IMAGE_MODEL_CATALOG = Object.freeze([
  Object.freeze({
    id: 'krea-2-turbo', provider: 'krea-mcp', modelId: 'krea-2-turbo',
    displayName: 'Krea 2 Turbo', shortComment: 'Bajo costo · rápido · ideal para explorar variantes',
    description: 'Bajo costo · rápido · ideal para explorar variantes',
    primaryCapability: 'Exploración rápida de variantes', costTier: 'LOW', speedTier: 'FAST',
    providerName: 'krea-mcp', requiresProductReference: false, supportsProductReference: false, aspectRatios: SUPPORTED_ASPECT_RATIOS,
    buildProvider: () => new KreaMcpImageProvider('krea-2-turbo'),
  }),
  Object.freeze({
    id: 'krea-2-medium', provider: 'krea-mcp', modelId: 'krea-2-medium',
    displayName: 'Krea 2 Medium', shortComment: 'Equilibrado · buena calidad y velocidad',
    description: 'Equilibrado · buena calidad y velocidad',
    primaryCapability: 'Balance calidad/costo', costTier: 'BALANCED', speedTier: 'STANDARD',
    providerName: 'krea-mcp', requiresProductReference: false, supportsProductReference: false, aspectRatios: SUPPORTED_ASPECT_RATIOS,
    buildProvider: () => new KreaMcpImageProvider('krea-2-medium'),
  }),
  Object.freeze({
    id: 'krea-2-large', provider: 'krea-mcp', modelId: 'krea-2-large',
    displayName: 'Krea 2 Large', shortComment: 'Alta calidad · ideal para imágenes finales',
    description: 'Alta calidad · ideal para imágenes finales',
    primaryCapability: 'Fotografía premium', costTier: 'HIGH', speedTier: 'SLOW',
    providerName: 'krea-mcp', requiresProductReference: false, supportsProductReference: false, aspectRatios: SUPPORTED_ASPECT_RATIOS,
    buildProvider: () => new KreaMcpImageProvider('krea-2-large'),
  }),
  Object.freeze({
    id: 'runway-gen4', provider: 'krea-mcp', modelId: 'runway-gen4',
    displayName: 'Runway Gen-4', shortComment: 'Referencia de producto · conserva mejor la identidad visual',
    description: 'Referencia de producto · conserva mejor la identidad visual',
    primaryCapability: 'Preserva identidad real del producto', costTier: 'PREMIUM', speedTier: 'SLOW',
    providerName: 'krea-mcp', requiresProductReference: true, supportsProductReference: true, aspectRatios: SUPPORTED_ASPECT_RATIOS,
    buildProvider: () => new KreaMcpImageProvider('runway-gen4'),
  }),
  Object.freeze({
    id: 'openai-gpt-image', provider: 'openai', modelId: 'gpt-image-1',
    displayName: 'GPT Image', shortComment: 'Alternativa general · sin referencia de producto',
    description: 'Alternativa general · sin referencia de producto',
    primaryCapability: 'Generación general', costTier: 'BALANCED', speedTier: 'STANDARD',
    providerName: 'openai', requiresProductReference: false, supportsProductReference: false, aspectRatios: SUPPORTED_ASPECT_RATIOS,
    buildProvider: () => new OpenAIImageProvider(),
  }),
]);

export function getImageModel(modelId) {
  const entry = IMAGE_MODEL_CATALOG.find((m) => m.id === modelId);
  if (!entry) throw new Error(`imageModelCatalog: "${modelId}" no es un modelo real del catálogo (válidos: ${IMAGE_MODEL_CATALOG.map((m) => m.id).join(', ')}).`);
  return entry;
}

/** Forma real y mínima para la UI -- nunca expone buildProvider() (detalle interno) ni nombres técnicos de endpoint/modelo. "available:true" siempre real aquí: toUiShape() solo se aplica DESPUÉS del filtro real de listAvailableImageModels(). */
function toUiShape(entry) {
  return Object.freeze({
    id: entry.id,
    provider: entry.provider,
    displayName: entry.displayName,
    shortComment: entry.shortComment,
    description: entry.description,
    primaryCapability: entry.primaryCapability,
    costTier: entry.costTier,
    costTierLabel: COST_TIER_LABELS[entry.costTier],
    speedTier: entry.speedTier,
    speedTierLabel: SPEED_TIER_LABELS[entry.speedTier],
    supportsProductReference: entry.supportsProductReference,
    aspectRatios: entry.aspectRatios,
    available: true,
  });
}

/**
 * Modelos reales realmente disponibles AHORA en este entorno (Validación
 * D/E del encargo): credencial real configurada (isConfigured() real de su
 * provider) Y, si el modelo requiere referencia real de producto, que
 * exista un asset de producto real (productReferenceAvailable) -- nunca se
 * muestra un modelo sin credencial ni un modelo de referencia sin nada
 * real que referenciar. "aspectRatio" (Paso 12 del encargo Krea MCP):
 * cuando se provee, excluye cualquier modelo real que no lo soporte --
 * nunca se recomienda/lista un modelo real para un formato que no puede
 * producir.
 */
export function listAvailableImageModels({ productReferenceAvailable = false, aspectRatio = null } = {}) {
  return Object.freeze(
    IMAGE_MODEL_CATALOG
      .filter((entry) => {
        if (entry.requiresProductReference && !productReferenceAvailable) return false;
        if (aspectRatio && !entry.aspectRatios.includes(aspectRatio)) return false;
        try {
          return entry.buildProvider().isConfigured();
        } catch {
          return false; // un provider real que no puede ni construirse nunca se ofrece como disponible.
        }
      })
      .map(toUiShape),
  );
}

/**
 * Recomendación real (Creative Director + Provider Router, regla central
 * del encargo: "el sistema recomienda, el usuario decide"). Nunca lanza --
 * si ningún modelo real está disponible, recommendedModel es null y
 * recommendationReason lo explica (nunca se inventa un modelo disponible).
 *
 * @param {{productAssetAvailable?:boolean, visualTreatmentId?:?string, hasGenerationRequiredScenes?:boolean, aspectRatio?:?string}} args
 */
export function recommendImageModel({
  productAssetAvailable = false, visualTreatmentId = null, hasGenerationRequiredScenes = true, aspectRatio = null,
} = {}) {
  const disponibles = listAvailableImageModels({ productReferenceAvailable: productAssetAvailable, aspectRatio });
  if (disponibles.length === 0) {
    return Object.freeze({ recommendedModel: null, recommendationReason: 'Ningún modelo real de imagen está disponible en este entorno (sin credenciales configuradas).' });
  }

  const requiereIdentidadDeProducto = hasGenerationRequiredScenes
    && productAssetAvailable
    && PRODUCT_PROMINENT_TREATMENTS.includes(visualTreatmentId);

  if (requiereIdentidadDeProducto) {
    const conReferencia = disponibles.find((m) => IMAGE_MODEL_CATALOG.find((c) => c.id === m.id).requiresProductReference);
    if (conReferencia) {
      return Object.freeze({
        recommendedModel: conReferencia,
        recommendationReason: 'Recomendado porque esta escena requiere preservar la referencia del producto.',
      });
    }
    // Regla de producto: se PREFIERE un modelo con referencia real, pero si
    // ninguno está disponible (ej. sin asset real, ya filtrado arriba, o
    // caso límite) se cae al mismo criterio real de costo -- nunca se deja
    // sin recomendación por no encontrar el modelo ideal.
  }

  const economicos = disponibles.filter((m) => !IMAGE_MODEL_CATALOG.find((c) => c.id === m.id).requiresProductReference);
  const elegido = [...(economicos.length > 0 ? economicos : disponibles)]
    .sort((a, b) => COST_TIER_RANK[a.costTier] - COST_TIER_RANK[b.costTier])[0];

  return Object.freeze({
    recommendedModel: elegido,
    recommendationReason: 'Recomendado por su menor costo para generar variantes.',
  });
}

/**
 * Aplica la regla central real: "si el usuario no cambia nada,
 * selectionMode='automatic'; si selecciona otro modelo,
 * selectionMode='user_selected'" -- el modelo seleccionado SOBRESCRIBE la
 * recomendación (nunca se ignora la selección real del usuario).
 *
 * @param {{recommendedModel:?object, recommendationReason:string, selectedModelId?:?string, productAssetAvailable?:boolean, aspectRatio?:?string}} args
 * @returns {{recommendedProvider:?string, recommendedModel:?string, recommendationReason:string, selectedProvider:?string, selectedModel:?string, selectionMode:'automatic'|'user_selected', finalModelId:?string}}
 */
export function buildModelSelection({
  recommendedModel, recommendationReason, selectedModelId = null, productAssetAvailable = false, aspectRatio = null,
}) {
  const recommendedProvider = recommendedModel
    ? IMAGE_MODEL_CATALOG.find((c) => c.id === recommendedModel.id)?.providerName ?? null
    : null;

  if (!selectedModelId || selectedModelId === recommendedModel?.id) {
    return Object.freeze({
      recommendedProvider, recommendedModel: recommendedModel?.id ?? null, recommendationReason,
      selectedProvider: recommendedProvider, selectedModel: recommendedModel?.id ?? null,
      selectionMode: 'automatic',
      finalModelId: recommendedModel?.id ?? null,
    });
  }

  // El usuario eligió otro modelo real -- se valida contra los REALMENTE
  // disponibles ahora (nunca se acepta un modelo sin credencial real, ni
  // un modelo de referencia sin asset real de producto, Validación D/E).
  const disponibles = listAvailableImageModels({ productReferenceAvailable: productAssetAvailable, aspectRatio });
  const seleccionado = disponibles.find((m) => m.id === selectedModelId);
  if (!seleccionado) {
    throw new Error(`buildModelSelection: "${selectedModelId}" no es un modelo real disponible ahora (credencial ausente o requiere referencia de producto sin asset real) -- el usuario nunca puede seleccionar un modelo no disponible.`);
  }
  const selectedProvider = IMAGE_MODEL_CATALOG.find((c) => c.id === seleccionado.id)?.providerName ?? null;

  return Object.freeze({
    recommendedProvider, recommendedModel: recommendedModel?.id ?? null, recommendationReason,
    selectedProvider, selectedModel: seleccionado.id,
    selectionMode: 'user_selected',
    finalModelId: seleccionado.id,
  });
}

