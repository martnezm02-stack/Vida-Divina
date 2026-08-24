// Script manual de verificación (no forma parte de la suite automatizada)
// -- corre el preprocessor sobre el texto exacto de "Audio 1 - Explicacion
// de como funciona el producto" y vuelca el resultado completo para
// revisión humana. No genera audio, no modifica nada.
import { prepararTextoParaTTS } from '../src/preprocessor.js';

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

const resultado = prepararTextoParaTTS(TEXTO_AUDIO_01);

console.log('=== A. TEXTO ORIGINAL ===\n');
console.log(resultado.textoOriginal);

console.log('\n\n=== B. TEXTO PREPARADO PARA TTS ===\n');
console.log(resultado.textoPreparado);

console.log('\n\n=== C. CAMBIOS REALIZADOS ===\n');
if (resultado.cambios.length === 0) {
  console.log('(ninguno)');
} else {
  resultado.cambios.forEach((c, i) => {
    console.log(`${i + 1}. [${c.tipo}] "${c.original}" -> "${c.corregido}"`);
  });
}

console.log('\n\n=== ADVERTENCIAS (no aplicadas automáticamente) ===\n');
if (resultado.advertencias.length === 0) {
  console.log('(ninguna)');
} else {
  resultado.advertencias.forEach((a, i) => {
    console.log(`${i + 1}. [${a.tipo}]`);
    if (a.oracion) console.log(`   Oración: "${a.oracion}"`);
    if (a.palabra) console.log(`   Palabra: "${a.palabra}" -- contexto: ${a.contexto}`);
    if (a.fragmento) console.log(`   Fragmento: "${a.fragmento}"`);
    console.log(`   ${a.detalle}`);
  });
}

console.log('\n\n=== VERIFICACIÓN DE CONSERVACIÓN DE SIGNIFICADO ===\n');
console.log('ok:', resultado.verificacion.ok);
resultado.verificacion.detalles.forEach((d) => console.log('-', d));
console.log('\nrequiereRevision:', resultado.requiereRevision);
