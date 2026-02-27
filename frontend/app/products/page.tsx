'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { productsApi, Product, ProductFilters } from '@/lib/products';

export default function ProductsPage() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, any>>({});
  const [filters, setFilters] = useState<ProductFilters>({
    page: 1,
    limit: 50,
    status: undefined,
    search: ''
  });
  const [pagination, setPagination] = useState({
    total: 0,
    totalPages: 0,
    hasMore: false
  });
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showBulkForm, setShowBulkForm] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [newProduct, setNewProduct] = useState<Partial<Product>>({
    sku: '',
    name: '',
    size: '',
    colour: '',
    unit_production_cost: 0,
    unit_selling_price: 0,
    type: '',
    lead_time_days: 0,
    status: 'Active'
  });

  const loadProducts = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await productsApi.getProducts(filters);
      setProducts(response.data);
      setPagination({
        total: response.pagination.total,
        totalPages: response.pagination.totalPages,
        hasMore: response.pagination.hasMore
      });
    } catch (error: any) {
      console.error('Load products error:', error);
      setError(error.message || 'Failed to load products');
    } finally {
      setLoading(false);
    }
  };

  const handleAddProduct = async () => {
    try {
      const response = await productsApi.createProduct(newProduct as Omit<Product, 'id' | 'created_at' | 'updated_at'>);
      setProducts([response.data, ...products]);
      setShowAddForm(false);
      setNewProduct({
        sku: '',
        name: '',
        size: '',
        colour: '',
        unit_production_cost: 0,
        unit_selling_price: 0,
        type: '',
        lead_time_days: 0,
        status: 'Active'
      });
      alert('Product added successfully');
    } catch (error: any) {
      alert(error.message || 'Failed to add product');
    }
  };

  const handleBulkPaste = async () => {
    try {
      // Parse the bulk text - handle tab-separated values
      const lines = bulkText.trim().split('\n');
      const headers = ['sku', 'big_sku', 'name', 'size', 'colour', 'unit_production_cost', 'unit_selling_price', 'type', 'lead_time_days', 'status'];
      
      const productsToCreate: Omit<Product, 'id' | 'created_at' | 'updated_at'>[] = [];
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        // Split by tab first, if no tabs then split by multiple spaces or comma
        let parts = line.includes('\t') ? line.split('\t') : line.split(/\s{2,}|\,/);
        
        // Clean up parts (remove quotes if present and trim whitespace)
        parts = parts.map(p => p.replace(/^"(.*)"$/, '').trim());
        
        // Create product object
        const product: any = {};
        headers.forEach((header, index) => {
          let value = parts[index] || '';
          
          // Handle numeric values with commas (e.g., "1,000" -> 1000)
          if (header === 'unit_production_cost' || header === 'unit_selling_price') {
            value = value.replace(/,/g, '');
            product[header] = value ? parseFloat(value) : 0;
          } else if (header === 'lead_time_days') {
            value = value.replace(/,/g, '');
            product[header] = value ? parseInt(value) : 0;
          } else if (header === 'status') {
            product[header] = value || 'Active';
          } else {
            product[header] = value || (header === 'sku' || header === 'name' ? '' : undefined);
          }
        });
        
        // Skip if no SKU or name
        if (!product.sku && !product.name) continue;
        
        productsToCreate.push(product as Omit<Product, 'id' | 'created_at' | 'updated_at'>);
      }
      
      if (productsToCreate.length === 0) {
        alert('No valid products found in the pasted data');
        return;
      }
      
      // Bulk create
      const response = await productsApi.bulkCreateProducts(productsToCreate);
      
      if (response.success) {
        setProducts([...response.data, ...products]);
        setShowBulkForm(false);
        setBulkText('');
        alert(`Successfully added ${response.created} products${response.errors ? ` (${response.errors.length} errors)` : ''}`);
      }
    } catch (error: any) {
      alert(error.message || 'Failed to add products in bulk');
    }
  };

  const handleEdit = (productId: string, product: Product) => {
    setEditing(productId);
    setEditValues({ [productId]: { ...product } });
  };

  const handleSave = async (productId: string) => {
    try {
      const updates = editValues[productId];
      delete updates.id;
      delete updates.created_at;
      delete updates.updated_at;
      
      await productsApi.updateProduct(productId, updates);
      setEditing(null);
      delete editValues[productId];
      await loadProducts();
      alert('Product updated successfully');
    } catch (error: any) {
      alert(error.message || 'Failed to update product');
    }
  };

  const handleCancel = (productId: string) => {
    setEditing(null);
    delete editValues[productId];
  };

  const handleDelete = async (productId: string) => {
    if (!confirm('Are you sure you want to delete this product?')) return;
    
    try {
      await productsApi.deleteProduct(productId);
      await loadProducts();
      alert('Product deleted successfully');
    } catch (error: any) {
      alert(error.message || 'Failed to delete product');
    }
  };

  const handleBulkUpdate = async () => {
    if (selectedProducts.length === 0) {
      alert('No products selected');
      return;
    }

    try {
      const updates = selectedProducts.map(id => ({
        id,
        ...editValues[id]
      }));
      
      await productsApi.bulkUpdateProducts(updates);
      setBulkMode(false);
      setSelectedProducts([]);
      setEditValues({});
      await loadProducts();
      alert(`${updates.length} products updated`);
    } catch (error: any) {
      alert(error.message || 'Failed to update products');
    }
  };

  const handleCellEdit = (productId: string, field: string, value: any) => {
    setEditValues(prev => ({
      ...prev,
      [productId]: {
        ...prev[productId],
        [field]: value
      }
    }));
  };

  const handleSelectProduct = (productId: string) => {
    setSelectedProducts(prev => 
      prev.includes(productId) 
        ? prev.filter(id => id !== productId)
        : [...prev, productId]
    );
  };

  const renderEditableCell = (product: Product, field: keyof Product, value: any) => {
    const isEditing = editing === product.id || (bulkMode && selectedProducts.includes(product.id));
    
    if (!isEditing) {
      return <div className="min-w-[100px]">{value || '-'}</div>;
    }

    if (field === 'status') {
      return (
        <select
          value={editValues[product.id]?.[field] || value}
          onChange={(e) => handleCellEdit(product.id, field, e.target.value)}
          className="px-2 py-1 border rounded"
        >
          <option value="Active">Active</option>
          <option value="Inactive">Inactive</option>
        </select>
      );
    }

    if (field === 'unit_production_cost' || field === 'unit_selling_price') {
      return (
        <Input
          type="number"
          step="0.01"
          value={editValues[product.id]?.[field] || value || ''}
          onChange={(e) => handleCellEdit(product.id, field, parseFloat(e.target.value))}
          className="min-w-[120px]"
        />
      );
    }

    if (field === 'lead_time_days') {
      return (
        <Input
          type="number"
          value={editValues[product.id]?.[field] || value || ''}
          onChange={(e) => handleCellEdit(product.id, field, parseInt(e.target.value))}
          className="min-w-[80px]"
        />
      );
    }

    return (
      <Input
        value={editValues[product.id]?.[field] || value || ''}
        onChange={(e) => handleCellEdit(product.id, field, e.target.value)}
        className="min-w-[120px]"
      />
    );
  };

  return (
    <div className="px-4 py-6 sm:px-0">
          {/* Filters and Controls */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Filters & Controls</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-4 mb-4">
                <Input
                  placeholder="Search products..."
                  value={filters.search}
                  onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value, page: 1 }))}
                  className="max-w-sm"
                />
                <select
                  value={filters.status || ''}
                  onChange={(e) => setFilters(prev => ({ 
                    ...prev, 
                    status: e.target.value as 'Active' | 'Inactive' | undefined,
                    page: 1 
                  }))}
                  className="px-3 py-2 border rounded"
                >
                  <option value="">All Status</option>
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
                <Button variant="outline" onClick={loadProducts} disabled={loading}>
                  {loading ? 'Loading...' : 'Load Products'}
                </Button>
                <Button variant="outline" onClick={() => window.location.reload()}>
                  Refresh Page
                </Button>
                <Button
                  variant={bulkMode ? "default" : "outline"}
                  onClick={() => {
                    setBulkMode(!bulkMode);
                    setSelectedProducts([]);
                    setEditValues({});
                  }}
                >
                  {bulkMode ? 'Exit Bulk Mode' : 'Bulk Edit'}
                </Button>
                {bulkMode && selectedProducts.length > 0 && (
                  <Button onClick={handleBulkUpdate}>
                    Update Selected ({selectedProducts.length})
                  </Button>
                )}
                <Button onClick={() => setShowAddForm(!showAddForm)}>
                  {showAddForm ? 'Cancel' : 'Add Product'}
                </Button>
                <Button variant="outline" onClick={() => setShowBulkForm(!showBulkForm)}>
                  {showBulkForm ? 'Cancel' : 'Bulk Add'}
                </Button>
              </div>
              
              {/* Add Product Form */}
              {showAddForm && (
                <div className="border rounded-lg p-4 mb-4 bg-gray-50">
                  <h3 className="text-lg font-semibold mb-4">Add New Product</h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                    <Input
                      placeholder="SKU*"
                      value={newProduct.sku}
                      onChange={(e) => setNewProduct(prev => ({ ...prev, sku: e.target.value }))}
                    />
                    <Input
                      placeholder="Big SKU"
                      value={newProduct.big_sku}
                      onChange={(e) => setNewProduct(prev => ({ ...prev, big_sku: e.target.value }))}
                    />
                    <Input
                      placeholder="Name*"
                      value={newProduct.name}
                      onChange={(e) => setNewProduct(prev => ({ ...prev, name: e.target.value }))}
                    />
                    <Input
                      placeholder="Size"
                      value={newProduct.size}
                      onChange={(e) => setNewProduct(prev => ({ ...prev, size: e.target.value }))}
                    />
                    <Input
                      placeholder="Colour"
                      value={newProduct.colour}
                      onChange={(e) => setNewProduct(prev => ({ ...prev, colour: e.target.value }))}
                    />
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="Unit Cost"
                      value={newProduct.unit_production_cost}
                      onChange={(e) => setNewProduct(prev => ({ ...prev, unit_production_cost: parseFloat(e.target.value) || 0 }))}
                    />
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="Unit Price"
                      value={newProduct.unit_selling_price}
                      onChange={(e) => setNewProduct(prev => ({ ...prev, unit_selling_price: parseFloat(e.target.value) || 0 }))}
                    />
                    <Input
                      placeholder="Type"
                      value={newProduct.type}
                      onChange={(e) => setNewProduct(prev => ({ ...prev, type: e.target.value }))}
                    />
                    <Input
                      type="number"
                      placeholder="Lead Time (days)"
                      value={newProduct.lead_time_days}
                      onChange={(e) => setNewProduct(prev => ({ ...prev, lead_time_days: parseInt(e.target.value) || 0 }))}
                    />
                    <select
                      value={newProduct.status}
                      onChange={(e) => setNewProduct(prev => ({ ...prev, status: e.target.value as 'Active' | 'Inactive' }))}
                      className="px-3 py-2 border rounded"
                    >
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                    </select>
                  </div>
                  <div className="mt-4">
                    <Button onClick={handleAddProduct} disabled={!newProduct.sku || !newProduct.name}>
                      Save Product
                    </Button>
                  </div>
                </div>
              )}
              
              {/* Bulk Add Form */}
              {showBulkForm && (
                <div className="border rounded-lg p-4 mb-4 bg-gray-50">
                  <h3 className="text-lg font-semibold mb-2">Bulk Add Products</h3>
                  <p className="text-sm text-gray-600 mb-4">
                    Paste your data below. Use tab-separated values or multiple spaces between columns.
                  </p>
                  <p className="text-sm text-gray-600 mb-4">
                    Format: SKU | Big SKU | Name | Size | Colour | Unit Cost | Unit Price | Type | Lead Time | Status
                  </p>
                  <div className="mb-4">
                    <textarea
                      className="w-full h-64 p-3 border rounded-md font-mono text-sm"
                      placeholder="Paste your data here...&#10;&#10;Example:&#10;win-25-0176&#9;250152&#9;essential-denim&#9;xl&#9;black&#9;550&#9;1,245&#9;&#9;&#9;Active&#10;win-25-0177&#9;250153&#9;essential-denim&#9;xl&#9;navy&#9;550&#9;1,245&#9;&#9;&#9;Active&#10;win-25-0178&#9;250132&#9;stripes-pants&#9;xs&#9;navy&#9;427&#9;965&#9;&#9;&#9;Active"
                      value={bulkText}
                      onChange={(e) => setBulkText(e.target.value)}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={handleBulkPaste} disabled={!bulkText.trim()}>
                      Add {bulkText.trim().split('\n').filter(line => line.trim()).length} Products
                    </Button>
                    <Button variant="outline" onClick={() => {
                      setShowBulkForm(false);
                      setBulkText('');
                    }}>
                      Clear
                    </Button>
                  </div>
                  <div className="mt-4 text-xs text-gray-500">
                    <p>• Use tab-separated values or multiple spaces</p>
                    <p>• Numbers can include commas (e.g., 1,245)</p>
                    <p>• Empty fields are allowed and will use defaults</p>
                    <p>• Type and Lead Time are optional</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
          
          {/* Error Display */}
          {error && (
            <Alert className="mb-6 border-red-200 bg-red-50">
              <AlertDescription className="text-red-800">
                Error: {error}
                <Button variant="link" className="ml-2 p-0 h-auto text-red-800 underline" onClick={() => setError(null)}>
                  Dismiss
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {/* Products Table */}
          <Card>
            <CardHeader>
              <CardTitle>Products ({pagination.total})</CardTitle>
              <CardDescription>
                Page {filters.page} of {pagination.totalPages}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8">Loading...</div>
              ) : products.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No products loaded. Click "Add Product" to create a new product or "Load Products" to fetch existing ones.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b">
                        {bulkMode && <th className="text-left p-2"></th>}
                        <th className="text-left p-2">SKU</th>
                        <th className="text-left p-2">Big SKU</th>
                        <th className="text-left p-2">Name</th>
                        <th className="text-left p-2">Size</th>
                        <th className="text-left p-2">Colour</th>
                        <th className="text-left p-2">Unit Cost</th>
                        <th className="text-left p-2">Unit Price</th>
                        <th className="text-left p-2">Type</th>
                        <th className="text-left p-2">Lead Time</th>
                        <th className="text-left p-2">Status</th>
                        <th className="text-left p-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {products.map((product) => (
                        <tr key={product.id} className="border-b hover:bg-gray-50">
                          {bulkMode && (
                            <td className="p-2">
                              <input
                                type="checkbox"
                                checked={selectedProducts.includes(product.id)}
                                onChange={() => handleSelectProduct(product.id)}
                              />
                            </td>
                          )}
                          <td className="p-2">{renderEditableCell(product, 'sku', product.sku)}</td>
                          <td className="p-2">{renderEditableCell(product, 'big_sku', product.big_sku)}</td>
                          <td className="p-2">{renderEditableCell(product, 'name', product.name)}</td>
                          <td className="p-2">{renderEditableCell(product, 'size', product.size)}</td>
                          <td className="p-2">{renderEditableCell(product, 'colour', product.colour)}</td>
                          <td className="p-2">{renderEditableCell(product, 'unit_production_cost', product.unit_production_cost)}</td>
                          <td className="p-2">{renderEditableCell(product, 'unit_selling_price', product.unit_selling_price)}</td>
                          <td className="p-2">{renderEditableCell(product, 'type', product.type)}</td>
                          <td className="p-2">{renderEditableCell(product, 'lead_time_days', product.lead_time_days)}</td>
                          <td className="p-2">
                            {renderEditableCell(product, 'status', product.status)}
                          </td>
                          <td className="p-2">
                            {!bulkMode && (
                              <div className="flex space-x-2">
                                {editing === product.id ? (
                                  <>
                                    <Button size="sm" onClick={() => handleSave(product.id)}>
                                      Save
                                    </Button>
                                    <Button size="sm" variant="outline" onClick={() => handleCancel(product.id)}>
                                      Cancel
                                    </Button>
                                  </>
                                ) : (
                                  <>
                                    <Button size="sm" variant="outline" onClick={() => handleEdit(product.id, product)}>
                                      Edit
                                    </Button>
                                    <Button size="sm" variant="destructive" onClick={() => handleDelete(product.id)}>
                                      Delete
                                    </Button>
                                  </>
                                )}
                              </div>
                            )}
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
                  >
                    Next
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
    </div>
  );
}
