// Global settings interface
export interface SmartLoopSettings {
    // AI Model Settings
    temperature: number;
    maxTokens: number;
    model: string;

    // Memory Settings
    memoryEnabled: boolean;
    memoryContextLength: number;

    // Response Settings
    streamingEnabled: boolean;
    codeHighlighting: boolean;

    // Privacy Settings
    dataRetention: boolean;
    analyticsEnabled: boolean;

    // Language & Region
    language: string;
    timezone: string;
}

// Default settings
export const DEFAULT_SETTINGS: SmartLoopSettings = {
    temperature: 0.7,
    maxTokens: 2000,
    model: 'gpt-4',
    memoryEnabled: true,
    memoryContextLength: 10,
    streamingEnabled: true,
    codeHighlighting: true,
    dataRetention: true,
    analyticsEnabled: true,
    language: 'en',
    timezone: 'UTC',
};

// Get settings from localStorage
export function getSettings(): SmartLoopSettings {
    if (typeof window === 'undefined') {
        return DEFAULT_SETTINGS;
    }

    try {
        const savedSettings = localStorage.getItem('smartloop_settings');
        if (savedSettings) {
            return { ...DEFAULT_SETTINGS, ...JSON.parse(savedSettings) };
        }
    } catch (e) {
        console.error('Failed to load settings:', e);
    }

    return DEFAULT_SETTINGS;
}

// Save settings to localStorage
export function saveSettings(settings: SmartLoopSettings): void {
    if (typeof window === 'undefined') return;

    try {
        localStorage.setItem('smartloop_settings', JSON.stringify(settings));
    } catch (e) {
        console.error('Failed to save settings:', e);
    }
}

// Get specific setting value
export function getSetting<K extends keyof SmartLoopSettings>(
    key: K
): SmartLoopSettings[K] {
    const settings = getSettings();
    return settings[key];
}

// Update specific setting
export function updateSetting<K extends keyof SmartLoopSettings>(
    key: K,
    value: SmartLoopSettings[K]
): void {
    const settings = getSettings();
    settings[key] = value;
    saveSettings(settings);
}

// Reset to defaults
export function resetSettings(): void {
    saveSettings(DEFAULT_SETTINGS);
}

// Get settings for API calls (simplified format)
export function getAPISettings() {
    const settings = getSettings();
    return {
        temperature: settings.temperature,
        max_tokens: settings.maxTokens,
        model: settings.model,
        stream: settings.streamingEnabled,
    };
}
