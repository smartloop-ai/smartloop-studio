import { useThemeContext } from '@/app/contexts/ThemeContext';
import { RailIconName } from '@/app/theme/themes';

/**
 * A theme's own artwork for a rail section, injected as raw SVG and forced to
 * the requested box. Shared by the rail itself and by the panels that repeat
 * their section's glyph on cards and empty states, so a theme only has to
 * declare each icon once.
 */
export function ThemeRailIcon({ svg, size = 18 }: { svg: string; size?: number }) {
  return (
    <span
      className="flex-shrink-0 inline-flex items-center justify-center [&>svg]:w-full [&>svg]:h-full"
      style={{ width: size, height: size }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

/**
 * The active theme's glyph for a section, or `null` when it ships none — the
 * caller supplies its own default. A hook rather than a component so a caller
 * can branch on "does this theme have one" before laying out around it.
 */
export function useThemeIcon() {
  const { theme } = useThemeContext();
  return (name: RailIconName, size = 18) => {
    const svg = theme.icons?.[name];
    return svg ? <ThemeRailIcon svg={svg} size={size} /> : null;
  };
}
