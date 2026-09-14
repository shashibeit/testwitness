import { afterEach } from 'vitest';

afterEach(() => {
  document.body.replaceChildren();
  document.head.querySelectorAll('[data-test-witness-test]').forEach((node) => node.remove());
});
