import { readFile } from 'node:fs/promises';

const reactStylesUrl = new URL('../../react/src/styles.css', import.meta.url);
const vanillaStylesUrl = new URL('../styles.css', import.meta.url);

const [reactStyles, vanillaStyles] = await Promise.all([
  readFile(reactStylesUrl, 'utf8'),
  readFile(vanillaStylesUrl, 'utf8'),
]);

if (reactStyles !== vanillaStyles) {
  throw new Error(
    'The vanilla and React Operations Portal styles have diverged. Keep both demos visually aligned.',
  );
}

console.log('React and vanilla Operations Portal styles are identical.');
