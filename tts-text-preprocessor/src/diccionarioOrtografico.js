// diccionarioOrtografico.js
// Diccionario curado manualmente de correcciones ortográficas SEGURAS
// (restauración de acentos y concordancia evidente) para texto en español
// mexicano de registro comercial/asesoría. Deliberadamente NO es un
// corrector ortográfico genérico: cada entrada fue elegida porque la forma
// sin acento es, en la inmensa mayoría de los casos reales, un error de
// tecleo y no una palabra distinta — nunca porque "suene mejor".
//
// No incluye pares genuinamente ambiguos (ej. "si"/"sí", "tu"/"tú",
// "mas"/"más", "esta"/"está") — esos dependen del rol gramatical en la
// oración y corregirlos a ciegas puede cambiar el significado. Esos casos
// viven en PALABRAS_AMBIGUAS, para marcarse como advertencia, nunca para
// corregirse automáticamente.

// clave: palabra en minúsculas sin acento -> valor: forma correcta
export const CORRECCIONES_SEGURAS = new Map([
  ['tambien', 'también'],
  ['informacion', 'información'],
  ['opcion', 'opción'],
  ['opciones', 'opciones'], // ya correcta, sin acento (se deja por completitud/documentacion)
  ['perdida', 'pérdida'],
  ['perdidas', 'pérdidas'],
  ['digestion', 'digestión'],
  ['digestivo', 'digestivo'], // ya correcta, no lleva acento
  ['inflamacion', 'inflamación'],
  ['energia', 'energía'],
  ['dia', 'día'],
  ['dias', 'días'],
  ['traves', 'través'],
  ['decision', 'decisión'],
  ['atencion', 'atención'],
  ['ademas', 'además'],
  ['facil', 'fácil'],
  ['facilmente', 'fácilmente'],
  ['dificil', 'difícil'],
  ['rapido', 'rápido'],
  ['rapida', 'rápida'],
  ['rapidamente', 'rápidamente'],
  ['ultimo', 'último'],
  ['ultima', 'última'],
  ['articulo', 'artículo'],
  ['medico', 'médico'],
  ['medica', 'médica'],
  ['practico', 'práctico'],
  ['practica', 'práctica'],
  ['publico', 'público'],
  ['publica', 'pública'],
  ['unico', 'único'],
  ['unica', 'única'],
  ['unicamente', 'únicamente'],
  ['especifico', 'específico'],
  ['especifica', 'específica'],
  ['especificamente', 'específicamente'],
  ['organico', 'orgánico'],
  ['organica', 'orgánica'],
  ['cronico', 'crónico'],
  ['cronica', 'crónica'],
  ['fisico', 'físico'],
  ['fisica', 'física'],
  ['cientifico', 'científico'],
  ['cientifica', 'científica'],
  ['numero', 'número'],
  ['numeros', 'números'],
  ['telefono', 'teléfono'],
  ['maximo', 'máximo'],
  ['minimo', 'mínimo'],
  ['proposito', 'propósito'],
  ['habito', 'hábito'],
  ['habitos', 'hábitos'],
  ['estomago', 'estómago'],
  ['sintoma', 'síntoma'],
  ['sintomas', 'síntomas'],
  ['nutricion', 'nutrición'],
  ['higado', 'hígado'],
  ['estres', 'estrés'],
  ['animo', 'ánimo'],
  ['regimen', 'régimen'],
  ['equilibrio', 'equilibrio'], // ya correcta
  ['metabolismo', 'metabolismo'], // ya correcta, sin acento
]);

// Correcciones de concordancia/gramática evidentes que no son puramente de
// acentuación pero cumplen el mismo criterio: la forma corregida NUNCA
// cambia el significado, solo corrige una concordancia de género/número
// claramente incorrecta. Se reportan con tipo distinto para que sea
// auditable por separado.
export const CORRECCIONES_CONCORDANCIA = new Map([
  ['la primer semana', 'la primera semana'],
  ['la primer vez', 'la primera vez'],
  ['la primer opcion', 'la primera opción'],
]);

// Pares donde la forma sin acento y con acento son AMBAS palabras válidas
// en español, con significados o funciones gramaticales distintos según el
// contexto. Nunca se corrigen automáticamente — solo se reportan como
// advertencia si aparecen, para revisión humana.
// Deliberadamente NO incluye "de", "se", "te", "mi" -- aunque técnicamente
// tienen contraparte acentuada ("dé", "sé", "té", "mí"), en español
// comercial/hablado normal la forma sin acento es la correcta en más del
// 99% de los casos; incluirlas produce advertencias en casi cada oración
// sin señal útil real (ruido que entrena a ignorar las advertencias).
// Se dejan solo los pares donde la forma acentuada aparece con frecuencia
// suficiente en este tipo de texto para que la advertencia tenga valor.
export const PALABRAS_AMBIGUAS = new Set([
  'si', // si (condicional) / sí (afirmación)
  'tu', // tu (posesivo) / tú (pronombre)
  'mas', // mas (pero, formal) / más (cantidad)
  'aun', // aun (incluso) / aún (todavía)
  'solo', // solo (adjetivo, sin compañía) / sólo (adverbio, solamente — RAE ya no exige el acento, pero puede seguir siendo ambiguo)
  'esta', // esta (demostrativo) / está (verbo estar)
  'estas', // estas (demostrativo) / estás (verbo estar)
  'continuo', // continuo (adjetivo) / continúo (verbo continuar)
]);
