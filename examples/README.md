# TestWitness examples

> Every test has a story. Capture the proof.

Use the [framework quick-start guide](./QUICK_START.md) to run and integrate each example.

| Example                                                 | Integration style                                                |
| ------------------------------------------------------- | ---------------------------------------------------------------- |
| [React](./react/)                                       | npm import with one root provider                                |
| [Angular](./angular/)                                   | npm import with one root-scoped injectable service               |
| [Vue](./vue/)                                           | npm import with one application-level provider                   |
| [Plain HTML and JavaScript](./vanilla/)                 | Browser IIFE through `window.TestWitness`                        |
| [AngularJS](./angularjs/)                               | Browser IIFE wrapped by an AngularJS service                     |
| [FreeMarker/FTL](./freemarker/)                         | Browser IIFE plus safely escaped server-rendered data attributes |
| [Angular integration snippets](./angular-instructions/) | SSR-aware service and standalone component snippets              |

All runnable applications use only sample data. Generated evidence remains in browser memory until
it is downloaded or the SDK instance is destroyed.
