import { getLocalApiEndpoint } from "@/app/constants";

/**
 * Project Service
 * Handles project CRUD against the local SLP service
 */

interface CreateProjectParams {
  title: string;
  temperature?: number;
  color?: string;
  system?: boolean;
}

interface ProjectServiceResponse {
  success: boolean;
  data?: any;
  error?: string;
}

/**
 * Create a new project
 * Local API uses `name` field instead of `title`
 */
const createProject = async (params: CreateProjectParams): Promise<ProjectServiceResponse> => {
  try {
    const { title, temperature = 0.3, color, system = false } = params;

    if (!title || !title.trim()) {
      return {
        success: false,
        error: 'Project title is required'
      };
    }

    const requestBody: any = {
      name: title.trim(),
      description: '',
      temperature,
      system
    };

    if (color) {
      requestBody.color = color;
    }

    const localBase = await getLocalApiEndpoint();
    const url = `${localBase}/v1/projects`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    if (response.status === 200 || response.status === 201) {
      const project = await response.json();
      return { success: true, data: project };
    }

    const errorData = await response.json().catch(() => ({}));
    return {
      success: false,
      error: errorData.detail || errorData.message || 'Failed to create project'
    };
  } catch (error: any) {
    console.error('Error creating project:', error);
    return {
      success: false,
      error: error.message || 'An error occurred while creating the project'
    };
  }
};

/**
 * Delete a project
 */
const deleteProject = async (projectId: string): Promise<ProjectServiceResponse> => {
  try {
    if (!projectId) {
      return { success: false, error: 'Project ID is required' };
    }

    const localBase = await getLocalApiEndpoint();
    const url = `${localBase}/v1/projects/${projectId}`;
    const response = await fetch(url, { method: 'DELETE' });

    if (response.status === 200 || response.status === 204) {
      return { success: true, data: { projectId } };
    }

    const errorData = await response.json().catch(() => ({}));
    return {
      success: false,
      error: errorData.detail || errorData.message || 'Failed to delete project'
    };
  } catch (error: any) {
    console.error('Error deleting project:', error);
    return {
      success: false,
      error: error.message || 'An error occurred while deleting the project'
    };
  }
};

/**
 * Get all projects from local service
 */
const getProjects = async (): Promise<ProjectServiceResponse> => {
  try {
    const localBase = await getLocalApiEndpoint();
    const url = `${localBase}/v1/projects`;
    const response = await fetch(url);

    if (response.ok) {
      const projects = await response.json();
      return { success: true, data: projects };
    }

    const errorData = await response.json().catch(() => ({}));
    return {
      success: false,
      error: errorData.detail || errorData.message || 'Failed to fetch projects'
    };
  } catch (error: any) {
    console.error('Error fetching projects:', error);
    return {
      success: false,
      error: error.message || 'An error occurred while fetching projects'
    };
  }
};

/**
 * Update project details
 */
const updateProject = async (projectId: string, updates: Partial<CreateProjectParams>): Promise<ProjectServiceResponse> => {
  try {
    if (!projectId) {
      return { success: false, error: 'Project ID is required' };
    }

    // Map title to name for local API
    const body: any = { ...updates };
    if (body.title) {
      body.name = body.title;
      delete body.title;
    }

    const localBase = await getLocalApiEndpoint();
    const url = `${localBase}/v1/projects/${projectId}`;
    const response = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (response.status === 200) {
      const project = await response.json();
      return { success: true, data: project };
    }

    const errorData = await response.json().catch(() => ({}));
    return {
      success: false,
      error: errorData.detail || errorData.message || 'Failed to update project'
    };
  } catch (error: any) {
    console.error('Error updating project:', error);
    return {
      success: false,
      error: error.message || 'An error occurred while updating the project'
    };
  }
};

export const projectService = {
  createProject,
  deleteProject,
  getProjects,
  updateProject
};
