import { getLocalApiEndpoint } from "@/app/constants";
import { storageService } from "./storage.service";

const logout = async () => {
  await storageService.removeItem("token");
  await storageService.removeItem("u");
  await storageService.removeItem("dev_token");
  sessionStorage.clear();
}

const redirectToLogin = async () => {
  await logout();
  if (typeof window !== 'undefined') {
    const isElectron = window.electronAPI?.isElectron;
    if (isElectron) {
      // Use hash navigation for Electron (file:// protocol with HashRouter)
      window.location.hash = '/login';
      window.location.reload();
    } else {
      window.location.href = '/login';
    }
  }
};

const checkTokenExpiration = (response) => {
  // Handle 401 Unauthorized (expired or invalid token)
  if (response.status === 401) {
    console.log('Token expired or invalid (401), clearing session');
    redirectToLogin();
    return true;
  }
  // 403 is NOT a dead session. SLP answers it for a model or a feature the
  // account's plan doesn't cover -- the token is fine and signing in again
  // changes nothing, so clearing the session here logged people out over a
  // plan limit. Every conversation and document call reaches this via
  // makeAuthenticatedRequest, so it was reachable from most of the app.
  return false;
}

const getUser = async () => {
  const localApi = await getLocalApiEndpoint();

  if (!localApi) {
    console.error('UserService: Local API not available');
    return null;
  }

  const options = {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  }

  try {
    let resp = await fetch(`${localApi}/v1/users/me`, options);

    if (checkTokenExpiration(resp)) {
      return null;
    }

    if (resp.status === 200) {
      const result = await resp.json();

      const user = {
        email: result.email,
        name: result.name,
        verified: result.is_verified,
        admin: result.is_superuser,

        is_paid: result.is_paid || false, // Subscription status from API
        is_premium: result.is_premium || false, // Premium status from API

        tokens: result.tokens,
        number_of_tokens_processed: result.number_of_tokens_processed || 0,

        // conversations
        conversations: result.conversations || [],

        // Default settings
        default_temperature: result.default_temperature !== undefined ? result.default_temperature : 0.3,
        default_memory: result.default_memory !== undefined ? result.default_memory : true,
        onboarded: result.onboarded !== undefined ? result.onboarded : false,
      };

      // Save to storageService for persistence
      try {
        const userData = JSON.stringify(user);
        await storageService.setItem("u", userData);
      } catch (e) {
        console.error('Error saving user to storage:', e);
      }
      return Promise.resolve(user);
    } else if (resp.status === 400) {
      console.error("UserService: Bad request (400) - malformed token");
      redirectToLogin();
      return null;
    } else if (resp.status === 404) {
      console.error("UserService: User not found (404) - token valid but user deleted");
      redirectToLogin();
      return null;
    } else if (resp.status >= 500) {
      console.error("UserService: Server error:", resp.status);
      throw new Error("Server error");
    } else {
      console.error("UserService: Invalid response status:", resp.status);
      throw new Error("Invalid login");
    }
  } catch (error) {
    console.error("UserService: Error fetching user:", error);

    // Handle network errors (offline, CORS, connection refused, etc.)
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      console.error("UserService: Network error - unable to reach server");
      // Return null instead of throwing to allow graceful handling
      // The app can continue with cached user data if available
      return null;
    }

    // Handle other errors
    throw error;
  }
};

const makeAuthenticatedRequest = async (url, options = {}) => {
  try {
    const response = await fetch(url, options);

    if (checkTokenExpiration(response)) {
      return;
    }

    return response;
  } catch (error) {
    throw error;
  }
};

// Fetch and store user data via local API proxy
const fetchAndStoreUser = async () => {
  const localApi = await getLocalApiEndpoint();

  if (!localApi) {
    console.error('UserService: Local API not available for fetchAndStoreUser');
    return null;
  }

  try {
    const userResponse = await fetch(`${localApi}/v1/users/me`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (userResponse.ok) {
      const result = await userResponse.json();
      const user = {
        email: result.email,
        name: result.name,
        verified: result.is_verified,
        admin: result.is_superuser,
        is_paid: result.is_paid || false,
        premium: result.is_paid || false,
        tokens: result.tokens,
        number_of_tokens_processed: result.number_of_tokens_processed || 0,

        // conversations
        conversations: result.conversations || [],

        // Default settings
        default_temperature: result.default_temperature !== undefined ? result.default_temperature : 0.3,
        default_memory: result.default_memory !== undefined ? result.default_memory : true,
        onboarded: result.onboarded !== undefined ? result.onboarded : false,
      };

      // Store user to storageService for persistence
      try {
        const userData = JSON.stringify(user);
        await storageService.setItem("u", userData);
        console.log('User data stored successfully');
        return user;
      } catch (e) {
        console.error('Error saving user to storage:', e);
        return null;
      }
    } else {
      console.error('Failed to fetch user data:', userResponse.status);
      return null;
    }
  } catch (error) {
    console.error('Error fetching user data:', error);
    return null;
  }
};

// Update user settings
const updateSettings = async (settings) => {
  const localApi = await getLocalApiEndpoint();

  if (!localApi) {
    console.error('UserService: Local API not available');
    return null;
  }

  const options = {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(settings)
  };

  try {
    let resp = await fetch(`${localApi}/v1/users/me`, options);

    if (checkTokenExpiration(resp)) {
      return null;
    }

    if (resp.status === 200) {
      // Refresh user data after update
      return await getUser();
    } else {
      console.error("UserService: Failed to update settings:", resp.status);
      throw new Error("Failed to update settings");
    }
  } catch (error) {
    console.error("UserService: Error updating settings:", error);
    throw error;
  }
};

export const userService = {
  get: getUser,
  logout: logout,
  checkTokenExpiration: checkTokenExpiration,
  makeAuthenticatedRequest: makeAuthenticatedRequest,
  redirectToLogin: redirectToLogin,
  fetchAndStoreUser: fetchAndStoreUser,
  updateSettings: updateSettings,
}
