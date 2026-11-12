// Page templates. Each function returns the inner HTML of <main>.
// All class names are prefixed `ip-` so the same markup and CSS can be pasted into an Odoo page.
//
// Version 7: the page is the photographer's set. A section is either in the sun (the blue paper of the company's own
// photographs, ink type) or at night (the black backdrop of its bar photographs, white type); `data-set` tells the script
// which, so the bar at the top keeps the right colour. Every picture is one of the company's photographs.
import { esc, md, waLink, picture } from './html.mjs';
import { icon } from './icons.mjs';
import { PRODUCT_IDS, FEATURED_IDS, REDIRECTS, urlFor } from './routes.mjs';
import { CARD_IMAGE } from './catalog.mjs';
import * as shopPages from './shop-pages.mjs';

const alt = (ctx, id) => ctx.c.alt[id] ?? '';
const external = 'target="_blank" rel="noopener"';
const quoteUrl = (ctx) => `${urlFor('contact', ctx.lang)}#devis`;
const productUrl = (ctx, id) => urlFor(`shop-${id}`, ctx.lang);
/** A value of the product sheet as one line: "36 g la pièce · Packs de 2 kg". */
const facts = (ctx, id) => ctx.c.products[id].specs.filter(([key]) => ['pack', 'size', 'minimum', 'material'].includes(key)).map(([key, value]) => (key === 'minimum' ? `${ctx.c.specLabels.minimum} : ${value}` : value)).join(' · ');

// ---------------------------------------------------------------- components

/** A photograph laid on the set. `ratio` crops it by CSS (object-fit) around its focal point. */
function plate(ctx, id, { sizes = '(min-width: 900px) 46vw, 92vw', priority = false, ratio, cls = '' } = {}) {
  return `<figure class="ip-plate ${cls}"${ratio ? ` style="--ratio:${ratio}"` : ''} data-plate>${picture(ctx, id, { alt: alt(ctx, id), sizes, priority })}</figure>`;
}

/** Picture on one side, words on the other; `set` is the light of the section. */
function scene(ctx, { id, set = 'sun', image, title, lead, body = '', flip = false, ratio, tag = 'h2', cls = '' }) {
  return `<section class="ip-scene ip-scene--${set}${flip ? ' ip-scene--flip' : ''} ${cls}" data-set="${set}"${id ? ` aria-labelledby="${id}"` : ''}>
      <div class="ip-wrap ip-scene__grid">
        ${plate(ctx, image, { ratio, cls: 'ip-scene__media' })}
        <div class="ip-scene__body" data-reveal>
          <${tag} class="ip-scene__title"${id ? ` id="${id}"` : ''}>${md(ctx, title)}</${tag}>
          ${lead ? `<p class="ip-lead">${md(ctx, lead)}</p>` : ''}
          ${body}
        </div>
      </div>
    </section>`;
}

function contactDetails(ctx) {
  const { c, site } = ctx;
  return `<ul class="ip-details">
      <li><a href="${waLink(ctx, c.wa.generic)}" ${external}><span class="ip-details__icon">${icon('whatsapp')}</span><span><span class="ip-details__label">${esc(c.ui.whatsapp)}</span><bdi class="ip-details__value" dir="ltr">${esc(site.phoneDisplay)}</bdi></span></a></li>
      <li><a href="tel:${site.phoneHref}"><span class="ip-details__icon">${icon('phone')}</span><span><span class="ip-details__label">${esc(c.ui.phone)}</span><bdi class="ip-details__value" dir="ltr">${esc(site.phoneDisplay)}</bdi></span></a></li>
      <li><a href="mailto:${site.email}"><span class="ip-details__icon">${icon('mail')}</span><span><span class="ip-details__label">${esc(c.ui.email)}</span><bdi class="ip-details__value" dir="ltr">${esc(site.email)}</bdi></span></a></li>
      <li><a href="${site.instagramUrl}" ${external}><span class="ip-details__icon">${icon('instagram')}</span><span><span class="ip-details__label">${esc(c.ui.instagram)}</span><bdi class="ip-details__value" dir="ltr">@${site.instagram}</bdi></span></a></li>
    </ul>`;
}

