"""
build_catalog.py
Descubre TODOS los productos en docs/productos/ y genera catalog.json
que el sitio web consume en runtime.

Source of truth: docs/productos/<categoria>/<producto>.md
  O: docs/productos/<categoria>.md cuando el producto vive en archivo único

Estructura soportada en cada .md:
  - Nombre comercial / Nombre visible / Categoría
  - Objetivo principal / Problema / Ingredientes / Beneficios
  - Presentación / Público objetivo
  - Productos complementarios / Palabras clave

No inventa datos. Los campos no encontrados quedan como null.
Los productos sin imágenes en assets/products/<slug>/raw/ reciben un
placeholder SVG generado automáticamente.
"""
import os
import re
import json

ROOT = r"C:\Users\manue\Vida Divina"
DOCS = os.path.join(ROOT, "docs", "productos")
ASSETS = os.path.join(ROOT, "assets", "products")
OUT = os.path.join(ROOT, "catalog.json")
PLACEHOLDERS = os.path.join(ROOT, "products")

CATEGORIES = {
    "01-control-de-peso":          "Control de Peso",
    "02-cafe-divina":               "Café Divina · Bebidas Funcionales",
    "03-longevidad-bienestar":      "Longevidad y Bienestar General",
    "04-funcion-cognitiva":         "Función Cognitiva",
    "05-dolor-articulaciones":      "Dolor y Articulaciones",
    "06-salud-visual":              "Salud Visual",
    "07-rendimiento-fisico":        "Rendimiento Físico y Fuerza",
    "08-intimidad-libido":          "Intimidad y Libido",
    "09-proteinas-batidos":         "Proteínas y Batidos",
    "10-energia-antioxidantes":     "Energía y Antioxidantes",
    "11-extractos-hongos":          "Extractos de Hongos Medicinales",
    "12-cuidado-personal":          "Cuidado Personal",
    "13-linea-radien":              "Línea Radien · Cuidado de la Piel",
}


def slugify(s: str) -> str:
    """Slug limpio en kebab-case sin acentos."""
    s = s.strip().lower()
    repl = {
        "á": "a", "é": "e", "í": "i", "ó": "o", "ú": "u",
        "ñ": "n", "ü": "u", "ç": "c",
    }
    for k, v in repl.items():
        s = s.replace(k, v)
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")


def list_images(slug: str) -> list[str]:
    """Lista las imágenes del producto en /products/<slug>/.
    Esta carpeta contiene los assets ya optimizados (WebP).
    Si el producto no tiene assets, devuelve lista vacía y el caller
    generará un placeholder SVG.
    """
    d = os.path.join(ROOT, "products", slug)
    if not os.path.isdir(d):
        return []
    files = [f for f in os.listdir(d) if f.lower().endswith((".webp", ".png", ".jpg", ".jpeg"))]

    by_base = {}
    for f in files:
        base, ext = f.rsplit(".", 1)
        if ext.lower() == "webp":
            by_base[base] = f
        elif base not in by_base:
            by_base[base] = f

    def slot_key(fname):
        m = re.search(r"-(\d{2})-", fname)
        return int(m.group(1)) if m else 99
    return sorted(by_base.values(), key=slot_key)


def grab(content: str, field: str) -> str | None:
    """Extrae el valor de un campo del formato `- **Campo:** valor`."""
    pattern = rf"^\s*[-*]?\s*\**\s*{re.escape(field)}\s*\**\s*[:\-]\s*(.+)$"
    m = re.search(pattern, content, re.M)
    if not m:
        return None
    val = m.group(1).strip()
    # Quitar markdown links
    val = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", val)
    return val.strip().strip("*")


def parse_md(content: str) -> dict:
    return {
        "nombreComercial":   grab(content, "Nombre comercial"),
        "nombreVisible":     grab(content, "Nombre visible"),
        "objetivoPrincipal": grab(content, "Objetivo principal"),
        "problema":          grab(content, "Problema que ayuda a resolver"),
        "ingredientes":      grab(content, "Ingredientes principales"),
        "beneficios":        grab(content, "Beneficios"),
        "presentacion":      grab(content, "Presentación"),
        "publicoObjetivo":   grab(content, "Público objetivo"),
        "complementarios":   grab(content, "Productos complementarios"),
        "keywords":          grab(content, "Palabras clave"),
    }


def split_beneficios(text):
    if not text:
        return []
    parts = re.split(r"[;·]+|(?<=\w),\s(?=[A-ZÁÉÍÓÚÑa-záéíóúñ])", text)
    return [p.strip(" .") for p in parts if p.strip()]


def split_ingredientes(text):
    if not text:
        return []
    parts = re.split(r"[,;·]+", text)
    return [p.strip(" .") for p in parts if p.strip()]


