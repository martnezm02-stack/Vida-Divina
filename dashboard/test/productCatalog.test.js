// productCatalog.test.js — Corrección "Limpieza y normalización del
// Product Knowledge" (2026-08-28). Cobertura real de la selección
// determinista de PRODUCT_PRIMARY (Paso 3/12/28 del encargo) -- usa datos
// REALES de assets/products/ y docs/productos/, ningún fixture inventado.
// No existía ningún test dedicado de este módulo antes de esta tarea.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { listProductsWithAssets, getProduct } from '../server/lib/productCatalog.js';

const NUEVE_PRODUCTOS_REALES = Object.freeze([
  'cappuccino', 'extracto-tremella', 'mars-capsules', 'ripped-capsules', 'sculpt-black',
  'Sculpt-Tongkat-Ali', 'te-divina', 'tongkat-ali-cafe', 'venus-capsules',
]);

describe('A/C: primary product asset selection — nunca por orden alfabético (Paso 3/12 del encargo)', () => {
  test('CAFÉ TONGKAT ALI (caso reportado): PRODUCT_PRIMARY real es "Tongkat ali.png" (foto limpia real del empaque), nunca "Tongkat ali beneficios.png" (lámina gráfica real)', () => {
    const p = getProduct('tongkat-ali-cafe');
    const primary = p.rawAssets.find((a) => a.role === 'PRODUCT_PRIMARY');
    assert.equal(primary.originalFilename, 'Tongkat ali.png');
    assert.notEqual(primary.originalFilename, 'Tongkat ali beneficios.png');
  });

  test('exactamente UN asset real por producto real recibe PRODUCT_PRIMARY -- el resto real es PRODUCT_SECONDARY_REFERENCE (nunca todos con el mismo role real)', () => {
    for (const slug of NUEVE_PRODUCTOS_REALES) {
      const p = getProduct(slug);
      const primarios = p.rawAssets.filter((a) => a.role === 'PRODUCT_PRIMARY');
      assert.equal(primarios.length, 1, `producto real "${slug}" debe tener exactamente 1 asset real PRODUCT_PRIMARY (obtuvo ${primarios.length})`);
      const secundarios = p.rawAssets.filter((a) => a.role === 'PRODUCT_SECONDARY_REFERENCE');
      assert.equal(primarios.length + secundarios.length, p.rawAssets.length, `producto real "${slug}": todo asset real debe ser PRODUCT_PRIMARY o PRODUCT_SECONDARY_REFERENCE, nunca un role real fuera del catálogo`);
    }
  });

  test('convención real "01_Producto" (mayoría del catálogo real): el archivo real que matchea se elige como PRODUCT_PRIMARY, nunca el de "Beneficios"/"Lifestyle"', () => {
    for (const slug of ['mars-capsules', 'ripped-capsules', 'venus-capsules', 'cappuccino', 'extracto-tremella']) {
      const p = getProduct(slug);
      const primary = p.rawAssets.find((a) => a.role === 'PRODUCT_PRIMARY');
      assert.match(primary.originalFilename, /01[_-]?producto/i, `producto real "${slug}": PRODUCT_PRIMARY real debe ser el archivo real "01_Producto"`);
      assert.doesNotMatch(primary.originalFilename, /benefici|lifestyle/i, `producto real "${slug}": PRODUCT_PRIMARY real nunca debe ser un gráfico de beneficios/lifestyle`);
    }
  });

  test('producto real de archivo único (sculpt-black, sin sufijo Beneficios/Lifestyle en su nombre base) -- PRODUCT_PRIMARY real sigue siendo el archivo real sin clasificar', () => {
    const p = getProduct('sculpt-black');
    const primary = p.rawAssets.find((a) => a.role === 'PRODUCT_PRIMARY');
    assert.equal(primary.originalFilename, 'Sculpt_Black.png');
  });
});