/**
 * Forms compose a WhatsApp message (no backend in the static draft).
 * Field names match Odoo's website form (name, phone, email_from, company, subject, description)
 * so the port only has to swap the handler.
 */
const FORM_FIELDS = {
  contact: [
    { key: 'name', odoo: 'name', required: true, autocomplete: 'name' },
    { key: 'phone', odoo: 'phone', type: 'tel', autocomplete: 'tel', inputmode: 'tel' },
    { key: 'email', odoo: 'email_from', type: 'email', required: true, autocomplete: 'email' },
    { key: 'company', odoo: 'company', autocomplete: 'organization' },
    { key: 'subject', odoo: 'subject', required: true, wide: true },
    { key: 'message', odoo: 'description', required: true, wide: true, textarea: true },
  ],
  quote: [
    { key: 'name', odoo: 'name', required: true, autocomplete: 'name' },
    { key: 'phone', odoo: 'phone', type: 'tel', required: true, autocomplete: 'tel', inputmode: 'tel' },
    { key: 'email', odoo: 'email_from', type: 'email', autocomplete: 'email' },
    { key: 'venue', odoo: 'company', required: true, autocomplete: 'organization' },
    { key: 'city', odoo: 'city', required: true, autocomplete: 'address-level2' },
    { key: 'date', odoo: 'date', type: 'date' },
    { key: 'needs', odoo: 'description', required: true, wide: true, textarea: true },
  ],
};

function form(ctx, kind) {
  const { c, site } = ctx;
  const f = c.forms[kind];
  const fields = FORM_FIELDS[kind]
    .map((field) => {
      const id = `f-${kind}-${field.key}`;
      const label = f.fields[field.key];
      const attrs = [
        `id="${id}"`,
        `name="${field.odoo}"`,
        `data-label="${esc(label)}"`,
        field.required ? 'required' : '',
        field.autocomplete ? `autocomplete="${field.autocomplete}"` : '',
        field.inputmode ? `inputmode="${field.inputmode}"` : '',
        `aria-describedby="${id}-err"`,
      ].filter(Boolean).join(' ');
      const control = field.textarea
        ? `<textarea ${attrs} rows="4"></textarea>`
        : `<input ${attrs} type="${field.type ?? 'text'}">`;
      return `<div class="ip-field${field.wide ? ' ip-field--wide' : ''}">
          <label for="${id}">${esc(label)}${field.required ? ' <span class="ip-req" aria-hidden="true">*</span>' : ''}</label>
          ${control}
          <p class="ip-field__error" id="${id}-err" hidden></p>
        </div>`;
    })
    .join('');
  return `<form class="ip-form" data-ip-form="${kind}" data-wa="https://wa.me/${site.whatsapp}" data-greeting="${esc(f.greeting)}" data-required="${esc(c.forms.required)}" data-invalid-email="${esc(c.forms.invalidEmail)}" data-invalid-phone="${esc(c.forms.invalidPhone)}" data-status="${esc(c.forms.status)}" data-blocked="${esc(c.forms.blocked)}" novalidate>
      <div class="ip-form__grid">${fields}</div>
      <button class="ip-btn ip-btn--ink ip-btn--lg ip-form__submit" type="submit">${icon('whatsapp')}<span>${esc(c.ui.send)}</span></button>
      <p class="ip-form__status" role="status" aria-live="polite"></p>
    </form>`;
}

