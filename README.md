# Carte narrative des provinces d'Afghanistan

Application statique React/Vite pour GitHub Pages.

## Contenu

Les fiches de province sont dans `content/provinces`.

Chaque fichier Markdown contient :

- `code` : code stable de la province, à ne pas modifier
- `title` : titre affiché dans le panneau
- `intro` : courte introduction affichée avant le corps
- `updatedAt` : date informative pour l'éditeur
- le corps Markdown de la fiche

PagesCMS lit la configuration `.pages.yml` et donne une interface visuelle pour éditer ces fichiers.

## Développement local

```bash
npm install
npm run dev
```

Puis ouvrir l'URL affichée par Vite.

## Build

```bash
npm run build
```

Le dossier généré est `dist`.

## Déploiement

La GitHub Action `.github/workflows/deploy.yml` construit le site et publie `dist` sur GitHub Pages à chaque push sur `main`.
