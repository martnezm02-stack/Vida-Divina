import { assertAssetEntryIntegrity } from '../src/productIntegrity.js';

const realPath = 'C:\\Users\\manue\\Vida Divina\\content-orchestrator\\package.json';

try {
  assertAssetEntryIntegrity({ assetId: 'x'.repeat(10), sourcePath: realPath, type: 'GENERATED_IMAGE', role: 'PRODUCT_PRIMARY', productId: 'te-divina' });
  console.log('FAIL: should have thrown');
} catch (e) {
  console.log('OK, threw:', e.message.slice(0, 200));
}

const ok = assertAssetEntryIntegrity({ assetId: 'x'.repeat(10), sourcePath: realPath, type: 'PRODUCT_IMAGE', role: 'PRODUCT_PRIMARY', productId: 'te-divina' }, { expectedProductId: 'te-divina' });
console.log('valid case returned:', ok);

try {
  assertAssetEntryIntegrity({ assetId: 'x'.repeat(10), sourcePath: realPath, type: 'PRODUCT_IMAGE', role: 'PRODUCT_PRIMARY', productId: 'otro-producto' }, { expectedProductId: 'te-divina' });
  console.log('FAIL: should have thrown on productId mismatch');
} catch (e) {
  console.log('OK, threw:', e.message.slice(0, 200));
}