/** Contact form with a switch between a general question and a professional quote request. */
function contactPanel(ctx) {
  const { c } = ctx;
  const t = c.contact.tabs;
  return `<div class="ip-panel" id="devis" data-ip-tabs>
        <div class="ip-tabs" role="tablist" aria-label="${esc(c.contact.title)}">
          <button class="ip-tab" role="tab" type="button" id="tab-message" aria-controls="panel-message" aria-selected="true" data-hash="">${esc(t.message)}</button>
          <button class="ip-tab" role="tab" type="button" id="tab-quote" aria-controls="panel-quote" aria-selected="false" tabindex="-1" data-hash="devis">${esc(t.quote)}</button>
        </div>
        <div role="tabpanel" id="panel-message" aria-labelledby="tab-message">${form(ctx, 'contact')}</div>
        <div role="tabpanel" id="panel-quote" aria-labelledby="tab-quote">${form(ctx, 'quote')}</div>
      </div>`;
}

/** Five of the company's own Instagram posts; every tile opens the profile. */
const INSTA = ['cube-served', 'rose-pour', 'berry-top', 'event-block', 'cube-whisky'];
function instagram(ctx) {
  const { c, site } = ctx;
  const tiles = INSTA
    .map((id) => `<li><a class="ip-insta__tile" href="${site.instagramUrl}" ${external}>${picture(ctx, id, { alt: alt(ctx, id), sizes: '(min-width: 900px) 20vw, 46vw' })}</a></li>`)
    .join('');
  return `<section class="ip-insta" data-set="sun" aria-labelledby="h-insta">
      <div class="ip-wrap">
        <div class="ip-insta__head" data-reveal>
          <h2 id="h-insta">${esc(c.home.instagram.title)}</h2>
          <a class="ip-link" href="${site.instagramUrl}" ${external}>${icon('instagram')}<bdi dir="ltr">@${site.instagram}</bdi>${icon('arrow')}</a>
        </div>
        <ul class="ip-insta__grid" data-reveal>${tiles}</ul>
      </div>
    </section>`;
}

/** Closing band: the two ways to reach the company. */
function ctaBand(ctx) {
  const { c } = ctx;
  return `<section class="ip-cta" data-set="sun">
      <div class="ip-wrap ip-cta__inner" data-reveal>
        <h2 class="ip-cta__title">${esc(c.shop.list.quoteTitle)}</h2>
        <div class="ip-cta__actions">
          <a class="ip-btn ip-btn--ink ip-btn--lg" href="${quoteUrl(ctx)}"><span>${esc(c.shop.buy.requestQuote)}</span>${icon('arrow')}</a>
          <a class="ip-btn ip-btn--line ip-btn--lg" href="${waLink(ctx, c.wa.generic)}" ${external}>${icon('whatsapp')}<span>${esc(c.ui.orderWhatsapp)}</span></a>
        </div>
      </div>
    </section>`;
}

// ---------------------------------------------------------------- home

/** One of the three clear shapes, as a full scene: its photograph, its name, the company's own line about it. */
function piece(ctx, id, i) {
  const { c } = ctx;
  const p = c.products[id];
  const url = productUrl(ctx, id);
  const line = c.v7.product[id];
  const fact = facts(ctx, id);
  return `<article class="ip-piece${i % 2 ? ' ip-piece--flip' : ''}">
        <a class="ip-piece__media" href="${url}" tabindex="-1" aria-hidden="true">${plate(ctx, CARD_IMAGE[id], { ratio: id === 'ice-stick' ? '4 / 5' : '1 / 1' })}</a>
        <div class="ip-piece__body" data-reveal>
          <h3 class="ip-piece__name"><a href="${url}">${md(ctx, p.h1)}</a></h3>
          ${line ? `<p class="ip-motto">${md(ctx, line)}</p>` : ''}
          <p class="ip-piece__text">${md(ctx, p.paras[0])}</p>
          ${fact ? `<p class="ip-fact">${md(ctx, fact)}</p>` : ''}
          <a class="ip-link" href="${url}"><span>${esc(c.v7.ui.seeProduct)}</span>${icon('arrow')}</a>
        </div>
      </article>`;
}

