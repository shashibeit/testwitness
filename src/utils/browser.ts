import type { BrowserMetadata, OperatingSystemMetadata } from '../types/session';

interface UserAgentBrand {
  brand: string;
  version: string;
}

interface UserAgentDataLike {
  brands?: readonly UserAgentBrand[];
  platform?: string;
}

type NavigatorWithUserAgentData = Navigator & {
  userAgentData?: UserAgentDataLike;
};

const UNKNOWN_BROWSER: BrowserMetadata = Object.freeze({ name: 'Unknown', version: 'Unknown' });
const UNKNOWN_OS: OperatingSystemMetadata = Object.freeze({ name: 'Unknown' });

function matchVersion(userAgent: string, expression: RegExp): string | undefined {
  return expression.exec(userAgent)?.[1];
}

function normalizePlatform(platform: string): OperatingSystemMetadata | undefined {
  const normalized = platform.trim().toLowerCase();
  if (!normalized) return undefined;

  if (normalized.includes('win')) return { name: 'Windows' };
  if (normalized.includes('mac')) return { name: 'macOS' };
  if (normalized.includes('ios') || normalized.includes('iphone') || normalized.includes('ipad')) {
    return { name: 'iOS' };
  }
  if (normalized.includes('android')) return { name: 'Android' };
  if (normalized.includes('chrome os') || normalized.includes('cros')) return { name: 'Chrome OS' };
  if (normalized.includes('linux')) return { name: 'Linux' };

  return { name: platform.trim() };
}

/** Detects the browser using Client Hints when present and the UA as fallback. */
export function detectBrowser(navigatorValue?: Navigator): BrowserMetadata {
  if (!navigatorValue) return { ...UNKNOWN_BROWSER };

  const navigatorWithHints = navigatorValue as NavigatorWithUserAgentData;
  const brands = navigatorWithHints.userAgentData?.brands ?? [];
  const edgeBrand = brands.find((entry) => /Microsoft Edge/i.test(entry.brand));
  if (edgeBrand) return { name: 'Microsoft Edge', version: edgeBrand.version };

  const chromeBrand = brands.find((entry) => /Google Chrome/i.test(entry.brand));
  if (chromeBrand) return { name: 'Chrome', version: chromeBrand.version };

  const userAgent = navigatorValue.userAgent ?? '';
  const edgeVersion = matchVersion(userAgent, /Edg(?:A|iOS)?\/([\d.]+)/i);
  if (edgeVersion) return { name: 'Microsoft Edge', version: edgeVersion };

  const firefoxVersion = matchVersion(userAgent, /Firefox\/([\d.]+)/i);
  if (firefoxVersion) return { name: 'Firefox', version: firefoxVersion };

  const chromeVersion = matchVersion(userAgent, /(?:Chrome|CriOS)\/([\d.]+)/i);
  if (chromeVersion) return { name: 'Chrome', version: chromeVersion };

  const safariVersion =
    /Safari\//i.test(userAgent) && !/(?:Chrome|CriOS|Chromium|Edg)\//i.test(userAgent)
      ? matchVersion(userAgent, /Version\/([\d.]+)/i)
      : undefined;
  if (safariVersion) return { name: 'Safari', version: safariVersion };

  return { ...UNKNOWN_BROWSER };
}

/** Detects an operating system without assuming Client Hints support. */
export function detectOperatingSystem(navigatorValue?: Navigator): OperatingSystemMetadata {
  if (!navigatorValue) return { ...UNKNOWN_OS };

  const navigatorWithHints = navigatorValue as NavigatorWithUserAgentData;
  const hintedPlatform = navigatorWithHints.userAgentData?.platform;
  if (hintedPlatform) return normalizePlatform(hintedPlatform) ?? { ...UNKNOWN_OS };

  const userAgent = navigatorValue.userAgent ?? '';
  const windowsVersion = matchVersion(userAgent, /Windows NT ([\d.]+)/i);
  if (windowsVersion) return { name: 'Windows', version: windowsVersion };

  const iosVersion = matchVersion(userAgent, /(?:iPhone OS|CPU(?: iPhone)? OS) ([\d_]+)/i);
  if (iosVersion) return { name: 'iOS', version: iosVersion.replace(/_/g, '.') };

  const androidVersion = matchVersion(userAgent, /Android ([\d.]+)/i);
  if (androidVersion) return { name: 'Android', version: androidVersion };

  const macVersion = matchVersion(userAgent, /Mac OS X ([\d_]+)/i);
  if (macVersion) return { name: 'macOS', version: macVersion.replace(/_/g, '.') };

  if (/CrOS/i.test(userAgent)) return { name: 'Chrome OS' };
  if (/Linux/i.test(userAgent)) return { name: 'Linux' };

  return normalizePlatform(navigatorValue.platform) ?? { ...UNKNOWN_OS };
}

export interface BrowserCapabilities {
  displayMedia: boolean;
  mediaRecorder: boolean;
}

/** Feature detection used for user-facing media support messages. */
export function detectBrowserCapabilities(navigatorValue?: Navigator): BrowserCapabilities {
  return {
    displayMedia: typeof navigatorValue?.mediaDevices?.getDisplayMedia === 'function',
    mediaRecorder: typeof globalThis.MediaRecorder === 'function',
  };
}
