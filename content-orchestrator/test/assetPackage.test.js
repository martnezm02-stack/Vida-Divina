import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, writeFileSync, unlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerAssetEntry, createAssetPackage, getAssetPackageEntriesByType, ASSET_ENTRY_TYPES, leerArchivoConReintentos } from '../src/assetPackage.js';

const THIS_FILE = fileURLToPath(import.meta.url);

const TE_DIVINA_PHOTO = 'C:\\Users\\manue\\Vida Divina\\assets\\products\\te-divina\\raw\\te divina c tasa.jpeg';

describe('registerAssetEntry — PRODUCT_IMAGE reutiliza assetRegistry real', () => {
  test('registra la fotografía real de Té Divina con dimensiones reales medidas', (t) => {
    if (!existsSync(TE_DIVINA_PHOTO)) { t.skip('fotografía real no disponible en este entorno'); return; }
    const entry = registerAssetEntry({ sourcePath: TE_DIVINA_PHOTO, type: 'PRODUCT_IMAGE', role: 'PRODUCT_PRIMARY', productId: 'te-divina' });
    assert.equal(entry.status, 'AVAILABLE');
    assert.match(entry.assetId, /^[0-9a-f]{64}$/);
    assert.equal(entry.width, 1170);
    assert.equal(entry.height, 1159);
  });

  test('rechaza PRODUCT_IMAGE sin productId', (t) => {
    if (!existsSync(TE_DIVINA_PHOTO)) { t.skip('fotografía real no disponible en este entorno'); return; }
    assert.throws(() => registerAssetEntry({ sourcePath: TE_DIVINA_PHOTO, type: 'PRODUCT_IMAGE', role: 'PRODUCT_PRIMARY' }), /productId/);
  });

  test('rechaza un role inválido para PRODUCT_IMAGE', (t) => {
    if (!existsSync(TE_DIVINA_PHOTO)) { t.skip('fotografía real no disponible en este entorno'); return; }
    assert.throws(() => registerAssetEntry({ sourcePath: TE_DIVINA_PHOTO, type: 'PRODUCT_IMAGE', role: 'NOT_A_ROLE', productId: 'te-divina' }), /role de assetRegistry/);
  });
});

describe('registerAssetEntry — tipos genéricos (audio/video/música/etc.)', () => {
  test('un archivo real (este propio test) se registra como AUDIO_VOICE con hash real', () => {
    const entry = registerAssetEntry({ sourcePath: THIS_FILE, type: 'AUDIO_VOICE', role: 'VOICEOVER', productId: 'te-divina' });
    assert.equal(entry.status, 'AVAILABLE');
    assert.match(entry.hash, /^[0-9a-f]{64}$/);
    assert.equal(entry.assetId, entry.hash);
  });

  test('un archivo que no existe se registra como REQUIRED_MISSING, nunca se fabrica', () => {
    const entry = registerAssetEntry({ sourcePath: 'C:/no/existe/musica.mp3', type: 'AUDIO_MUSIC', role: 'BACKGROUND_MUSIC' });
    assert.equal(entry.status, 'REQUIRED_MISSING');
    assert.equal(entry.assetId, null);
  });

  test('rechaza un type fuera de ASSET_ENTRY_TYPES', () => {
    assert.throws(() => registerAssetEntry({ sourcePath: 'C:/x', type: 'NOT_A_TYPE', role: 'x' }), /type.*inválido/);
  });

  test('ASSET_ENTRY_TYPES cubre las categorías reales de la Parte 5', () => {
    for (const t of ['PRODUCT_IMAGE', 'LOGO', 'GENERATED_IMAGE', 'B_ROLL', 'VIDEO_CLIP', 'AUDIO_VOICE', 'AUDIO_MUSIC', 'GRAPHIC', 'FONT', 'BRAND_ASSET']) {
      assert.ok(ASSET_ENTRY_TYPES.includes(t));
    }
  });
});

describe('createAssetPackage — trazabilidad completa', () => {
  test('agrupa múltiples entradas reales con assetPackageId y trazabilidad completa', (t) => {
    if (!existsSync(TE_DIVINA_PHOTO)) { t.skip('fotografía real no disponible en este entorno'); return; }
    const pkg = createAssetPackage({
      contentRequestId: 'cr-test-1',
      entries: [
        { sourcePath: TE_DIVINA_PHOTO, type: 'PRODUCT_IMAGE', role: 'PRODUCT_PRIMARY', productId: 'te-divina' },
      ],
    });
    assert.match(pkg.assetPackageId, /^[0-9a-f-]{36}$/);
    assert.equal(pkg.contentRequestId, 'cr-test-1');
    assert.equal(pkg.entryCount, 1);
    assert.equal(pkg.hasAllAssetsAvailable, true);
    assert.equal(getAssetPackageEntriesByType(pkg, 'PRODUCT_IMAGE').length, 1);
  });

  test('hasAllAssetsAvailable es false si algún asset real falta, y lo lista', () => {
    const pkg = createAssetPackage({
      contentRequestId: 'cr-test-2',
      entries: [{ sourcePath: 'C:/no/existe.wav', type: 'AUDIO_VOICE', role: 'VOICEOVER' }],
    });
    assert.equal(pkg.hasAllAssetsAvailable, false);
    assert.deepEqual([...pkg.missingAssetPaths], ['C:/no/existe.wav']);
  });

  test('rechaza un Asset Package sin ninguna entrada', () => {
    assert.throws(() => createAssetPackage({ contentRequestId: 'x', entries: [] }), /entries.*arreglo no vacío/);
  });
});

describe('leerArchivoConReintentos -- hand-off WSL2->Windows (auditoría "Video Workspace + Voice Engine", 2026-08-23)', () => {
  test('archivo real y estable: lee exitosamente, sin reintentos necesarios', () => {
    const dir = mkdtempSync(join(tmpdir(), 'vd-handoff-'));
    const filePath = join(dir, 'audio.wav');
    writeFileSync(filePath, 'contenido-estable-real');
    const { buffer, stat } = leerArchivoConReintentos(filePath, 'AUDIO_VOICE');
    assert.equal(buffer.toString(), 'contenido-estable-real');
    assert.equal(stat.size, buffer.length);
    rmSync(dir, { recursive: true, force: true });
  });

  test('archivo que deja de ser accesible tras el chequeo inicial: lanza AUDIO_ASSET_READ_FAILED con contexto real (nunca un error genérico ni VALIDATION_FAILED sin detalle)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'vd-handoff-'));
    const filePath = join(dir, 'audio.wav');
    writeFileSync(filePath, 'contenido-temporal');
    unlinkSync(filePath); // simula el mount UNC no estabilizado / archivo ya no accesible al momento real de la lectura
    assert.throws(() => leerArchivoConReintentos(filePath, 'AUDIO_VOICE'), /AUDIO_ASSET_READ_FAILED/);
    rmSync(dir, { recursive: true, force: true });
  });

  test('mismo fallo con un type que no es AUDIO_VOICE usa el prefijo genérico ASSET_READ_FAILED, no AUDIO_ASSET_*', () => {
    const dir = mkdtempSync(join(tmpdir(), 'vd-handoff-'));
    const filePath = join(dir, 'graphic.png');
    writeFileSync(filePath, 'x');
    unlinkSync(filePath);
    let mensaje = '';
    try {
      leerArchivoConReintentos(filePath, 'GRAPHIC');
    } catch (err) {
      mensaje = err.message;
    }
    assert.match(mensaje, /^ASSET_READ_FAILED/);
    rmSync(dir, { recursive: true, force: true });
  });
});
