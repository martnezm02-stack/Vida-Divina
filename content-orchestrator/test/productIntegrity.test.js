import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  captureProductImageState, assertProductImageUnchanged, assertAssetEntryIntegrity, assertAssetPackageIntegrity,
} from '../src/productIntegrity.js';

const THIS_FILE = fileURLToPath(import.meta.url);
const tmpDir = mkdtempSync(join(tmpdir(), 'co-integrity-test-'));
const tmpImage = join(tmpDir, 'foto.jpeg');
writeFileSync(tmpImage, Buffer.from([0xff, 0xd8, 0xff, 0xd9])); // JPEG mínimo real (SOI+EOI), no un asset registrado -- solo para hash/mutación.

after(() => rmSync(tmpDir, { recursive: true, force: true }));

describe('captureProductImageState / assertProductImageUnchanged', () => {
  test('detecta que una fotografía real NO cambió', () => {
    const state = captureProductImageState(tmpImage);
    assert.equal(assertProductImageUnchanged(state), true);
  });

  test('detecta y rechaza que una fotografía real SÍ cambió (violación de integridad de producto)', () => {
    const state = captureProductImageState(tmpImage);
    writeFileSync(tmpImage, Buffer.from([0xff, 0xd8, 0x00, 0x00, 0xff, 0xd9])); // contenido real distinto.
    assert.throws(() => assertProductImageUnchanged(state), /cambió de contenido/);
  });

  test('lanza si la fotografía real no existe al capturar el estado', () => {
    assert.throws(() => captureProductImageState('C:/no/existe.jpeg'), /no se puede garantizar integridad/);
  });
});

describe('assertAssetEntryIntegrity — verificación real de los 8 puntos de integridad', () => {
  test('acepta una entrada PRODUCT_IMAGE real y consistente', () => {
    const entry = { assetId: 'a'.repeat(64), sourcePath: THIS_FILE, type: 'PRODUCT_IMAGE', role: 'PRODUCT_PRIMARY', productId: 'te-divina' };
    // Cambia el assetId a un hash real para pasar la verificación de contenido.
    assert.equal(assertAssetEntryIntegrity({ ...entry, assetId: hashOf(THIS_FILE) }, { expectedProductId: 'te-divina' }), true);
  });

  test('rechaza sin assetId', () => {
    assert.throws(() => assertAssetEntryIntegrity({ sourcePath: THIS_FILE, type: 'PRODUCT_IMAGE', role: 'PRODUCT_PRIMARY' }), /assetId.*ausente/);
  });

  test('rechaza si el archivo no existe físicamente', () => {
    assert.throws(() => assertAssetEntryIntegrity({ assetId: 'a'.repeat(64), sourcePath: 'C:/no/existe.jpeg', type: 'PRODUCT_IMAGE', role: 'PRODUCT_PRIMARY' }), /no existe físicamente/);
  });

  test('rechaza un type fuera de ASSET_ENTRY_TYPES', () => {
    assert.throws(() => assertAssetEntryIntegrity({ assetId: 'a'.repeat(64), sourcePath: THIS_FILE, type: 'NOT_A_TYPE', role: 'x' }), /type.*inválido/);
  });

  test('rechaza sin role', () => {
    assert.throws(() => assertAssetEntryIntegrity({ assetId: 'a'.repeat(64), sourcePath: THIS_FILE, type: 'PRODUCT_IMAGE' }), /role.*ausente/);
  });

  test('rechaza correspondencia producto-asset rota (productId no coincide con expectedProductId)', () => {
    assert.throws(() => assertAssetEntryIntegrity(
      { assetId: 'a'.repeat(64), sourcePath: THIS_FILE, type: 'PRODUCT_IMAGE', role: 'PRODUCT_PRIMARY', productId: 'otro-producto' },
      { expectedProductId: 'te-divina' },
    ), /correspondencia producto-asset rota/);
  });

  test('rechaza un asset GENERATED_IMAGE presentado con role de fotografía oficial (RAW vs GENERATED)', () => {
    assert.throws(() => assertAssetEntryIntegrity({ assetId: 'a'.repeat(64), sourcePath: THIS_FILE, type: 'GENERATED_IMAGE', role: 'PRODUCT_PRIMARY' }), /NUNCA puede presentarse como fotografía oficial/);
  });

  test('acepta un asset GENERATED_IMAGE con un role que NO es de fotografía oficial', () => {
    assert.equal(assertAssetEntryIntegrity({ assetId: hashOf(THIS_FILE), sourcePath: THIS_FILE, type: 'GENERATED_IMAGE', role: 'COMPOSITE_BACKGROUND' }), true);
  });

  test('rechaza si el hash real del archivo ya no coincide con el assetId original (mutación detectada)', () => {
    const hashReal = hashOf(THIS_FILE);
    assert.throws(() => assertAssetEntryIntegrity({ assetId: 'f'.repeat(64), sourcePath: THIS_FILE, type: 'PRODUCT_IMAGE', role: 'PRODUCT_PRIMARY' }), /ya no coincide con su assetId original/);
    assert.notEqual(hashReal, 'f'.repeat(64));
  });
});

describe('assertAssetPackageIntegrity', () => {
  test('valida todas las entradas AVAILABLE de un Asset Package real, ignora las REQUIRED_MISSING', () => {
    const pkg = {
      entries: [
        { assetId: hashOf(THIS_FILE), sourcePath: THIS_FILE, type: 'PRODUCT_IMAGE', role: 'PRODUCT_PRIMARY', productId: 'te-divina', status: 'AVAILABLE' },
        { assetId: null, sourcePath: 'C:/no/existe.jpeg', type: 'PRODUCT_IMAGE', role: 'PRODUCT_PRIMARY', status: 'REQUIRED_MISSING' },
      ],
    };
    assert.equal(assertAssetPackageIntegrity(pkg, { expectedProductId: 'te-divina' }), true);
  });
});

function hashOf(filePath) {
  // Mismo idioma sha256 que el resto del proyecto -- usado solo para preparar fixtures de test reales.
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}