/** The rest of the range as a plain list: name, what it is for, the figure that matters, a small photograph. */
function row(ctx, id) {
  const { c } = ctx;
  const p = c.products[id];
  const fact = facts(ctx, id) || (ctx.shop.products[id].mode === 'quote' ? c.shop.buy.quoteOnly : '');
  return `<li>
        <a class="ip-row" href="${productUrl(ctx, id)}">
          <span class="ip-row__thumb">${picture(ctx, CARD_IMAGE[id], { alt: '', sizes: '(min-width: 900px) 180px, 96px' })}</span>
          <span class="ip-row__name">${md(ctx, p.h1)}</span>
          <span class="ip-row__desc">${md(ctx, p.paras[0])}</span>
          <span class="ip-row__fact">${md(ctx, fact)}</span>
          <span class="ip-row__go">${icon('arrow')}</span>
        </a>
      </li>`;
}

export function home(ctx) {
  const { c, lang } = ctx;
  const h = c.home;
  const v = c.v7;
  const vows = c.mentions.map((m) => `<li>${esc(m)}</li>`).join('');
  return `
    <section class="ip-hero" data-set="sun" data-ip-ice="cube">
      <div class="ip-wrap ip-hero__inner">
        <h1 class="ip-hero__title">${md(ctx, h.heroTitle)}</h1>
        <div class="ip-hero__slot" data-ice-slot aria-hidden="true"></div>
        <div class="ip-hero__foot">
          <p class="ip-hero__sub">${md(ctx, h.heroSub)}</p>
          <div class="ip-hero__cta">
            <a class="ip-btn ip-btn--ink ip-btn--lg" href="${urlFor('shop', lang)}" data-ice-box><span>${esc(c.ui.shopOrder)}</span>${icon('arrow')}</a>
            <a class="ip-btn ip-btn--line ip-btn--lg" href="#nos-glacons"><span>${esc(c.ui.seeIce)}</span></a>
          </div>
        </div>
      </div>
      <p class="ip-hero__hint" aria-hidden="true">${icon('turn')}<span>${esc(v.ui.turn)}</span></p>
    </section>

    <section class="ip-say" data-set="sun">
      <div class="ip-wrap">
        <p class="ip-say__line" data-reveal>${md(ctx, v.lines.difference)}</p>
        <p class="ip-say__text" data-reveal>${md(ctx, h.intro)}</p>
      </div>
    </section>

    <section class="ip-range" id="nos-glacons" data-set="sun" aria-labelledby="h-ice">
      <div class="ip-wrap">
        <div class="ip-sectionhead" data-reveal>
          <h2 id="h-ice">${esc(h.productsTitle)}</h2>
          <a class="ip-link" href="${urlFor('shop', lang)}"><span>${esc(c.ui.seeAll)}</span>${icon('arrow')}</a>
        </div>
        ${FEATURED_IDS.slice(0, 3).map((id, i) => piece(ctx, id, i)).join('')}
      </div>
    </section>

    ${scene(ctx, {
      id: 'h-custom', set: 'night', image: 'white-rose', ratio: '4 / 5', title: v.product['custom-ice'], lead: v.lines.inclusions,
      body: `<div class="ip-actions">
            <a class="ip-btn ip-btn--white ip-btn--lg" href="${quoteUrl(ctx)}"><span>${esc(c.shop.buy.requestQuote)}</span>${icon('arrow')}</a>
            <a class="ip-link" href="${productUrl(ctx, 'custom-ice')}"><span>${md(ctx, c.products['custom-ice'].h1)}</span>${icon('arrow')}</a>
          </div>`,
    })}

    ${scene(ctx, {
      id: 'h-craft', set: 'night', flip: true, image: 'cube-glove', ratio: '1 / 1', title: v.lines.craft, lead: h.savoir.text, cls: 'ip-scene--last',
      body: `<ol class="ip-vows" aria-label="${esc(c.savoir.title)}">${vows}</ol>
          <a class="ip-link" href="${urlFor('savoir', lang)}"><span>${esc(h.savoir.link)}</span>${icon('arrow')}</a>`,
    })}

    ${scene(ctx, {
      id: 'h-sign', set: 'sun', image: 'stamp-set', ratio: '1 / 1', title: v.lines.signature, lead: v.lines.signatureText, cls: 'ip-scene--dawn',
      body: `<p>${md(ctx, c.products['ice-stamp'].paras[1])}</p>
          <div class="ip-actions">
            <a class="ip-btn ip-btn--ink ip-btn--lg" href="${productUrl(ctx, 'ice-stamp')}"><span>${md(ctx, c.products['ice-stamp'].h1)}</span>${icon('arrow')}</a>
            <a class="ip-link" href="${quoteUrl(ctx)}"><span>${esc(c.shop.buy.requestQuote)}</span>${icon('arrow')}</a>
          </div>`,
    })}

    <section class="ip-service" data-set="sun" aria-labelledby="h-service">
      <div class="ip-wrap">
        <div class="ip-sectionhead" data-reveal>
          <h2 id="h-service">${esc(c.shop.list.categories.service)}</h2>
        </div>
        <ul class="ip-rows" data-reveal>${['gourmet-ice', 'crushed-ice', 'dry-ice', 'ice-slab'].map((id) => row(ctx, id)).join('')}</ul>
        <div class="ip-deliver" data-reveal>
          <p class="ip-deliver__fact">${md(ctx, h.pro.fact)}</p>
          <a class="ip-btn ip-btn--ink ip-btn--lg" href="${urlFor('shop', lang)}"><span>${esc(c.ui.shopOrder)}</span>${icon('arrow')}</a>
        </div>
      </div>
    </section>

    ${instagram(ctx)}

    <section class="ip-contact" id="contact" data-set="sun" aria-labelledby="h-contact">
      <div class="ip-wrap ip-contact__grid">
        <div class="ip-contact__intro" data-reveal>
          <h2 id="h-contact">${esc(h.contact.title)}</h2>
          ${h.contact.paras.map((p) => `<p class="ip-lead">${md(ctx, p)}</p>`).join('')}
          ${contactDetails(ctx)}
        </div>
        <div class="ip-panel" data-reveal>${form(ctx, 'contact')}</div>
      </div>
    </section>`;
}

