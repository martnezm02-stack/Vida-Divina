// configuracionVozAprobada.js
// Configuración de voz APROBADA (advisory-hybrid-v1 / DEFAULT VIDA DIVINA
// VOICE). Copiada literalmente de
// ~/vida-divina-voice-engine-data/voice-reference/DEFAULT_VOICE_CONFIG.md
// -- NO modificar ningún valor sin autorización explícita y sin actualizar
// primero ese documento.

export const CONFIGURACION_VOZ_APROBADA = Object.freeze({
  modelo: 'es-MX-LatAm regional (t3_es_mx_latam.safetensors + s3gen_v3.pt)',
  referenciaIdentidad: '/home/manuel1974/vida-divina-voice-engine-data/voice-reference/reference-mono.wav',
  perfil: 'manuel_es_mx',
  language_id: 'es',
  exaggeration: 0.35,
  cfg_weight: 0.5,
  temperature: 0.8,
  repetition_penalty: 2.0,
  min_p: 0.05,
  top_p: 1.0,
  seed: 'no fija (RNG por defecto de PyTorch)',
  modoLlamada: 'única llamada continua, sin segmentar',
});
