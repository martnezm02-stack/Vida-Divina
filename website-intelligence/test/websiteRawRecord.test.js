import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  createWebsiteRawRecord,
  createWebsiteRawRecordFromBackendResult,
  hashContent,
  ACQUISITION_METHODS,
  FETCH_STATUS,
} from '../src/acquisition/websiteRawRecord.js';

function base(overrides = {}) {
  return {
    url: 'https://ejemplo-ficticio.test/pagina',
    acquisition_method: 'http_direct',
    fetch_status: 'ok',
    html: '<html><title>Pagina</title><body>hola</body></html>',
    ...overrides,
  };
}

describe('WebsiteRawRecord — campos obligatorios y tipos', () => {
  test('crea un registro válido con content_hash derivado y site calculado de la URL', () => {
    const record = createWebsiteRawRecord(base());
    assert.ok(record.raw_id);
    assert.equal(record.site, 'ejemplo-ficticio.test');
    assert.equal(record.content_hash, hashContent(base().html));
    assert.ok(record.retrieved_at);
  });

  test('rechaza sin url, con url inválida (no http/https), o con acquisition_method/fetch_status inválidos', () => {
    assert.throws(() => createWebsiteRawRecord(base({ url: undefined })));
    assert.throws(() => createWebsiteRawRecord(base({ url: 'ftp://ejemplo.test/x' })));
    assert.throws(() => createWebsiteRawRecord(base({ url: 'no-es-una-url' })));
    assert.throws(() => createWebsiteRawRecord(base({ acquisition_method: 'browser_magico' })));
    assert.throws(() => createWebsiteRawRecord(base({ fetch_status: 'estado_inventado' })));
  });

  test('acepta exactamente los métodos y estados documentados', () => {
    assert.deepEqual(ACQUISITION_METHODS, ['http_direct', 'browser_render', 'specialized_tool']);
    assert.deepEqual(FETCH_STATUS, ['ok', 'partial', 'blocked', 'error', 'authentication_required']);
  });

  test('rechaza fetch_status "ok" sin contenido en html ni text — nunca se declara éxito vacío', () => {
    assert.throws(() => createWebsiteRawRecord(base({ html: null, text: null })));
  });

  test('viewport, cuando se especifica, debe ser desktop/tablet/mobile', () => {
    assert.throws(() => createWebsiteRawRecord(base({ viewport: 'ultrawide' })));
    const record = createWebsiteRawRecord(base({ viewport: 'mobile' }));
    assert.equal(record.viewport, 'mobile');
  });

  test('el registro queda congelado (Object.freeze)', () => {
    const record = createWebsiteRawRecord(base());
    assert.throws(() => { record.url = 'https://otro.test'; }, TypeError);
  });
});

describe('WebsiteRawRecord — fetch_status "error"/"blocked" nunca llevan contenido inventado', () => {
  test('error sin contenido es válido', () => {
    const record = createWebsiteRawRecord(base({ fetch_status: 'error', html: null, text: null }));
    assert.equal(record.fetch_status, 'error');
    assert.equal(record.content_hash, hashContent(''));
  });

  test('blocked sin contenido es válido', () => {
    const record = createWebsiteRawRecord(base({ fetch_status: 'blocked', html: null, text: null }));
    assert.equal(record.fetch_status, 'blocked');
  });
});

describe('WebsiteRawRecord — AUTHENTICATION_REQUIRED: la adquisición se detiene, nunca se simula contenido', () => {
  test('exige authentication_required=true cuando fetch_status es authentication_required', () => {
    assert.throws(() => createWebsiteRawRecord(base({ fetch_status: 'authentication_required', html: null, text: null, authentication_required: false })));
  });

  test('rechaza cualquier contenido presente junto con authentication_required', () => {
    assert.throws(() => createWebsiteRawRecord(base({ fetch_status: 'authentication_required', authentication_required: true })));
  });

  test('un registro authentication_required válido no tiene html ni text', () => {
    const record = createWebsiteRawRecord(base({ fetch_status: 'authentication_required', html: null, text: null, authentication_required: true }));
    assert.equal(record.html, null);
    assert.equal(record.text, null);
    assert.equal(record.authentication_required, true);
  });

  test('rechaza authentication_required=true junto con cualquier otro fetch_status', () => {
    assert.throws(() => createWebsiteRawRecord(base({ fetch_status: 'ok', authentication_required: true })));
  });
});

