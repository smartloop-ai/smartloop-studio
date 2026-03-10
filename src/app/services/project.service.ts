import { getLocalApiEndpoint } from "@/app/constants";
import { storageService } from "./storage.service";

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

    const localBase = await getLocalApiEndpoint();
    const body: any = { name: name.trim(), description: '', system };
    if (model_name) body.model_name = model_name;

    const response = await fetch(`${localBase}/v1/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (response.status === 200 || response.status === 201) {
      const project = await response.json();

      // Save UI metadata to local SQLite
      await storageService.upsertProject({
        id: project.id,
        name: project.name,
        color,
        system,
      });

      return { success: true, data: { ...project, color } };
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

    const response = await fetch(`${localBase}/v1/projects/${projectId}`, { method: 'DELETE' });

    if (response.status === 200 || response.status === 204) {
      // Delete all local conversations (and their messages via cascade) for this project
      await storageService.deleteConversationsByProject(projectId);
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
      return { ...p, color: meta?.color || null };
    });
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

    const response = await fetch(`${localBase}/v1/projects/${projectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });

    if (response.status === 200) {
      const project = await response.json();

      // Update local UI metadata
      const metaUpdates: any = {};
      if (updates.name) metaUpdates.name = updates.name;
      if (updates.color !== undefined) metaUpdates.color = updates.color;
      if (Object.keys(metaUpdates).length > 0) {
        await storageService.updateProjectMeta(projectId, metaUpdates);
      }

      return { success: true, data: { ...project, color: updates.color ?? project.color } };
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
