const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export interface InventoryItem {
  brand_id: string;
  sku: string;
  big_sku?: string;
  item_name?: string;
  colour?: string;
  size?: string;
  unit_selling_price?: number;
  warehouse_in: number;
  stores_in: number;
  stock_out: number;
  total_sold: number;
  current_inventory: number;
  inventory_value: number;
  inventory_status: 'In Stock' | 'Out of Stock' | 'Negative Stock';
  last_stock_move?: string;
  last_transaction?: string;
}

export interface InventoryFilters {
  page?: number;
  limit?: number;
  search?: string;
  status?: 'In Stock' | 'Out of Stock' | 'Negative Stock';
  low_stock?: boolean;
  negative_stock?: boolean;
  sort_by?: 'sku' | 'item_name' | 'current_inventory' | 'inventory_value' | 'last_transaction';
  sort_order?: 'asc' | 'desc';
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

export interface InventoryResponse {
  data: InventoryItem[];
  pagination: Pagination;
  summary: {
    total_items: number;
    in_stock_count: number;
    out_of_stock_count: number;
    negative_stock_count: number;
    total_inventory_value: number;
  };
}

export interface InventoryItemWithHistory {
  inventory: InventoryItem;
  history: Array<{
    type: 'stock_move' | 'transaction';
    date: string;
    quantity: number;
    destination: string;
    notes?: string;
    created_at: string;
  }>;
}

export interface InventoryValueSummary {
  positive_inventory_value: number;
  negative_inventory_value: number;
  out_of_stock_value: number;
  in_stock_value: number;
  items_with_stock: number;
  items_out_of_stock: number;
  items_negative_stock: number;
}

class InventoryAPI {
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
      signal: AbortSignal.timeout(30000), // Longer timeout for inventory queries
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
      console.error(`Inventory API Error [${endpoint}]:`, error);
      throw error;
    }
  }

  async getInventory(filters: InventoryFilters = {}): Promise<InventoryResponse> {
    const params = new URLSearchParams();
    
    if (filters.page) params.append('page', filters.page.toString());
    if (filters.limit) params.append('limit', filters.limit.toString());
    if (filters.search) params.append('search', filters.search);
    if (filters.status) params.append('status', filters.status);
    if (filters.low_stock !== undefined) params.append('low_stock', filters.low_stock.toString());
    if (filters.negative_stock !== undefined) params.append('negative_stock', filters.negative_stock.toString());
    if (filters.sort_by) params.append('sort_by', filters.sort_by);
    if (filters.sort_order) params.append('sort_order', filters.sort_order);
    
    const queryString = params.toString();
    const endpoint = `/api/inventory${queryString ? `?${queryString}` : ''}`;
    
    return this.request<InventoryResponse>(endpoint);
  }

  async getInventoryItem(sku: string): Promise<InventoryItemWithHistory> {
    return this.request<InventoryItemWithHistory>(`/api/inventory/${encodeURIComponent(sku)}`);
  }

  async refreshInventory(): Promise<{ message: string; timestamp: string }> {
    return this.request<{ message: string; timestamp: string }>('/api/inventory/refresh', {
      method: 'POST',
    });
  }

  async getLowStockItems(threshold: number = 10): Promise<{ data: InventoryItem[]; threshold: number; count: number }> {
    return this.request<{ data: InventoryItem[]; threshold: number; count: number }>(`/api/inventory/low-stock?threshold=${threshold}`);
  }

  async getNegativeStockItems(): Promise<{ data: InventoryItem[]; count: number }> {
    return this.request<{ data: InventoryItem[]; count: number }>('/api/inventory/negative-stock');
  }

  async getInventoryValueSummary(): Promise<InventoryValueSummary> {
    return this.request<InventoryValueSummary>('/api/inventory/value-summary');
  }

  async getTopItemsByValue(limit: number = 20): Promise<{ data: InventoryItem[]; count: number }> {
    return this.request<{ data: InventoryItem[]; count: number }>(`/api/inventory/top-by-value?limit=${limit}`);
  }
}

export const inventoryApi = new InventoryAPI();
