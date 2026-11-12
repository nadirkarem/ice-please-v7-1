import Lenis from 'lenis';
import './style.css';
import { initShop } from './shop.js';
import { createIce } from './ice.js';

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const root = document.querySelector('.ip');
/* On the static site the page scrolls in the window; in Odoo it scrolls inside #wrapwrap. One handle for both. */
const scrollEl = (() => { const w = document.getElementById('wrapwrap'); return w && /(auto|scroll)/.test(getComputedStyle(w).overflowY) ? w : null; })();
const scroller = scrollEl || window;
const scrollTop = () => (scrollEl ? scrollEl.scrollTop : window.scrollY);
const onScrollOf = (fn) => scroller.addEventListener('scroll', fn, { passive: true });
const offScrollOf = (fn) => scroller.removeEventListener('scroll', fn);
/* things a page sets up on window or document are listed here and undone before the next page arrives */
let cleanups = [];
const track = (fn) => cleanups.push(fn);

/* iOS Safari only applies :active (the press state of every control) on a page that listens to touches */
document.addEventListener('touchstart', () => {}, { passive: true });

initSmoothScroll();
initHeader();
initOdooChrome();
initMenu();
initPage();
initRouter();

/* One call per page: runs on load, and again after every navigation made by the router. */
function initPage() {
  initReveal();
  initIce();
  initTone();
  initGallery();
  initBuybar();
  initFloatingButton();
  initTabs();
  initForms();
  initShop({ track });
}

/* Header: invisible by default (CSS adds the glass under the pointer), white on the home photo at the top,
   steps aside while reading down and comes back on the way up. */
function initHeader() {
  const header = document.querySelector('[data-ip-header]');
  if (!header) return;
  let last = scrollTop();
  const onScroll = () => {
    const y = scrollTop();
    header.classList.toggle('is-top', y <= 8);
    if (Math.abs(y - last) > 6) { header.classList.toggle('is-away', y > 140 && y > last); last = y; }
  };
  onScroll();
  onScrollOf(onScroll);
}

/* Odoo's own pages (shop, cart, account…) get this header and footer from the layout patch, which cannot know which page it is on:
   the current link and the language links are set here. The pack's pages live under a prefix (data-ip-prefix, e.g. /v6) that the
   link comparison ignores; Odoo's own pages (/shop, /my…) and their language versions (/en/shop) have none. */
function initOdooChrome() {
  if (!root || !root.classList.contains('ip-odoo')) return;
  const header = document.querySelector('[data-ip-header]');
  if (!header) return;
  const prefix = header.dataset.ipPrefix || '';
  const bare = (path) => (path.replace(/\/+$/, '') || '/');
  const strip = (path) => bare(bare(path).replace(prefix, '').replace(/^\/(en|ar)(?=\/|$)/, '') || '/');
  const here = strip(location.pathname);
  document.querySelectorAll('.ip-nav a, .ip-sheet__nav a').forEach((a) => {
    const target = strip(new URL(a.href, location.href).pathname);
    const on = target === here || (target !== '/' && here.startsWith(`${target}/`));
    if (on) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  document.querySelectorAll('.ip-lang a[lang]').forEach((a) => {
    const lang = a.getAttribute('lang');
    a.href = `${lang === 'fr' ? '' : `/${lang}`}${here === '/' ? '' : here}${location.search}` || '/';
  });
}

/* Mobile menu: a sheet under the bar. While it is open the page behind is inert and cannot scroll. */
function initMenu() {
  const header = document.querySelector('[data-ip-header]');
  const burger = header?.querySelector('.ip-burger');
  const sheet = header?.querySelector('[data-ip-sheet]');
  if (!burger || !sheet) return;
  const behind = () => document.querySelectorAll('main, .ip-footer, .ip-wa, .ip-buybar');
  const desktop = window.matchMedia('(min-width: 1040px)');

  const setOpen = (open) => {
    header.classList.toggle('is-open', open);
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? burger.dataset.labelClose : burger.dataset.labelOpen);
    sheet.toggleAttribute('inert', !open);
    behind().forEach((el) => el.toggleAttribute('inert', open));
    (scrollEl || document.documentElement).style.overflow = open ? 'hidden' : '';
    window.__ipLenis?.[open ? 'stop' : 'start']();
  };
  window.__ipCloseMenu = () => setOpen(false);

  burger.addEventListener('click', () => setOpen(!header.classList.contains('is-open')));
  sheet.addEventListener('click', (event) => {
    if (event.target.closest('a')) setOpen(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && header.classList.contains('is-open')) {
      setOpen(false);
      burger.focus();
    }
  });
  desktop.addEventListener('change', () => setOpen(false));
}

/* Scroll reveal for elements marked [data-reveal]. Anything already on screen is shown at once. */
function initReveal() {
  const items = document.querySelectorAll('[data-reveal], [data-plate]');
  if (!items.length) return;
  if (!('IntersectionObserver' in window)) {
    items.forEach((el) => el.classList.add('is-in'));
    return;
  }
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        observer.unobserve(entry.target);
      });
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
  );
  items.forEach((el) => observer.observe(el));
  track(() => observer.disconnect());
}

