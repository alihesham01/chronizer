const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export interface Store {
  id: string;
  brand_id: string;
  name: string;
  group?: string;
  commission?: number;
  rent?: number;
  activation_date?: string;
  deactivation_date?: string;
  created_at: string;
  updated_at: string;
}

export interface StoreFilters {
  page?: number;
  limit?: number;
  search?: string;
  group?: string;
  status?: 'active' | 'inactive';
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

export interface StoresResponse {
  data: Store[];
  pagination: Pagination;
}

export interface BulkCreateResponse {
  success: boolean;
  data: Store[];
  created: number;
  errors?: Array<{
    row: number;
    name?: string;
    error: string;
  }>;
}

class StoresAPI {
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${API_BASE_URL}${endpoint}`;
    const config: RequestInit = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
      signal: AbortSignal.timeout(10000), // 10 second timeout
    };

    try {
      const response = await fetch(url, config);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`API Error [${endpoint}]: ${response.status} - ${errorText}`);
        throw new Error(errorText || `HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      return data;
    } catch (error) {
      console.error(`Stores API Error [${endpoint}]:`, error);
      throw error;
    }
  }

  // Get all stores with pagination and filtering
  async getStores(filters: StoreFilters = {}): Promise<StoresResponse> {
    const params = new URLSearchParams();
    
    if (filters.page) params.append('page', filters.page.toString());
    if (filters.limit) params.append('limit', filters.limit.toString());
    if (filters.search) params.append('search', filters.search);
    if (filters.group) params.append('group', filters.group);
    if (filters.status) params.append('status', filters.status);
    
    const queryString = params.toString();
    const endpoint = `/api/stores${queryString ? `?${queryString}` : ''}`;
    
    return this.request<StoresResponse>(endpoint);
  }

  // Get a single store by ID
  async getStore(id: string): Promise<Store> {
    return this.request<Store>(`/api/stores/${id}`);
  }

  // Create a new store
  async createStore(store: Omit<Store, 'id' | 'brand_id' | 'created_at' | 'updated_at'>): Promise<Store> {
    return this.request<Store>('/api/stores', {
      method: 'POST',
      body: JSON.stringify(store),
    });
  }

  // Update a store
  async updateStore(id: string, store: Partial<Omit<Store, 'id' | 'brand_id' | 'created_at' | 'updated_at'>>): Promise<Store> {
    return this.request<Store>(`/api/stores/${id}`, {
      method: 'PUT',
      body: JSON.stringify(store),
    });
  }

  // Delete a store
  async deleteStore(id: string): Promise<{ message: string }> {
    return this.request<{ message: string }>(`/api/stores/${id}`, {
      method: 'DELETE',
    });
  }

  // Bulk create stores
  async bulkCreateStores(stores: Omit<Store, 'id' | 'brand_id' | 'created_at' | 'updated_at'>[]): Promise<BulkCreateResponse> {
    return this.request<BulkCreateResponse>('/api/stores/bulk', {
      method: 'POST',
      body: JSON.stringify({ stores }),
    });
  }
}

export const storesApi = new StoresAPI();
