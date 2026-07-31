// Deep-import each brand's Color component directly. The package barrel
// (`@lobehub/icons`) re-exports an IconCombine feature that pulls in
// `@lobehub/ui`, which we don't install — importing the leaf components avoids
// that dependency entirely.
import Gemma from '@lobehub/icons/es/Gemma/components/Color';
import Qwen from '@lobehub/icons/es/Qwen/components/Color';
import Google from '@lobehub/icons/es/Google/components/Color';
import Mistral from '@lobehub/icons/es/Mistral/components/Color';
import DeepSeek from '@lobehub/icons/es/DeepSeek/components/Color';
import Meta from '@lobehub/icons/es/Meta/components/Color';
import Microsoft from '@lobehub/icons/es/Microsoft/components/Color';
import HuggingFace from '@lobehub/icons/es/HuggingFace/components/Color';

interface ModelBrandIconProps {
    // Raw model id/name (e.g. "gemma3-1b", "qwen2.5-vl").
    name: string;
    size?: number;
}

// Map a model name to its provider's brand icon. Falls back to a neutral cube
// mark for anything we don't recognize.
export default function ModelBrandIcon({ name, size = 14 }: ModelBrandIconProps) {
    const n = (name || '').toLowerCase();

    let Icon: any = null;
    if (n.includes('gemma')) Icon = Gemma;
    else if (n.includes('qwen')) Icon = Qwen;
    else if (n.includes('gemini') || n.includes('google')) Icon = Google;
    else if (n.includes('mixtral') || n.includes('mistral') || n.includes('ministral')) Icon = Mistral;
    else if (n.includes('deepseek')) Icon = DeepSeek;
    else if (n.includes('llama') || n.includes('meta')) Icon = Meta;
    else if (n.includes('phi')) Icon = Microsoft;
    else if (n.includes('smol') || n.includes('hf')) Icon = HuggingFace;

    if (Icon) {
        return <Icon size={size} />;
    }

    // Neutral fallback — the generic model cube.
    return (
        <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className="flex-shrink-0" style={{ color: 'var(--sl-text-faint)' }}>
            <path d="M2 4l6-2.5L14 4v8l-6 2.5L2 12V4z" stroke="currentColor" strokeWidth="0.75" fill="none" />
            <path d="M8 6.5v8" stroke="currentColor" strokeWidth="0.5" />
            <path d="M2 4l6 2.5L14 4" stroke="currentColor" strokeWidth="0.5" fill="none" />
        </svg>
    );
}