/* Smooth wheel scrolling (Lenis) on desktop pointers only: touch keeps the browser's own momentum, and
   reduced motion keeps plain scrolling. Off unless the .ip root asks for it (data-ip-router or data-ip-smooth). */
function initSmoothScroll() {
  if (!root || !(root.hasAttribute('data-ip-router') || root.hasAttribute('data-ip-smooth')) || reduced()) return;
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  const options = { autoRaf: true, lerp: 0.085, wheelMultiplier: 0.95, anchors: { offset: -96 } };
  if (scrollEl) { options.wrapper = scrollEl; options.content = scrollEl; options.eventsTarget = scrollEl; }
  window.__ipLenis = new Lenis(options);
}

/* Clear ice drawn live (src/ice.js): in the hero of the home page, and under violet light on the know-how page.
   The block stands where the template put its slot; in a right-to-left page the light comes from the other side. */
function initIce() {
  document.querySelectorAll('[data-ip-ice]').forEach((host) => {
    const slot = host.querySelector('[data-ice-slot]');
    if (!slot) return;
    const ice = createIce(host, { slot, shape: host.dataset.ipIce || 'cube', mirror: getComputedStyle(host).direction === 'rtl' });
    if (ice) track(() => ice.destroy());
  });
}

/* The bar is ink on the paper and white on a night set: whichever set is under it decides. */
/* On a phone the same reading also colours the browser around the page:
   - theme-color (the status bar and Android's address bar) takes the set under the top edge, so the bar turns black
     over a night scene instead of staying sky blue;
   - the root background (what the rubber band shows past either end of the page) is the first set's colour while the
     visitor is in the upper half of the page and night in the lower half, where the footer is. */
function initTone() {
  const SET_COLOR = { sun: '#96ceec', night: '#020a11' };
  const header = document.querySelector('[data-ip-header]');
  const sets = [...document.querySelectorAll('main [data-set], .ip-footer')];
  if (!header || !sets.length) return;
  const theme = document.querySelector('meta[name="theme-color"]');
  const first = sets[0].dataset.set || 'sun';
  let frame = 0;
  const update = () => {
    frame = 0;
    const line = 44; // the band under the status bar, whether the header is shown or has stepped aside
    let tone = 'sun';
    for (const el of sets) {
      const r = el.getBoundingClientRect();
      if (r.top <= line && r.bottom > line) tone = el.matches('.ip-footer') ? 'night' : el.dataset.set;
    }
    if (header.dataset.tone !== tone) header.dataset.tone = tone;
    if (theme && theme.content !== SET_COLOR[tone]) theme.content = SET_COLOR[tone];
    const lower = scrollTop() + innerHeight / 2 > document.documentElement.scrollHeight / 2;
    const root = lower ? SET_COLOR.night : SET_COLOR[first];
    if (document.documentElement.style.backgroundColor !== root) document.documentElement.style.backgroundColor = root;
  };
  const onScroll = () => { frame = frame || requestAnimationFrame(update); };
  update();
  onScrollOf(onScroll);
  window.addEventListener('resize', onScroll);
  track(() => { offScrollOf(onScroll); window.removeEventListener('resize', onScroll); cancelAnimationFrame(frame); });
}

