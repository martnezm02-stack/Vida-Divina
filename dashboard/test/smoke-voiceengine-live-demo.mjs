import { generateNewVoiceover, isVoiceEngineReachable } from '../server/lib/voiceEngineClient.js';

console.log('reachable:', await isVoiceEngineReachable());
const result = await generateNewVoiceover({ text: 'Prueba real desde el cliente del dashboard.' });
console.log('resultado real:', result);
