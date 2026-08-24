// campaignIntelligence.js — Marketing Intelligence Engine, Fase 8. Estado
// real del proyecto (mismo hallazgo que Fase 1 del encargo, y ya
// documentado en performanceAnalysisService.js#attributesOf): NINGÚN
// PublishedContent ni ninguna opportunity tiene un campaignId estructurado
// hoy -- attribution-engine/src/evidenceModel.js reconoce "campaignId" como
// campo de evidencia (activaría ASSISTED) pero ninguna fuente real lo
// captura todavía.
//
// El encargo es explícito: "Si campaignId no existe: NO inferir campaña
// desde caption." -- por lo tanto esta función siempre devuelve
// INSUFFICIENT_DATA, documentado, nunca fabrica una campaña.

import { createDataQualitySignal } from './marketingInsight.js';

export function buildCampaignIntelligence() {
  return {
    insights: [],
    dataQualitySignals: [createDataQualitySignal({
      category: 'CAMPAIGN_PERFORMANCE', scope: 'global', reason: 'INSUFFICIENT_DATA',
      explanation: 'PublishedContent y opportunities no tienen campaignId estructurado en este proyecto (campo reconocido por evidenceModel.js pero nunca capturado por whatsapp-adapter/crm/content-orchestrator). Campaign Intelligence no infiere campaña desde caption ni ningún otro texto libre — regla explícita de esta fase.',
    })],
  };
}