describe('B: product asset IDs existentes — nunca cambian (content-addressed, Paso 13/21 del encargo)', () => {
  test('assetId real de "Tongkat ali.png" es el hash real sha256 del archivo real -- reclasificar el role real NUNCA cambia el assetId real', () => {
    const p = getProduct('tongkat-ali-cafe');
    const primary = p.rawAssets.find((a) => a.role === 'PRODUCT_PRIMARY');
    assert.equal(primary.assetId, '6ff83c1b20b7c5ca7f308ed778097a1a717b76331411242ea1307a9fcb84dc1d');
  });

  test('los 3 assetId reales de tongkat-ali-cafe son únicos reales y ninguno se pierde/duplica tras la corrección real de primary', () => {
    const p = getProduct('tongkat-ali-cafe');
    assert.equal(p.rawAssets.length, 3);
    const ids = new Set(p.rawAssets.map((a) => a.assetId));
    assert.equal(ids.size, 3, 'los 3 assetId reales deben seguir siendo distintos reales entre sí -- nunca duplicados por la reclasificación real de role');
  });
});

// Completar Product Knowledge — REISHI + Sculpt Max (2026-09-01): dos
// carpetas de assets reales que existían sin ficha resoluble (slug de
// carpeta "Capsulas Reishi"/"Capsulas Sculpt Max" no coincidía con el slug
// real de docs/productos/, reishi-capsules.md/sculpt-max.md) -- se
// renombraron las carpetas (git mv, mismo assetId real por contenido) para
// alinear el slug, y se agregó "Nombre visible" a ambas fichas. Ahora son
// productos operativos reales adicionales -- el conteo fijo de "9" queda
// obsoleto a propósito, se reemplaza por una lista explícita de operativos.
const PRODUCTOS_OPERATIVOS_REALES = Object.freeze([...NUEVE_PRODUCTOS_REALES, 'reishi-capsules', 'sculpt-max', 'life-capsules']);

describe('C: product catalog consistency — GET /api/products expone los productos reales operativos (Paso 14/24 del encargo + Reishi/Sculpt Max)', () => {
  test('listProductsWithAssets() real incluye los 9 productos reales operativos previos MÁS reishi-capsules y sculpt-max, todos con factsAvailable=true', () => {
    const productos = listProductsWithAssets();
    const operativos = productos.filter((p) => p.factsAvailable);
    const slugsOperativos = operativos.map((p) => p.productSlug).sort();
    assert.deepEqual(slugsOperativos, [...PRODUCTOS_OPERATIVOS_REALES].sort());
  });

  test('la corrección real NUNCA cambió productId/nombreVisible/category/state de ningún producto real (Paso 14 del encargo)', () => {
    const cafe = getProduct('tongkat-ali-cafe');
    assert.equal(cafe.productSlug, 'tongkat-ali-cafe');
    assert.equal(cafe.nombreVisible, 'Café Tongkat Ali');
    assert.equal(cafe.estadoComercial, 'ACTIVO');
    assert.equal(cafe.factsAvailable, true);
  });
});

describe('Completar Product Knowledge — REISHI + Sculpt Max: nombreVisible exacto, assets, dataQuality', () => {
  test('nombreVisible EXACTO -- sin variantes ("Sculpt Max", "SCULPT MAX", "Reishi Capsules", "Cápsulas Reishi", etc.)', () => {
    assert.equal(getProduct('reishi-capsules').nombreVisible, 'Cápsulas REISHI');
    assert.equal(getProduct('sculpt-max').nombreVisible, 'Cápsulas Sculpt Max');
  });

  test('ya no aparecen como "sin nombre comercial real" (factsAvailable=true, nombreComercial real presente)', () => {
    const reishi = getProduct('reishi-capsules');
    const sculptMax = getProduct('sculpt-max');
    assert.equal(reishi.factsAvailable, true);
    assert.ok(reishi.nombreComercial);
    assert.equal(sculptMax.factsAvailable, true);
    assert.ok(sculptMax.nombreComercial);
  });

  test('assets reales asociados correctamente -- 2 archivos cada uno, ninguno duplicado, foto "producto" elegida como PRODUCT_PRIMARY', () => {
    const reishi = getProduct('reishi-capsules');
    assert.equal(reishi.rawAssetCount, 2);
    assert.equal(new Set(reishi.rawAssets.map((a) => a.assetId)).size, 2);
    assert.match(reishi.rawAssets.find((a) => a.role === 'PRODUCT_PRIMARY').originalFilename, /producto/i);

    const sculptMax = getProduct('sculpt-max');
    assert.equal(sculptMax.rawAssetCount, 2);
    assert.equal(new Set(sculptMax.rawAssets.map((a) => a.assetId)).size, 2);
    assert.match(sculptMax.rawAssets.find((a) => a.role === 'PRODUCT_PRIMARY').originalFilename, /producto/i);
  });

  test('dataQualityStatus VERIFIED para ambos (sin datos críticos faltantes ni conflictos)', () => {
    assert.equal(getProduct('reishi-capsules').dataQualityStatus, 'VERIFIED');
    assert.equal(getProduct('sculpt-max').dataQualityStatus, 'VERIFIED');
  });
});

