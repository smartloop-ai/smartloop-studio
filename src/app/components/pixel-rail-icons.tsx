// Blocky, pixel-art variants of the right-sidebar rail icons, shown when the
// Minecraft theme is active. All use currentColor so they inherit the rail's
// muted / brand-active states like the vector icons they replace.
interface PixelRailIconProps {
    name: 'logs' | 'models' | 'documents' | 'mcp' | 'skills' | 'settings';
    size?: number;
}

export default function PixelRailIcon({ name, size = 18 }: PixelRailIconProps) {
    const common = { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', className: 'mc-pixel flex-shrink-0' };

    switch (name) {
        case 'logs':
            // A written log: entries stacked down the page.
            return (
                <svg {...common}>
                    <rect x="2" y="3" width="2" height="2" fill="currentColor" />
                    <rect x="6" y="3" width="8" height="2" fill="currentColor" />
                    <rect x="2" y="7" width="2" height="2" fill="currentColor" />
                    <rect x="6" y="7" width="8" height="2" fill="currentColor" />
                    <rect x="2" y="11" width="2" height="2" fill="currentColor" />
                    <rect x="6" y="11" width="5" height="2" fill="currentColor" />
                </svg>
            );
        case 'models':
            // Grass block: bright top, dirt body.
            return (
                <svg {...common}>
                    <rect x="3" y="3" width="10" height="3" fill="currentColor" />
                    <rect x="3" y="6" width="10" height="7" fill="currentColor" opacity="0.5" />
                </svg>
            );
        case 'documents':
            // Blocky page with text lines.
            return (
                <svg {...common}>
                    <rect x="4" y="2" width="8" height="12" fill="currentColor" opacity="0.5" />
                    <rect x="5" y="4" width="6" height="1" fill="currentColor" />
                    <rect x="5" y="6" width="6" height="1" fill="currentColor" />
                    <rect x="5" y="8" width="6" height="1" fill="currentColor" />
                    <rect x="5" y="10" width="4" height="1" fill="currentColor" />
                </svg>
            );
        case 'mcp':
            // Two blocks linked — a connection.
            return (
                <svg {...common}>
                    <rect x="2" y="6" width="4" height="4" fill="currentColor" />
                    <rect x="10" y="6" width="4" height="4" fill="currentColor" />
                    <rect x="6" y="7" width="4" height="2" fill="currentColor" opacity="0.6" />
                </svg>
            );
        case 'skills':
            // Minecraft-style diagonal sword.
            return (
                <svg {...common}>
                    <rect x="9" y="2" width="4" height="2" fill="currentColor" />
                    <rect x="8" y="4" width="2" height="2" fill="currentColor" />
                    <rect x="6" y="6" width="2" height="2" fill="currentColor" />
                    <rect x="4" y="8" width="3" height="3" fill="currentColor" opacity="0.6" />
                    <rect x="2" y="11" width="2" height="2" fill="currentColor" />
                </svg>
            );
        case 'settings':
            // Blocky gear/cross.
            return (
                <svg {...common}>
                    <rect x="6" y="2" width="4" height="12" fill="currentColor" opacity="0.5" />
                    <rect x="2" y="6" width="12" height="4" fill="currentColor" opacity="0.5" />
                    <rect x="6" y="6" width="4" height="4" fill="currentColor" />
                </svg>
            );
        default:
            return null;
    }
}
