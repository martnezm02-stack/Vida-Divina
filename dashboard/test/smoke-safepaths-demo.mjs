import { resolveSafeMediaPath, ALLOWED_MEDIA_ROOTS, PROJECT_ROOT } from '../server/lib/safePaths.js';

console.log('PROJECT_ROOT:', PROJECT_ROOT);
console.log('ALLOWED_MEDIA_ROOTS:', ALLOWED_MEDIA_ROOTS);

const okPath = 'C:\\Users\\manue\\Vida Divina\\assets\\products\\te-divina\\raw\\te divina c tasa.jpeg';
console.log('allowed real file:', resolveSafeMediaPath(okPath));

const badPath = 'C:\\Users\\manue\\Vida Divina\\creative-intelligence\\data';
console.log('disallowed dir (should be null):', resolveSafeMediaPath(badPath));

const traversal = 'C:\\Users\\manue\\Vida Divina\\assets\\products\\..\\..\\voice-engine';
console.log('traversal attempt (should be null):', resolveSafeMediaPath(traversal));
