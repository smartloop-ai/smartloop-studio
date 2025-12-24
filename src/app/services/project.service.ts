import { API_ENDPOINT } from "@/app/constants";
import { userService } from "./user.service";

/**
 * Project Service
 * Handles project creation, deletion, and related cleanup operations
 */

interface CreateProjectParams {
  title: string;
  temperature?: number;
}

interface ProjectServiceResponse {
  success: boolean;
  data?: any;
  error?: string;
}

/**
 * Create a new project
 * @param params - Project creation parameters (title, temperature)
 * @returns Promise with project data or error
 */
const createProject = async (params: CreateProjectParams): Promise<ProjectServiceResponse> => {
  try {
    const { title, temperature = 0.3 } = params;

    if (!title || !title.trim()) {
      return {
        success: false,
        error: 'Project title is required'
      };
    }

    const url = `${API_ENDPOINT}/projects`;
    const response = await userService.makeAuthenticatedRequest(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        title: title.trim(),
        temperature
      })
    });

    if (!response) {
      return {
        success: false,
        error: 'No response from server'
      };
    }

    if (response.status === 200 || response.status === 201) {
      const project = await response.json();
      return {
        success: true,
        data: project
      };
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
 * Delete a project and clean up associated data
 * @param projectId - ID of the project to delete
 * @param userId - User ID (email) for cleaning up chat history
 * @returns Promise with success status
 */
const deleteProject = async (projectId: string, userId?: string): Promise<ProjectServiceResponse> => {
  try {
    if (!projectId) {
      return {
        success: false,
        error: 'Project ID is required'
      };
    }

    // Delete the project via API
    const url = `${API_ENDPOINT}/projects/${projectId}`;
    const response = await userService.makeAuthenticatedRequest(url, {
      method: 'DELETE'
    });

    if (!response) {
      return {
        success: false,
        error: 'No response from server'
      };
    }

    if (response.status === 200 || response.status === 204) {
      // Clean up local storage data associated with this project
      cleanupProjectData(projectId, userId);

      return {
        success: true,
        data: { projectId }
      };
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
 * Clean up localStorage and sessionStorage data for a deleted project
 * @param projectId - ID of the deleted project
 * @param userId - User ID (email) for identifying chat history keys
 */
const cleanupProjectData = (projectId: string, userId?: string): void => {
  if (typeof window === 'undefined') return;

  try {
    // Clean up chat history from localStorage
    if (userId) {
      const chatKey = `chat_${userId}_${projectId}`;
      localStorage.removeItem(chatKey);
    }

    // Clean up any session storage related to this project
    const sessionKey = `project_session_${projectId}`;
    sessionStorage.removeItem(sessionKey);

    // If we don't have userId, try to find and remove any chat keys with this projectId
    if (!userId) {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.includes(`_${projectId}`)) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key));
    }

    console.log(`Cleaned up data for project: ${projectId}`);
  } catch (error) {
    console.error('Error cleaning up project data:', error);
  }
};

/**
 * Get all projects for the current user
 * @returns Promise with user data containing projects
 */
const getProjects = async (): Promise<ProjectServiceResponse> => {
  try {
    const user = await userService.get();

    if (!user) {
      return {
        success: false,
        error: 'Failed to fetch user data'
      };
    }

    return {
      success: true,
      data: user.projects || []
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
 * @param projectId - ID of the project to update
 * @param updates - Fields to update (title, temperature, etc.)
 * @returns Promise with updated project data
 */
const updateProject = async (projectId: string, updates: Partial<CreateProjectParams>): Promise<ProjectServiceResponse> => {
  try {
    if (!projectId) {
      return {
        success: false,
        error: 'Project ID is required'
      };
    }

    const url = `${API_ENDPOINT}/projects/${projectId}`;
    const response = await userService.makeAuthenticatedRequest(url, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(updates)
    });

    if (!response) {
      return {
        success: false,
        error: 'No response from server'
      };
    }

    if (response.status === 200) {
      const project = await response.json();
      return {
        success: true,
        data: project
      };
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
  updateProject,
  cleanupProjectData
};
