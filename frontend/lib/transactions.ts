const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export interface Transaction {
  id: string;
  brand_id: string;
  transaction_date: string;
  store_id?: string;
  store_name?: string;
  sku: string;
  quantity_sold: number;
  selling_price: number;
  big_sku?: string;
  item_name?: string;
  colour?: string;
  size?: string;
  status: 'sale' | 'return' | 'adjustment';
  customer_id?: string;
  payment_method?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface TransactionFilters {
  page?: number;
  limit?: number;
  search?: string;
  status?: 'sale' | 'return' | 'adjustment';
  store_id?: string;
  start_date?: string;
  end_date?: string;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

export interface TransactionsResponse {
  data: Transaction[];
  pagination: Pagination;
}

export interface BulkCreateResponse {
  success: boolean;
  data: Transaction[];
  created: number;
  errors?: Array<{
    row: number;
    sku?: string;
    error: string;
  }>;
}

class TransactionsAPI {
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
      signal: AbortSignal.timeout(10000),
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
      console.error(`Transactions API Error [${endpoint}]:`, error);
      throw error;
    }
  }

  async getTransactions(filters: TransactionFilters = {}): Promise<TransactionsResponse> {
    const params = new URLSearchParams();
    
    if (filters.page) params.append('page', filters.page.toString());
    if (filters.limit) params.append('limit', filters.limit.toString());
    if (filters.search) params.append('search', filters.search);
    if (filters.status) params.append('status', filters.status);
    if (filters.store_id) params.append('store_id', filters.store_id);
    if (filters.start_date) params.append('start_date', filters.start_date);
    if (filters.end_date) params.append('end_date', filters.end_date);
    
    const queryString = params.toString();
    const endpoint = `/api/transactions${queryString ? `?${queryString}` : ''}`;
    
    return this.request<TransactionsResponse>(endpoint);
  }

  async getTransaction(id: string): Promise<Transaction> {
    return this.request<Transaction>(`/api/transactions/${id}`);
  }

  async createTransaction(transaction: Omit<Transaction, 'id' | 'brand_id' | 'big_sku' | 'item_name' | 'colour' | 'size' | 'status' | 'created_at' | 'updated_at'>): Promise<Transaction> {
    return this.request<Transaction>('/api/transactions', {
      method: 'POST',
      body: JSON.stringify(transaction),
    });
  }

  async updateTransaction(id: string, transaction: Partial<Omit<Transaction, 'id' | 'brand_id' | 'status' | 'created_at' | 'updated_at'>>): Promise<Transaction> {
    return this.request<Transaction>(`/api/transactions/${id}`, {
      method: 'PUT',
      body: JSON.stringify(transaction),
    });
  }

  async deleteTransaction(id: string): Promise<{ message: string }> {
    return this.request<{ message: string }>(`/api/transactions/${id}`, {
      method: 'DELETE',
    });
  }

  async bulkCreateTransactions(transactions: Omit<Transaction, 'id' | 'brand_id' | 'big_sku' | 'item_name' | 'colour' | 'size' | 'status' | 'created_at' | 'updated_at'>[]): Promise<BulkCreateResponse> {
    return this.request<BulkCreateResponse>('/api/transactions/bulk', {
      method: 'POST',
      body: JSON.stringify({ transactions }),
    });
  }

  /**
   * Validate SKU exists in products
   */
  async validateSKU(sku: string): Promise<{ valid: boolean; product?: any }> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/products?search=${sku}&limit=1`);
      const data = await response.json();
      
      if (data.data && data.data.length > 0 && data.data[0].sku === sku) {
        return { valid: true, product: data.data[0] };
      }
      
      return { valid: false };
    } catch (error) {
      return { valid: false };
    }
  }
}

export const transactionsApi = new TransactionsAPI();
