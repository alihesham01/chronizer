const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export interface ApiResponse<T = any> {
  success?: boolean;
  data?: T;
  error?: string;
  message?: string;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}

export interface Transaction {
  id: string;
  brand_id: string;
  sku: string;
  big_sku?: string;
  item_name?: string;
  colour?: string;
  size?: string;
  store_id?: string;
  store_name?: string;
  quantity_sold: number;
  selling_price: number;
  status: 'sale' | 'return' | 'void' | 'deleted';
  transaction_date: string;
  payment_method?: string;
  notes?: string;
  created_at: string;
}

export interface DashboardMetrics {
  today: {
    today_transactions: number;
    today_revenue: number;
  };
  yesterday: {
    yesterday_transactions: number;
  };
  month: {
    month_transactions: number;
    month_revenue: number;
  };
  topStore?: {
    store_name: string;
    transaction_count: number;
    revenue: number;
  };
}

export interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  evictions: number;
  size: number;
  hitRate: number;
  memoryUsage: string;
}

export interface HealthStatus {
  status: 'ok' | 'error';
  timestamp: string;
  version: string;
  services: {
    database: string;
    cache: string;
  };
}

class ApiClient {
  private baseURL: string;

  constructor(baseURL: string = API_BASE_URL) {
    this.baseURL = baseURL;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseURL}${endpoint}`;

    // Include auth token if available
    const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
    const authHeaders: Record<string, string> = {};
    if (token) {
      authHeaders['Authorization'] = `Bearer ${token}`;
    }

    const config: RequestInit = {
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
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
      console.error(`API Error [${endpoint}]:`, error);
      throw error;
    }
  }

  // Health check
  async getHealth(): Promise<HealthStatus> {
    const response = await this.request<HealthStatus>('/api/health');
    return response as any as HealthStatus;
  }

  // Transactions
  async getTransactions(params?: {
    page?: number;
    limit?: number;
    store?: string;
    sku?: string;
    type?: string;
  }): Promise<{ data: Transaction[]; pagination: any }> {
    const searchParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          searchParams.append(key, value.toString());
        }
      });
    }

    const endpoint = `/api/transactions${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;
    const response = await this.request<Transaction[]>(endpoint);
    return {
      data: response.data || [],
      pagination: response.pagination,
    };
  }

  async getTransaction(id: string): Promise<Transaction | null> {
    try {
      const response = await this.request<Transaction>(`/api/transactions/${id}`);
      return response.data || null;
    } catch {
      return null;
    }
  }

  async createTransaction(transaction: Omit<Transaction, 'id' | 'date' | 'totalAmount'>): Promise<Transaction> {
    const response = await this.request<Transaction>('/api/transactions', {
      method: 'POST',
      body: JSON.stringify(transaction),
    });
    return response.data!;
  }

  async updateTransaction(id: string, updates: Partial<Transaction>): Promise<Transaction> {
    const response = await this.request<Transaction>(`/api/transactions/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
    return response.data!;
  }

  async deleteTransaction(id: string): Promise<void> {
    await this.request(`/api/transactions/${id}`, {
      method: 'DELETE',
    });
  }

  // Analytics
  async getDashboardMetrics(): Promise<DashboardMetrics> {
    const response = await this.request<DashboardMetrics>('/api/analytics/dashboard');
    return response.data!;
  }

  async getDailySummary(dateRange?: { start: string; end: string }): Promise<any[]> {
    const searchParams = new URLSearchParams();
    if (dateRange) {
      searchParams.append('start', dateRange.start);
      searchParams.append('end', dateRange.end);
    }

    const endpoint = `/api/analytics/daily${
      searchParams.toString() ? `?${searchParams.toString()}` : ''
    }`;
    const response = await this.request<any[]>(endpoint);
    return response.data || [];
  }

  async getSkuPerformance(limit: number = 10): Promise<any[]> {
    const response = await this.request<any[]>(`/api/analytics/sku?limit=${limit}`);
    return response.data || [];
  }

  async getStorePerformance(limit: number = 10): Promise<any[]> {
    const response = await this.request<any[]>(`/api/analytics/store?limit=${limit}`);
    return response.data || [];
  }

  async getHourlyTrends(dateRange?: { start: string; end: string }): Promise<any[]> {
    const searchParams = new URLSearchParams();
    if (dateRange) {
      searchParams.append('start', dateRange.start);
      searchParams.append('end', dateRange.end);
    }

    const endpoint = `/api/analytics/hourly${
      searchParams.toString() ? `?${searchParams.toString()}` : ''
    }`;
    const response = await this.request<any[]>(endpoint);
    return response.data || [];
  }

  // Cache
  async getCacheStats(): Promise<CacheStats> {
    const response = await this.request<CacheStats>('/api/cache/stats');
    return response as any as CacheStats;
  }

  async clearCache(): Promise<void> {
    await this.request('/api/cache/clear', { method: 'POST' });
  }

  // Bulk operations
  async bulkCreateTransactions(transactions: Omit<Transaction, 'id' | 'date' | 'totalAmount'>[]): Promise<void> {
    await this.request('/api/transactions/bulk', {
      method: 'POST',
      body: JSON.stringify({ transactions }),
    });
  }

  async exportTransactions(params?: {
    format?: 'csv' | 'json';
    start_date?: string;
    end_date?: string;
    store_id?: string;
  }): Promise<Blob> {
    const searchParams = new URLSearchParams();
    const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
    if (params) {
      if (params.format) searchParams.append('format', params.format);
      if (params.start_date) searchParams.append('start_date', params.start_date);
      if (params.end_date) searchParams.append('end_date', params.end_date);
      if (params.store_id) searchParams.append('store_id', params.store_id);
    }

    const response = await fetch(`${this.baseURL}/api/transactions/export?${searchParams}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok) throw new Error('Export failed');
    return response.blob();
  }

  // Auth
  async changePassword(currentPassword: string, newPassword: string): Promise<{ success: boolean; message?: string; error?: string }> {
    const response = await this.request<any>('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    return response as any;
  }

  async refreshToken(): Promise<{ token: string }> {
    const response = await this.request<{ token: string }>('/api/auth/refresh', {
      method: 'POST',
    });
    return response.data!;
  }
}

export const api = new ApiClient();