/* Product photographs: a strip that slides under the finger; the small pictures jump to a photograph and show which one is on. */
function initGallery() {
  document.querySelectorAll('[data-ip-gallery]').forEach((gallery) => {
    const track2 = gallery.querySelector('.ip-gallery__track');
    const slides = [...gallery.querySelectorAll('.ip-gallery__slide')];
    const thumbs = [...gallery.querySelectorAll('[data-ip-photo]')];
    if (!track2 || slides.length < 2) return;
    const go = (i) => track2.scrollTo({ left: slides[i].offsetLeft - slides[0].offsetLeft, behavior: reduced() ? 'auto' : 'smooth' });
    thumbs.forEach((b, i) => b.addEventListener('click', () => go(i)));
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        const i = slides.indexOf(e.target);
        thumbs.forEach((b, k) => (k === i ? b.setAttribute('aria-current', 'true') : b.removeAttribute('aria-current')));
      });
    }, { root: track2, threshold: 0.6 });
    slides.forEach((sl) => io.observe(sl));
    track2.addEventListener('keydown', (e) => {
      const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
      if (!step) return;
      const dir = getComputedStyle(track2).direction === 'rtl' ? -1 : 1;
      const at = Math.max(0, thumbs.findIndex((b) => b.hasAttribute('aria-current')));
      go(Math.min(slides.length - 1, Math.max(0, at + step * dir)));
      e.preventDefault();
    });
    track(() => io.disconnect());
  });
}

/* Phone: once the buy box has left the screen, the product name and its button come back as a bar at the bottom. */
function initBuybar() {
  const bar = document.querySelector('.ip-buybar');
  const box = document.querySelector('.ip-buy');
  if (!bar || !box || !('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver(([e]) => bar.classList.toggle('is-in', !e.isIntersecting && e.boundingClientRect.top < 0));
  io.observe(box);
  track(() => io.disconnect());
}

/* Floating WhatsApp button: steps aside wherever the page already offers an order or contact action */
function initFloatingButton() {
  const button = document.querySelector('.ip-wa');
  if (!button || !('IntersectionObserver' in window)) return;
  const visible = new Set();
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => (entry.isIntersecting ? visible.add(entry.target) : visible.delete(entry.target)));
    button.classList.toggle('is-away', visible.size > 0);
  });
  document.querySelectorAll('.ip-hero, .ip-contact, .ip-cta, .ip-footer, .ip-buy, .ip-deliver, .ip-summary').forEach((zone) => observer.observe(zone));
  track(() => observer.disconnect());
}

/* ---- page transitions (static site only) ----------------------------------------------------------
   A click on an internal link covers the page with frost that grows from the pointer while the next page
   is fetched, the content is swapped without a reload, and a hole opens in the frost from the same point.
   The Odoo fragments carry no data-ip-router attribute, so Odoo keeps its own navigation. */
