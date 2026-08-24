// performanceLearningStoreInstance.js — única instancia real de
// PerformanceLearningStore que usan la Fase 1 de Performance Intelligence
// (backfillPublishedContent.js, performanceCollectionService.js) y el
// dashboard (routes/performance.js). Mismo directorio ya usado por
// performance-learning-intelligence/phase12Mvp.js — no se crea un segundo
// almacén paralelo; los registros reales (source:"platform_observed") y los
// de demo (source:"synthetic_fixture") conviven en el mismo store,
// distinguibles por ese campo — exactamente el contrato que Fase 12 ya
// define para eso.

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PerformanceLearningStore } from '../../performance-learning-intelligence/src/store.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', '..', 'performance-learning-intelligence', 'data', 'intelligence');

export const performanceLearningStore = new PerformanceLearningStore(DATA_DIR);
