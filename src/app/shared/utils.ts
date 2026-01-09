import { SHA256 } from 'crypto-js';
import { API_ENDPOINT } from '@/app/constants';

export const isValidEmail = (email: string)=>{
	if (!/^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/i.test(email)){
		return false;
	}
	return true;
}

export const gravatar = (user: { email: any }) => {
    return `https://gravatar.com/avatar/${SHA256(user.email)}?d=retro`;
}

interface OAuthUtilsType {
  getOAuthParams(searchParams: URLSearchParams): {
    responseType: string | null;
    clientId: string | null;
    redirectUri: string | null;
    state: string | null;
    code: string | null;
    token: string | null;
  };
  isOAuthFlow(params: ReturnType<typeof OAuthUtils.getOAuthParams>): boolean;
  createToken(accessToken: string, name: string): Promise<string | null>;
  deleteToken(tokenId: string, accessToken: string): Promise<boolean>;
  getTokens(accessToken: string): Promise<any>;
  createToken(accessToken: string, name: string): Promise<string | null>;
}

export const OAuthUtils: OAuthUtilsType = {
  /**
   * Extracts OAuth parameters from URL search parameters
   */
  getOAuthParams(searchParams: URLSearchParams) {
    return {
      responseType: searchParams.get('response_type'),
      clientId: searchParams.get('client_id'),
      redirectUri: searchParams.get('redirect_uri'),
      state: searchParams.get('state'),
      code: searchParams.get('code'),
      token: searchParams.get('token')
    };
  },

  /**
   * Checks if the current request is part of an OAuth flow
   */
  isOAuthFlow(params: ReturnType<typeof OAuthUtils.getOAuthParams>): boolean {
    return Boolean(params.responseType && params.clientId && params.redirectUri);
  },

  /**
   * Creates a token with the given name
   */
  async createToken(accessToken: string, name: string) {
    try {
      const url = `${API_ENDPOINT}/users/me/tokens`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({ name })
      });

      if (!response.ok) {
        throw new Error(`Failed to create token: ${response.status}`);
      }

      const result = await response.json();
      return result.token;
    } catch (error) {
      console.error("Error creating token:", error);
      return null;
    }
  },

  /**
   * Deletes a token by ID
   */
  async deleteToken(tokenId: string, accessToken: string) {
    try {
      const url = `${API_ENDPOINT}/users/me/tokens/${tokenId}`;
      const options = {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        }
      };

      const response = await fetch(url, options);
      if (!response.ok) {
        throw new Error(`Failed to delete token: ${response.status}`);
      }

      return true;
    } catch (error) {
      console.error("Error deleting token:", error);
      return false;
    }
  },

  /**
   * Gets all tokens for a user
   */
  async getTokens(accessToken: string) {
    try {
      const url = `${API_ENDPOINT}/users/me/tokens`;
      const options = {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      };

      const response = await fetch(url, options);
      if (!response.ok) {
        throw new Error(`Failed to fetch tokens: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Error fetching tokens:", error);
      return null;
    }
  },
}

// Shared dialog/modal styles for consistent UI across the app
export const dialogStyles = {
  // Standard dialog paper props
  paper: {
    bgcolor: '#000000',
    backgroundColor: '#000000',
    backgroundImage: 'none',
    border: '1px solid #1a1a1a',
    borderRadius: '12px',
    maxWidth: '480px',
  },
  // Darker backdrop
  backdrop: {
    backdropFilter: 'blur(2px)',
    bgcolor: 'rgba(0, 0, 0, 0.4)',
  },
  // Wide dialog paper props (for larger dialogs)
  paperWide: {
    bgcolor: '#000000',
    backgroundColor: '#000000',
    backgroundImage: 'none',
    backdropFilter: 'blur(10px)',
    border: '1px solid rgba(236, 72, 153, 0.3)',
    borderRadius: '16px',
    maxWidth: '600px',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
  },
};

