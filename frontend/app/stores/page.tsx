'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { storesApi, Store, StoreFilters } from '@/lib/stores';

export default function StoresPage() {
  const router = useRouter();
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, any>>({});
  const [filters, setFilters] = useState<StoreFilters>({
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
  const [selectedStores, setSelectedStores] = useState<string[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showBulkForm, setShowBulkForm] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [newStore, setNewStore] = useState<Partial<Store>>({
    name: '',
    group: '',
    commission: 0,
    rent: 0,
    activation_date: '',
    deactivation_date: ''
  });

  const loadStores = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await storesApi.getStores(filters);
      setStores(response.data);
      setPagination({
        total: response.pagination.total,
        totalPages: response.pagination.totalPages,
        hasMore: response.pagination.hasMore
      });
    } catch (error: any) {
      console.error('Load stores error:', error);
      setError(error.message || 'Failed to load stores');
    } finally {
      setLoading(false);
    }
  };

  const handleAddStore = async () => {
    try {
      const response = await storesApi.createStore(newStore as Omit<Store, 'id' | 'brand_id' | 'created_at' | 'updated_at'>);
      setStores([response, ...stores]);
      setShowAddForm(false);
      setNewStore({
        name: '',
        group: '',
        commission: 0,
        rent: 0,
        activation_date: '',
        deactivation_date: ''
      });
      alert('Store added successfully');
    } catch (error: any) {
      alert(error.message || 'Failed to add store');
    }
  };

  const handleBulkPaste = async () => {
    try {
      // Parse the bulk text - handle tab-separated values
      const lines = bulkText.trim().split('\n');
      const headers = ['name', 'group', 'commission', 'rent', 'activation_date', 'deactivation_date'];
      
      const storesToCreate: Omit<Store, 'id' | 'brand_id' | 'created_at' | 'updated_at'>[] = [];
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        // Split by tab first, if no tabs then split by multiple spaces or comma
        let parts = line.includes('\t') ? line.split('\t') : line.split(/\s{2,}|\,/);
        
        // Clean up parts (remove quotes if present and trim whitespace)
        parts = parts.map(p => p.replace(/^"(.*)"$/, '').trim());
        
        // Create store object
        const store: any = {};
        headers.forEach((header, index) => {
          let value = parts[index] || '';
          
          // Handle numeric values with commas (e.g., "1,000" -> 1000)
          if (header === 'commission' || header === 'rent') {
            value = value.replace(/,/g, '');
            store[header] = value ? parseFloat(value) : 0;
          } else {
            store[header] = value || undefined;
          }
        });
        
        // Skip if no name
        if (!store.name) continue;
        
        storesToCreate.push(store as Omit<Store, 'id' | 'brand_id' | 'created_at' | 'updated_at'>);
      }
      
      if (storesToCreate.length === 0) {
        alert('No valid stores found in the pasted data');
        return;
      }
      
      // Bulk create
      const response = await storesApi.bulkCreateStores(storesToCreate);
      
      if (response.success) {
        setStores([...response.data, ...stores]);
        setShowBulkForm(false);
        setBulkText('');
        alert(`Successfully added ${response.created} stores${response.errors ? ` (${response.errors.length} errors)` : ''}`);
      }
    } catch (error: any) {
      alert(error.message || 'Failed to add stores in bulk');
    }
  };

  const handleEdit = (storeId: string, store: Store) => {
    setEditing(storeId);
    setEditValues({ [storeId]: { ...store } });
  };

  const handleSave = async (storeId: string) => {
    try {
      const updates = editValues[storeId];
      delete updates.id;
      delete updates.brand_id;
      delete updates.created_at;
      delete updates.updated_at;
      
      const response = await storesApi.updateStore(storeId, updates);
      setStores(stores.map(s => s.id === storeId ? response : s));
      setEditing(null);
      setEditValues({ ...editValues, [storeId]: undefined });
    } catch (error: any) {
      alert(error.message || 'Failed to update store');
    }
  };

  const handleCancel = (storeId: string) => {
    setEditing(null);
    setEditValues({ ...editValues, [storeId]: undefined });
  };

  const handleDelete = async (storeId: string) => {
    if (!confirm('Are you sure you want to delete this store?')) return;
    
    try {
      await storesApi.deleteStore(storeId);
      setStores(stores.filter(s => s.id !== storeId));
    } catch (error: any) {
      alert(error.message || 'Failed to delete store');
    }
  };

  const handleBulkUpdate = async () => {
    // Implementation for bulk updates
    alert('Bulk update feature coming soon');
  };

  const renderEditableCell = (store: Store, field: keyof Store, value: any) => {
    if (editing === store.id) {
      if (field === 'activation_date' || field === 'deactivation_date') {
        return (
          <input
            type="date"
            value={editValues[store.id][field] || ''}
            onChange={(e) => setEditValues({
              ...editValues,
              [store.id]: { ...editValues[store.id], [field]: e.target.value }
            })}
            className="w-full px-2 py-1 border rounded"
          />
        );
      } else if (field === 'commission' || field === 'rent') {
        return (
          <input
            type="number"
            step="0.01"
            value={editValues[store.id][field] || ''}
            onChange={(e) => setEditValues({
              ...editValues,
              [store.id]: { ...editValues[store.id], [field]: parseFloat(e.target.value) || 0 }
            })}
            className="w-full px-2 py-1 border rounded"
          />
        );
      } else {
        return (
          <input
            type="text"
            value={editValues[store.id][field] || ''}
            onChange={(e) => setEditValues({
              ...editValues,
              [store.id]: { ...editValues[store.id], [field]: e.target.value }
            })}
            className="w-full px-2 py-1 border rounded"
          />
        );
      }
    }
    
    // Display value with formatting
    if (field === 'commission' || field === 'rent') {
      return value ? value.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '-';
    }
    
    if (field === 'activation_date' || field === 'deactivation_date') {
      return value ? new Date(value).toLocaleDateString() : '-';
    }
    
    return value || '-';
  };

  const isStoreActive = (store: Store) => {
    const now = new Date();
    const activationDate = store.activation_date ? new Date(store.activation_date) : null;
    const deactivationDate = store.deactivation_date ? new Date(store.deactivation_date) : null;
    
    if (!activationDate || activationDate > now) return false;
    if (!deactivationDate) return true;
    return deactivationDate > now;
  };

  return (
    <div className="px-4 py-6 sm:px-0">
          <Card>
            <CardHeader>
              <CardTitle>Stores Management</CardTitle>
              <CardDescription>
                Add, edit, and manage your store locations
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Filters and Actions */}
              <div className="flex flex-wrap gap-4 mb-6">
                <Input
                  placeholder="Search stores..."
                  value={filters.search}
                  onChange={(e) => setFilters({ ...filters, search: e.target.value, page: 1 })}
                  className="max-w-xs"
                />
                <select
                  value={filters.status || ''}
                  onChange={(e) => setFilters({ 
                    ...filters, 
                    status: e.target.value as 'active' | 'inactive' | undefined,
                    page: 1 
                  })}
                  className="px-3 py-2 border rounded"
                >
                  <option value="">All Status</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
                <Button variant="outline" onClick={loadStores} disabled={loading}>
                  {loading ? 'Loading...' : 'Load Stores'}
                </Button>
                <Button variant="outline" onClick={() => window.location.reload()}>
                  Refresh Page
                </Button>
                <Button
                  variant={bulkMode ? "default" : "outline"}
                  onClick={() => {
                    setBulkMode(!bulkMode);
                    setSelectedStores([]);
                    setEditValues({});
                  }}
                >
                  {bulkMode ? 'Exit Bulk Mode' : 'Bulk Edit'}
                </Button>
                {bulkMode && selectedStores.length > 0 && (
                  <Button onClick={handleBulkUpdate}>
                    Update Selected ({selectedStores.length})
                  </Button>
                )}
                <Button onClick={() => setShowAddForm(!showAddForm)}>
                  {showAddForm ? 'Cancel' : 'Add Store'}
                </Button>
                <Button variant="outline" onClick={() => setShowBulkForm(!showBulkForm)}>
                  {showBulkForm ? 'Cancel' : 'Bulk Add'}
                </Button>
              </div>
              
              {/* Add Store Form */}
              {showAddForm && (
                <div className="border rounded-lg p-4 mb-4 bg-gray-50">
                  <h3 className="text-lg font-semibold mb-4">Add New Store</h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    <Input
                      placeholder="Store Name*"
                      value={newStore.name}
                      onChange={(e) => setNewStore(prev => ({ ...prev, name: e.target.value }))}
                    />
                    <Input
                      placeholder="Group"
                      value={newStore.group}
                      onChange={(e) => setNewStore(prev => ({ ...prev, group: e.target.value }))}
                    />
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="Commission %"
                      value={newStore.commission}
                      onChange={(e) => setNewStore(prev => ({ ...prev, commission: parseFloat(e.target.value) || 0 }))}
                    />
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="Rent"
                      value={newStore.rent}
                      onChange={(e) => setNewStore(prev => ({ ...prev, rent: parseFloat(e.target.value) || 0 }))}
                    />
                    <Input
                      type="date"
                      placeholder="Activation Date"
                      value={newStore.activation_date}
                      onChange={(e) => setNewStore(prev => ({ ...prev, activation_date: e.target.value }))}
                    />
                    <Input
                      type="date"
                      placeholder="Deactivation Date"
                      value={newStore.deactivation_date}
                      onChange={(e) => setNewStore(prev => ({ ...prev, deactivation_date: e.target.value }))}
                    />
                  </div>
                  <div className="mt-4">
                    <Button onClick={handleAddStore} disabled={!newStore.name}>
                      Save Store
                    </Button>
                  </div>
                </div>
              )}
              
              {/* Bulk Add Form */}
              {showBulkForm && (
                <div className="border rounded-lg p-4 mb-4 bg-gray-50">
                  <h3 className="text-lg font-semibold mb-2">Bulk Add Stores</h3>
                  <p className="text-sm text-gray-600 mb-4">
                    Paste your data below. Use tab-separated values or multiple spaces between columns.
                  </p>
                  <p className="text-sm text-gray-600 mb-4">
                    Format: Name | Group | Commission | Rent | Activation Date | Deactivation Date
                  </p>
                  <div className="mb-4">
                    <textarea
                      className="w-full h-64 p-3 border rounded-md font-mono text-sm"
                      placeholder="Paste your data here...&#10;&#10;Example:&#10;Main Store&#9;A&#9;15.00&#9;5000.00&#9;2024-01-01&#9;&#10;Downtown Branch&#9;A&#9;12.50&#9;3500.00&#9;2024-02-15&#9;"
                      value={bulkText}
                      onChange={(e) => setBulkText(e.target.value)}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={handleBulkPaste} disabled={!bulkText.trim()}>
                      Add {bulkText.trim().split('\n').filter(line => line.trim()).length} Stores
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
                    <p>• Numbers can include commas (e.g., 5,000.00)</p>
                    <p>• Empty fields are allowed</p>
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

          {/* Stores Table */}
          <Card>
            <CardHeader>
              <CardTitle>Stores ({pagination.total})</CardTitle>
              <CardDescription>
                Page {filters.page} of {pagination.totalPages}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8">Loading...</div>
              ) : stores.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No stores loaded. Click "Add Store" to create a new store or "Load Stores" to fetch existing ones.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b">
                        {bulkMode && (
                          <th className="text-left p-2">
                            <input
                              type="checkbox"
                              checked={selectedStores.length === stores.length}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedStores(stores.map(s => s.id));
                                } else {
                                  setSelectedStores([]);
                                }
                              }}
                            />
                          </th>
                        )}
                        <th className="text-left p-2">Name</th>
                        <th className="text-left p-2">Group</th>
                        <th className="text-left p-2">Commission</th>
                        <th className="text-left p-2">Rent</th>
                        <th className="text-left p-2">Activation Date</th>
                        <th className="text-left p-2">Deactivation Date</th>
                        <th className="text-left p-2">Status</th>
                        <th className="text-left p-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stores.map((store) => (
                        <tr key={store.id} className="border-b hover:bg-gray-50">
                          {bulkMode && (
                            <td className="p-2">
                              <input
                                type="checkbox"
                                checked={selectedStores.includes(store.id)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedStores([...selectedStores, store.id]);
                                  } else {
                                    setSelectedStores(selectedStores.filter(id => id !== store.id));
                                  }
                                }}
                              />
                            </td>
                          )}
                          <td className="p-2 font-medium">{renderEditableCell(store, 'name', store.name)}</td>
                          <td className="p-2">{renderEditableCell(store, 'group', store.group)}</td>
                          <td className="p-2">{renderEditableCell(store, 'commission', store.commission)}%</td>
                          <td className="p-2">${renderEditableCell(store, 'rent', store.rent)}</td>
                          <td className="p-2">{renderEditableCell(store, 'activation_date', store.activation_date)}</td>
                          <td className="p-2">{renderEditableCell(store, 'deactivation_date', store.deactivation_date)}</td>
                          <td className="p-2">
                            {isStoreActive(store) ? (
                              <Badge variant="default">Active</Badge>
                            ) : (
                              <Badge variant="secondary">Inactive</Badge>
                            )}
                          </td>
                          <td className="p-2">
                            {!bulkMode && (
                              <div className="flex space-x-2">
                                {editing === store.id ? (
                                  <>
                                    <Button size="sm" onClick={() => handleSave(store.id)}>
                                      Save
                                    </Button>
                                    <Button size="sm" variant="outline" onClick={() => handleCancel(store.id)}>
                                      Cancel
                                    </Button>
                                  </>
                                ) : (
                                  <>
                                    <Button size="sm" variant="outline" onClick={() => handleEdit(store.id, store)}>
                                      Edit
                                    </Button>
                                    <Button size="sm" variant="destructive" onClick={() => handleDelete(store.id)}>
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
