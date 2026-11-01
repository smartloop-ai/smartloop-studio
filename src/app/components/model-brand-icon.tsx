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
// Cloud-served brands. OpenAI and xAI ship monochrome marks only.
import Minimax from '@lobehub/icons/es/Minimax/components/Color';
import Claude from '@lobehub/icons/es/Claude/components/Color';
import Kimi from '@lobehub/icons/es/Kimi/components/Color';
import Zhipu from '@lobehub/icons/es/Zhipu/components/Color';
import OpenAI from '@lobehub/icons/es/OpenAI/components/Mono';
import Grok from '@lobehub/icons/es/Grok/components/Mono';

interface ModelBrandIconProps {
    // Raw model id/name (e.g. "gemma3-1b", "qwen2.5-vl").
    name: string;
    size?: number;
}

// Friendly maker/vendor name for a model, so non-technical users recognize the
// brand behind a cryptic model id (e.g. "qwen2.5-vl" → "Alibaba"). Returns null
// when we don't recognize the family, so callers can hide the label.
export function brandName(name: string): string | null {
    const n = (name || '').toLowerCase();
    if (n.includes('gemma') || n.includes('gemini') || n.includes('google')) return 'Google';
    if (n.includes('qwen')) return 'Alibaba';
    if (n.includes('mixtral') || n.includes('mistral') || n.includes('ministral')) return 'Mistral AI';
    if (n.includes('deepseek')) return 'DeepSeek';
    if (n.includes('llama') || n.includes('meta')) return 'Meta';
    if (n.includes('phi')) return 'Microsoft';
    if (n.includes('smol') || n.includes('hf')) return 'Hugging Face';
    if (n.includes('minimax')) return 'MiniMax';
    if (n.includes('claude') || n.includes('anthropic')) return 'Anthropic';
    if (n.includes('kimi') || n.includes('moonshot')) return 'Moonshot AI';
    if (n.includes('glm') || n.includes('zhipu')) return 'Zhipu AI';
    if (n.includes('gpt') || n.includes('openai') || /\bo[1-9]\b/.test(n)) return 'OpenAI';
    if (n.includes('grok') || n.includes('xai')) return 'xAI';
    return null;
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
    else if (n.includes('minimax')) Icon = Minimax;
    else if (n.includes('claude') || n.includes('anthropic')) Icon = Claude;
    else if (n.includes('kimi') || n.includes('moonshot')) Icon = Kimi;
    else if (n.includes('glm') || n.includes('zhipu')) Icon = Zhipu;
    else if (n.includes('gpt') || n.includes('openai') || /\bo[1-9]\b/.test(n)) Icon = OpenAI;
    else if (n.includes('grok') || n.includes('xai')) Icon = Grok;

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
