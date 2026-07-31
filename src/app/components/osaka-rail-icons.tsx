// Terminal/glyph-style variants of the right-sidebar rail icons, shown when the
// Osaka Jade theme is active. All use currentColor so they inherit the rail's
// muted / brand-active states like the vector icons they replace.
interface OsakaRailIconProps {
    name: 'models' | 'documents' | 'mcp' | 'skills' | 'settings';
    size?: number;
}

export default function OsakaRailIcon({ name, size = 18 }: OsakaRailIconProps) {
    const common = {
        width: size,
        height: size,
        viewBox: '0 0 16 16',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1,
        strokeLinecap: 'round' as const,
        strokeLinejoin: 'round' as const,
        className: 'flex-shrink-0',
    };

    switch (name) {
        case 'models':
            // CPU chip.
            return (
                <svg {...common}>
                    <rect x="5" y="5" width="6" height="6" rx="0.5" />
                    <path d="M6.5 5V3M9.5 5V3M6.5 13v-2M9.5 13v-2M5 6.5H3M5 9.5H3M13 6.5h-2M13 9.5h-2" />
                    <rect x="7.2" y="7.2" width="1.6" height="1.6" fill="currentColor" stroke="none" />
                </svg>
            );
        case 'documents':
            // File with text lines.
            return (
                <svg {...common}>
                    <rect x="4" y="2.5" width="8" height="11" rx="0.5" />
                    <path d="M6 5.5h4M6 8h4M6 10.5h2.5" />
                </svg>
            );
        case 'mcp':
            // Node graph — a connection.
            return (
                <svg {...common}>
                    <circle cx="4" cy="5" r="1.5" />
                    <circle cx="12" cy="5" r="1.5" />
                    <circle cx="8" cy="11.5" r="1.5" />
                    <path d="M5.3 5.7l1.6 4.6M10.7 5.7l-1.6 4.6M5.4 5h5.2" />
                </svg>
            );
        case 'skills':
            // Terminal prompt: >_
            return (
                <svg {...common}>
                    <path d="M3.5 4.5L7 8l-3.5 3.5" strokeWidth="1.4" />
                    <rect x="8.5" y="10.4" width="4.5" height="1.6" rx="0.4" fill="currentColor" stroke="none" />
                </svg>
            );
        case 'settings':
            // Gear.
            return (
                <svg {...common}>
                    <circle cx="8" cy="8" r="2.3" />
                    <path d="M8 2.6V4M8 12v1.4M2.6 8H4M12 8h1.4M4.3 4.3l1 1M10.7 10.7l1 1M11.7 4.3l-1 1M5.3 10.7l-1 1" />
                </svg>
            );
        default:
            return null;
    }
}
