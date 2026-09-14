let fallbackSequence = 0;

/**
 * Creates a collision-resistant identifier without requiring a specific browser
 * crypto implementation. The fallback is intended for older test/browser
 * environments only; evidence identifiers are not security credentials.
 */
export function createId(prefix = 'tw'): string {
  const cryptoApi = globalThis.crypto;

  if (typeof cryptoApi?.randomUUID === 'function') {
    return `${prefix}-${cryptoApi.randomUUID()}`;
  }

  if (typeof cryptoApi?.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    cryptoApi.getRandomValues(bytes);
    const randomPart = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    return `${prefix}-${randomPart}`;
  }

  fallbackSequence += 1;
  return `${prefix}-${Date.now().toString(36)}-${fallbackSequence.toString(36)}`;
}

/** Creates an identifier for a TestWitness session. */
export function createSessionId(): string {
  return createId('session');
}
