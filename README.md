# Ice Please, maquette du site : version 7 (FR / EN / AR)

Aperçu en ligne : **https://nadirkarem.github.io/ice-please-v7/**

Proposition de refonte du site d'Ice Please Morocco (FAAB & CO), glaçons premium et clear ice pour les professionnels de la boisson. Ce n'est pas le site officiel : c'est un brouillon non indexé (`noindex`, `robots.txt` qui interdit tout), sans vraie commande ni vrai paiement.

## Ce qui change par rapport à la version 6

- **Direction « le plateau »** : la page est le fond de studio des photographies de l'entreprise. Papier bleu ciel au soleil, type à l'encre ; scènes de nuit sur fond noir pour les photos prises au bar ; entre les deux, le papier s'assombrit par le bleu d'une ombre, sans jamais de trait net.
- **Uniquement de vraies photographies** : les 25 visuels viennent du compte Instagram public de l'entreprise (en pleine résolution) et, pour quatre produits, du site actuel. Les six films de synthèse de la version 6 sont retirés.
- **Un bloc de glace dessiné en direct** (`src/ice.js`) : dans le hero, on lit le titre à travers la glace, son ombre contient les reflets lumineux d'une glace claire, et on peut le faire tourner. Sur la page Savoir-faire, le même bloc sous lumière violette illustre l'étape UV (illustration, pas une photo du procédé).
- **Structure resserrée** : une seule page par produit, qui présente et vend (`/shop/<produit>/`) ; « Nos glaçons » est la boutique ; « À propos » rejoint « Savoir-faire ». Les anciennes adresses redirigent.
- **Typographie** : Newsreader (serif) pour les titres et les phrases de la marque, Schibsted Grotesk pour le reste, Noto Naskh et Noto Sans pour l'arabe.
- **Textes de la marque** : les phrases courtes viennent des légendes Instagram de l'entreprise (voir `VALIDATIONS_CLIENT.md`, section D).

## Lancer en local

```bash
npm install --legacy-peer-deps
npm run dev      # http://127.0.0.1:5300
npm run build    # génère dist/ (100 pages, dont 33 redirections des anciennes adresses)
```

Sous un sous-dossier, comme sur GitHub Pages : `BASE_PATH=/nom-du-depot npm run build`.

## Où modifier quoi

| Pour changer… | Fichier |
|---|---|
| un texte (FR, EN, AR) | `content/fr.json`, `content/en.json`, `content/ar.json` ; les phrases reprises d'Instagram sont sous `v7` |
| téléphone, e-mail, Instagram, indexation | `content/site.json` |
| la structure d'une page | `scripts/lib/pages.mjs` (accueil, savoir-faire, contact), `scripts/lib/shop-pages.mjs` (boutique, fiche, panier…) |
| l'en-tête, le pied de page, le `<head>`, les redirections | `scripts/lib/layout.mjs`, `scripts/lib/routes.mjs` |
| les photos d'un produit | `scripts/lib/catalog.mjs` (`GALLERY`) |
| le design | `src/style.css` |
| le bloc de glace (forme, lumière, ombre) | `src/ice.js` ; page d'essai : `tools/lab/ice.html` en mode dev |
| le comportement (menu, transitions de page, galerie, formulaires) | `src/main.js` |
| la boutique : catalogue, prix (vides : « -- MAD »), livraison, paiement | `content/shop.json`, `content/shop.<langue>.json`, `src/shop.js` |
| les images | sources dans `_src/` (hors dépôt), `npm run images` ; une seule image : `node scripts/images.mjs <id>` |

## Contrôles

`tools/qa/shop-sim.mjs` joue un client qui achète (filtres, options, panier, livraison, paiement refusé puis accepté, compte) ; `tools/qa/audit.mjs` contrôle erreurs, liens, contrastes, cibles tactiles. Les deux demandent Playwright (`npm i --no-save playwright`).

## Odoo

Le paquet Odoo de la version 6 (`npm run odoo`) n'est **pas** repris : avec une fiche unique par produit, la partie éditoriale doit entrer dans la fiche produit d'Odoo, ce qui reste à concevoir. Le script s'arrête avec un message tant que ce travail n'est pas fait.

## Mise en ligne

Chaque envoi sur la branche `main` reconstruit le site et le publie sur GitHub Pages (`.github/workflows/pages.yml`).