def discover_all() -> list[tuple[str, str, str]]:
    """
    Descubre todos los productos. Devuelve lista de (slug, cat_slug, source).
    source = 'individual' | 'category' (single file with multiple ## sections)
    """
    found = []
    for item in sorted(os.listdir(DOCS)):
        path = os.path.join(DOCS, item)
        if item == "index.md":
            continue
        if os.path.isdir(path):
            cat = item
            for f in sorted(os.listdir(path)):
                if not f.endswith(".md") or f == "index.md":
                    continue
                slug = f[:-3]
                found.append((slug, cat, "individual"))
        elif item.endswith(".md") and item != "productos.md":
            cat = item[:-3]
            # leer y extraer headings ## que sean productos
            with open(path, "r", encoding="utf-8") as fp:
                content = fp.read()
            # Cada ## seccion (excepto "Productos en esta categoría")
            sections = re.split(r"^##\s+", content, flags=re.M)
            for sec in sections[1:]:
                title_line = sec.split("\n", 1)[0].strip()
                if title_line == "Productos en esta categoría":
                    continue
                slug = slugify(title_line)
                found.append((slug, cat, "category"))
    return found


def parse_category_section(cat_path: str, product_name: str) -> dict | None:
    """Extrae la sección de un producto en un archivo único de categoría."""
    with open(cat_path, "r", encoding="utf-8") as f:
        content = f.read()
    sections = re.split(r"^##\s+", content, flags=re.M)
    for sec in sections[1:]:
        title = sec.split("\n", 1)[0].strip()
        if title == product_name or title.lower() == product_name.lower():
            return parse_md(sec)
    return None


def find_md(slug: str, cat: str) -> tuple[str | None, str]:
    """Busca el .md del producto en una categoría."""
    p1 = os.path.join(DOCS, cat, f"{slug}.md")
    if os.path.isfile(p1):
        return p1, "individual"
    p2 = os.path.join(DOCS, f"{cat}.md")
    if os.path.isfile(p2):
        return p2, "category"
    return None, ""


def build() -> dict:
    all_products = discover_all()
    items = []
    cat_counts = {c: 0 for c in CATEGORIES}

    for slug, cat, src in all_products:
        md_path, found_src = find_md(slug, cat)
        if not md_path:
            print(f"  SKIP {slug}: no .md found")
            continue

        if found_src == "individual":
            with open(md_path, "r", encoding="utf-8") as f:
                content = f.read()
            data = parse_md(content)
        else:
            # categoría con varios productos: necesita el nombre real
            # Lo derivamos del nombre del archivo de categoría
            product_name = slug.replace("-", " ").title()
            data = parse_category_section(md_path, product_name) or {}

        # Nombre visible
        nombre_visible = (
            data.get("nombreVisible")
            or data.get("nombreComercial")
            or slug.replace("-", " ").title()
        )

        # Imágenes
        imgs = list_images(slug)
        has_images = len(imgs) > 0

        item = {
            "slug":            slug,
            "categoria":       cat,
            "categoriaLabel":  CATEGORIES.get(cat, cat),
            "nombreComercial": data.get("nombreComercial"),
            "nombreVisible":   nombre_visible,
            "objetivo":        data.get("objetivoPrincipal"),
            "problema":        data.get("problema"),
            "ingredientes":    split_ingredientes(data.get("ingredientes") or ""),
            "beneficios":      split_beneficios(data.get("beneficios") or ""),
            "presentacion":    data.get("presentacion"),
            "publicoObjetivo": data.get("publicoObjetivo"),
            "keywords":        data.get("keywords"),
            "imagePrincipal":  (f"products/{slug}/{imgs[0]}" if has_images else f"products/_placeholders/{slug}.svg"),
            "images":          [f"products/{slug}/{i}" for i in imgs] if has_images else [f"products/_placeholders/{slug}.svg"],
            "hasImages":       has_images,
        }
        items.append(item)
        cat_counts[cat] = cat_counts.get(cat, 0) + 1

    # Construir lista de categorías con conteo
    cats = [
        {"slug": c, "label": CATEGORIES[c], "count": cat_counts.get(c, 0)}
        for c in CATEGORIES
    ]
    cats.sort(key=lambda x: (-x["count"], x["slug"]))

    return {
        "productos":   items,
        "categorias":  cats,
        "total":       len(items),
        "fuente":      "docs/productos/**/*.md",
        "actualizado": __import__("datetime").datetime.now().isoformat(timespec="seconds"),
    }


if __name__ == "__main__":
    data = build()
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    print(f"\nWrote {data['total']} products to {OUT}")
    print(f"Categorías: {len(data['categorias'])}")
    for c in data["categorias"]:
        if c["count"] > 0:
            print(f"  {c['slug']:35s} {c['count']:3d} — {c['label']}")
