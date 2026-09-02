/* ============================================================
   VIVE VIDA DIVINA — Sitio principal
   Catálogo en runtime + componentes compartidos
   ============================================================ */

const VVD = (function () {
  const PHONE = '522229071277';
  const CATALOG_URL = 'catalog.json';
  const I18N_URL = 'i18n.json';
  let _catalog = null;
  let _i18n = null;
  let _lang = 'es';

  // ============================================================
  // CATÁLOGO: carga y cache
  // ============================================================
  async function getCatalog() {
    if (_catalog) return _catalog;
    const r = await fetch(CATALOG_URL, { cache: 'no-store' });
    if (!r.ok) throw new Error('No se pudo cargar catalog.json');
    _catalog = await r.json();
    return _catalog;
  }

  // ============================================================
  // UTILIDADES
  // ============================================================
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function waLink(message) {
    return `https://wa.me/${PHONE}?text=${encodeURIComponent(message)}`;
  }

  function productHref(slug) {
    // Productos con landing dedicada
    if (slug === 'tongkat-ali-cafe') return '/tongkat-ali';
    return `/producto?slug=${encodeURIComponent(slug)}`;
  }

  // ============================================================
  // COMPONENTES
  // ============================================================

  // NAVBAR — se inyecta en <header data-vvd="navbar">
  function renderNavbar(opts = {}) {
    const slot = $('[data-vvd="navbar"]');
    if (!slot) return;
    const active = opts.active || '';
    slot.outerHTML = `
      <header class="navbar" id="vvd-navbar">
        <div class="container navbar__inner">
          <a href="index.html" class="navbar__logo" aria-label="Vive Vida Divina">
            <img src="logo.jpg" alt="Vive Vida Divina">
            <span>Vive Vida Divina<small>Bienestar natural</small></span>
          </a>
          <nav aria-label="Navegación principal">
            <ul class="navbar__menu" id="vvd-menu">
              <li><a href="/"${active==='home'?' style="color:var(--borgoña)"':''} data-i18n="nav.inicio">Inicio</a></li>
              <li><a href="/productos"${active==='productos'?' style="color:var(--borgoña)"':''} data-i18n="nav.tienda">Tienda</a></li>
              <li><a href="/categorias"${active==='categorias'?' style="color:var(--borgoña)"':''} data-i18n="nav.categorias">Categorías</a></li>
              <li><a href="/sobre-vida-divina"${active==='sobre'?' style="color:var(--borgoña)"':''} data-i18n="nav.sobre">Sobre Vida Divina</a></li>
              <li><a href="/contacto"${active==='contacto'?' style="color:var(--borgoña)"':''} data-i18n="nav.contacto">Contacto</a></li>
              <li>
                <div class="lang-switch" role="group" aria-label="Language selector">
                  <button type="button" data-lang="es" class="active" aria-label="Español">ES</button>
                  <button type="button" data-lang="en" aria-label="English">EN</button>
                </div>
              </li>
              <li><a href="/productos" class="btn btn--primary navbar__cta" data-i18n="nav.cta">Ver productos</a></li>
            </ul>
          </nav>
          <button class="navbar__toggle" id="vvd-toggle" aria-label="Abrir menú" aria-expanded="false">
            <i class="fas fa-bars"></i>
          </button>
        </div>
      </header>
    `;
    // Toggle mobile
    const tog = $('#vvd-toggle');
    const menu = $('#vvd-menu');
    if (tog && menu) {
      tog.addEventListener('click', () => {
        const open = menu.classList.toggle('is-open');
        tog.setAttribute('aria-expanded', String(open));
        tog.innerHTML = `<i class="fas fa-${open?'times':'bars'}"></i>`;
      });
    }

    // Toggle idioma (switch de dos botones ES | EN)
    const langSwitch = $('.lang-switch');
    if (langSwitch) {
      langSwitch.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-lang]');
        if (!btn) return;
        applyLang(btn.dataset.lang);
      });
    }
  }

  // FOOTER — se inyecta en <footer data-vvd="footer">
  function renderFooter() {
    const slot = $('[data-vvd="footer"]');
    if (!slot) return;
    slot.outerHTML = `
      <footer class="footer" id="vvd-footer">
        <div class="container">
          <div class="footer__grid">
            <div class="footer__brand">
              <img src="logo.jpg" alt="Vive Vida Divina">
              <p data-i18n="footer.brand.tagline">Bienestar integral, energía y vitalidad a través de productos de origen natural.</p>
            </div>
            <div>
              <h4 data-i18n="footer.h.productos">Productos</h4>
              <ul class="footer__links">
                <li><a href="/productos" data-i18n="footer.productos.catalogo">Catálogo completo</a></li>
                <li><a href="/categoria?slug=01-control-de-peso" data-i18n="footer.productos.peso">Control de peso</a></li>
                <li><a href="/categoria?slug=02-cafe-divina" data-i18n="footer.productos.cafe">Café Divina</a></li>
                <li><a href="/categoria?slug=03-longevidad-bienestar" data-i18n="footer.productos.longevidad">Longevidad</a></li>
                <li><a href="/categoria?slug=08-intimidad-libido" data-i18n="footer.productos.intimidad">Intimidad y libido</a></li>
              </ul>
            </div>
            <div>
              <h4 data-i18n="footer.h.marca">Marca</h4>
              <ul class="footer__links">
                <li><a href="/sobre-vida-divina" data-i18n="footer.marca.sobre">Sobre Vida Divina</a></li>
                <li><a href="/contacto" data-i18n="footer.marca.contacto">Contacto</a></li>
                <li><a href="https://wa.me/${PHONE}" target="_blank" rel="noopener" data-i18n="footer.marca.whatsapp">WhatsApp</a></li>
              </ul>
            </div>
            <div>
              <h4 data-i18n="footer.h.info">Información</h4>
              <ul class="footer__links">
                <li><a href="/contacto" data-i18n="footer.info.atencion">Atención al cliente</a></li>
                <li><a href="/contacto#emprendimiento" data-i18n="footer.info.emprendimiento">Oportunidad de negocio</a></li>
                <li><a href="/contacto#legal" data-i18n="footer.info.legal">Aviso legal</a></li>
              </ul>
            </div>
          </div>
          <div class="footer__bottom">
            <span data-i18n="footer.bottom.copy">© ${new Date().getFullYear()} Vive Vida Divina. Todos los derechos reservados.</span>
            <span data-i18n="footer.disclaimer">Este sitio no forma parte de Facebook, Instagram ni de sus empresas afiliadas.</span>
          </div>
        </div>
      </footer>
    `;
  }

  // Devuelve el label de una categoría traducido según idioma actual
  function categoryLabel(slug, fallback) {
    return t('cat.' + slug, fallback || slug);
  }

  // PRODUCT CARD — HTML string para un producto
  function productCardHTML(p) {
    const isPlaceholder = !p.hasImages;
    const badgeHTML = isPlaceholder
      ? `<span class="product-card__badge">${t('badge.próximamente', 'Imagen próximamente')}</span>`
      : '';
    return `
      <a class="product-card${isPlaceholder ? ' product-card--placeholder' : ''}" href="${productHref(p.slug)}" aria-label="${p.nombreVisible}">
        <div class="product-card__image">
          <img src="${p.imagePrincipal}" alt="${p.nombreVisible}" loading="lazy">
          ${badgeHTML}
        </div>
        <div class="product-card__body">
          <span class="product-card__category">${categoryLabel(p.categoria, p.categoriaLabel)}</span>
          <h3 class="product-card__title">${p.nombreVisible}</h3>
          <p class="product-card__desc">${p.objetivo || ''}</p>
          <div class="product-card__footer">
            <span class="product-card__cta">${isPlaceholder ? t('btn.ver.placeholder','Ver detalles') : t('btn.ver.mas','Conocer producto')}</span>
          </div>
        </div>
      </a>
    `;
  }

  // PRODUCT GRID — pinta en el contenedor dado
  function renderProductGrid(containerSel, products) {
    const el = $(containerSel);
    if (!el) return;
    el.innerHTML = products.map(productCardHTML).join('');
  }

  // ============================================================
  // INTERSECTION OBSERVER (fade-in)
  // ============================================================
  function initFadeIn() {
    const els = $$('.fade-in');
    if (!els.length || !('IntersectionObserver' in window)) {
      els.forEach(e => e.classList.add('is-visible'));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('is-visible');
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.12 });
    els.forEach(e => io.observe(e));
  }

  // ============================================================
  // I18N — sistema bilingüe ES / EN
  // ============================================================
  async function getI18n() {
    if (_i18n) return _i18n;
    const r = await fetch(I18N_URL, { cache: 'no-store' });
    if (!r.ok) throw new Error('No se pudo cargar i18n.json');
    _i18n = await r.json();
    return _i18n;
  }

  function t(key, fallback) {
    if (!_i18n) return fallback || key;
    const dict = _i18n[_lang] || {};
    let v = dict[key];
    if (v === undefined) v = (_i18n.es || {})[key];
    if (v === undefined) return fallback || key;
    return v;
  }

  function applyLang(lang) {
    if (!_i18n) return;
    if (lang !== 'es' && lang !== 'en') lang = 'es';
    _lang = lang;
    try { localStorage.setItem('vvd.lang', lang); } catch (_) {}
    document.documentElement.lang = lang;

    // 1) Reemplazar <title>
    const titleEl = document.querySelector('title[data-i18n]') || document.querySelector('title');
    const titleKey = document.querySelector('meta[name="i18n-title"]')?.content
      || (titleEl && titleEl.dataset.i18n);
    if (titleKey && titleEl) titleEl.textContent = t(titleKey);

    // 2) Reemplazar meta description
    const descEl = document.querySelector('meta[name="description"]');
    if (descEl && descEl.dataset.i18n) {
      descEl.setAttribute('content', t(descEl.dataset.i18n));
    }

    // 3) Reemplazar todos los data-i18n
    function applyTo(el) {
      const key = el.dataset.i18n;
      if (!key) return;
      let v = t(key);
      if (v === undefined) return;
      // Interpolar {year}, {n} y placeholders similares
      v = v.replace(/\{year\}/g, new Date().getFullYear());
      el.innerHTML = v;
    }
    $$('[data-i18n]').forEach(applyTo);

    // Re-aplicar cuando el DOM cambie (porque navbar/footer se inyectan después)
    // Solución: observer de mutaciones que aplique i18n a nodos nuevos
    const i18nObserver = new MutationObserver((mutations) => {
      for (const m of mutations) {
        m.addedNodes.forEach(node => {
          if (node.nodeType !== 1) return;
          if (node.dataset && node.dataset.i18n) applyTo(node);
          node.querySelectorAll && node.querySelectorAll('[data-i18n]').forEach(applyTo);
          node.querySelectorAll && node.querySelectorAll('[data-i18n-attr]').forEach(el => {
            const spec = el.dataset.i18nAttr;
            spec.split('|').forEach(part => {
              const [attr, key] = part.split(':');
              if (attr && key) el.setAttribute(attr, t(key));
            });
          });
        });
      }
    });
    if (document.body) i18nObserver.observe(document.body, { childList: true, subtree: true });

    // 4) Reemplazar data-i18n-attr (formato: "attr:key|attr:key")
    $$('[data-i18n-attr]').forEach(el => {
      const spec = el.dataset.i18nAttr;
      spec.split('|').forEach(part => {
        const [attr, key] = part.split(':');
        if (attr && key) el.setAttribute(attr, t(key));
      });
    });

    // 5) Estado activo del switch de idioma
    $$('.lang-switch button[data-lang]').forEach(b => {
      b.classList.toggle('active', b.dataset.lang === lang);
    });
    document.documentElement.setAttribute('data-lang', lang);

    // 6) Hook personalizado para páginas que quieran reaccionar
    document.dispatchEvent(new CustomEvent('vvd:lang', { detail: { lang } }));
  }

  async function initLang() {
    await getI18n();
    let saved = null;
    try { saved = localStorage.getItem('vvd.lang'); } catch (_) {}
    if (!saved) {
      const nav = (navigator.language || 'es').toLowerCase();
      saved = nav.startsWith('en') ? 'en' : 'es';
    }
    applyLang(saved);
  }

  function toggleLang() {
    applyLang(_lang === 'es' ? 'en' : 'es');
  }

  function getLang() {
    return _lang;
  }

  // ============================================================
  // INIT GLOBAL
  // ============================================================
  async function init(opts) {
    renderNavbar(opts || {});
    renderFooter();
    await initLang();
    initFadeIn();
  }

  return {
    init,
    getCatalog,
    getI18n,
    getLang,
    t,
    applyLang,
    toggleLang,
    productCardHTML,
    renderProductGrid,
    productHref,
    categoryLabel,
    waLink,
    $,
    $$,
  };
})();

document.addEventListener('DOMContentLoaded', () => {
  // Detección simple de la página actual para marcar el link activo
  const path = location.pathname.split('/').pop() || 'index.html';
  const activeMap = {
    'index.html': 'home',
    '': 'home',
    'productos.html': 'productos',
    'categorias.html': 'categorias',
    'sobre-vida-divina.html': 'sobre',
    'contacto.html': 'contacto',
  };
  const active = activeMap[path] || '';
  VVD.init({ active });
});
