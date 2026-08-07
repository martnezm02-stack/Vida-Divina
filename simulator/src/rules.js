// rules.js
// Transcripción fiel de las tablas SI/ENTONCES ya documentadas — no son
// reglas inventadas por el simulador, son el criterio de decisión que
// docs/proceso_de_venta/ y docs/agente_ia/ ya describen en prosa. Cada
// entrada cita su fuente exacta.
//
// Por qué están transcritas aquí (y no leídas en vivo desde el Markdown):
// las tablas viven como texto narrativo, no como datos estructurados —
// el Knowledge Compiler (Sprint 2) no las extrajo porque
// docs/KNOWLEDGE_MODEL.md no define esa extracción como su
// responsabilidad. Es el hallazgo de arquitectura más importante de este
// sprint — ver docs/CONVERSATION_SIMULATOR.md, "Campos faltantes
// detectados".

// ---------------------------------------------------------------------
// Prioridad 1 de docs/agente_ia/prioridades.md: Seguridad. Se evalúa
// SIEMPRE primero, antes que cualquier otra regla — fuente:
// docs/agente_ia/reglas_de_decision.md, sección "Solicitud médica", y
// docs/agente_ia/reglas_de_seguridad.md.
// ---------------------------------------------------------------------
export const SENAL_MEDICA = {
  fuente: 'docs/agente_ia/reglas_de_decision.md#solicitud-médica + docs/objeciones/README.md (pendiente: mi_medico_no_me_deja)',
  patrones: [
    /diabetes/i,
    /diabétic/i,
    /medicament/i,
    /pastillas? para (la )?presión/i,
    /embarazad/i,
    /lactancia/i,
    /mi médico/i,
    /me dijo el doctor/i,
    /condición médica/i,
    /tratamiento médico/i,
  ],
};

// ---------------------------------------------------------------------
// Cliente que pregunta únicamente por precio — fuente:
// docs/conversaciones/primer_contacto/pregunta_precio.md
// ---------------------------------------------------------------------
export const SENAL_PRECIO = {
  fuente: 'docs/conversaciones/primer_contacto/pregunta_precio.md',
  patrones: [/precio/i, /cu[aá]nto (cuesta|vale)/i, /costo/i],
};

// ---------------------------------------------------------------------
// Señal de interés en el negocio — fuente:
// docs/proceso_de_venta/emprendimiento.md, "Señales válidas para
// presentar la oportunidad"
// ---------------------------------------------------------------------
export const SENAL_EMPRENDIMIENTO = {
  fuente: 'docs/proceso_de_venta/emprendimiento.md#señales-válidas-para-presentar-la-oportunidad',
  patrones: [/distribui/i, /emprend/i, /ganar dinero/i, /vender (yo|tambi[ée]n)/i, /ingreso (extra|adicional)/i, /afiliad/i, /negocio/i],
};

// ---------------------------------------------------------------------
// Mapa señal -> perfil. Fuente: docs/clientes/README.md, sección "Mapa
// rápido: necesidad -> primer producto de entrada", y su equivalente en
// docs/conversaciones/descubrimiento/senales_por_perfil.md. Se transcribe
// completo (las 16 filas), no una muestra.
// ---------------------------------------------------------------------
export const SENALES_PERFIL = [
  { perfilId: 'clientes/perder_peso', patrones: [/bajar de peso/i, /controlar (el|mi) apetito/i, /perder peso/i] },
  { perfilId: 'clientes/control_glucosa', patrones: [/niveles de az[uú]car/i, /az[uú]car en sangre/i] },
  { perfilId: 'clientes/salud_digestiva', patrones: [/pesad[oa] despu[ée]s de comer/i, /digesti[oó]n/i, /va(y|i)s? mal al ba[ñn]o/i] },
  { perfilId: 'clientes/energia', patrones: [/cansad[oa]/i, /sin energ[ií]a/i, /muy cansad/i, /me falta energ[ií]a/i] },
  { perfilId: 'clientes/rendimiento_deportivo', patrones: [/entren[oa]/i, /ganar m[uú]sculo/i, /recuperarme/i] },
  { perfilId: 'clientes/sistema_inmunologico', patrones: [/me enfermo/i, /defensas/i, /resfr[ií]os/i] },
  { perfilId: 'clientes/longevidad', patrones: [/envejecer bien/i, /vitalidad/i, /longevidad/i] },
  { perfilId: 'clientes/salud_cognitiva', patrones: [/no me puedo concentrar/i, /se me olvidan/i, /memoria/i] },
  { perfilId: 'clientes/dolor_articulaciones', patrones: [/duele[nm]?/i, /articulaciones/i, /inflamaci[oó]n/i] },
  { perfilId: 'clientes/salud_visual', patrones: [/se me cansa la vista/i, /vista cansada/i, /pantallas/i] },
  { perfilId: 'clientes/salud_intima_libido', patrones: [/deseo en pareja/i, /libido/i, /menopausia/i] },
  { perfilId: 'clientes/descanso_sueno', patrones: [/no puedo dormir/i, /no duermo bien/i, /insomnio/i] },
  { perfilId: 'clientes/cuidado_personal', patrones: [/jab[oó]n/i, /pasta dental/i, /algo natural para la piel/i] },
  { perfilId: 'clientes/belleza_anti_edad', patrones: [/verme m[aá]s joven/i, /cuidar mi rostro/i, /arrugas/i] },
  { perfilId: 'clientes/emprendimiento', patrones: SENAL_EMPRENDIMIENTO.patrones },
  { perfilId: 'clientes/bienestar_general', patrones: [/quiero informaci[oó]n/i, /cuidarme m[aá]s/i, /no s[ée] bien/i] },
];

// ---------------------------------------------------------------------
// Calificación del cliente — fuente:
// docs/proceso_de_venta/calificacion_del_cliente.md
// ---------------------------------------------------------------------
export function calificarCliente(mensaje) {
  const fuente = 'docs/proceso_de_venta/calificacion_del_cliente.md';
  if (SENAL_PRECIO.patrones.some((p) => p.test(mensaje))) {
    return { nivel: 'caliente', razon: 'pregunta directa por precio', fuente };
  }
  if (/quiero informaci[oó]n|no s[ée] bien|cu[ée]ntame/i.test(mensaje)) {
    return { nivel: 'frio', razon: 'sin intención de compra explícita', fuente };
  }
  return { nivel: 'tibio', razon: 'mostró un interés concreto en el primer mensaje', fuente };
}