// ---------------------------------------------------------------- know-how (with what used to be "À propos")

/**
 * The four commitments, in the order the ice lives them: the water, the light, the hand, the glass. Each one is a scene:
 * three on the company's own photographs, and the UV light on a block drawn live under violet light (an illustration:
 * there is no photograph of that step). The counter is real information, the steps do follow each other.
 */
const VOW_IMAGES = ['cube-pure', null, 'cube-whisky', 'cube-served'];
function vow(ctx, i) {
  const { c } = ctx;
  const total = c.mentions.length;
  const media = VOW_IMAGES[i]
    ? plate(ctx, VOW_IMAGES[i], { ratio: '4 / 5', cls: 'ip-vow__media' })
    : `<div class="ip-vow__media ip-vow__lamp" data-ip-ice="stick" aria-hidden="true"><div class="ip-vow__slot" data-ice-slot></div></div>`;
  const tally = i === 0 ? '<span class="ip-tally" aria-hidden="true"><i></i><i></i><i></i><b></b><b></b></span>' : '';
  return `<li class="ip-vow${i % 2 ? ' ip-vow--flip' : ''}${VOW_IMAGES[i] ? '' : ' ip-vow--uv'}">
        ${media}
        <div class="ip-vow__body" data-reveal>
          <h2 class="ip-vow__claim">${esc(c.mentions[i])}</h2>
          ${tally}
          <p class="ip-vow__step"><span class="ip-vow__count">${i + 1} ${esc(c.ui.stepOf)} ${total}</span><span>${esc(c.savoir.stepLabels[i])}</span></p>
        </div>
      </li>`;
}

