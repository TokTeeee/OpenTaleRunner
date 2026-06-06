import { useSettingsStore } from '../stores/settingsStore';
import { getLocalizedName } from '../services/i18n/locales';
import type { LanguageCode, LocalizationData } from '../services/i18n/locales';

export function useLocalization() {
  const language = useSettingsStore((s) => s.language) as LanguageCode;

  const t = (key: string, type: keyof LocalizationData) => getLocalizedName(key, type, language);

  return { t, language };
}

// Helper function to localize location names in place descriptions
export function localizeLocationInfo(
  location: { region?: string; subRegion?: string; coordinates?: { x: number; z: number } },
  language: LanguageCode
): string {
  const parts: string[] = [];

  if (location.region) {
    parts.push(getLocalizedName(location.region, 'regions', language));
  }

  if (location.subRegion) {
    parts.push(getLocalizedName(location.subRegion, 'locations', language));
  }

  if (location.coordinates) {
    parts.push(`(${location.coordinates.x}, ${location.coordinates.z})`);
  }

  return parts.join(' - ');
}