function initRouter() {
  if (!root || !root.hasAttribute('data-ip-router') || !window.fetch || !window.DOMParser) return;
  const curtain = document.createElement('div');
  curtain.className = 'ip-curtain';
  curtain.setAttribute('aria-hidden', 'true');
  curtain.hidden = true;
  curtain.innerHTML = '<div class="ip-curtain__panel"></div>';
  document.body.append(curtain);
  const panel = curtain.firstElementChild;
  let point = { x: innerWidth / 2, y: innerHeight / 2 };
  let token = 0;
  addEventListener('pointerdown', (e) => { point = { x: e.clientX, y: e.clientY }; }, { capture: true, passive: true });

  const sweep = (mode, ms) => {
    curtain.hidden = false;
    curtain.dataset.mode = mode;
    curtain.style.setProperty('--ip-x', `${point.x}px`);
    curtain.style.setProperty('--ip-y', `${point.y}px`);
    return panel.animate({ '--ip-r': ['0vmax', '170vmax'] }, { duration: ms, easing: 'cubic-bezier(0.7, 0, 0.2, 1)', fill: 'forwards' }).finished;
  };
  const clearCurtain = () => { panel.getAnimations().forEach((a) => a.cancel()); curtain.hidden = true; };

  async function go(url, { push, animate }) {
    const mine = ++token;
    const fetching = fetch(url.href, { credentials: 'same-origin' }).then((r) => {
      if (!r.ok || !(r.headers.get('content-type') || '').includes('html')) throw new Error('not a page');
      return r.text();
    });
    const covering = animate ? sweep('disc', 800) : Promise.resolve();
    let html;
    try { [html] = await Promise.all([fetching, covering]); } catch { location.href = url.href; return; }
    if (mine !== token) return;
    swap(new DOMParser().parseFromString(html, 'text/html'), url, push);
    if (animate) { await sweep('hole', 950); if (mine === token) clearCurtain(); }
  }

  function swap(doc, url, push) {
    cleanups.forEach((fn) => fn());
    cleanups = [];
    window.__ipCloseMenu?.();
    const next = doc.querySelector('.ip');
    document.title = doc.title;
    document.documentElement.lang = doc.documentElement.lang;
    document.documentElement.dir = doc.documentElement.dir;
    for (const sel of ['meta[name="description"]', 'link[rel="canonical"]', 'meta[name="theme-color"]']) {
      const a = document.head.querySelector(sel), b = doc.head.querySelector(sel);
      if (a && b) a.replaceWith(b.cloneNode(true)); else if (b) document.head.append(b.cloneNode(true)); else a?.remove();
    }
    document.body.dataset.page = doc.body.dataset.page;
    document.body.dataset.kind = doc.body.dataset.kind;
    root.lang = next.lang; root.dir = next.dir;
    // the header stays; its tone, current link and language links follow the new page
    const header = root.querySelector('[data-ip-header]'), nextHeader = next.querySelector('[data-ip-header]');
    header.dataset.tone = nextHeader.dataset.tone;
    for (const sel of ['.ip-nav', '.ip-sheet__nav', '.ip-header__tools .ip-lang', '.ip-sheet__foot .ip-lang']) {
      const a = header.querySelector(sel), b = nextHeader.querySelector(sel);
      if (a && b) a.replaceWith(document.adoptNode(b));
    }
    root.querySelector('main').replaceWith(document.adoptNode(next.querySelector('main')));
    root.querySelector('footer').replaceWith(document.adoptNode(next.querySelector('footer')));
    const wa = root.querySelector('.ip-wa'), nextWa = next.querySelector('.ip-wa');
    if (wa && nextWa) wa.replaceWith(document.adoptNode(nextWa)); else if (nextWa) root.append(document.adoptNode(nextWa)); else wa?.remove();
    if (push) history.pushState({}, '', url.href);
    const smooth = document.documentElement.style.scrollBehavior;
    document.documentElement.style.scrollBehavior = 'auto';
    window.scrollTo(0, 0);
    window.__ipLenis?.scrollTo(0, { immediate: true, force: true });
    document.documentElement.style.scrollBehavior = smooth;
    header.classList.add('is-top'); header.classList.remove('is-away');
    initPage();
    const main = root.querySelector('main');
    main.tabIndex = -1;
    main.focus({ preventScroll: true });
    if (url.hash) document.getElementById(decodeURIComponent(url.hash.slice(1)))?.scrollIntoView();
  }

  document.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const a = event.target.closest('a[href]');
    if (!a || a.target || a.hasAttribute('download') || a.closest('[data-ip-no-router]')) return;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin || /\.[a-z0-9]{2,5}$/i.test(url.pathname)) return;
    if (url.pathname === location.pathname && url.search === location.search) return; // same page: the browser handles the hash
    event.preventDefault();
    go(url, { push: true, animate: !reduced() && !a.hasAttribute('data-ip-instant') });
  });
  window.addEventListener('popstate', () => go(new URL(location.href), { push: false, animate: false }));
}

