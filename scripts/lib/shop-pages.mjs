// Shop templates: listing, buy box, cart, checkout, payment, simulated provider page, confirmation, account.
// Same rules as pages.mjs: every class starts with `ip-`. The markup is static; src/shop.js fills in what depends on
// the visitor (cart lines, totals, order, account). Everything the script needs travels in one JSON block
// (#ip-shop-data) written at the end of <main>, so the client-side router swaps it together with the page.
//
// Version 7: a product has one page, which presents it (photographs, the company's line, the text) and sells it (price,
// options, quantity, cart). The range is the shop itself; the former presentation addresses redirect here.
import { esc, md, plain, waLink, picture } from './html.mjs';
import { icon } from './icons.mjs';
import { PRODUCT_IDS, shopProductOf, urlFor } from './routes.mjs';
import { CARD_IMAGE, GALLERY, allProducts, money, productInfo } from './catalog.mjs';

const external = 'target="_blank" rel="noopener"';
const fill = (s, vars) => s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
const quoteUrl = (ctx) => `${urlFor('contact', ctx.lang)}#devis`;
const alt = (ctx, id) => ctx.c.alt[id] ?? '';

// ---------------------------------------------------------------- data for the script

/** The one JSON block the script reads. `ids` limits the catalogue (a product page only needs its own product). */
export function shopData(ctx, { ids } = {}) {
  const { c, lang, dir, site, shop } = ctx;
  const t = c.shop;
  const products = allProducts(ctx);
  const data = {
    lang,
    dir,
    currency: shop.currency,
    demo: shop.demo,
    vatRate: shop.vatRate,
    wa: `https://wa.me/${site.whatsapp}`,
    routes: Object.fromEntries(
      ['home', 'shop', 'cart', 'checkout', 'payment', 'simulate', 'confirmation', 'login', 'signup', 'account', 'cgv'].map((id) => [id, urlFor(id, lang)]),
    ),
    quote: quoteUrl(ctx),
    products: ids ? Object.fromEntries(ids.map((id) => [id, products[id]])) : products,
    delivery: shop.delivery.map((d) => ({ ...d, name: t.checkout.methods[d.id].name, desc: t.checkout.methods[d.id].desc })),
    payment: shop.payment.map((p) => ({ ...p, name: t.payment.methods[p.id].name, desc: t.payment.methods[p.id].desc })),
    t: { ...t, forms: { required: c.forms.required, invalidEmail: c.forms.invalidEmail, invalidPhone: c.forms.invalidPhone }, cartAria: c.ui.cartAria },
  };
  return `<script type="application/json" id="ip-shop-data">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;
}

// ---------------------------------------------------------------- pieces

const demoNote = (ctx) => (ctx.shop.demo ? `<p class="ip-demo" role="note">${icon('info')}<span>${esc(ctx.c.shop.demo)}</span></p>` : '');

/** Title band of the shop pages; `compact` for the pages of a visit (cart, checkout…). */
function head(ctx, { title, lead, compact = true }) {
  return `<header class="ip-pagehead${compact ? ' ip-pagehead--compact' : ''}" data-set="sun">
      <div class="ip-wrap">
        <h1 class="ip-pagehead__title">${esc(title)}</h1>
        ${lead ? `<p class="ip-lead">${esc(lead)}</p>` : ''}
      </div>
    </header>`;
}

/** Order steps: cart, delivery, payment, confirmation. */
function steps(ctx, current) {
  const t = ctx.c.shop.cart;
  const items = t.stepNames
    .map((name, i) => {
      const n = i + 1;
      const state = n < current ? ' is-done' : n === current ? ' is-current' : '';
      return `<li class="ip-steps__item${state}"${n === current ? ' aria-current="step"' : ''}><span class="ip-steps__n" aria-hidden="true">${n < current ? icon('check') : n}</span><span class="ip-steps__t">${esc(name)}</span></li>`;
    })
    .join('');
  return `<ol class="ip-steps" aria-label="${esc(t.steps)}">${items}</ol>`;
}

function field(ctx, kind, { key, label, type = 'text', required = false, autocomplete, inputmode, wide = false, textarea = false, hint, attrs = '' }) {
  const id = `f-${kind}-${key}`;
  const a = [
    `id="${id}"`,
    `name="${key}"`,
    `data-label="${esc(label)}"`,
    required ? 'required' : '',
    autocomplete ? `autocomplete="${autocomplete}"` : '',
    inputmode ? `inputmode="${inputmode}"` : '',
    `aria-describedby="${id}-err${hint ? ` ${id}-hint` : ''}"`,
    attrs,
  ].filter(Boolean).join(' ');
  const control = textarea ? `<textarea ${a} rows="3"></textarea>` : `<input ${a} type="${type}">`;
  return `<div class="ip-field${wide ? ' ip-field--wide' : ''}">
          <label for="${id}">${esc(label)}${required ? ' <span class="ip-req" aria-hidden="true">*</span>' : ''}</label>
          ${control}
          ${hint ? `<p class="ip-field__hint" id="${id}-hint">${esc(hint)}</p>` : ''}
          <p class="ip-field__error" id="${id}-err" hidden></p>
        </div>`;
}

/** Totals block shared by the cart, the checkout and the payment pages. */
function summary(ctx, { lines = false, actions = '' } = {}) {
  const t = ctx.c.shop.cart;
  return `<aside class="ip-summary" aria-labelledby="sum-h" data-ip-summary>
        <h2 class="ip-summary__title" id="sum-h">${esc(t.summary)}</h2>
        ${lines ? '<ul class="ip-summary__lines" data-ip-sum-lines></ul>' : ''}
        <dl class="ip-summary__totals">
          <div><dt>${esc(t.subtotal)}</dt><dd data-ip-subtotal>${money(ctx.lang, null)}</dd></div>
          <div><dt>${esc(t.delivery)}</dt><dd data-ip-delivery>${esc(t.deliveryLater)}</dd></div>
          <div class="is-total"><dt>${esc(t.total)}</dt><dd data-ip-total>${money(ctx.lang, null)}</dd></div>
        </dl>
        <p class="ip-summary__note">${esc(t.tax)}</p>
        ${actions}
      </aside>`;
}

// ---------------------------------------------------------------- buy box (product page)

function optionSelect(info, t) {
  if (!info.option) return '';
  const o = info.option;
  const placeholder = o.default ? '' : `<option value="">${esc(t.buy.choose)}</option>`;
  const options = o.values.map((v) => `<option value="${esc(v.id)}"${v.id === o.default ? ' selected' : ''}>${esc(v.label)}</option>`).join('');
  return `<div class="ip-field ip-buy__option">
          <label for="buy-option">${esc(o.label)}</label>
          <select id="buy-option" name="option" data-ip-option aria-describedby="buy-error"${o.default ? '' : ' required'}>${placeholder}${options}</select>
        </div>`;
}

export function qtyControl(t, { id = 'buy-qty', value = 1, min = 1, label } = {}) {
  return `<div class="ip-qty" role="group" aria-label="${esc(label ?? t.buy.qty)}">
            <button class="ip-qty__btn" type="button" data-ip-qty="-1" aria-label="${esc(t.buy.qtyMinus)}">${icon('minus')}</button>
            <input class="ip-qty__input" id="${id}" name="qty" type="text" inputmode="numeric" enterkeyhint="done" pattern="[0-9]*" autocomplete="off" value="${value}" data-min="${min}" aria-label="${esc(t.buy.qty)}">
            <button class="ip-qty__btn" type="button" data-ip-qty="1" aria-label="${esc(t.buy.qtyPlus)}">${icon('plus')}</button>
          </div>`;
}

/** Price shown while it is not confirmed: the placeholder, plus a hidden explanation for screen readers. */
export function priceTag(ctx, value, { hint = true } = {}) {
  const shown = money(ctx.lang, value, ctx.shop.currency);
  return `<span class="ip-price">${shown}${value == null && hint ? `<span class="ip-sr"> (${esc(ctx.c.shop.priceHint)})</span>` : ''}</span>`;
}

export function buyBox(ctx, id) {
  const { c } = ctx;
  const t = c.shop;
  const info = productInfo(ctx, id);
  const wa = waLink(ctx, c.wa.product.replace('{product}', info.h1));
  const waBtn = `<a class="ip-btn ip-btn--line" href="${wa}" ${external}>${icon('whatsapp')}<span>${esc(t.buy.orderWa)}</span></a>`;

  if (info.mode === 'quote') {
    return `<div class="ip-buy ip-buy--quote" id="buy">
        <p class="ip-buy__price"><span class="ip-buy__badge">${esc(t.buy.quoteOnly)}</span></p>
        <p>${esc(t.buy.quoteNote)}</p>
        <div class="ip-buy__row">
          <a class="ip-btn ip-btn--ink ip-btn--lg" href="${quoteUrl(ctx)}"><span>${esc(t.buy.requestQuote)}</span>${icon('arrow')}</a>
          ${waBtn}
        </div>
      </div>`;
  }

  const unit = info.unit ? `<span class="ip-buy__unit">/ ${esc(info.unit)}</span>` : '';
  return `<div class="ip-buy" id="buy" data-ip-buy data-product="${id}">
        <p class="ip-buy__price">${priceTag(ctx, info.price)}${unit}</p>
        ${optionSelect(info, t)}
        <div class="ip-buy__row">
          ${qtyControl(t, { value: info.min, min: info.min })}
          <button class="ip-btn ip-btn--ink ip-btn--lg ip-buy__add" type="button" data-ip-add>${icon('bag')}<span>${esc(t.buy.add)}</span></button>
        </div>
        ${info.min > 1 ? `<p class="ip-buy__note">${esc(fill(t.buy.minNote, { n: info.min, unit: info.unit }))}</p>` : ''}
        <p class="ip-field__error ip-buy__error" id="buy-error" role="alert" hidden></p>
        <p class="ip-buy__alt"><span>${esc(t.buy.alt)}</span> ${waBtn.replace('ip-btn ip-btn--line', 'ip-link')}<a class="ip-link" href="${quoteUrl(ctx)}"><span>${esc(t.buy.requestQuote)}</span></a></p>
      </div>`;
}

/** Sticky bar of the product page on phones. */
export function buyBar(ctx, id) {
  const t = ctx.c.shop;
  const info = productInfo(ctx, id);
  const name = md(ctx, ctx.c.products[id].h1);
  if (info.mode === 'quote') {
    return `<div class="ip-buybar"><span class="ip-buybar__name">${name}</span><a class="ip-btn ip-btn--ink" href="${quoteUrl(ctx)}"><span>${esc(t.buy.requestQuote)}</span></a></div>`;
  }
  const simple = !info.option && info.min === 1;
  const action = simple
    ? `<button class="ip-btn ip-btn--ink" type="button" data-ip-bar-add="${id}">${icon('bag')}<span>${esc(t.buy.bar)}</span></button>`
    : `<a class="ip-btn ip-btn--ink" href="#buy">${icon('bag')}<span>${esc(t.buy.bar)}</span></a>`;
  return `<div class="ip-buybar" data-ip-buybar><span class="ip-buybar__text"><span class="ip-buybar__name">${name}</span><span class="ip-buybar__price">${priceTag(ctx, info.price, { hint: false })}</span></span>${action}</div>`;
}

// ---------------------------------------------------------------- listing

function productCard(ctx, id) {
  const t = ctx.c.shop;
  const p = ctx.c.products[id];
  const info = productInfo(ctx, id);
  const img = CARD_IMAGE[id];
  const search = `${p.card} ${p.h1} ${p.paras[0]}`.toLowerCase();
  const price = info.mode === 'quote'
    ? `<span class="ip-buy__badge">${esc(t.buy.quoteOnly)}</span>`
    : `${priceTag(ctx, info.price)}${info.unit ? `<span class="ip-pcard__unit">/ ${esc(info.unit)}</span>` : ''}`;
  let action;
  if (info.mode === 'quote') {
    action = `<a class="ip-btn ip-btn--line ip-btn--sm" href="${quoteUrl(ctx)}"><span>${esc(t.buy.requestQuote)}</span></a>`;
  } else if (info.option || info.min > 1) {
    action = `<a class="ip-btn ip-btn--line ip-btn--sm" href="${info.href}"><span>${esc(t.buy.chooseOptions)}</span></a>`;
  } else {
    action = `<button class="ip-btn ip-btn--ink ip-btn--sm" type="button" data-ip-quick="${id}" aria-label="${esc(`${t.buy.add} : ${p.card}`)}">${icon('bag')}<span>${esc(t.buy.add)}</span></button>`;
  }
  return `<li class="ip-pcard" data-cat="${info.category}" data-search="${esc(search)}">
      <a class="ip-pcard__media" href="${info.href}" tabindex="-1" aria-hidden="true">${picture(ctx, img, { alt: '', sizes: '(min-width: 1000px) 30vw, (min-width: 640px) 46vw, 92vw' })}</a>
      <div class="ip-pcard__body">
        <h2 class="ip-pcard__name"><a href="${info.href}">${md(ctx, p.h1)}</a></h2>
        <p class="ip-pcard__price">${price}</p>
        <p class="ip-pcard__desc">${md(ctx, p.paras[0])}</p>
        <div class="ip-pcard__actions">${action}</div>
      </div>
    </li>`;
}

export function shop(ctx) {
  const { c } = ctx;
  const t = c.shop;
  const chips = [
    `<button class="ip-chip" type="button" data-ip-filter="" aria-pressed="true">${esc(t.list.all)}</button>`,
    ...ctx.shop.categories.map((cat) => `<button class="ip-chip" type="button" data-ip-filter="${cat.id}" aria-pressed="false">${esc(t.list.categories[cat.id])}</button>`),
  ].join('');
  return `
    ${head(ctx, { title: c.nav.glacons, lead: t.list.lead, compact: false })}
    <section class="ip-shop" data-set="sun" data-ip-shop="list">
      <div class="ip-wrap">
        ${demoNote(ctx)}
        <div class="ip-shopbar">
          <div class="ip-chips" role="group" aria-label="${esc(t.list.filters)}">${chips}</div>
          <div class="ip-search">
            <label class="ip-sr" for="shop-q">${esc(t.list.search)}</label>
            <input id="shop-q" type="search" enterkeyhint="search" data-ip-search placeholder="${esc(t.list.searchPlaceholder)}" autocomplete="off">
          </div>
        </div>
        <p class="ip-shop__count" role="status" aria-live="polite" data-ip-count data-template="${esc(t.list.shown)}"></p>
        <ul class="ip-pgrid" data-ip-grid>${PRODUCT_IDS.map((id) => productCard(ctx, id)).join('')}</ul>
        <div class="ip-empty" data-ip-empty hidden>
          <p>${esc(t.list.empty)}</p>
          <button class="ip-btn ip-btn--line" type="button" data-ip-reset>${esc(t.list.reset)}</button>
        </div>
      </div>
    </section>
    <section class="ip-cta" data-set="sun">
      <div class="ip-wrap ip-cta__inner">
        <h2 class="ip-cta__title">${esc(t.list.quoteTitle)}</h2>
        <div class="ip-cta__actions">
          <a class="ip-btn ip-btn--ink ip-btn--lg" href="${quoteUrl(ctx)}"><span>${esc(t.buy.requestQuote)}</span>${icon('arrow')}</a>
          <a class="ip-btn ip-btn--line ip-btn--lg" href="${waLink(ctx, c.wa.generic)}" ${external}>${icon('whatsapp')}<span>${esc(c.ui.orderWhatsapp)}</span></a>
        </div>
      </div>
    </section>
    ${shopData(ctx)}`;
}

// ---------------------------------------------------------------- product page: presents and sells

/** The photographs of a product: a strip that slides (finger, trackpad or the small pictures under it). */
function gallery(ctx, id) {
  const { c } = ctx;
  const list = GALLERY[id];
  const slides = list
    .map((img, i) => `<li class="ip-gallery__slide" id="photo-${i + 1}">${picture(ctx, img, { alt: alt(ctx, img), priority: i === 0, sizes: '(min-width: 900px) 50vw, 100vw' })}</li>`)
    .join('');
  const thumbs = list.length > 1
    ? `<div class="ip-gallery__thumbs" role="group" aria-label="${esc(c.v7.ui.gallery)}">${list
        .map((img, i) => `<button class="ip-gallery__thumb" type="button" data-ip-photo="${i}" aria-label="${esc(c.v7.ui.showPhoto.replace('{n}', i + 1))}"${i === 0 ? ' aria-current="true"' : ''}>${picture(ctx, img, { alt: '', sizes: '84px' })}</button>`)
        .join('')}</div>`
    : '';
  return `<div class="ip-gallery" data-ip-gallery>
        <ul class="ip-gallery__track" tabindex="0" aria-label="${esc(c.v7.ui.gallery)}">${slides}</ul>
        ${thumbs}
      </div>`;
}

/** Three other products, the closest in the range first. */
function related(ctx, id) {
  const { c } = ctx;
  const at = PRODUCT_IDS.indexOf(id);
  const others = [1, 2, 3].map((n) => PRODUCT_IDS[(at + n) % PRODUCT_IDS.length]);
  const cards = others
    .map((o) => {
      const info = productInfo(ctx, o);
      return `<li class="ip-mini">
          <a class="ip-mini__link" href="${info.href}">
            <span class="ip-mini__media">${picture(ctx, CARD_IMAGE[o], { alt: '', sizes: '(min-width: 900px) 28vw, 70vw' })}</span>
            <span class="ip-mini__name">${md(ctx, c.products[o].h1)}</span>
            <span class="ip-mini__go">${icon('arrow')}</span>
          </a>
        </li>`;
    })
    .join('');
  return `<section class="ip-related" data-set="sun" aria-labelledby="h-related">
      <div class="ip-wrap">
        <div class="ip-sectionhead"><h2 id="h-related">${esc(c.ui.related)}</h2><a class="ip-link" href="${urlFor('shop', ctx.lang)}"><span>${esc(c.ui.seeAll)}</span>${icon('arrow')}</a></div>
        <ul class="ip-minis">${cards}</ul>
      </div>
    </section>`;
}

export function shopProduct(ctx, page) {
  const { c, lang } = ctx;
  const id = shopProductOf(page.id);
  const p = c.products[id];
  const line = c.v7.product[id];
  const specs = p.specs.length
    ? `<div class="ip-specs"><h2 class="ip-specs__title">${esc(c.ui.specs)}</h2><dl>${p.specs.map(([key, value]) => `<div><dt>${esc(c.specLabels[key])}</dt><dd>${md(ctx, value)}</dd></div>`).join('')}</dl></div>`
    : '';
  const more = p.paras.slice(1);
  return `
    <article class="ip-product" data-set="sun">
      <div class="ip-wrap ip-product__grid">
        ${gallery(ctx, id)}
        <div class="ip-product__body">
          <nav class="ip-crumbs" aria-label="${esc(c.nav.glacons)}">
            <a href="${urlFor('home', lang)}">${esc(c.ui.home)}</a><span aria-hidden="true">/</span><a href="${urlFor('shop', lang)}">${esc(c.nav.glacons)}</a>
          </nav>
          <h1 class="ip-product__title">${md(ctx, p.h1)}</h1>
          ${line ? `<p class="ip-motto">${md(ctx, line)}</p>` : ''}
          <p class="ip-lead">${md(ctx, p.paras[0])}</p>
          ${demoNote(ctx)}
          ${buyBox(ctx, id)}
        </div>
      </div>
      ${more.length || specs ? `<div class="ip-wrap ip-product__more">
        <div class="ip-product__text">${more.map((t) => `<p>${md(ctx, t)}</p>`).join('')}</div>
        ${specs}
      </div>` : ''}
    </article>
    ${related(ctx, id)}
    ${buyBar(ctx, id)}
    ${shopData(ctx, { ids: [id] })}`;
}

// ---------------------------------------------------------------- cart

export function cart(ctx) {
  const t = ctx.c.shop;
  const actions = `<a class="ip-btn ip-btn--ink ip-btn--lg ip-summary__cta" href="${urlFor('checkout', ctx.lang)}" data-ip-checkout>${esc(t.cart.checkout)}${icon('arrow')}</a>
        <a class="ip-btn ip-btn--line ip-summary__quote" href="${quoteUrl(ctx)}" data-ip-cart-quote>${esc(t.cart.quote)}</a>
        <a class="ip-link ip-summary__continue" href="${urlFor('shop', ctx.lang)}">${esc(t.cart.continue)}</a>`;
  return `
    ${head(ctx, { title: t.cart.title, lead: t.cart.lead })}
    <section data-set="sun" class="ip-section ip-section--tight ip-cartpage" data-ip-shop="cart">
      <div class="ip-wrap">
        ${demoNote(ctx)}
        ${steps(ctx, 1)}
        <div class="ip-cartgrid">
          <div class="ip-cartgrid__main">
            <p class="ip-cart__count" data-ip-items role="status" aria-live="polite"></p>
            <ul class="ip-lines" data-ip-lines></ul>
            <div class="ip-empty" data-ip-empty hidden>
              <h2>${esc(t.cart.empty)}</h2>
              <p>${esc(t.cart.emptyLead)}</p>
              <a class="ip-btn ip-btn--ink ip-btn--lg" href="${urlFor('shop', ctx.lang)}"><span>${esc(t.list.title)}</span>${icon('arrow')}</a>
            </div>
          </div>
          ${summary(ctx, { actions })}
        </div>
      </div>
    </section>
    ${shopData(ctx)}`;
}

// ---------------------------------------------------------------- checkout (delivery)

function choices(ctx, kind, items, { name, legend, checked }) {
  const t = ctx.c.shop;
  const rows = items
    .map((it) => {
      const meta = kind === 'delivery' ? t.checkout.methods[it.id] : t.payment.methods[it.id];
      const price = kind === 'delivery' ? `<span class="ip-choice__price" data-ip-fee="${it.id}">${money(ctx.lang, it.fee, ctx.shop.currency)}</span>` : '';
      return `<label class="ip-choice">
            <input type="radio" name="${name}" value="${it.id}"${it.id === checked ? ' checked' : ''}${kind === 'payment' ? ' required' : ''}>
            <span class="ip-choice__body"><span class="ip-choice__name">${esc(meta.name)}</span><span class="ip-choice__desc">${esc(meta.desc)}</span></span>
            ${price}
          </label>`;
    })
    .join('');
  return `<fieldset class="ip-choices"><legend class="ip-choices__legend">${esc(legend)}</legend>${rows}</fieldset>`;
}

export function checkout(ctx) {
  const t = ctx.c.shop;
  const k = 'co';
  const f = t.checkout.fields;
  const defaultDelivery = ctx.shop.delivery.find((d) => d.default)?.id ?? ctx.shop.delivery[0].id;
  return `
    ${head(ctx, { title: t.checkout.title, lead: t.checkout.lead })}
    <section data-set="sun" class="ip-section ip-section--tight ip-checkoutpage" data-ip-shop="checkout">
      <div class="ip-wrap">
        ${demoNote(ctx)}
        ${steps(ctx, 2)}
        <div class="ip-cartgrid">
          <form class="ip-form ip-checkoutform" data-ip-checkout-form novalidate>
            <p class="ip-accounthint" data-ip-accounthint>${esc(t.checkout.accountHint)} <a class="ip-link" href="${urlFor('login', ctx.lang)}">${esc(t.checkout.signIn)}</a></p>
            <fieldset class="ip-panel ip-fieldset">
              <legend class="ip-fieldset__legend">${esc(t.checkout.contact)}</legend>
              <div class="ip-form__grid">
                ${field(ctx, k, { key: 'name', label: f.name, required: true, autocomplete: 'name' })}
                ${field(ctx, k, { key: 'phone', label: f.phone, type: 'tel', required: true, autocomplete: 'tel', inputmode: 'tel' })}
                ${field(ctx, k, { key: 'email', label: f.email, type: 'email', required: true, autocomplete: 'email', wide: true })}
                ${field(ctx, k, { key: 'company', label: f.company, autocomplete: 'organization' })}
                ${field(ctx, k, { key: 'ice', label: f.ice, inputmode: 'numeric', autocomplete: 'off' })}
              </div>
            </fieldset>
            <fieldset class="ip-panel ip-fieldset">
              <legend class="ip-fieldset__legend">${esc(t.checkout.address)}</legend>
              <div class="ip-form__grid">
                ${field(ctx, k, { key: 'street', label: f.street, required: true, autocomplete: 'street-address', wide: true })}
                ${field(ctx, k, { key: 'city', label: f.city, required: true, autocomplete: 'address-level2' })}
                ${field(ctx, k, { key: 'zip', label: f.zip, autocomplete: 'postal-code', inputmode: 'numeric' })}
                ${field(ctx, k, { key: 'date', label: f.date, type: 'date' })}
                ${field(ctx, k, { key: 'note', label: f.note, textarea: true, wide: true })}
              </div>
            </fieldset>
            <div class="ip-panel ip-fieldset">
              ${choices(ctx, 'delivery', ctx.shop.delivery, { name: 'delivery', legend: t.checkout.method, checked: defaultDelivery })}
            </div>
            <p class="ip-form__summary ip-field__error" data-ip-form-error role="alert" hidden>${esc(t.checkout.errors)}</p>
            <div class="ip-form__nav">
              <a class="ip-link" href="${urlFor('cart', ctx.lang)}">${esc(t.checkout.back)}</a>
              <button class="ip-btn ip-btn--ink ip-btn--lg" type="submit"><span>${esc(t.checkout.continue)}</span>${icon('arrow')}</button>
            </div>
          </form>
          ${summary(ctx, { lines: true })}
        </div>
      </div>
    </section>
    ${shopData(ctx)}`;
}

// ---------------------------------------------------------------- payment

export function payment(ctx) {
  const t = ctx.c.shop;
  const checked = '';
  const terms = fill(esc(t.payment.terms), { link: `<a class="ip-link" href="${urlFor('cgv', ctx.lang)}" hreflang="fr" target="_blank" rel="noopener">${esc(t.payment.termsLink)}</a>` });
  return `
    ${head(ctx, { title: t.payment.title, lead: t.payment.lead })}
    <section data-set="sun" class="ip-section ip-section--tight ip-paymentpage" data-ip-shop="payment">
      <div class="ip-wrap">
        ${demoNote(ctx)}
        ${steps(ctx, 3)}
        <div class="ip-cartgrid">
          <form class="ip-form ip-payform" data-ip-pay-form novalidate>
            <section class="ip-panel ip-review" aria-labelledby="rev-h">
              <h2 class="ip-fieldset__legend" id="rev-h">${esc(t.payment.review)}</h2>
              <dl class="ip-review__list">
                <div><dt>${esc(t.payment.contact)}</dt><dd data-ip-rev-contact></dd><dd class="ip-review__edit"><a class="ip-link" href="${urlFor('checkout', ctx.lang)}">${esc(t.payment.edit)}</a></dd></div>
                <div><dt>${esc(t.payment.address)}</dt><dd data-ip-rev-address></dd></div>
              </dl>
            </section>
            <div class="ip-panel ip-fieldset">
              ${choices(ctx, 'payment', ctx.shop.payment, { name: 'payment', legend: t.payment.method, checked })}
              <p class="ip-field__error" id="pay-method-err" role="alert" hidden></p>
              <p class="ip-choices__note" data-ip-pay-note aria-live="polite"></p>
            </div>
            <div class="ip-terms">
              <label class="ip-check"><input type="checkbox" name="terms" id="f-pay-terms" required aria-describedby="f-pay-terms-err"><span>${terms}</span></label>
              <p class="ip-field__error" id="f-pay-terms-err" role="alert" hidden></p>
            </div>
            <div class="ip-form__nav">
              <a class="ip-link" href="${urlFor('checkout', ctx.lang)}">${esc(t.payment.back)}</a>
              <button class="ip-btn ip-btn--ink ip-btn--lg" type="submit" data-ip-pay-submit data-pay="${esc(t.payment.pay)}" data-confirm="${esc(t.payment.confirm)}">${icon('lock')}<span>${esc(t.payment.pay)}</span></button>
            </div>
          </form>
          ${summary(ctx, { lines: true })}
        </div>
      </div>
    </section>
    ${shopData(ctx)}`;
}

// ---------------------------------------------------------------- simulated payment provider page

export function simulate(ctx) {
  const t = ctx.c.shop.simulate;
  return `
    <section data-set="sun" class="ip-sim" data-ip-shop="simulate">
      <div class="ip-wrap">
        <div class="ip-sim__card">
          <p class="ip-sim__badge">${esc(t.badge)}</p>
          <h1 class="ip-sim__title">${esc(t.title)}</h1>
          <p class="ip-sim__lead">${esc(t.lead)}</p>
          <dl class="ip-sim__facts">
            <div><dt class="ip-sr">${esc(t.order.replace('{ref}', ''))}</dt><dd data-ip-sim-order></dd></div>
            <div><dt class="ip-sr">${esc(t.amount.replace('{amount}', ''))}</dt><dd data-ip-sim-amount></dd></div>
          </dl>
          <p class="ip-sim__q" id="sim-q">${esc(t.question)}</p>
          <div class="ip-sim__actions" role="group" aria-labelledby="sim-q">
            <button class="ip-btn ip-btn--ink ip-btn--lg" type="button" data-ip-sim="yes">${icon('check')}<span>${esc(t.yes)}</span></button>
            <button class="ip-btn ip-btn--line ip-btn--lg" type="button" data-ip-sim="no"><span>${esc(t.no)}</span></button>
          </div>
          <p class="ip-sim__processing" role="status" aria-live="polite" data-ip-sim-status hidden>${esc(t.processing)}</p>
          <a class="ip-link ip-sim__back" href="${urlFor('payment', ctx.lang)}">${esc(t.back)}</a>
        </div>
      </div>
    </section>
    ${shopData(ctx)}`;
}

// ---------------------------------------------------------------- confirmation (paid, pending or failed)

export function confirmation(ctx) {
  const t = ctx.c.shop.confirmation;
  const cartT = ctx.c.shop.cart;
  const wa = waLink(ctx, ctx.c.wa.generic);
  return `
    <section data-set="sun" class="ip-section ip-section--tight ip-confpage" data-ip-shop="confirmation">
      <div class="ip-wrap ip-conf">
        ${steps(ctx, 4)}
        <div class="ip-conf__none" data-ip-state="none" hidden>
          <h1 class="ip-conf__title">${esc(t.none)}</h1>
          <p class="ip-lead">${esc(t.noneLead)}</p>
          <a class="ip-btn ip-btn--ink ip-btn--lg" href="${urlFor('shop', ctx.lang)}"><span>${esc(ctx.c.shop.list.title)}</span>${icon('arrow')}</a>
        </div>

        <div class="ip-cartgrid ip-conf__grid" data-ip-state="order" hidden>
          <div class="ip-conf__main">
            <div class="ip-alert ip-alert--success" role="status" data-ip-alert>
              <span class="ip-alert__icon" aria-hidden="true">${icon('check')}</span>
              <div>
                <h1 class="ip-alert__title" data-ip-title></h1>
                <p data-ip-text></p>
                <p class="ip-alert__ref" data-ip-transfer-ref hidden><strong>${esc(t.transferRef)} :</strong> <bdi dir="ltr" data-ip-ref></bdi></p>
              </div>
            </div>
            <p class="ip-conf__order"><span data-ip-order-label data-template="${esc(t.order)}"></span></p>
            <div class="ip-conf__actions" data-ip-fail-actions hidden>
              <a class="ip-btn ip-btn--ink ip-btn--lg" href="${urlFor('payment', ctx.lang)}">${icon('lock')}<span>${esc(t.retry)}</span></a>
              <a class="ip-btn ip-btn--line" href="${urlFor('payment', ctx.lang)}"><span>${esc(t.other)}</span></a>
              <a class="ip-btn ip-btn--line" href="${urlFor('cart', ctx.lang)}"><span>${esc(t.toCart)}</span></a>
              <a class="ip-link" href="${wa}" ${external}>${esc(ctx.c.ui.waHelp)}</a>
            </div>
            <section class="ip-panel ip-conf__details" data-ip-details hidden aria-label="${esc(t.order.replace('{ref}', ''))}">
              <ul class="ip-sum-lines" data-ip-conf-lines></ul>
              <dl class="ip-review__list" data-ip-conf-meta></dl>
            </section>
          </div>
          <aside class="ip-summary ip-conf__side" data-ip-summary>
            <h2 class="ip-summary__title">${esc(cartT.summary)}</h2>
            <dl class="ip-summary__totals">
              <div><dt>${esc(cartT.subtotal)}</dt><dd data-ip-subtotal>${money(ctx.lang, null)}</dd></div>
              <div><dt>${esc(cartT.delivery)}</dt><dd data-ip-delivery>${money(ctx.lang, null)}</dd></div>
              <div class="is-total"><dt>${esc(cartT.total)}</dt><dd data-ip-total>${money(ctx.lang, null)}</dd></div>
            </dl>
            <div class="ip-conf__next" data-ip-next hidden>
              <h2 class="ip-summary__title">${esc(t.next)}</h2>
              <p>${esc(t.nextText)}</p>
              <a class="ip-btn ip-btn--ink ip-btn--lg" href="${urlFor('account', ctx.lang)}"><span>${esc(t.orders)}</span>${icon('arrow')}</a>
              <a class="ip-link" href="${urlFor('home', ctx.lang)}">${esc(t.home)}</a>
            </div>
          </aside>
        </div>
      </div>
    </section>
    ${shopData(ctx)}`;
}

// ---------------------------------------------------------------- account

function authForm(ctx, kind) {
  const t = ctx.c.shop.account;
  const f = t.fields;
  const signup = kind === 'signup';
  const k = signup ? 'su' : 'li';
  return `
    ${head(ctx, { title: signup ? t.signupTitle : t.loginTitle, lead: signup ? t.signupLead : t.loginLead })}
    <section data-set="sun" class="ip-section ip-section--tight ip-authpage" data-ip-shop="${kind}">
      <div class="ip-wrap ip-auth">
        ${demoNote(ctx)}
        <form class="ip-panel ip-form" data-ip-auth-form="${kind}" novalidate>
          <div class="ip-form__grid ip-form__grid--one">
            ${signup ? field(ctx, k, { key: 'name', label: f.name, required: true, autocomplete: 'name' }) : ''}
            ${field(ctx, k, { key: 'email', label: f.email, type: 'email', required: true, autocomplete: signup ? 'email' : 'username' })}
            ${field(ctx, k, { key: 'password', label: f.password, type: 'password', required: true, autocomplete: signup ? 'new-password' : 'current-password', hint: signup ? t.passwordHint : undefined })}
            ${signup ? `<div class="ip-field ip-field--wide"><label class="ip-check"><input type="checkbox" name="pro" id="f-su-pro" data-ip-pro><span>${esc(t.pro)}</span></label></div>
            <div class="ip-field ip-field--wide" data-ip-pro-fields hidden>
              ${field(ctx, k, { key: 'company', label: f.company, autocomplete: 'organization', wide: true })}
              ${field(ctx, k, { key: 'ice', label: f.ice, inputmode: 'numeric', autocomplete: 'off', wide: true })}
              <p class="ip-field__hint">${esc(t.proNote)}</p>
            </div>` : ''}
          </div>
          <button class="ip-btn ip-btn--ink ip-btn--lg ip-form__submit" type="submit"><span>${esc(signup ? t.signup : t.login)}</span></button>
          <p class="ip-form__status" role="status" aria-live="polite" data-ip-auth-status></p>
          <p class="ip-auth__alt">${esc(signup ? t.haveAccount : t.noAccount)} <a class="ip-link" href="${urlFor(signup ? 'login' : 'signup', ctx.lang)}">${esc(signup ? t.login : t.signupTitle)}</a></p>
          <p class="ip-field__hint">${esc(t.demoNote)}</p>
        </form>
      </div>
    </section>
    ${shopData(ctx)}`;
}

export const login = (ctx) => authForm(ctx, 'login');
export const signup = (ctx) => authForm(ctx, 'signup');

export function account(ctx) {
  const t = ctx.c.shop.account;
  const cols = t.cols;
  return `
    ${head(ctx, { title: t.title })}
    <section data-set="sun" class="ip-section ip-section--tight ip-accountpage" data-ip-shop="account">
      <div class="ip-wrap">
        ${demoNote(ctx)}
        <div class="ip-account" data-ip-account hidden>
          <div class="ip-account__head">
            <p class="ip-lead" data-ip-hello data-template="${esc(t.hello)}"></p>
            <p class="ip-account__pro" data-ip-pro-badge hidden>${esc(t.proBadge)}</p>
            <button class="ip-btn ip-btn--line ip-btn--sm" type="button" data-ip-logout>${esc(t.logout)}</button>
          </div>
          <section class="ip-panel" aria-labelledby="orders-h">
            <h2 class="ip-fieldset__legend" id="orders-h">${esc(t.orders)}</h2>
            <div class="ip-empty ip-empty--inline" data-ip-orders-empty hidden>
              <p>${esc(t.ordersEmpty)}</p>
              <a class="ip-btn ip-btn--ink" href="${urlFor('shop', ctx.lang)}"><span>${esc(t.ordersCta)}</span>${icon('arrow')}</a>
            </div>
            <div class="ip-tablewrap" data-ip-orders-wrap hidden>
              <table class="ip-table">
                <thead><tr><th scope="col">${esc(cols.ref)}</th><th scope="col">${esc(cols.date)}</th><th scope="col">${esc(cols.status)}</th><th scope="col" class="ip-table__num">${esc(cols.total)}</th></tr></thead>
                <tbody data-ip-orders></tbody>
              </table>
            </div>
          </section>
        </div>
        <div class="ip-account__guest" data-ip-guest hidden>
          <p class="ip-lead">${esc(t.loginLead)}</p>
          <div class="ip-conf__actions">
            <a class="ip-btn ip-btn--ink ip-btn--lg" href="${urlFor('login', ctx.lang)}"><span>${esc(t.login)}</span></a>
            <a class="ip-btn ip-btn--line ip-btn--lg" href="${urlFor('signup', ctx.lang)}"><span>${esc(t.signupTitle)}</span></a>
          </div>
        </div>
      </div>
    </section>
    ${shopData(ctx)}`;
}
