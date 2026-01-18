import { API_ENDPOINT } from "@/app/constants";
import { storageService } from "./storage.service";

const getToken = async () => {
  if (typeof window !== 'undefined') {
    const token = await storageService.getItem("token");

    if (token && token?.length > 0) {
      return token;
    }
  }
  return null;
};

const logout = async () => {
  await storageService.removeItem("token");
  await storageService.removeItem("u");
  // Stop token refresh when logging out
  stopTokenRefresh();
}

// Check if running in Electron
const isElectron = () => {
  return typeof window !== 'undefined' && window.electronAPI?.isElectron;
};

// Track if token refresh is already initialized to prevent duplicate calls
let tokenRefreshInitialized = false;

// Initialize token refresh (call this after successful login)
const initializeTokenRefresh = async () => {
  if (!isElectron()) {
    console.log('[TokenRefresh] Not in Electron, skipping token refresh setup');
    return;
  }

  // Prevent duplicate initialization - refresh token invalidates the old token
  // so we should only call this once per session
  if (tokenRefreshInitialized) {
    console.log('[TokenRefresh] Already initialized, skipping');
    return;
  }

  const token = await getToken();
  if (!token) {
    console.log('[TokenRefresh] No token found, skipping refresh setup');
    return;
  }

  console.log('[TokenRefresh] Initializing token refresh...');
  tokenRefreshInitialized = true;

  // Set up listener for token refresh events from main process
  window.electronAPI.onTokenRefreshed(async (data) => {
    if (data.success && data.token) {
      console.log('[TokenRefresh] Received new token from main process');
      await storageService.setItem('token', data.token);

      // Dispatch event so other parts of the app can react if needed
      window.dispatchEvent(new CustomEvent('tokenRefreshed', { detail: { token: data.token } }));
    } else if (data.requiresReauth) {
      console.log('[TokenRefresh] Token expired, redirecting to login');
      redirectToLogin();
    }
  });

  // Start the background refresh
  window.electronAPI.startTokenRefresh();
};

// Stop token refresh
const stopTokenRefresh = () => {
  if (!isElectron()) {
    return;
  }

  console.log('[TokenRefresh] Stopping token refresh...');
  tokenRefreshInitialized = false; // Reset flag so it can be initialized again after re-login
  window.electronAPI.removeTokenRefreshListener();
  window.electronAPI.stopTokenRefresh();
};

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
  // Handle 403 Forbidden (valid token but insufficient permissions)
  if (response.status === 403) {
    console.log('Access forbidden (403), clearing session');
    redirectToLogin();
    return true;
  }
  return false;
}

const getUser = async () => {
  const token = await getToken();

  if (token == null) {
    console.error('UserService: No token found');
    return null;
  }

  const options = {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
  }

  try {
    let resp = await fetch(`${API_ENDPOINT}/users/me`, options);

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
        projects: result.projects,

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
  const token = await getToken();

  if (!token) {
    redirectToLogin();
    return;
  }

  const requestOptions = {
    ...options,
    headers: {
      ...options.headers,
      'Authorization': `Bearer ${token}`
    }
  };

  try {
    const response = await fetch(url, requestOptions);

    if (checkTokenExpiration(response)) {
      return;
    }

    return response;
  } catch (error) {
    throw error;
  }
};

// Fetch and store user data using a provided token (useful for OAuth callbacks)
const fetchAndStoreUser = async (token) => {
  if (!token) {
    console.error('No token provided to fetchAndStoreUser');
    return null;
  }

  try {
    const userResponse = await fetch(`${API_ENDPOINT}/users/me`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
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
        projects: result.projects,

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
  const token = await getToken();

  if (!token) {
    console.error('UserService: No token found');
    return null;
  }

  const options = {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(settings)
  };

  try {
    let resp = await fetch(`${API_ENDPOINT}/users/me`, options);

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
  token: getToken,
  checkTokenExpiration: checkTokenExpiration,
  makeAuthenticatedRequest: makeAuthenticatedRequest,
  redirectToLogin: redirectToLogin,
  fetchAndStoreUser: fetchAndStoreUser,
  updateSettings: updateSettings,
  initializeTokenRefresh: initializeTokenRefresh,
  stopTokenRefresh: stopTokenRefresh
}
