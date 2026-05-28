import { getLocalApiEndpoint } from "@/app/constants";
import { storageService } from "./storage.service";
import { documentService } from "./document.service";

/**
 * Project Service
 * API is the source of truth for project data (id, name, description, model_name, current, system).
 * Local SQLite stores UI-only metadata (color).
 */

interface CreateProjectParams {
  name: string;
  color?: string;
  system?: boolean;
  model_name?: string;
  folder_path?: string;
}

interface ProjectServiceResponse {
  success: boolean;
  data?: any;
  error?: string;
}

/**
 * Create a new project in the local API, then save UI metadata to SQLite.
 */
const createProject = async (params: CreateProjectParams): Promise<ProjectServiceResponse> => {
  try {
    const { name, color, system = false, model_name } = params;

    if (!name || !name.trim()) {
      return { success: false, error: 'Project name is required' };
    }

    const trimmedName = name.trim();
    const slug = trimmedName.toLowerCase().replace(/\s+/g, '_');

    const localBase = await getLocalApiEndpoint();
    const body: any = { name: slug, description: '', system };
    if (model_name) body.model_name = model_name;

    const response = await fetch(`${localBase}/v1/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (response.status === 200 || response.status === 201) {
      const project = await response.json();
      const folderPath = project.cwd || params.folder_path;

      // Save UI metadata to local SQLite (preserve display name)
      await storageService.upsertProject({
        id: project.id,
        name: trimmedName,
        color,
        system,
        folder_path: folderPath,
      });

      // Auto-register a local MCP server for the new project
      await storageService.addMcpServer({
        id: `mcp_local_${project.id}`,
        project_id: project.id,
        name: slug,
        server_type: 'local',
        config: { name: slug },
      });

      return { success: true, data: { ...project, name: trimmedName, color, folder_path: folderPath } };
    }

    const errorData = await response.json().catch(() => ({}));
    return { success: false, error: errorData.detail || errorData.message || 'Failed to create project' };
  } catch (error: any) {
    console.error('Error creating project:', error);
    return { success: false, error: error.message || 'An error occurred while creating the project' };
  }
};

/**
 * Delete a project from the local API and remove UI metadata from SQLite.
 */
const deleteProject = async (projectId: string): Promise<ProjectServiceResponse> => {
  try {
    if (!projectId) {
      return { success: false, error: 'Project ID is required' };
    }

    const localBase = await getLocalApiEndpoint();
    if (!localBase) return { success: false, error: 'Local API service is not ready' };

    // Delete documents from the local API before deleting the project
    try {
      const docsResult = await documentService.getLocalDocuments(projectId);
      if (docsResult.success && Array.isArray(docsResult.data)) {
        for (const doc of docsResult.data) {
          if (doc.id) {
            await documentService.deleteLocalDocument(projectId, doc.id);
          }
        }
      }
    } catch (e) {
      console.warn('Error cleaning up documents during project deletion:', e);
    }

    const response = await fetch(`${localBase}/v1/projects/${projectId}`, { method: 'DELETE' });

    if (response.status === 200 || response.status === 204) {
      // Delete all local SQLite data for this project
      await storageService.deleteConversationsByProject(projectId);
      await storageService.deleteMcpServersByProject(projectId);
      await storageService.deleteDocumentStatusByProject(projectId);
      await storageService.deleteFoldersByProject(projectId);
      await storageService.deleteProjectMeta(projectId);

      return { success: true, data: { projectId } };
    }

    const errorData = await response.json().catch(() => ({}));
    return { success: false, error: errorData.detail || errorData.message || 'Failed to delete project' };
  } catch (error: any) {
    console.error('Error deleting project:', error);
    return { success: false, error: error.message || 'An error occurred while deleting the project' };
  }
};

/**
 * Get all projects from local API, enriched with UI metadata from SQLite.
 * Returns the enriched array directly, or an empty array on failure.
 */
const getProjects = async (): Promise<any[]> => {
  try {
    const localBase = await getLocalApiEndpoint();
    if (!localBase) return [];

    const response = await fetch(`${localBase}/v1/projects`);
    if (!response.ok) return [];

    const data = await response.json();

    // API may return a raw array or { projects: [...] }
    const projects = Array.isArray(data) ? data : (Array.isArray(data?.projects) ? data.projects : []);

    // Enrich with local UI metadata (color)
    const localMeta = await storageService.getAllProjectMeta();
    const metaMap = new Map(localMeta.map((m: any) => [m.id, m]));

    const enriched = projects.map((p: any) => {
      const meta = metaMap.get(p.id);
      const folderPath = p.cwd || meta?.folder_path || null;
      return { ...p, name: meta?.name || p.name, color: meta?.color || null, folder_path: folderPath };
    });

    // Persist folder_path from API response if missing in SQLite
    for (const p of enriched) {
      if (p.folder_path && !metaMap.get(p.id)?.folder_path) {
        await storageService.updateProjectMeta(p.id, { folder_path: p.folder_path });
      }
    }

    return enriched;
  } catch (error: any) {
    console.error('Error fetching projects:', error);
    return [];
  }
};

/**
 * Update a project in the local API and sync UI metadata to SQLite.
 */
const updateProject = async (projectId: string, updates: Partial<CreateProjectParams>): Promise<ProjectServiceResponse> => {
  try {
    if (!projectId) {
      return { success: false, error: 'Project ID is required' };
    }

    const localBase = await getLocalApiEndpoint();
    if (!localBase) return { success: false, error: 'Local API service is not ready' };

    const trimmedName = updates.name?.trim();
    const apiUpdates = { ...updates };
    if (trimmedName) {
      apiUpdates.name = trimmedName.toLowerCase().replace(/\s+/g, '_');
    }

    const response = await fetch(`${localBase}/v1/projects/${projectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(apiUpdates)
    });

    if (response.status === 200) {
      const project = await response.json();

      // Update local UI metadata (preserve display name)
      const metaUpdates: any = {};
      if (trimmedName) metaUpdates.name = trimmedName;
      if (updates.color !== undefined) metaUpdates.color = updates.color;
      if (project.cwd) metaUpdates.folder_path = project.cwd;
      if (Object.keys(metaUpdates).length > 0) {
        await storageService.updateProjectMeta(projectId, metaUpdates);
      }

      return { success: true, data: { ...project, name: trimmedName || project.name, color: updates.color ?? project.color, folder_path: project.cwd } };
    }

    const errorData = await response.json().catch(() => ({}));
    return { success: false, error: errorData.detail || errorData.message || 'Failed to update project' };
  } catch (error: any) {
    console.error('Error updating project:', error);
    return { success: false, error: error.message || 'An error occurred while updating the project' };
  }
};

export const projectService = {
  createProject,
  deleteProject,
  getProjects,
  updateProject
};
