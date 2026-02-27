const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export interface StockMove {
  id: string;
  brand_id: string;
  move_date: string;
  sku: string;
  quantity: number;
  destination: string;
  reference_type?: string;
  reference_id?: string;
  notes?: string;
  big_sku?: string;
  item_name?: string;
  colour?: string;
  size?: string;
  movement_type: 'inbound' | 'outbound' | 'transfer_to' | 'transfer_from' | 'adjustment';
  created_at: string;
  updated_at: string;
  store_name?: string;
}

export interface StockMoveFilters {
  page?: number;
  limit?: number;
  search?: string;
  destination?: string;
  movement_type?: 'inbound' | 'outbound' | 'transfer_to' | 'transfer_from' | 'adjustment';
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

export interface StockMovesResponse {
  data: StockMove[];
  pagination: Pagination;
}

export interface BulkCreateResponse {
  success: boolean;
  data: StockMove[];
  created: number;
  errors?: Array<{
    row: number;
    sku?: string;
    error: string;
  }>;
}

export interface StockSummary {
  brand_id: string;
  sku: string;
  big_sku?: string;
  item_name?: string;
  colour?: string;
  size?: string;
  warehouse_quantity: number;
  stores_quantity: number;
  total_in_stores: number;
  net_quantity: number;
  total_moves: number;
}

export interface StockBalance {
  brand_id: string;
  sku: string;
  destination: string;
  balance: number;
  move_count: number;
  last_move_date: string;
}

class StockMovesAPI {
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
      console.error(`Stock Moves API Error [${endpoint}]:`, error);
      throw error;
    }
  }

  async getStockMoves(filters: StockMoveFilters = {}): Promise<StockMovesResponse> {
    const params = new URLSearchParams();
    
    if (filters.page) params.append('page', filters.page.toString());
    if (filters.limit) params.append('limit', filters.limit.toString());
    if (filters.search) params.append('search', filters.search);
    if (filters.destination) params.append('destination', filters.destination);
    if (filters.movement_type) params.append('movement_type', filters.movement_type);
    if (filters.start_date) params.append('start_date', filters.start_date);
    if (filters.end_date) params.append('end_date', filters.end_date);
    
    const queryString = params.toString();
    const endpoint = `/api/stock-moves${queryString ? `?${queryString}` : ''}`;
    
    return this.request<StockMovesResponse>(endpoint);
  }

  async getStockMove(id: string): Promise<StockMove> {
    return this.request<StockMove>(`/api/stock-moves/${id}`);
  }

  async createStockMove(stockMove: Omit<StockMove, 'id' | 'brand_id' | 'big_sku' | 'item_name' | 'colour' | 'size' | 'movement_type' | 'created_at' | 'updated_at' | 'store_name'>): Promise<StockMove> {
    return this.request<StockMove>('/api/stock-moves', {
      method: 'POST',
      body: JSON.stringify(stockMove),
    });
  }

  async updateStockMove(id: string, stockMove: Partial<Omit<StockMove, 'id' | 'brand_id' | 'movement_type' | 'created_at' | 'updated_at' | 'store_name'>>): Promise<StockMove> {
    return this.request<StockMove>(`/api/stock-moves/${id}`, {
      method: 'PUT',
      body: JSON.stringify(stockMove),
    });
  }

  async deleteStockMove(id: string): Promise<{ message: string }> {
    return this.request<{ message: string }>(`/api/stock-moves/${id}`, {
      method: 'DELETE',
    });
  }

  async bulkCreateStockMoves(stockMoves: Omit<StockMove, 'id' | 'brand_id' | 'big_sku' | 'item_name' | 'colour' | 'size' | 'movement_type' | 'created_at' | 'updated_at' | 'store_name'>[]): Promise<BulkCreateResponse> {
    return this.request<BulkCreateResponse>('/api/stock-moves/bulk', {
      method: 'POST',
      body: JSON.stringify({ stock_moves: stockMoves }),
    });
  }

  async getStockSummary(sku?: string): Promise<StockSummary[]> {
    const params = sku ? `?sku=${sku}` : '';
    return this.request<StockSummary[]>(`/api/stock-moves/summary${params}`);
  }

  async getStockBalanceByDestination(sku?: string, destination?: string): Promise<StockBalance[]> {
    const params = new URLSearchParams();
    if (sku) params.append('sku', sku);
    if (destination) params.append('destination', destination);
    const queryString = params.toString();
    return this.request<StockBalance[]>(`/api/stock-moves/balance${queryString ? `?${queryString}` : ''}`);
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

export const stockMovesApi = new StockMovesAPI();