describe('WebsiteRawRecord — screenshot_reference: solo metadatos, nunca bytes de imagen', () => {
  function withScreenshot(overrides = {}) {
    return base({
      screenshot_reference: {
        screenshot_id: 'shot-1',
        viewport: 'desktop',
        content_hash: 'abc123',
        ...overrides,
      },
    });
  }

  test('acepta una referencia de screenshot válida (solo metadatos)', () => {
    const record = createWebsiteRawRecord(withScreenshot());
    assert.equal(record.screenshot_reference.screenshot_id, 'shot-1');
  });

  test('rechaza screenshot_reference sin viewport válido o sin content_hash', () => {
    assert.throws(() => createWebsiteRawRecord(base({ screenshot_reference: { screenshot_id: 'x', viewport: 'ultrawide', content_hash: 'h' } })));
    assert.throws(() => createWebsiteRawRecord(base({ screenshot_reference: { screenshot_id: 'x', viewport: 'desktop' } })));
  });

  test('rechaza estructuralmente cualquier intento de embeber bytes de imagen', () => {
    assert.throws(
      () => createWebsiteRawRecord(withScreenshot({ image_data: 'ZmFrZS1iYXNlNjQ=' })),
      /METADATOS/
    );
    assert.throws(() => createWebsiteRawRecord(withScreenshot({ base64: 'ZmFrZQ==' })));
  });
});

describe('WebsiteRawRecord — interaction_context', () => {
  test('exige trigger cuando se declara interaction_context', () => {
    assert.throws(() => createWebsiteRawRecord(base({ interaction_context: { target_detail: 'menu' } })));
    const record = createWebsiteRawRecord(base({ interaction_context: { trigger: 'click', target_detail: 'menu hamburguesa' } }));
    assert.equal(record.interaction_context.trigger, 'click');
  });
});

describe('WebsiteRawRecord — content_flags (banderas de seguridad, nunca acción automática)', () => {
  test('content_flags se persiste tal cual, como dato informativo', () => {
    const record = createWebsiteRawRecord(base({ content_flags: ['possible_prompt_injection', 'contains_script_tag'] }));
    assert.deepEqual(record.content_flags, ['possible_prompt_injection', 'contains_script_tag']);
  });
});

describe('createWebsiteRawRecordFromBackendResult — normalización del payload crudo de un backend', () => {
  test('normaliza un resultado exitoso a fetch_status "ok"', () => {
    const record = createWebsiteRawRecordFromBackendResult(
      { ok: true, blocked: false, authRequired: false, httpStatus: 200, html: '<html>x</html>', text: 'x', title: 'Título' },
      { url: 'https://ejemplo-ficticio.test/x', acquisitionMethod: 'http_direct' }
    );
    assert.equal(record.fetch_status, 'ok');
    assert.equal(record.page_title, 'Título');
    assert.equal(record.metadata.http_status, 200);
  });

  test('normaliza authRequired a fetch_status "authentication_required" sin contenido', () => {
    const record = createWebsiteRawRecordFromBackendResult(
      { ok: false, blocked: false, authRequired: true, httpStatus: 401, html: null, text: null, title: null },
      { url: 'https://ejemplo-ficticio.test/privado', acquisitionMethod: 'http_direct' }
    );
    assert.equal(record.fetch_status, 'authentication_required');
    assert.equal(record.authentication_required, true);
    assert.equal(record.html, null);
  });

  test('normaliza blocked y error correctamente, distinguiéndolos', () => {
    const blocked = createWebsiteRawRecordFromBackendResult(
      { ok: false, blocked: true, authRequired: false, httpStatus: 200, html: null, text: null },
      { url: 'https://ejemplo-ficticio.test/y', acquisitionMethod: 'http_direct' }
    );
    assert.equal(blocked.fetch_status, 'blocked');

    const errored = createWebsiteRawRecordFromBackendResult(
      { ok: false, blocked: false, authRequired: false, httpStatus: 500, html: null, text: null },
      { url: 'https://ejemplo-ficticio.test/z', acquisitionMethod: 'http_direct' }
    );
    assert.equal(errored.fetch_status, 'error');
  });
});
