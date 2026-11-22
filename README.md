# doux: portfolio site

Source for my portfolio, live at **[jordanlowjunyi.github.io/Jordan](https://jordanlowjunyi.github.io/Jordan/)**.

Built with React, TypeScript, Vite, Tailwind CSS and GSAP. All page text (projects, publications, awards, experience) lives in [`src/content/siteContent.tsx`](src/content/siteContent.tsx), so updating the site never means touching layout code.

## Run locally

```bash
npm install
npm run dev
```

## Deploy

```bash
npm run deploy
```

This builds and publishes to two GitHub Pages targets:

- `deploy:doux` builds with the default base path and pushes `dist` to this repo's `gh-pages` branch.
- `deploy:jordan` builds with `VITE_BASE=/Jordan/` and pushes to [JordanLowJunYi/Jordan](https://github.com/JordanLowJunYi/Jordan), which serves the public URL above.