describe('Completar Product Knowledge — Cápsulas Life (mismo proceso que Reishi/Sculpt Max)', () => {
  test('nombreVisible EXACTO -- "Cápsulas Life", sin variantes ("Life", "Life Capsules", "Cápsulas LIFE")', () => {
    assert.equal(getProduct('life-capsules').nombreVisible, 'Cápsulas Life');
  });

  test('ya no aparece como "sin nombre comercial real" (factsAvailable=true)', () => {
    const life = getProduct('life-capsules');
    assert.equal(life.factsAvailable, true);
    assert.ok(life.nombreComercial);
  });

  test('asset único real asociado correctamente, marcado PRODUCT_PRIMARY (único archivo, sin sufijo Beneficios/Lifestyle)', () => {
    const life = getProduct('life-capsules');
    assert.equal(life.rawAssetCount, 1);
    const primary = life.rawAssets.find((a) => a.role === 'PRODUCT_PRIMARY');
    assert.equal(primary.originalFilename, 'Life Nature.png');
  });

  test('dataQualityStatus VERIFIED (Presentación real de 60 cápsulas corroborada por el empaque)', () => {
    assert.equal(getProduct('life-capsules').dataQualityStatus, 'VERIFIED');
  });
});

describe('D: dataQualityStatus — expuesto real en productCatalog.js (Paso 18/22 del encargo)', () => {
  test('Sculpt Black real: CONFLICT real con detalle real, expuesto por listProductsWithAssets()/getProduct()', () => {
    const p = getProduct('sculpt-black');
    assert.equal(p.dataQualityStatus, 'CONFLICT');
    assert.match(p.dataQualityDetail, /Garcinia/);
  });

  test('Venus Capsules real: VERIFIED real tras la corrección de ingredientes/beneficios (Paso 1/2 del encargo "Corrección integral")', () => {
    const p = getProduct('venus-capsules');
    assert.equal(p.dataQualityStatus, 'VERIFIED');
  });

  test('Café Tongkat Ali real: VERIFIED real (sin conflicto/incompletitud real), detalle real null', () => {
    const p = getProduct('tongkat-ali-cafe');
    assert.equal(p.dataQualityStatus, 'VERIFIED');
    assert.equal(p.dataQualityDetail, null);
  });
});

describe('I: backward compatibility — Paso 28/34 del encargo', () => {
  test('un producto real sin carpeta de assets real -- null explícito, comportamiento preexistente intacto', () => {
    assert.equal(getProduct('producto-que-no-existe'), null);
  });

  test('rawAssetCount real sigue reflejando el total real de archivos (3 por producto real de los 9), nunca solo los PRODUCT_PRIMARY reales', () => {
    for (const slug of NUEVE_PRODUCTOS_REALES) {
      const p = getProduct(slug);
      assert.equal(p.rawAssetCount, 3, `producto real "${slug}" debe seguir reportando 3 assets reales (rawAssetCount intacto)`);
      assert.equal(p.rawAssets.length, 3);
    }
  });

  test('cada asset real sigue trayendo dimensiones reales (width/height) y status real, mismo contrato real de antes', () => {
    const p = getProduct('tongkat-ali-cafe');
    for (const a of p.rawAssets) {
      assert.ok(a.width > 0 && a.height > 0, `asset real "${a.originalFilename}" debe traer dimensiones reales`);
      assert.equal(a.status, 'PRODUCT_REFERENCE_AVAILABLE');
    }
  });
});
