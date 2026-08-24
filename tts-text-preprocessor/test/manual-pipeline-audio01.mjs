// Prueba controlada manual (no forma parte de la suite automatizada):
// texto Audio 1 -> preprocessor -> validación -> generación TTS real.
// No toca WhatsApp en absoluto -- ni se importa el módulo.
import { generarAudioDesdeTexto, guardarAuditoria } from '../src/pipelineVoiceEngine.js';

const TEXTO_AUDIO_01 =
  'Perfecto. En este caso le voy a explicar cómo funciona nuestro producto.\n\n' +
  'El Té Divina es un tratamiento completo de 42 días que contiene ingredientes naturales, entre ellos arándano rojo, papaya, jengibre y chaga.\n\n' +
  'La combinación de estos ingredientes está pensada para apoyar el bienestar de nuestro organismo, principalmente a nivel digestivo. Por eso, muchas personas lo utilizan buscando mejorar su digestión, favorecer la regularidad intestinal, disminuir la sensación de inflamación, estreñimiento y sentirse más ligeras.\n\n' +
  'También nos puede apoyar a la perdida de peso de forma natural y sin rebote, además de ayudar a quienes buscan sentirse con más energía y disminuir esa sensación de cansancio.\n\n' +
  'Otro de los aspectos que muchas personas buscan mejorar es su estado de ánimo, su nivel de estrés y la calidad de su descanso, que hoy en día también son temas muy comunes.\n\n' +
  'Además, el cuidado del hígado es muy importante, ya que participa en numerosas funciones de nuestro organismo, por lo que este producto le apoya en su bienestar.\n\n' +
  'El tratamiento se toma tres veces al día durante 42 días y los resultados los va a ver desde la primer semana.\n\n' +
  'Ahora sí me gustaría saber, ¿hay algo específicamente que esté buscando mejorar en su Salud?\n\n' +
  'Así puedo orientarle y decirle qué opción puede ser más adecuada para lo que usted está buscando.';

console.log('=== Ejecutando pipeline completo: preprocessor -> validación -> Voice Engine ===\n');
console.log('(WhatsApp NO se importa ni se invoca en este script)\n');

const registro = await generarAudioDesdeTexto(TEXTO_AUDIO_01, { etiqueta: 'pipeline-audio01' });

console.log('=== ESTADO ===', registro.estado, '\n');
console.log(JSON.stringify(registro, null, 2));

const rutaAuditoria = 'C:\\Users\\manue\\AppData\\Local\\Temp\\claude\\C--Users-manue-Vida-Divina\\a8863738-d803-46f6-8368-66fb87866acd\\scratchpad\\auditoria-pipeline-audio01.json';
await guardarAuditoria(registro, rutaAuditoria);
console.log('\nAuditoría guardada en:', rutaAuditoria);
