const API_BASE_URL = 'http://localhost:3000';

export interface Product {
  id: string;
  sku: string;
  big_sku?: string;
  name: string;
  size?: string;
  colour?: string;
  unit_production_cost?: number;
  unit_selling_price?: number;
  type?: string;
  lead_time_days?: number;
  status: 'Active' | 'Inactive';
  created_at: string;
  updated_at: string;
}

export interface ProductFilters {
  page?: number;
  limit?: number;
  search?: string;
  status?: 'Active' | 'Inactive';
  type?: string;
}

export interface ProductsResponse {
  success: boolean;
  data: Product[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}

class ProductsClient {
  private baseURL: string;

  constructor(baseURL: string = API_BASE_URL) {
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
      console.error(`Products API Error [${endpoint}]:`, error);
      throw error;
    }
  }

  // Get all products with filters
  async getProducts(filters?: ProductFilters): Promise<ProductsResponse> {
    const searchParams = new URLSearchParams();
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined) {
          searchParams.append(key, value.toString());
        }
      });
    }

    const endpoint = `/api/products${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;
    return this.request<ProductsResponse>(endpoint);
  }

  // Get a single product
  async getProduct(id: string): Promise<{ success: boolean; data: Product }> {
    return this.request<{ success: boolean; data: Product }>(`/api/products/${id}`);
  }

  // Create a new product
  async createProduct(product: Omit<Product, 'id' | 'created_at' | 'updated_at'>): Promise<{ success: boolean; data: Product }> {
    return this.request<{ success: boolean; data: Product }>('/api/products', {
      method: 'POST',
      body: JSON.stringify(product),
    });
  }

  // Update a product
  async updateProduct(id: string, updates: Partial<Product>): Promise<{ success: boolean; data: Product }> {
    return this.request<{ success: boolean; data: Product }>(`/api/products/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  // Delete a product
  async deleteProduct(id: string): Promise<{ success: boolean; message: string }> {
    return this.request<{ success: boolean; message: string }>(`/api/products/${id}`, {
      method: 'DELETE',
    });
  }

  // Bulk update products
  async bulkUpdateProducts(updates: Array<{ id: string } & Partial<Product>>): Promise<{ success: boolean; data: Product[]; updated: number }> {
    return this.request<{ success: boolean; data: Product[]; updated: number }>('/api/products/bulk/update', {
      method: 'POST',
      body: JSON.stringify({ updates }),
    });
  }

  // Bulk create products
  async bulkCreateProducts(products: Omit<Product, 'id' | 'created_at' | 'updated_at'>[]): Promise<{ success: boolean; data: Product[]; created: number; errors?: any[] }> {
    return this.request<{ success: boolean; data: Product[]; created: number; errors?: any[] }>('/api/products/bulk/create', {
      method: 'POST',
      body: JSON.stringify({ products }),
    });
  }
}

export const productsApi = new ProductsClient();
