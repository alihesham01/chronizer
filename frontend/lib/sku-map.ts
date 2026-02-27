const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export interface SkuMapping {
  id: string;
  brand_id: string;
  store_group: string;
  store_sku: string;
  product_id: string;
  product_sku: string;
  product_name: string;
  product_size?: string;
  product_colour?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface StoreGroup {
  store_group: string;
  mapping_count: string;
}

export interface SkuMapFilters {
  store_group?: string;
  search?: string;
  page?: number;
  limit?: number;
}

class SkuMapAPI {
  private getToken(): string {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('auth_token') || '';
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${API_BASE_URL}${endpoint}`;
    const token = this.getToken();
    const config: RequestInit = {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
      ...options,
      signal: AbortSignal.timeout(10000),
    };

    const response = await fetch(url, config);
    if (!response.ok) {
      const errorText = await response.text();
      let msg = `HTTP ${response.status}`;
      try { msg = JSON.parse(errorText).message || msg; } catch {}
      throw new Error(msg);
    }
    return response.json();
  }

  async getMappings(filters: SkuMapFilters = {}): Promise<{ success: boolean; data: SkuMapping[]; pagination: any }> {
    const params = new URLSearchParams();
    if (filters.store_group) params.append('store_group', filters.store_group);
    if (filters.search) params.append('search', filters.search);
    if (filters.page) params.append('page', filters.page.toString());
    if (filters.limit) params.append('limit', filters.limit.toString());
    const qs = params.toString();
    return this.request(`/api/sku-map${qs ? `?${qs}` : ''}`);
  }

  async getGroups(): Promise<{ success: boolean; data: StoreGroup[] }> {
    return this.request('/api/sku-map/groups');
  }

  async createMapping(data: { store_group: string; store_sku: string; product_id: string; notes?: string }): Promise<{ success: boolean; data: SkuMapping }> {
    return this.request('/api/sku-map', { method: 'POST', body: JSON.stringify(data) });
  }

  async bulkCreateMappings(mappings: { store_group: string; store_sku: string; product_id: string; notes?: string }[]): Promise<{ success: boolean; created: number; data: SkuMapping[]; errors: any[] }> {
    return this.request('/api/sku-map/bulk', { method: 'POST', body: JSON.stringify({ mappings }) });
  }

  async updateMapping(id: string, data: Partial<{ store_group: string; store_sku: string; product_id: string; notes: string }>): Promise<{ success: boolean; data: SkuMapping }> {
    return this.request(`/api/sku-map/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  }

  async deleteMapping(id: string): Promise<{ success: boolean; message: string }> {
    return this.request(`/api/sku-map/${id}`, { method: 'DELETE' });
  }

  async deleteGroup(group: string): Promise<{ success: boolean; message: string }> {
    return this.request(`/api/sku-map/group/${encodeURIComponent(group)}`, { method: 'DELETE' });
  }
}

export const skuMapApi = new SkuMapAPI();