/* Tabs (contact page): a question or a quote request. #devis opens the quote tab. */
function initTabs() {
  document.querySelectorAll('[data-ip-tabs]').forEach((root) => {
    const tabs = [...root.querySelectorAll('[role="tab"]')];
    const panels = tabs.map((tab) => document.getElementById(tab.getAttribute('aria-controls')));
    const rtl = getComputedStyle(root).direction === 'rtl';

    const select = (index, { focus = false, remember = true } = {}) => {
      tabs.forEach((tab, i) => {
        const on = i === index;
        tab.setAttribute('aria-selected', String(on));
        tab.tabIndex = on ? 0 : -1;
        panels[i].hidden = !on;
      });
      if (focus) tabs[index].focus();
      if (remember) {
        const hash = tabs[index].dataset.hash;
        history.replaceState(null, '', hash ? `#${hash}` : `${location.pathname}${location.search}`);
      }
    };
    const fromHash = () => {
      const index = tabs.findIndex((tab) => tab.dataset.hash && `#${tab.dataset.hash}` === location.hash);
      select(index === -1 ? 0 : index, { remember: false });
    };

    tabs.forEach((tab, i) => {
      tab.addEventListener('click', () => select(i));
      tab.addEventListener('keydown', (event) => {
        const step = { ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1 }[event.key];
        if (step) select((i + step + tabs.length) % tabs.length, { focus: true });
        else if (event.key === 'Home') select(0, { focus: true });
        else if (event.key === 'End') select(tabs.length - 1, { focus: true });
        else return;
        event.preventDefault();
      });
    });
    window.addEventListener('hashchange', fromHash);
    track(() => window.removeEventListener('hashchange', fromHash));
    fromHash();
  });
}

/* Forms: validate in place, then hand the message to WhatsApp (no server in the static draft). */
function initForms() {
  document.querySelectorAll('[data-ip-form]').forEach((form) => {
    const status = form.querySelector('.ip-form__status');
    const fields = [...form.querySelectorAll('input, textarea')];

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      let firstInvalid = null;
      fields.forEach((field) => {
        const message = validate(field, form.dataset);
        showError(field, message);
        if (message && !firstInvalid) firstInvalid = field;
      });
      if (firstInvalid) {
        status.textContent = '';
        firstInvalid.focus();
        return;
      }
      const link = document.createElement('a');
      link.href = `${form.dataset.wa}?text=${encodeURIComponent(compose(form, fields))}`;
      link.target = '_blank';
      link.rel = 'noopener';
      link.click();
      showStatus(status, form.dataset, link.href);
    });

    // clear an error as soon as the field is fixed
    form.addEventListener('input', (event) => {
      const field = event.target;
      if (field.getAttribute('aria-invalid') === 'true') showError(field, validate(field, form.dataset));
    });
  });
}

function validate(field, messages) {
  const value = field.value.trim();
  if (field.required && !value) return messages.required;
  if (value && field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return messages.invalidEmail;
  if (value && field.type === 'tel' && !/^[+()\d][\d\s().-]{5,}$/.test(value)) return messages.invalidPhone;
  return '';
}

function showError(field, message) {
  const error = document.getElementById(`${field.id}-err`);
  if (error) {
    error.hidden = !message;
    error.textContent = message;
  }
  field.setAttribute('aria-invalid', message ? 'true' : 'false');
}

function compose(form, fields) {
  const lines = [form.dataset.greeting];
  fields.forEach((field) => {
    const value = field.value.trim();
    if (value) lines.push(`${field.dataset.label}: ${value}`);
  });
  return lines.join('\n');
}

function showStatus(status, messages, href) {
  status.textContent = `${messages.status} ${messages.blocked} `;
  const fallback = document.createElement('a');
  fallback.href = href;
  fallback.target = '_blank';
  fallback.rel = 'noopener';
  fallback.textContent = 'WhatsApp';
  status.append(fallback);
}
