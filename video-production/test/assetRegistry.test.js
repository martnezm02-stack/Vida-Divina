import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { registerImageAsset, ASSET_ROLES, ASSET_STATUS } from '../src/assetRegistry.js';

const TE_DIVINA_PRIMARY = 'C:/Users/manue/Vida Divina/assets/products/te-divina/raw/te divina c tasa.jpeg';
const TE_DIVINA_SECONDARY = 'C:/Users/manue/Vida Divina/assets/products/te-divina/raw/te desintoxica.jpeg';
const RIPPED_CAPSULES_PNG = 'C:/Users/manue/Vida Divina/assets/products/ripped-capsules/raw/Ripped_01_Producto.png';

describe('registerImageAsset — fotografías reales de Té Divina', () => {
  test('registra la fotografía primaria real con dimensiones reales medidas', () => {
    const asset = registerImageAsset({ sourcePath: TE_DIVINA_PRIMARY, productId: 'te-divina', role: 'PRODUCT_PRIMARY' });
    assert.equal(asset.status, 'PRODUCT_REFERENCE_AVAILABLE');
    assert.equal(asset.width, 1170);
    assert.equal(asset.height, 1159);
    assert.equal(asset.format, 'jpeg');
    assert.equal(asset.originalFilename, 'te divina c tasa.jpeg');
    assert.match(asset.assetId, /^[0-9a-f]{64}$/);
  });

  test('registra la fotografía secundaria real (histórica) con dimensiones reales', () => {
    const asset = registerImageAsset({ sourcePath: TE_DIVINA_SECONDARY, productId: 'te-divina', role: 'PRODUCT_SECONDARY_REFERENCE' });
    assert.equal(asset.status, 'PRODUCT_REFERENCE_AVAILABLE');
    assert.equal(asset.width, 1280);
    assert.equal(asset.height, 1280);
  });

  test('assetId es content-addressed: el mismo archivo real produce siempre el mismo id', () => {
    const a1 = registerImageAsset({ sourcePath: TE_DIVINA_PRIMARY, productId: 'te-divina', role: 'PRODUCT_PRIMARY' });
    const a2 = registerImageAsset({ sourcePath: TE_DIVINA_PRIMARY, productId: 'te-divina', role: 'PRODUCT_PRIMARY' });
    assert.equal(a1.assetId, a2.assetId);
  });

  test('un archivo que no existe se registra como PRODUCT_REFERENCE_REQUIRED, nunca se fabrica', () => {
    const asset = registerImageAsset({ sourcePath: 'C:/no/existe/foto.jpeg', productId: 'te-divina', role: 'PRODUCT_PRIMARY' });
    assert.equal(asset.status, 'PRODUCT_REFERENCE_REQUIRED');
    assert.equal(asset.assetId, null);
    assert.equal(asset.width, null);
  });

  test('rechaza un role fuera de ASSET_ROLES', () => {
    assert.throws(() => registerImageAsset({ sourcePath: TE_DIVINA_PRIMARY, productId: 'te-divina', role: 'HERO_SHOT' }));
  });

  test('vocabularios exportados', () => {
    assert.deepEqual([...ASSET_ROLES], ['PRODUCT_PRIMARY', 'PRODUCT_SECONDARY_REFERENCE']);
    assert.deepEqual([...ASSET_STATUS], ['PRODUCT_REFERENCE_AVAILABLE', 'PRODUCT_REFERENCE_REQUIRED']);
  });
});

describe('registerImageAsset -- soporte PNG real (auditoría "Video Workspace + Voice Engine", 2026-08-23: fotografías RAW reales de Divina Ripped Capsules son PNG, no JPEG)', () => {
  test('registra la fotografía PNG real de Ripped Capsules con dimensiones reales medidas (chunk IHDR)', () => {
    const asset = registerImageAsset({ sourcePath: RIPPED_CAPSULES_PNG, productId: 'ripped-capsules', role: 'PRODUCT_PRIMARY' });
    assert.equal(asset.status, 'PRODUCT_REFERENCE_AVAILABLE');
    assert.equal(asset.format, 'png');
    assert.ok(Number.isInteger(asset.width) && asset.width > 0);
    assert.ok(Number.isInteger(asset.height) && asset.height > 0);
    assert.match(asset.assetId, /^[0-9a-f]{64}$/);
  });

  test('assetId de un PNG es content-addressed: el mismo archivo real produce siempre el mismo id', () => {
    const a1 = registerImageAsset({ sourcePath: RIPPED_CAPSULES_PNG, productId: 'ripped-capsules', role: 'PRODUCT_PRIMARY' });
    const a2 = registerImageAsset({ sourcePath: RIPPED_CAPSULES_PNG, productId: 'ripped-capsules', role: 'PRODUCT_PRIMARY' });
    assert.equal(a1.assetId, a2.assetId);
  });

  test('el hash del PNG original es exactamente el hash real del archivo -- nunca se convierte ni se reescribe (integridad del original)', () => {
    const expectedHash = createHash('sha256').update(readFileSync(RIPPED_CAPSULES_PNG)).digest('hex');
    const asset = registerImageAsset({ sourcePath: RIPPED_CAPSULES_PNG, productId: 'ripped-capsules', role: 'PRODUCT_PRIMARY' });
    assert.equal(asset.assetId, expectedHash);
    assert.equal(asset.sourcePath, RIPPED_CAPSULES_PNG); // sourcePath real, nunca una copia/derivación
  });

  test('un PNG corrupto (firma real inválida) se rechaza -- nunca inventa dimensiones', () => {
    const dir = mkdtempSync(join(tmpdir(), 'vd-png-corrupto-'));
    const filePath = join(dir, 'corrupto.png');
    writeFileSync(filePath, Buffer.from([0x00, 0x01, 0x02, 0x03]));
    assert.throws(() => registerImageAsset({ sourcePath: filePath, productId: 'x', role: 'PRODUCT_PRIMARY' }), /leerDimensionesPng/);
    rmSync(dir, { recursive: true, force: true });
  });

  test('un JPEG corrupto (firma real inválida) sigue rechazándose -- regresión, mismo comportamiento previo a esta fase', () => {
    const dir = mkdtempSync(join(tmpdir(), 'vd-jpeg-corrupto-'));
    const filePath = join(dir, 'corrupto.jpeg');
    writeFileSync(filePath, Buffer.from([0x00, 0x01, 0x02, 0x03]));
    assert.throws(() => registerImageAsset({ sourcePath: filePath, productId: 'x', role: 'PRODUCT_PRIMARY' }), /leerDimensionesJpeg/);
    rmSync(dir, { recursive: true, force: true });
  });

  test('un formato real todavía no soportado (ej. .webp) sigue rechazándose explícitamente, nunca en silencio', () => {
    const dir = mkdtempSync(join(tmpdir(), 'vd-webp-'));
    const filePath = join(dir, 'foto.webp');
    writeFileSync(filePath, Buffer.from([0x00, 0x01, 0x02, 0x03]));
    assert.throws(() => registerImageAsset({ sourcePath: filePath, productId: 'x', role: 'PRODUCT_PRIMARY' }), /no soportado/);
    rmSync(dir, { recursive: true, force: true });
  });
});
