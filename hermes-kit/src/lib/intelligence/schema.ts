// schema.ts — Esquema del Intelligence Store (MI-1).
//
// Modelo canónico: PROJECT (workspace) → SOURCE / ACTOR → INTELLIGENCE ITEM
// (con clasificación creativa y elementos creativos embebidos, 1:1) →
// METRICS (snapshots, time-series) / ASSET / EVIDENCE / AI ANALYSIS
// (1:muchos) → SIGNAL / PATTERN / INSIGHT / WATCHLIST (estructuras base,
// sin motor de detección todavía) → RELATIONSHIP (grafo item-a-item).
//
// Convención heredada de src/lib/db.ts: better-sqlite3, timestamps en
// segundos (unixepoch()), migraciones ligeras vía PRAGMA table_info +
// ALTER TABLE (sin runner de migraciones separado).
import type Database from "better-sqlite3";

export function ensureSchema(db: Database.Database): void {
  db.exec(`
    -- Workspace/proyecto: aislamiento lógico (Marketing Intelligence, Vida
    -- Divina, Trading, Cliente A...) dentro de un único Store compartido --
    -- nunca una base de datos por proyecto.
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    -- Fuente de inteligencia (tiktok, meta_ads, instagram, x, youtube,
    -- reddit, google_ads...). Catálogo abierto -- no CHECK de valores fijos,
    -- para no tener que tocar el esquema cada vez que se añade una fuente.
    CREATE TABLE IF NOT EXISTS sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    -- Anunciante / marca / creador / cuenta / publisher.
    CREATE TABLE IF NOT EXISTS actors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id),
      source_id INTEGER REFERENCES sources(id),
      external_id TEXT,
      handle TEXT,
      display_name TEXT,
      type TEXT,
      url TEXT,
      metadata_json TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    -- Idempotencia: mismo actor externo dentro del mismo proyecto/fuente no
    -- se duplica. external_id puede faltar (no todas las fuentes lo dan) --
    -- por eso es un índice parcial, no un UNIQUE de columna.
    CREATE UNIQUE INDEX IF NOT EXISTS idx_actors_identity
      ON actors(project_id, source_id, external_id)
      WHERE external_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_actors_project ON actors(project_id);

    -- Unidad principal investigada: anuncio, publicación, video, contenido
    -- de creador u otro tipo futuro (content_type es texto libre a
    -- propósito -- el modelo no se acopla solo a "ad").
    CREATE TABLE IF NOT EXISTS intelligence_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id),
      source_id INTEGER NOT NULL REFERENCES sources(id),
      actor_id INTEGER REFERENCES actors(id),
      external_id TEXT,
      canonical_url TEXT,
      content_type TEXT NOT NULL,
      title TEXT,
      description TEXT,

      -- Temporal: los días activos son una variable estratégica central --
      -- se derivan de last_seen_at - first_seen_at, nunca se piden sueltos.
      published_at INTEGER,
      first_seen_at INTEGER NOT NULL DEFAULT (unixepoch()),
      last_seen_at INTEGER NOT NULL DEFAULT (unixepoch()),

      -- Clasificación creativa (1:1 con el item -- no es serie temporal).
      format TEXT,
      style TEXT,
      theme TEXT,
      market TEXT,
      audience TEXT,
      objective TEXT,
      product TEXT,
      funnel_stage TEXT,

      -- Elementos creativos (1:1 con el item).
      hook TEXT,
      angle TEXT,
      problem TEXT,
      mechanism TEXT,
      cta TEXT,
      offer TEXT,
      social_proof TEXT,

      tags_json TEXT,
      metadata_json TEXT,

      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    -- Idempotencia principal: (proyecto, fuente, external_id). Índice
    -- parcial porque no toda fuente entrega un id estable.
    CREATE UNIQUE INDEX IF NOT EXISTS idx_items_identity
      ON intelligence_items(project_id, source_id, external_id)
      WHERE external_id IS NOT NULL;
    -- Idempotencia secundaria por URL canónica, para fuentes sin
    -- external_id fiable.
    CREATE UNIQUE INDEX IF NOT EXISTS idx_items_canonical_url
      ON intelligence_items(project_id, canonical_url)
      WHERE canonical_url IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_items_project ON intelligence_items(project_id);
    CREATE INDEX IF NOT EXISTS idx_items_source ON intelligence_items(project_id, source_id);
    CREATE INDEX IF NOT EXISTS idx_items_actor ON intelligence_items(actor_id);
    CREATE INDEX IF NOT EXISTS idx_items_market ON intelligence_items(project_id, market);
    CREATE INDEX IF NOT EXISTS idx_items_audience ON intelligence_items(project_id, audience);
    CREATE INDEX IF NOT EXISTS idx_items_funnel ON intelligence_items(project_id, funnel_stage);
    CREATE INDEX IF NOT EXISTS idx_items_published ON intelligence_items(project_id, published_at);
    CREATE INDEX IF NOT EXISTS idx_items_first_seen ON intelligence_items(project_id, first_seen_at);
    CREATE INDEX IF NOT EXISTS idx_items_last_seen ON intelligence_items(project_id, last_seen_at);

    -- Métricas: snapshots en el tiempo, nunca un único valor mutable --
    -- un item puede observarse varias veces y las métricas cambian.
    -- "Desconocido" se guarda como NULL, nunca como 0.
    CREATE TABLE IF NOT EXISTS item_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL REFERENCES intelligence_items(id),
      views INTEGER,
      likes INTEGER,
      comments INTEGER,
      shares INTEGER,
      engagement REAL,
      reach INTEGER,
      extra_json TEXT,
      captured_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_metrics_item ON item_metrics(item_id, captured_at);

    -- Evidencia visual/asset: thumbnail, video, imagen, audio, URL...
    CREATE TABLE IF NOT EXISTS assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL REFERENCES intelligence_items(id),
      kind TEXT NOT NULL,
      url TEXT,
      local_path TEXT,
      metadata_json TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_assets_item ON assets(item_id);

    -- Evidencia: frames, thumbnails, fragmentos de transcript, URLs,
    -- referencias de fuente. Distinto de "assets" -- un asset es un archivo
    -- referenciable, una evidencia es una observación puntual que respalda
    -- una afirmación sobre el item.
    CREATE TABLE IF NOT EXISTS evidence (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL REFERENCES intelligence_items(id),
      kind TEXT NOT NULL,
      content TEXT,
      url TEXT,
      metadata_json TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_evidence_item ON evidence(item_id);

    -- Análisis IA: estructurado y extensible, nunca acoplado a un único
    -- prompt o modelo -- analysis_type + result_json abiertos.
    CREATE TABLE IF NOT EXISTS ai_analyses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL REFERENCES intelligence_items(id),
      analysis_type TEXT NOT NULL,
      model TEXT,
      result_json TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_ai_analyses_item ON ai_analyses(item_id, analysis_type);

    -- Señal: trending topic, actividad de competidor, oportunidad creativa,
    -- crecimiento inusual, comportamiento repetido. Solo estructura -- el
    -- motor que las detecta no se implementa en MI-1.
    CREATE TABLE IF NOT EXISTS signals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id),
      item_id INTEGER REFERENCES intelligence_items(id),
      actor_id INTEGER REFERENCES actors(id),
      signal_type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      strength REAL,
      detected_at INTEGER NOT NULL DEFAULT (unixepoch()),
      metadata_json TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_signals_project ON signals(project_id, detected_at);
    CREATE INDEX IF NOT EXISTS idx_signals_item ON signals(item_id);

    -- Relaciones item-a-item: contenido relacionado, anuncios similares,
    -- misma campaña, mismo patrón. Actor y fuente ya se relacionan vía FK
    -- directa en intelligence_items -- esta tabla es solo para el grafo
    -- explícito entre items.
    CREATE TABLE IF NOT EXISTS item_relationships (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL REFERENCES intelligence_items(id),
      related_item_id INTEGER NOT NULL REFERENCES intelligence_items(id),
      relation_type TEXT NOT NULL,
      metadata_json TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_relationships_item ON item_relationships(item_id);
    CREATE INDEX IF NOT EXISTS idx_relationships_related ON item_relationships(related_item_id);

    -- Patrón: estructura base para patrones futuros (motor de detección
    -- fuera de alcance de MI-1).
    CREATE TABLE IF NOT EXISTS patterns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id),
      name TEXT NOT NULL,
      description TEXT,
      pattern_type TEXT,
      metadata_json TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_patterns_project ON patterns(project_id);

    -- Items que evidencian un patrón (tabla puente, no serie temporal).
    CREATE TABLE IF NOT EXISTS pattern_items (
      pattern_id INTEGER NOT NULL REFERENCES patterns(id),
      item_id INTEGER NOT NULL REFERENCES intelligence_items(id),
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      PRIMARY KEY (pattern_id, item_id)
    );

    -- Insight: estructura base para insights futuros.
    CREATE TABLE IF NOT EXISTS insights (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id),
      name TEXT NOT NULL,
      description TEXT,
      insight_type TEXT,
      metadata_json TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_insights_project ON insights(project_id);

    -- Patrones que respaldan un insight (tabla puente).
    CREATE TABLE IF NOT EXISTS insight_patterns (
      insight_id INTEGER NOT NULL REFERENCES insights(id),
      pattern_id INTEGER NOT NULL REFERENCES patterns(id),
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      PRIMARY KEY (insight_id, pattern_id)
    );

    -- Watchlist: keywords, competidores, creadores, marcas, temas, cuentas.
    CREATE TABLE IF NOT EXISTS watchlists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id),
      name TEXT NOT NULL,
      watchlist_type TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_watchlists_project ON watchlists(project_id);

    CREATE TABLE IF NOT EXISTS watchlist_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      watchlist_id INTEGER NOT NULL REFERENCES watchlists(id),
      value TEXT NOT NULL,
      kind TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_watchlist_entries_list ON watchlist_entries(watchlist_id);

    -- MI-3 (Analysis & Enrichment): un análisis/enriquecimiento sobre un
    -- item o un conjunto de items, ejecutado bajo demanda (query-driven,
    -- nunca por cron). Distinto de ai_analyses (MI-1: un análisis IA suelto
    -- 1:1 con un solo item, sin versión/caching/confianza) -- analysis_runs
    -- soporta conjuntos, versiones, caching determinista y trazabilidad,
    -- que ai_analyses no modelaba. Nunca sobrescribe: cada ejecución nueva
    -- es una fila nueva (ver analysisService.ts para versión/caching).
    CREATE TABLE IF NOT EXISTS analysis_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id),
      analysis_type TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT,
      confidence REAL,
      items_key TEXT NOT NULL,
      input_hash TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      context_json TEXT,
      result_json TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_analysis_runs_lookup
      ON analysis_runs(project_id, analysis_type, items_key, input_hash);
    CREATE INDEX IF NOT EXISTS idx_analysis_runs_project ON analysis_runs(project_id, created_at);

    -- Qué items cubrió cada análisis (1 fila = análisis de un solo item, N
    -- filas = análisis de un conjunto).
    CREATE TABLE IF NOT EXISTS analysis_run_items (
      analysis_run_id INTEGER NOT NULL REFERENCES analysis_runs(id),
      item_id INTEGER NOT NULL REFERENCES intelligence_items(id),
      PRIMARY KEY (analysis_run_id, item_id)
    );
    CREATE INDEX IF NOT EXISTS idx_analysis_run_items_item ON analysis_run_items(item_id);

    -- Provenance: a qué evidencia concreta (tabla evidence, ya existente en
    -- MI-1) se puede rastrear una afirmación del análisis.
    CREATE TABLE IF NOT EXISTS analysis_run_evidence (
      analysis_run_id INTEGER NOT NULL REFERENCES analysis_runs(id),
      evidence_id INTEGER NOT NULL REFERENCES evidence(id),
      PRIMARY KEY (analysis_run_id, evidence_id)
    );

    -- MI-4 (Pattern & Intelligence Detection): qué items sustentan una
    -- signal agregada (p.ej. HOOK_FREQUENCY sobre 12 items) -- signals.item_id
    -- (MI-1) sigue sirviendo para señales de un solo item, esto cubre el
    -- caso de conjunto sin tocar esa columna.
    CREATE TABLE IF NOT EXISTS signal_items (
      signal_id INTEGER NOT NULL REFERENCES signals(id),
      item_id INTEGER NOT NULL REFERENCES intelligence_items(id),
      PRIMARY KEY (signal_id, item_id)
    );
    CREATE INDEX IF NOT EXISTS idx_signal_items_item ON signal_items(item_id);

    -- Qué signals contribuyeron a un pattern. Items/actors/evidence/metrics
    -- que sustentan un pattern se derivan transitivamente vía pattern_items
    -- (join con intelligence_items/evidence/item_metrics/analysis_run_items
    -- por item_id) -- no se duplica esa relación en una tabla nueva; signals
    -- sí necesita su propio join porque puede cubrir un conjunto de items
    -- distinto al del pattern concreto.
    CREATE TABLE IF NOT EXISTS pattern_signals (
      pattern_id INTEGER NOT NULL REFERENCES patterns(id),
      signal_id INTEGER NOT NULL REFERENCES signals(id),
      PRIMARY KEY (pattern_id, signal_id)
    );
  `);

  // Migración (MI-2, ingesta/normalización): intelligence_items no tenía
  // columnas propias para "language" ni "media_type" -- el contrato
  // canónico de MI-2 los pide como campos de primera clase (distintos de
  // content_type, que es "ad"/"post"/"video"..., y de market, que es
  // país/mercado). Mismo patrón que src/lib/db.ts: PRAGMA table_info +
  // ALTER TABLE si falta, para no romper bases MI-1 ya creadas.
  const itemCols = db.prepare("PRAGMA table_info(intelligence_items)").all() as Array<{
    name: string;
  }>;
  if (!itemCols.some((c) => c.name === "language")) {
    db.exec("ALTER TABLE intelligence_items ADD COLUMN language TEXT");
  }
  if (!itemCols.some((c) => c.name === "media_type")) {
    db.exec("ALTER TABLE intelligence_items ADD COLUMN media_type TEXT");
  }

  // Migración (MI-4, detección de patrones): signals (MI-1) no tenía una
  // clave de agrupación normalizada -- la detección necesita poder hacer
  // upsert de una signal agregada ("el hook X ya tiene una signal de
  // frecuencia en este proyecto") sin volver a inspeccionar metadata_json.
  const signalCols = db.prepare("PRAGMA table_info(signals)").all() as Array<{ name: string }>;
  if (!signalCols.some((c) => c.name === "signal_key")) {
    db.exec("ALTER TABLE signals ADD COLUMN signal_key TEXT");
  }
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_signals_key ON signals(project_id, signal_type, signal_key)"
  );

  // Migración (MI-4): patterns (MI-1) solo tenía name/description/
  // pattern_type/metadata_json -- MI-4 pide que un pattern pueda exponer
  // directamente soporte cuantificable (item_support/actor_support/
  // frequency/confidence), su ventana temporal (first_seen_at/last_seen_at)
  // y si es un patrón de un solo actor o de mercado (scope) -- ver
  // detection/patternDetection.ts. pattern_key + (project_id, pattern_type)
  // es la clave de upsert: misma detección repetida sobre los mismos datos
  // actualiza el mismo pattern en vez de duplicarlo.
  const patternCols = db.prepare("PRAGMA table_info(patterns)").all() as Array<{ name: string }>;
  const newPatternColumns: Array<[string, string]> = [
    ["pattern_key", "TEXT"],
    ["scope", "TEXT"],
    ["confidence", "REAL"],
    ["item_support", "INTEGER"],
    ["actor_support", "INTEGER"],
    ["total_items_examined", "INTEGER"],
    ["frequency", "REAL"],
    ["first_seen_at", "INTEGER"],
    ["last_seen_at", "INTEGER"],
  ];
  for (const [name, type] of newPatternColumns) {
    if (!patternCols.some((c) => c.name === name)) {
      db.exec(`ALTER TABLE patterns ADD COLUMN ${name} ${type}`);
    }
  }
  db.exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_patterns_identity
       ON patterns(project_id, pattern_type, pattern_key)
       WHERE pattern_key IS NOT NULL`
  );
}
