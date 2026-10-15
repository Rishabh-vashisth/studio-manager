# Studio Manager

A manager app for an interior design studio: full client briefs, per-client deliverables, locked dates, quality gates and a portfolio gate.

Plain HTML, CSS and JavaScript. No framework, no runtime dependencies.

## Layout
- `src/logic.js` rules: brief, dates, quality gate, mood, scorecard (unit tested)
- `src/app.js` screens and storage
- `src/style.css`, `src/template.html`
- `scripts/build.js` joins them into `public/index.html`
- `test.js` logic tests, `scripts/smoke.js` browser test (needs `npm i`)

## Run
    npm test
    npm run build
    npx serve public

## Storage
Outside Claude the app saves to the browser's localStorage, on one device only. Team sharing and the "interview the client" feature depend on Claude's artifact runtime and are hidden when it is absent.
