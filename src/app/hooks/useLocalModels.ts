import { useModelStatus } from '../contexts/ModelStatusContext';

// Reader for the auxiliary-model slice of ModelStatusContext.
//
// The state deliberately does NOT live here: the Models panel is rendered
// conditionally in the right sidebar, so a hook instance is destroyed every time
// the user switches rail sections. Owning download state in the provider (and in
// the main process behind it) is what lets a download survive that.
export function useLocalModels() {
    const {
        localModels,
        localModelsLoading,
        downloads,
        isDownloading,
        enabledModels,
        isEnabled,
        fetchLocalModels,
        handleToggleModel,
        handleCancelDownload,
    } = useModelStatus();

    return {
        localModels,
        localModelsLoading,
        downloads,
        isDownloading,
        enabledModels,
        isEnabled,
        fetchLocalModels,
        handleToggleModel,
        handleCancelDownload,
    };
}
