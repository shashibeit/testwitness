# FreeMarker / FTL integration

> TestWitness — Every test has a story. Capture the proof.

1. Build TestWitness and deploy `dist/testwitness.min.js` as
   `/assets/vendor/testwitness.min.js` (or update the fixed path in the template).
2. Deploy `test-witness-example.js` as `/assets/test-witness-example.js`.
3. Render `test-witness.ftl` through the application and test from HTTPS or localhost, which browser
   media-capture APIs require.

The template declares HTML output format and auto-escaping. Server values are written to `data-*`
attributes and read through `element.dataset`; none are inserted into executable JavaScript. This is
safer than constructing an inline JavaScript object with `${...}`. In a legacy FTL configuration that
cannot enable auto-escaping, apply `?html` to every attribute value and never use `?no_esc` for these
values.

The two fixed external script tags also fit a stricter Content Security Policy without `unsafe-inline`.
Allow the application's own script origin, `blob:` downloads, and the image/media sources needed by
the page being captured. Browser tab recording always shows the browser's native permission picker;
the library cannot and does not bypass it.