export function savoir(ctx) {
  const { c } = ctx;
  const s = c.savoir;
  const a = c.about.sections;
  const sect = (sec, image, flip, ratio) => scene(ctx, {
    set: 'sun', flip, image, ratio, title: sec.title, lead: sec.paras[0],
    body: sec.paras.slice(1).map((t) => `<p>${md(ctx, t)}</p>`).join(''),
  });
  return `
    <header class="ip-opening" data-set="night">
      <div class="ip-wrap ip-opening__grid">
        <div class="ip-opening__text">
          <h1 class="ip-opening__title">${md(ctx, s.title)}</h1>
          ${s.paras.map((t) => `<p class="ip-lead">${md(ctx, t)}</p>`).join('')}
        </div>
        ${plate(ctx, 'cube-tongs', { ratio: '4 / 5', priority: true, cls: 'ip-opening__media' })}
      </div>
    </header>
    <section class="ip-vowspace" data-set="night" aria-label="${esc(c.ui.steps)}">
      <div class="ip-wrap"><ol class="ip-vowlist">${c.mentions.map((_, i) => vow(ctx, i)).join('')}</ol></div>
    </section>
    <div class="ip-dawn" aria-hidden="true"></div>
    ${sect(a[0], 'stick-bar', false, '4 / 5')}
    ${sect(a[1], 'berry', true, '4 / 5')}
    ${ctaBand(ctx)}`;
}

// ---------------------------------------------------------------- contact, legal, 404

function pageHead(ctx, { title, lead }) {
  return `<header class="ip-pagehead" data-set="sun">
      <div class="ip-wrap">
        <h1 class="ip-pagehead__title">${md(ctx, title)}</h1>
        ${lead ? `<p class="ip-lead">${md(ctx, lead)}</p>` : ''}
      </div>
    </header>`;
}

export function contact(ctx) {
  const { c } = ctx;
  return `
    ${pageHead(ctx, { title: c.contact.title, lead: c.contact.clients })}
    <section class="ip-contact ip-contact--page" data-set="sun">
      <div class="ip-wrap ip-contact__grid">
        <div class="ip-contact__intro" data-reveal>
          ${c.contact.paras.map((p) => `<p class="ip-lead">${md(ctx, p)}</p>`).join('')}
          ${contactDetails(ctx)}
        </div>
        <div data-reveal>${contactPanel(ctx)}</div>
      </div>
    </section>
    ${instagram(ctx)}`;
}

export function legal(ctx, page) {
  const doc = ctx.legal[page.id];
  return `
    ${pageHead(ctx, { title: doc.title })}
    <section class="ip-legal" data-set="sun">
      <div class="ip-wrap ip-prose">
        ${doc.blocks.map(([tag, text]) => `<${tag}>${md(ctx, text)}</${tag}>`).join('')}
      </div>
    </section>`;
}

export function notFound(ctx) {
  const { c, lang } = ctx;
  return `
    <section class="ip-notfound" data-set="sun">
      <div class="ip-wrap">
        <h1 class="ip-pagehead__title">${esc(c.notFound.title)}</h1>
        <a class="ip-btn ip-btn--ink ip-btn--lg" href="${urlFor('home', lang)}"><span>${esc(c.notFound.back)}</span>${icon('arrow')}</a>
      </div>
    </section>`;
}

/** Former addresses: the layout turns these into redirect pages, so nothing is rendered here. */
const moved = () => '';

export const RENDERERS = {
  home, savoir, contact,
  privacy: legal, terms: legal, cgv: legal, notFound,
  shop: shopPages.shop, ...Object.fromEntries(PRODUCT_IDS.map((id) => [`shop-${id}`, shopPages.shopProduct])), cart: shopPages.cart, checkout: shopPages.checkout, payment: shopPages.payment,
  simulate: shopPages.simulate, confirmation: shopPages.confirmation,
  login: shopPages.login, signup: shopPages.signup, account: shopPages.account,
  ...Object.fromEntries(Object.keys(REDIRECTS).map((id) => [id, moved])),
};
