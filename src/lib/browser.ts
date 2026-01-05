/**
 * Browser detection and Google Translate API availability checking
 */

export function isChrome(): boolean {
  if (typeof window === 'undefined') return false;
  return /Chrome/.test(navigator.userAgent) && /Google Inc/.test(navigator.vendor);
}

export async function checkGoogleTranslateAvailable(): Promise<boolean> {
  if (typeof self === 'undefined') {
    return false;
  }

  if (!('Translator' in self)) {
    return false;
  }

  try {
    // @ts-ignore - Chrome Translator API
    const availability = await self.Translator.availability({
      sourceLanguage: 'ja',
      targetLanguage: 'en',
    });
    return availability !== 'unavailable';
  } catch (error) {
    console.error('Error checking Google Translate availability:', error);
    return false;
  }
}

