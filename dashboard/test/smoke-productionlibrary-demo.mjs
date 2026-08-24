import { listCampaigns, listFinalOutputsWithLineage } from '../server/lib/productionLibrary.js';

console.log('=== CAMPAIGNS ===');
console.log(JSON.stringify(listCampaigns(), null, 2).slice(0, 2000));

console.log('\n=== FINAL OUTPUTS (first 5) ===');
console.log(JSON.stringify(listFinalOutputsWithLineage().slice(0, 5), null, 2));
