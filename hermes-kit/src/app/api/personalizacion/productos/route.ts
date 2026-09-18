import { NextResponse } from "next/server";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { allProducts, REPO_ROOT } from "@/lib/vidaDivina/productKnowledge";

// GET /api/personalizacion/productos -- catálogo real de productos (mismo
// Knowledge Package que usan buscarProductos/consultarProducto), SOLO
// LECTURA. NUNCA una segunda fuente de productos/precios: categoría se
// deriva del mismo id real con categoriaDeProductoId (crm/services/
// inventorySnapshot.js), exactamente igual que Inventario/Dashboard.
export const dynamic = "force-dynamic";

const INVENTORY_SNAPSHOT_PATH = path.join(REPO_ROOT, "crm", "services", "inventorySnapshot.js");

export async function GET(): Promise<NextResponse> {
  try {
    const productos = await allProducts();
    // /* webpackIgnore: true */ obligatorio (2026-09-18): mismo hallazgo real
    // ya documentado (alertas.ts) para imports dinámicos de rutas hermanas.
    const { categoriaDeProductoId }: any = await import(/* webpackIgnore: true */ pathToFileURL(INVENTORY_SNAPSHOT_PATH).href);

    const lista = productos
      .map((p) => ({
        id: p.id,
        titulo: p.titulo,
        categoria: categoriaDeProductoId(p.id),
        rutaOriginal: p.ruta_original,
      }))
      .sort((a, b) => a.categoria.localeCompare(b.categoria) || a.titulo.localeCompare(b.titulo));

    return NextResponse.json({ ok: true, productos: lista });
  } catch (err) {
    return NextResponse.json({ ok: false, productos: [], error: err instanceof Error ? err.message : String(err) }, { status: 200 });
  }
}
