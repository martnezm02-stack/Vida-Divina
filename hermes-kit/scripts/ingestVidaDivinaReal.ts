// ingestVidaDivinaReal.ts — Primera ingestión REAL de Vida Divina en
// project_id=3948 (slug "vida-divina", bootstrap ya completado en
// 588ecac). Ejecutar con: npx tsx scripts/ingestVidaDivinaReal.ts
//
// Reutiliza EXCLUSIVAMENTE lo ya existente:
//   - fetchTikTokViaMonidBridge (bridges/tiktokMonidBridge.ts, sin tocar)
//   - metaAdsAdapter (ingestion/adapters/metaAdsAdapter.ts, sin tocar)
//   - runMultiSourceResearchQuery (research/multiSource.ts, sin tocar)
//
// TikTok: fetch en vivo real vía Monid con keywords del handle oficial
// conocido "vidadivina.oficial" (visto repetidamente como fixture
// realista en tests -- aquí se usa como keyword de búsqueda REAL, no
// como dato fabricado: el resultado son posts orgánicos reales
// devueltos por TikTok a través del bridge).
//
// Meta Ads: los raw items NO se adquieren desde este script (el MCP
// mcp__meta-ads__ads_library_search solo es invocable desde la sesión
// del agente, no desde un proceso Node hijo) -- se pasan ya adquiridos
// como argumento JSON (ver META_ADS_RAW_JSON más abajo), tal como los
// devolvió la búsqueda real por page_ids de las dos páginas de
// distribuidor Vida Divina confirmadas ("Vida Divina Durango",
// "Alcino Vida Divina").
import "./env-loader";
import { fetchTikTokViaMonidBridge } from "../src/lib/intelligence/bridges/tiktokMonidBridge";
import { metaAdsAdapter, type MetaAdsRawItem } from "../src/lib/intelligence/ingestion/adapters/metaAdsAdapter";
import { runMultiSourceResearchQuery } from "../src/lib/intelligence/research/multiSource";
import type { AvailableSource, UnavailableSource } from "../src/lib/intelligence/research/multiSource";
import type { TikTokRawAd } from "../src/lib/intelligence/ingestion/adapters/tiktokAdapter";

const PROJECT_SLUG = "vida-divina";

// Resultado REAL confirmado de mcp__meta-ads__ads_library_search
// (page_ids=["792479400622136","665464019993360"], ad_active_status=ALL,
// 2026-09-26) -- 2 páginas cuyo NOMBRE identifica inequívocamente a un
// distribuidor de Vida Divina ("Vida Divina Durango", "Alcino Vida
// Divina"). No se asocia por contener la palabra "divina" sola (la
// búsqueda amplia "Vida Divina"/"Vida Divina suplementos" devolvió
// cientos de miles de resultados irrelevantes, descartados en su
// totalidad) -- solo estas 2 páginas, cuyo nombre completo ES la marca.
const META_ADS_RAW: MetaAdsRawItem[] = [
  {
    id: "1494071698469502",
    page_id: "792479400622136",
    page_name: "Vida Divina Durango",
    ad_creative_link_title: "Vida Divina Durango",
    ad_creation_time: 1760811289,
    ad_delivery_start_time: 1760817972,
    ad_snapshot_url: "https://www.facebook.com/ads/library/?id=1494071698469502",
    currency: "MXN",
  },
  {
    id: "1525755015121925",
    page_id: "792479400622136",
    page_name: "Vida Divina Durango",
    ad_creative_link_title: "",
    ad_creation_time: 1759809549,
    ad_delivery_start_time: 1759814704,
    ad_snapshot_url: "https://www.facebook.com/ads/library/?id=1525755015121925",
    currency: "MXN",
  },
  {
    id: "1351065483271275",
    page_id: "665464019993360",
    page_name: "Alcino Vida Divina",
    ad_creative_link_title:
      "Alcino Vida Divina | Quero saber mais | Descobre já! | Recebe informações! | Preenche o formulário | Transforma a tua vida! | Mais Informações",
    ad_creation_time: 1758536264,
    ad_delivery_start_time: 1758542365,
    ad_snapshot_url: "https://www.facebook.com/ads/library/?id=1351065483271275",
    currency: "EUR",
  },
];

async function buildTikTokSource(): Promise<AvailableSource<TikTokRawAd> | UnavailableSource> {
  return fetchTikTokViaMonidBridge({
    keywords: ["vidadivina.oficial"],
    dateRange: "THIS_MONTH",
    maxItems: 25,
    sort: "MOST_LIKED",
  });
}

function buildMetaAdsSource(): AvailableSource<MetaAdsRawItem> {
  return { name: "meta_ads", adapter: metaAdsAdapter, raw: META_ADS_RAW };
}

async function main(): Promise<void> {
  const tiktokSource = await buildTikTokSource();
  const metaAdsSource = buildMetaAdsSource();

  const outcome = await runMultiSourceResearchQuery({
    project: PROJECT_SLUG,
    query: {},
    minItems: 1,
    sources: [tiktokSource, metaAdsSource],
  });

  console.log(JSON.stringify(outcome, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
