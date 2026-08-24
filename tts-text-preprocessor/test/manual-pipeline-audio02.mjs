// Prueba final end-to-end (no automatizada): texto Audio 2 -> preprocessor
// -> validacion -> generacion real con Voice Engine -> (conversion y envio
// WhatsApp se hacen en un paso posterior, fuera de este script).
import { generarAudioDesdeTexto, guardarAuditoria } from '../src/pipelineVoiceEngine.js';

const TEXTO_AUDIO_02 =
  'Aquí le comparto algunos testimonios de personas que ya han tomado el producto y han compartido su experiencia y los cambios que se han notado.\n\n' +
  'Estoy seguro de que con alguno de estos testimonios se va identificar y convencer de los resultados que tiene el producto.';

console.log('=== Ejecutando pipeline completo: preprocessor -> validación -> Voice Engine (generación REAL) ===\n');

const registro = await generarAudioDesdeTexto(TEXTO_AUDIO_02, { etiqueta: 'audio-02-testimonios' });

console.log('=== ESTADO ===', registro.estado, '\n');
console.log(JSON.stringify(registro, null, 2));

const rutaAuditoria = 'C:\\Users\\manue\\AppData\\Local\\Temp\\claude\\C--Users-manue-Vida-Divina\\a8863738-d803-46f6-8368-66fb87866acd\\scratchpad\\auditoria-pipeline-audio02.json';
await guardarAuditoria(registro, rutaAuditoria);
console.log('\nAuditoría guardada en:', rutaAuditoria);
