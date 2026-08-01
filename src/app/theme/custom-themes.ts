import type { ThemeDefinition } from './themes';
import { storageService } from '@/app/services/storage.service';

// Parsing/derivation lives in theme-parse.ts and is shared with the shipped
// YAML presets. Re-exported here so existing importers keep working.
export { parseThemeYaml, deriveThemeColors, isHexColor } from './theme-parse';

export const isCustomThemeId = (id: string) => id.startsWith('custom-');

// ── Persistence (electron-store via storageService) ─────────────────────────
const STORAGE_KEY = 'custom_themes';

export async function loadCustomThemes(): Promise<ThemeDefinition[]> {
  try {
    const raw = await storageService.getItem(STORAGE_KEY);
    if (!raw) return [];
    const list = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export async function saveCustomThemes(list: ThemeDefinition[]): Promise<void> {
  await storageService.setItem(STORAGE_KEY, JSON.stringify(list));
}
