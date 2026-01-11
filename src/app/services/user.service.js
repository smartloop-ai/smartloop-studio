import { API_ENDPOINT } from "@/app/constants";

const getToken = () => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem("token")

    if (token && token?.length > 0) {
      return token;
    }
  }
  return null;
};

const logout = () => {
  localStorage.removeItem("token");
  localStorage.removeItem("u");
}

const redirectToLogin = () => {
  logout();
  if (typeof window !== 'undefined') {
    window.location.href = '/login';
  }
}

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
  const token = getToken();

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

        // Default settings
        default_temperature: result.default_temperature !== undefined ? result.default_temperature : 0.3,
        default_memory: result.default_memory !== undefined ? result.default_memory : true,
        onboarded: result.onboarded !== undefined ? result.onboarded : false,
      };

      // Save to localStorage as JSON string
      try {
        localStorage.setItem("u", JSON.stringify(user));
      } catch (e) {
        console.error('Error saving user to localStorage:', e);
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
  const token = getToken();

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

        // Default settings
        default_temperature: result.default_temperature !== undefined ? result.default_temperature : 0.3,
        default_memory: result.default_memory !== undefined ? result.default_memory : true,
        onboarded: result.onboarded !== undefined ? result.onboarded : false,
      };

      // Store user as JSON string
      try {
        localStorage.setItem("u", JSON.stringify(user));
        console.log('User data stored successfully');
        return user;
      } catch (e) {
        console.error('Error saving user to localStorage:', e);
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
  const token = getToken();

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
  updateSettings: updateSettings
}
