// bootstrapVidaDivinaProject.ts — Crea (idempotentemente) el proyecto
// canónico "Vida Divina" en el Intelligence Store real. Ejecutar con:
//   npx tsx scripts/bootstrapVidaDivinaProject.ts
//
// Usa getOrCreateProject() (MI-1, sin tocar) -- ya es idempotente por sí
// misma (busca por slug antes de insertar), así que correr este script dos
// veces NUNCA crea un proyecto duplicado.
//
// Este script NO migra datos. La inspección dirigida de intelligence.db
// (ver informe del bootstrap) encontró 195 proyectos de prueba/E2E
// distintos que reutilizan el mismo patrón de fixture "Vida Divina TikTok"/
// "Vida Divina suplementos" (creado por decenas de bloques de desarrollo:
// Watchlist, Scheduler, Worker, Relevance, Signal->Insight, Entrypoint E2E),
// sin ningún marcador que distinga cuál -- si alguno -- representa
// producción real frente a una validación puntual. Migrar cualquiera de
// ellos sería una asociación arbitraria por similitud, exactamente lo que
// esta migración debe evitar. Por eso el proyecto se crea vacío: es la base
// limpia sobre la que la ingesta real (Watchlists reales, Worker real)
// escribirá datos genuinos de aquí en adelante.
import "./env-loader";
import { getOrCreateProject } from "../src/lib/intelligence";
import { getDefaultProject as getDefaultProjectForSwitcher } from "../src/lib/intelligence/dashboard/projectQueries";

const CANONICAL_SLUG = "vida-divina";
const CANONICAL_NAME = "Vida Divina";

function main(): void {
  const before = getDefaultProjectForSwitcher();

  const project = getOrCreateProject(CANONICAL_SLUG, CANONICAL_NAME);

  console.log(
    JSON.stringify(
      {
        action: "bootstrap-vida-divina-project",
        project: { id: project.id, slug: project.slug, name: project.name, created_at: project.created_at },
        defaultProjectBefore: before ? { id: before.id, slug: before.slug, itemCount: before.itemCount } : null,
      },
      null,
      2
    )
  );
}

main();
