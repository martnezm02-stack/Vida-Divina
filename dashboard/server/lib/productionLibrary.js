// productionLibrary.js — lee, sin duplicar, lo que ya persisten los stores
// reales (ProductionArtifactStore/VisualProductionPackageStore de
// creative-intelligence/, AssetLineage de content-orchestrator/) y los MP4
// reales ya producidos bajo video-production/. No crea una base de datos
// nueva -- solo proyecta lo que ya existe para la vista "CAMPAÑAS" y
// "ASSETS" del dashboard.

import { readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { listProductionArtifacts, getProductionArtifact } from '../../../creative-intelligence/production/productionArtifactStore.js';
import { listVisualProductionPackages, listVisualProductionPackagesByProductionArtifact } from '../../../creative-intelligence/production/visualProductionPackageStore.js';
import { listAllLineage } from '../../../content-orchestrator/src/assetLineage.js';
import { PROJECT_ROOT } from './safePaths.js';

const VIDEO_PRODUCTION_DIR = join(PROJECT_ROOT, 'video-production');

/**
 * Trazabilidad real: CreativeCell (candidateId) -> ProductionArtifact ->
 * VisualProductionPackage[], para cada ProductionArtifact ya persistido.
 * Nunca inventa una relación -- si un ProductionArtifact no tiene ningún
 * VisualProductionPackage persistido todavía, la lista queda vacía.
 */
export function listCampaigns() {
  return listProductionArtifacts().map((resumenArtifact) => {
    const artifact = getProductionArtifact(resumenArtifact.productionArtifactId);
    const paquetes = listVisualProductionPackagesByProductionArtifact(resumenArtifact.productionArtifactId);
    return {
      productionArtifactId: artifact.productionArtifactId,
      creativeCellCandidateId: artifact.creativeCellCandidateId,
      hypothesisRef: artifact.hypothesisRef,
      concept: artifact.concept,
      commercialObjective: artifact.commercialObjective,
      format: artifact.format,
      status: artifact.status,
      createdAt: artifact.createdAt,
      visualProductionPackages: paquetes,
    };
  });
}

/** Todos los VisualProductionPackage reales ya persistidos (proyección plana, para listados simples). */
export function listAllPackages() {
  return listVisualProductionPackages();
}

/** Recorre video-production/ buscando MP4 reales ya producidos (sin inventar ninguno) -- clasifica por convención de carpeta cuando es reconocible. */
export function listFinalOutputs() {
  const resultados = [];
  function recorrer(dir, profundidad) {
    if (profundidad > 3) return;
    let entradas;
    try {
      entradas = readdirSync(dir);
    } catch {
      return;
    }
    for (const entrada of entradas) {
      const full = join(dir, entrada);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        if (entrada === 'node_modules') continue;
        recorrer(full, profundidad + 1);
      } else if (extname(entrada).toLowerCase() === '.mp4') {
        resultados.push({ path: full, filename: entrada, fileSizeBytes: st.size, modifiedAt: st.mtime.toISOString() });
      }
    }
  }
  recorrer(VIDEO_PRODUCTION_DIR, 0);
  return resultados;
}

/** Une los MP4 reales encontrados con su registro de lineage real cuando existe (por hash de archivo) -- no fuerza a que todos lo tengan (algunos MP4 son de fases anteriores a que existiera lineage). */
export function listFinalOutputsWithLineage() {
  const lineageRecords = listAllLineage();
  const porPath = new Map(lineageRecords.map((r) => [r.derivedAssetPath, r]));
  return listFinalOutputs().map((out) => ({ ...out, lineage: porPath.get(out.path) ?? null }));
}
