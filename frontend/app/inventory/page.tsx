'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { inventoryApi, InventoryItem, InventoryFilters, InventoryResponse, InventoryValueSummary } from '@/lib/inventory';

export default function InventoryPage() {
  const router = useRouter();
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<InventoryFilters>({
    page: 1,
    limit: 50,
    sort_by: 'sku',
    sort_order: 'asc'
  });
  const [pagination, setPagination] = useState({
    total: 0,
    totalPages: 0,
    hasMore: false
  });
  const [summary, setSummary] = useState({
    total_items: 0,
    in_stock_count: 0,
    out_of_stock_count: 0,
    negative_stock_count: 0,
    total_inventory_value: 0
  });
  const [valueSummary, setValueSummary] = useState<InventoryValueSummary | null>(null);
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);
  const [showLowStockOnly, setShowLowStockOnly] = useState(false);
  const [showNegativeOnly, setShowNegativeOnly] = useState(false);

  // Load inventory data
  const loadInventory = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await inventoryApi.getInventory({
        ...filters,
        low_stock: showLowStockOnly,
        negative_stock: showNegativeOnly
      });
      
      setInventory(response.data);
      setPagination({
        total: response.pagination.total,
        totalPages: response.pagination.totalPages,
        hasMore: response.pagination.hasMore
      });
      setSummary(response.summary);
    } catch (error: any) {
      console.error('Load inventory error:', error);
      setError(error.message || 'Failed to load inventory');
    } finally {
      setLoading(false);
    }
  };

  // Load value summary
  const loadValueSummary = async () => {
    try {
      const summary = await inventoryApi.getInventoryValueSummary();
      setValueSummary(summary);
    } catch (error: any) {
      console.error('Failed to load value summary:', error);
    }
  };

  // Refresh inventory snapshot
  const refreshInventory = async () => {
    try {
      setLoading(true);
      const response = await inventoryApi.refreshInventory();
      setLastRefresh(response.timestamp);
      await loadInventory();
      await loadValueSummary();
      alert('Inventory refreshed successfully!');
    } catch (error: any) {
      alert(error.message || 'Failed to refresh inventory');
    } finally {
      setLoading(false);
    }
  };

  // Format currency
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(value);
  };

  // Get status badge
  const getStatusBadge = (status: string, inventory: number) => {
    if (inventory < 0) {
      return <Badge className="bg-red-100 text-red-800">Negative Stock</Badge>;
    }
    if (inventory === 0) {
      return <Badge className="bg-gray-100 text-gray-800">Out of Stock</Badge>;
    }
    if (inventory <= 10) {
      return <Badge className="bg-yellow-100 text-yellow-800">Low Stock</Badge>;
    }
    return <Badge className="bg-green-100 text-green-800">In Stock</Badge>;
  };

  // Calculate percentage for inventory bar
  const getInventoryPercentage = (item: InventoryItem) => {
    const maxExpected = Math.max(item.warehouse_in + item.stores_in, 1);
    const percentage = (item.current_inventory / maxExpected) * 100;
    return Math.max(0, Math.min(100, percentage));
  };

  // Load initial data
  useEffect(() => {
    loadInventory();
    loadValueSummary();
  }, [filters, showLowStockOnly, showNegativeOnly]);

  return (
    <div className="px-4 py-6 sm:px-0">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Total Items</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{summary.total_items.toLocaleString()}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">In Stock</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{summary.in_stock_count.toLocaleString()}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Out of Stock</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-gray-600">{summary.out_of_stock_count.toLocaleString()}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Negative Stock</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">{summary.negative_stock_count.toLocaleString()}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Total Value</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(summary.total_inventory_value)}</div>
              </CardContent>
            </Card>
          </div>

          {/* Filters and Actions */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Filters & Actions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-4 items-center">
                <Input
                  placeholder="Search by SKU, Name, or Big SKU..."
                  value={filters.search || ''}
                  onChange={(e) => setFilters({ ...filters, search: e.target.value, page: 1 })}
                  className="max-w-xs"
                />
                <select
                  value={filters.status || ''}
                  onChange={(e) => setFilters({ 
                    ...filters, 
                    status: e.target.value as any,
                    page: 1 
                  })}
                  className="px-3 py-2 border rounded"
                >
                  <option value="">All Status</option>
                  <option value="In Stock">In Stock</option>
                  <option value="Out of Stock">Out of Stock</option>
                  <option value="Negative Stock">Negative Stock</option>
                </select>
                <select
                  value={filters.sort_by || 'sku'}
                  onChange={(e) => setFilters({ 
                    ...filters, 
                    sort_by: e.target.value as any,
                    page: 1 
                  })}
                  className="px-3 py-2 border rounded"
                >
                  <option value="sku">Sort by SKU</option>
                  <option value="item_name">Sort by Name</option>
                  <option value="current_inventory">Sort by Quantity</option>
                  <option value="inventory_value">Sort by Value</option>
                  <option value="last_transaction">Sort by Last Transaction</option>
                </select>
                <select
                  value={filters.sort_order || 'asc'}
                  onChange={(e) => setFilters({ 
                    ...filters, 
                    sort_order: e.target.value as any,
                    page: 1 
                  })}
                  className="px-3 py-2 border rounded"
                >
                  <option value="asc">Ascending</option>
                  <option value="desc">Descending</option>
                </select>
                <Button
                  variant={showLowStockOnly ? "default" : "outline"}
                  onClick={() => {
                    setShowLowStockOnly(!showLowStockOnly);
                    setFilters({ ...filters, page: 1 });
                  }}
                  {...({} as any)}
                >
                  Low Stock Only
                </Button>
                <Button
                  variant={showNegativeOnly ? "destructive" : "outline"}
                  onClick={() => {
                    setShowNegativeOnly(!showNegativeOnly);
                    setFilters({ ...filters, page: 1 });
                  }}
                  {...({} as any)}
                >
                  Negative Only
                </Button>
                <Button variant="outline" onClick={loadInventory} disabled={loading} {...({} as any)}>
                  {loading ? 'Loading...' : 'Load Inventory'}
                </Button>
                <Button onClick={refreshInventory} disabled={loading} {...({} as any)}>
                  Refresh Data
                </Button>
              </div>
              {lastRefresh && (
                <p className="text-xs text-gray-500 mt-2">
                  Last refreshed: {new Date(lastRefresh).toLocaleString()}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Error Display */}
          {error && (
            <Alert className="mb-6 border-red-200 bg-red-50">
              <AlertDescription className="text-red-800">
                Error: {error}
                <Button variant="link" className="ml-2 p-0 h-auto text-red-800 underline" onClick={() => setError(null)} {...({} as any)}>
                  Dismiss
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {/* Inventory Table */}
          <Card>
            <CardHeader>
              <CardTitle>Inventory Items ({pagination.total})</CardTitle>
              <CardDescription>
                Page {filters.page} of {pagination.totalPages} • Showing {inventory.length} items
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8">Loading inventory data...</div>
              ) : inventory.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No inventory items found. Try adjusting filters or click "Load Inventory".
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50">
                        <th className="text-left p-3 font-medium">SKU</th>
                        <th className="text-left p-3 font-medium">Big SKU</th>
                        <th className="text-left p-3 font-medium">Item Name</th>
                        <th className="text-left p-3 font-medium">Colour</th>
                        <th className="text-left p-3 font-medium">Size</th>
                        <th className="text-center p-3 font-medium">Current Stock</th>
                        <th className="text-center p-3 font-medium">Stock Level</th>
                        <th className="text-right p-3 font-medium">Unit Price</th>
                        <th className="text-right p-3 font-medium">Total Value</th>
                        <th className="text-center p-3 font-medium">Status</th>
                        <th className="text-left p-3 font-medium">Last Activity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inventory.map((item) => (
                        <tr key={item.sku} className="border-b hover:bg-gray-50">
                          <td className="p-3 font-medium">{item.sku}</td>
                          <td className="p-3 text-gray-600">{item.big_sku || '-'}</td>
                          <td className="p-3">{item.item_name || '-'}</td>
                          <td className="p-3 text-gray-600">{item.colour || '-'}</td>
                          <td className="p-3 text-gray-600">{item.size || '-'}</td>
                          <td className="p-3 text-center">
                            <span className={item.current_inventory < 0 ? 'text-red-600 font-bold' : ''}>
                              {item.current_inventory.toLocaleString()}
                            </span>
                          </td>
                          <td className="p-3">
                            <div className="w-full bg-gray-200 rounded-full h-2">
                              <div
                                className={`h-2 rounded-full ${
                                  item.current_inventory < 0 
                                    ? 'bg-red-500' 
                                    : item.current_inventory === 0 
                                    ? 'bg-gray-400' 
                                    : item.current_inventory <= 10 
                                    ? 'bg-yellow-500' 
                                    : 'bg-green-500'
                                }`}
                                style={{ width: `${Math.max(5, getInventoryPercentage(item))}%` }}
                              />
                            </div>
                          </td>
                          <td className="p-3 text-right">
                            {item.unit_selling_price ? formatCurrency(item.unit_selling_price) : '-'}
                          </td>
                          <td className="p-3 text-right font-medium">
                            {formatCurrency(item.inventory_value)}
                          </td>
                          <td className="p-3 text-center">
                            {getStatusBadge(item.inventory_status, item.current_inventory)}
                          </td>
                          <td className="p-3 text-gray-600 text-xs">
                            {item.last_transaction 
                              ? new Date(item.last_transaction).toLocaleDateString()
                              : item.last_stock_move
                              ? new Date(item.last_stock_move).toLocaleDateString()
                              : '-'
                            }
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              
              {/* Pagination */}
              {pagination.totalPages > 1 && (
                <div className="flex justify-between items-center mt-4">
                  <Button
                    variant="outline"
                    disabled={(filters.page || 1) <= 1}
                    onClick={() => setFilters(prev => ({ ...prev, page: Math.max(1, (prev.page || 1) - 1) }))}
                    {...({} as any)}
                  >
                    Previous
                  </Button>
                  <span className="text-sm text-gray-600">
                    Page {filters.page || 1} of {pagination.totalPages}
                  </span>
                  <Button
                    variant="outline"
                    disabled={!pagination.hasMore}
                    onClick={() => setFilters(prev => ({ ...prev, page: (prev.page || 1) + 1 }))}
                    {...({} as any)}
                  >
                    Next
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Performance Note */}
          <Alert className="mt-6 border-blue-200 bg-blue-50">
            <AlertDescription className="text-blue-800">
              <strong>Performance Note:</strong> This inventory page uses optimized database views and materialized views to handle thousands of SKUs efficiently. 
              Data is refreshed periodically. Click "Refresh Data" to get the latest inventory calculations.
            </AlertDescription>
          </Alert>
    </div>
  );
}
