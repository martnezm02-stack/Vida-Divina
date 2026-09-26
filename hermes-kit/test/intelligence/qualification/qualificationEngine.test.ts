// qualificationEngine.test.ts — Content Qualification determinista: cubre
// EXACTAMENTE el caso real de falso positivo detectado en producción
// (vidadivina.oficial vs bibliadivina.oficial) que motivó este módulo.
import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateContentQualification } from "../../../src/lib/intelligence/qualification/qualificationEngine";
import type { BrandDescriptor, QualificationContext } from "../../../src/lib/intelligence/qualification/types";

const VIDA_DIVINA: BrandDescriptor = {
  name: "Vida Divina",
  brandTokens: ["vidadivina", "tedivina"],
  lookalikeTokens: ["divina"],
};

function baseContext(overrides: Partial<QualificationContext> = {}): QualificationContext {
  return {
    project: { id: 1, slug: "test" },
    brand: VIDA_DIVINA,
    item: { id: 1, canonical_url: null, description_snippet: null, source_metadata_page_name: null },
    actor: null,
    ...overrides,
  };
}

test("caso real: @bibliadivina.oficial (contenido de oraciones) -> IRRELEVANT, nunca RELEVANT por similitud difusa con @vidadivina.oficial", async () => {
  const context = baseContext({
    actor: { handle: "bibliadivina.oficial", display_name: "Biblia Divina Oficial" },
    item: {
      id: 1,
      canonical_url: "https://www.tiktok.com/@bibliadivina.oficial/video/123",
      description_snippet: "\"Oremos juntos\" Querido Dios, te pido que me guies. #jovenescristianos #fe",
      source_metadata_page_name: null,
    },
  });

  const decision = await evaluateContentQualification(context, null);
  assert.equal(decision.decision, "IRRELEVANT");
  assert.equal(decision.provider, "fallback:deterministic");
});

test("caso real: @divina_oficial hablando de una canción de Karol G -> IRRELEVANT", async () => {
  const context = baseContext({
    actor: { handle: "divina_oficial", display_name: null },
    item: {
      id: 2,
      canonical_url: "https://www.tiktok.com/@divina_oficial/video/456",
      description_snippet: "Suena tu canción y tú no estás aquí en mi lado. Bby Wow Karol G",
      source_metadata_page_name: null,
    },
  });

  const decision = await evaluateContentQualification(context, null);
  assert.equal(decision.decision, "IRRELEVANT");
});

test("handle con el token de marca anclado (walterdezavidadivina) -> RELEVANT", async () => {
  const context = baseContext({
    actor: { handle: "walterdezavidadivina", display_name: "walterdeza.liderazgo" },
  });
  const decision = await evaluateContentQualification(context, null);
  assert.equal(decision.decision, "RELEVANT");
});

test("texto con hashtag #VidaDivina (mayúsculas/acentos normalizados) -> RELEVANT", async () => {
  const context = baseContext({
    actor: { handle: "alguien123", display_name: null },
    item: {
      id: 3,
      canonical_url: null,
      description_snippet: "Contenido real sobre bienestar #VidaDivina #Emprendimiento",
      source_metadata_page_name: null,
    },
  });
  const decision = await evaluateContentQualification(context, null);
  assert.equal(decision.decision, "RELEVANT");
});

test("page_name de Meta Ads = 'Vida Divina Durango' -> RELEVANT", async () => {
  const context = baseContext({
    item: { id: 4, canonical_url: null, description_snippet: null, source_metadata_page_name: "Vida Divina Durango" },
  });
  const decision = await evaluateContentQualification(context, null);
  assert.equal(decision.decision, "RELEVANT");
});

test("sin ninguna evidencia de marca ni de look-alike -> UNCERTAIN, nunca RELEVANT por defecto", async () => {
  const context = baseContext({
    actor: { handle: "alguien_random", display_name: "Alguien Random" },
    item: { id: 5, canonical_url: null, description_snippet: "Un video genérico sobre recetas de cocina", source_metadata_page_name: null },
  });
  const decision = await evaluateContentQualification(context, null);
  assert.equal(decision.decision, "UNCERTAIN");
});
