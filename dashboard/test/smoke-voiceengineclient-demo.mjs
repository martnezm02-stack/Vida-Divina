import { listExistingAudioAssets, isVoiceEngineReachable } from '../server/lib/voiceEngineClient.js';

console.log('=== EXISTING AUDIO ASSETS ===');
console.log(JSON.stringify(listExistingAudioAssets(), null, 2));

console.log('\n=== VOICE ENGINE REACHABLE? ===');
console.log(await isVoiceEngineReachable());
