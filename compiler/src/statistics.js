// statistics.js
// Pipeline paso 9: generar estadísticas.
// Responsabilidad única: agregar conteos a partir de los datos ya
// construidos por las etapas anteriores. No decide nada, no valida —
// solo cuenta.

export function computeStatistics({ modules, entities, relationships, issues, startedAt, finishedAt }) {
  const errores = issues.filter((i) => i.severidad === 'error');
  const advertencias = issues.filter((i) => i.severidad === 'advertencia');

  const entidadesPorTipo = {};
  for (const e of entities) {
    entidadesPorTipo[e.tipo_entidad] = (entidadesPorTipo[e.tipo_entidad] ?? 0) + 1;
  }

  const relacionesPorTipo = {};
  for (const r of relationships) {
    relacionesPorTipo[r.tipo_relacion] = (relacionesPorTipo[r.tipo_relacion] ?? 0) + 1;
  }

  return {
    cantidad_modulos: modules.length,
    modulos: modules,
    cantidad_entidades: entities.length,
    entidades_por_tipo: entidadesPorTipo,
    cantidad_relaciones: relationships.length,
    relaciones_por_tipo: relacionesPorTipo,
    cantidad_advertencias: advertencias.length,
    cantidad_errores: errores.length,
    tiempo_compilacion_ms: finishedAt - startedAt,
  };
}
