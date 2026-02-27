const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export interface ApiResponse<T = any> {
  data?: T;
  error?: string;
  message?: string;
  pagination?: {
    hasMore: boolean;
    totalCount: number;
    limit: number;
  };
}

export interface Transaction {
  id: number;
  sku: string;
  storeName: string;
  quantity: number;
  sellingPrice: number;
  totalAmount: number;
  type: 'sale' | 'refund' | 'adjustment';
  date: string;
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
  metrics: {
    l1: { hits: number; misses: number; hitRate: number };
    l2: { hits: number; misses: number; hitRate: number };
    overall: { hits: number; misses: number; hitRate: number };
  };
  l1: {
    size: number;
    itemCount: number;
    evictions: number;
  };
}

export interface QueueStats {
  activeQueues: string[];
  activeWorkers: string[];
  queueStats: {
    [queueName: string]: {
      waiting: number;
      active: number;
      completed: number;
      failed: number;
    };
  };
}

export interface HealthStatus {
  status: 'ok' | 'error';
  timestamp: string;
  version: string;
  services: {
    database: { status: string };
    redis: { status: string };
    websocket: { status: string };
    queue: { status: string };
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
    return this.request<HealthStatus>('/api/health').then(res => res.data!);
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

  async getTransaction(id: number): Promise<Transaction | null> {
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

  async updateTransaction(id: number, updates: Partial<Transaction>): Promise<Transaction> {
    const response = await this.request<Transaction>(`/api/transactions/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
    return response.data!;
  }

  async deleteTransaction(id: number): Promise<void> {
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
    return response.data!;
  }

  async warmCache(): Promise<void> {
    await this.request('/api/cache/warm', { method: 'POST' });
  }

  async clearCache(): Promise<void> {
    await this.request('/api/cache/clear', { method: 'POST' });
  }

  // Queue
  async getQueueStats(): Promise<QueueStats> {
    const response = await this.request<QueueStats>('/api/queue/stats');
    return response.data!;
  }

  async getFailedJobs(queueName: string, limit: number = 50): Promise<any[]> {
    const response = await this.request<any[]>(`/api/queue/${queueName}/failed?limit=${limit}`);
    return response.data || [];
  }

  async retryJob(queueName: string, jobId: string): Promise<void> {
    await this.request(`/api/queue/${queueName}/${jobId}/retry`, { method: 'POST' });
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
    dateRange?: { start: string; end: string };
    store?: string;
  }): Promise<Blob> {
    const searchParams = new URLSearchParams();
    if (params) {
      if (params.format) searchParams.append('format', params.format);
      if (params.dateRange) {
        searchParams.append('start', params.dateRange.start);
        searchParams.append('end', params.dateRange.end);
      }
      if (params.store) searchParams.append('store', params.store);
    }

    const response = await fetch(`${this.baseURL}/api/transactions/export?${searchParams}`);
    if (!response.ok) throw new Error('Export failed');
    return response.blob();
  }
}

export const api = new ApiClient();
