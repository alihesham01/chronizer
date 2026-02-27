const AUTH_BASE_URL = '';

export interface LoginResponse {
  success: boolean;
  data: {
    brand: {
      id: string;
      name: string;
      subdomain: string;
    };
    owner: {
      id: string;
      email: string;
      firstName: string;
      lastName: string;
    };
    token: string;
    isAdmin: boolean;
  };
}

export interface RegisterData {
  name: string;
  subdomain: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

class AuthClient {
  private baseURL: string;

  constructor(baseURL: string = AUTH_BASE_URL) {
    this.baseURL = baseURL;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseURL}${endpoint}`;
    const config: RequestInit = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    };

    try {
      const response = await fetch(url, config);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `HTTP error! status: ${response.status}`);
      }

      return data;
    } catch (error) {
      console.error(`Auth Error [${endpoint}]:`, error);
      throw error;
    }
  }

  async login(email: string, password: string): Promise<LoginResponse> {
    return this.request<LoginResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  async register(data: RegisterData): Promise<LoginResponse> {
    return this.request<LoginResponse>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async verifyToken(token: string): Promise<any> {
    return this.request('/api/auth/verify', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  }

  async getMe(token: string): Promise<any> {
    return this.request('/api/auth/me', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  }
}

export const auth = new AuthClient();
