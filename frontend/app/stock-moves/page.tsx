'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { stockMovesApi, StockMove, StockMoveFilters, StockSummary, StockBalance } from '@/lib/stock-moves';
import { storesApi, Store } from '@/lib/stores';

export default function StockMovesPage() {
  const router = useRouter();
  const [stockMoves, setStockMoves] = useState<StockMove[]>([]);
  const [stockSummary, setStockSummary] = useState<StockSummary[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, any>>({});
  const [filters, setFilters] = useState<StockMoveFilters>({
    page: 1,
    limit: 50,
    movement_type: undefined,
    search: ''
  });
  const [pagination, setPagination] = useState({
    total: 0,
    totalPages: 0,
    hasMore: false
  });
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedStockMoves, setSelectedStockMoves] = useState<string[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showBulkForm, setShowBulkForm] = useState(false);
  const [showBulkEditForm, setShowBulkEditForm] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [bulkEditValues, setBulkEditValues] = useState<Partial<StockMove> & { quantity_adjustment?: number }>({});
  const [newStockMove, setNewStockMove] = useState<Partial<StockMove>>({
    move_date: new Date().toISOString().split('T')[0],
    sku: '',
    quantity: 0,
    destination: 'warehouse'
  });

  useEffect(() => {
    loadStores();
  }, []);

  const loadStores = async () => {
    try {
      const response = await storesApi.getStores({ limit: 100 });
      setStores(response.data);
    } catch (error: any) {
      console.error('Failed to load stores:', error);
    }
  };

  const loadStockMoves = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await stockMovesApi.getStockMoves(filters);
      setStockMoves(response.data);
      setPagination({
        total: response.pagination.total,
        totalPages: response.pagination.totalPages,
        hasMore: response.pagination.hasMore
      });
    } catch (error: any) {
      console.error('Load stock moves error:', error);
      setError(error.message || 'Failed to load stock moves');
    } finally {
      setLoading(false);
    }
  };

  const loadStockSummary = async () => {
    try {
      const summary = await stockMovesApi.getStockSummary();
      setStockSummary(summary);
    } catch (error: any) {
      console.error('Failed to load stock summary:', error);
    }
  };

  const validateSKU = async (sku: string): Promise<boolean> => {
    if (!sku) {
      setValidationErrors(prev => ({ ...prev, sku: 'SKU is required' }));
      return false;
    }

    const validation = await stockMovesApi.validateSKU(sku);
    if (!validation.valid) {
      setValidationErrors(prev => ({ ...prev, sku: `SKU '${sku}' not found in products` }));
      return false;
    }

    setValidationErrors(prev => {
      const { sku: _, ...rest } = prev;
      return rest;
    });
    return true;
  };

  const handleAddStockMove = async () => {
    try {
      // Validate SKU
      const isValid = await validateSKU(newStockMove.sku || '');
      if (!isValid) {
        alert('Please fix validation errors before saving');
        return;
      }

      if (!newStockMove.move_date || newStockMove.quantity === 0) {
        alert('Please fill in all required fields');
        return;
      }

      await stockMovesApi.createStockMove(newStockMove as any);
      setStockMoves([...stockMoves]);
      setShowAddForm(false);
      setNewStockMove({
        move_date: new Date().toISOString().split('T')[0],
        sku: '',
        quantity: 0,
        destination: 'warehouse'
      });
      alert('Stock move added successfully');
      loadStockMoves();
      loadStockSummary();
    } catch (error: any) {
      alert(error.message || 'Failed to add stock move');
    }
  };

  const handleBulkPaste = async () => {
    try {
      const lines = bulkText.trim().split('\n');
      const headers = ['move_date', 'sku', 'quantity', 'destination'];
      
      const stockMovesToCreate: any[] = [];
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        let parts = line.includes('\t') ? line.split('\t') : line.split(/\s{2,}|\,/);
        parts = parts.map(p => p.replace(/^"(.*)"$/, '').trim());
        
        const move: any = {};
        headers.forEach((header, index) => {
          let value = parts[index] || '';
          
          if (header === 'quantity') {
            value = value.replace(/,/g, '');
            move[header] = value ? parseInt(value) : 0;
          } else {
            move[header] = value || undefined;
          }
        });
        
        if (!move.move_date || !move.sku || move.quantity === 0) continue;
        
        stockMovesToCreate.push(move);
      }
      
      if (stockMovesToCreate.length === 0) {
        alert('No valid stock moves found in the pasted data');
        return;
      }
      
      const response = await stockMovesApi.bulkCreateStockMoves(stockMovesToCreate);
      
      if (response.success) {
        setShowBulkForm(false);
        setBulkText('');
        alert(`Successfully added ${response.created} stock moves${response.errors ? ` (${response.errors.length} errors)` : ''}`);
        loadStockMoves();
        loadStockSummary();
      }
    } catch (error: any) {
      alert(error.message || 'Failed to add stock moves in bulk');
    }
  };

  const handleEdit = (moveId: string, move: StockMove) => {
    setEditing(moveId);
    setEditValues({ [moveId]: { ...move } });
  };

  const handleSave = async (moveId: string) => {
    try {
      const updates = editValues[moveId];
      
      // Validate SKU if it was changed
      if (updates.sku) {
        const isValid = await validateSKU(updates.sku);
        if (!isValid) {
          alert('Invalid SKU. Please check and try again.');
          return;
        }
      }
      
      delete updates.id;
      delete updates.brand_id;
      delete updates.movement_type;
      delete updates.created_at;
      delete updates.updated_at;
      
      await stockMovesApi.updateStockMove(moveId, updates);
      setEditing(null);
      setEditValues({ ...editValues, [moveId]: undefined });
      loadStockMoves();
      loadStockSummary();
    } catch (error: any) {
      alert(error.message || 'Failed to update stock move');
    }
  };

  const handleCancel = (moveId: string) => {
    setEditing(null);
    setEditValues({ ...editValues, [moveId]: undefined });
  };

  const handleDelete = async (moveId: string) => {
    if (!confirm('Are you sure you want to delete this stock move?')) return;
    
    try {
      await stockMovesApi.deleteStockMove(moveId);
      setStockMoves(stockMoves.filter(m => m.id !== moveId));
      loadStockSummary();
    } catch (error: any) {
      alert(error.message || 'Failed to delete stock move');
    }
  };

  const handleBulkEdit = async () => {
    if (selectedStockMoves.length === 0) {
      alert('Please select stock moves to edit');
      return;
    }

    try {
      let successCount = 0;
      let failCount = 0;

      for (const moveId of selectedStockMoves) {
        try {
          const updates = { ...bulkEditValues };
          
          // Remove fields that shouldn't be updated
          delete updates.id;
          delete updates.brand_id;
          delete updates.movement_type;
          delete updates.created_at;
          delete updates.updated_at;
          delete updates.big_sku;
          delete updates.item_name;
          delete updates.colour;
          delete updates.size;

          // Only send fields that have values
          const filteredUpdates: any = {};
          Object.keys(updates).forEach((key: string) => {
            const value = (updates as any)[key];
            if (value !== undefined && value !== '') {
              filteredUpdates[key] = value;
            }
          });

          if (Object.keys(filteredUpdates).length > 0) {
            await stockMovesApi.updateStockMove(moveId, filteredUpdates);
            successCount++;
          }
        } catch (error) {
          failCount++;
          console.error(`Failed to update stock move ${moveId}:`, error);
        }
      }

      alert(`Bulk edit complete: ${successCount} updated, ${failCount} failed`);
      setShowBulkEditForm(false);
      setBulkEditValues({});
      setSelectedStockMoves([]);
      setBulkMode(false);
      loadStockMoves();
      loadStockSummary();
    } catch (error: any) {
      alert(error.message || 'Failed to bulk edit stock moves');
    }
  };

  const handleBulkDelete = async () => {
    if (selectedStockMoves.length === 0) {
      alert('Please select stock moves to delete');
      return;
    }

    if (!confirm(`Are you sure you want to delete ${selectedStockMoves.length} stock moves?`)) {
      return;
    }

    try {
      let successCount = 0;
      let failCount = 0;

      for (const moveId of selectedStockMoves) {
        try {
          await stockMovesApi.deleteStockMove(moveId);
          successCount++;
        } catch (error) {
          failCount++;
          console.error(`Failed to delete stock move ${moveId}:`, error);
        }
      }

      alert(`Bulk delete complete: ${successCount} deleted, ${failCount} failed`);
      setSelectedStockMoves([]);
      setBulkMode(false);
      loadStockMoves();
      loadStockSummary();
    } catch (error: any) {
      alert(error.message || 'Failed to bulk delete stock moves');
    }
  };

  const renderEditableCell = (move: StockMove, field: keyof StockMove, value: any) => {
    if (editing === move.id) {
      if (field === 'move_date') {
        return (
          <input
            type="date"
            value={editValues[move.id][field] || ''}
            onChange={(e) => setEditValues({
              ...editValues,
              [move.id]: { ...editValues[move.id], [field]: e.target.value }
            })}
            className="w-full px-2 py-1 border rounded"
          />
        );
      } else if (field === 'destination') {
        return (
          <select
            value={editValues[move.id][field] || ''}
            onChange={(e) => setEditValues({
              ...editValues,
              [move.id]: { ...editValues[move.id], [field]: e.target.value }
            })}
            className="w-full px-2 py-1 border rounded"
          >
            <option value="warehouse">Warehouse</option>
            {stores.map(store => (
              <option key={store.id} value={store.name}>{store.name}</option>
            ))}
          </select>
        );
      } else if (field === 'sku') {
        return (
          <input
            type="text"
            value={editValues[move.id][field] || ''}
            onChange={(e) => setEditValues({
              ...editValues,
              [move.id]: { ...editValues[move.id], [field]: e.target.value }
            })}
            onBlur={(e) => validateSKU(e.target.value)}
            className={`w-full px-2 py-1 border rounded ${validationErrors.sku ? 'border-red-500' : ''}`}
          />
        );
      } else if (field === 'quantity') {
        return (
          <input
            type="number"
            value={editValues[move.id][field] || ''}
            onChange={(e) => setEditValues({
              ...editValues,
              [move.id]: { ...editValues[move.id], [field]: parseInt(e.target.value) || 0 }
            })}
            className="w-full px-2 py-1 border rounded"
          />
        );
      } else {
        return (
          <input
            type="text"
            value={editValues[move.id][field] || ''}
            onChange={(e) => setEditValues({
              ...editValues,
              [move.id]: { ...editValues[move.id], [field]: e.target.value }
            })}
            className="w-full px-2 py-1 border rounded"
            disabled
          />
        );
      }
    }
    
    if (field === 'move_date') {
      return value ? new Date(value).toLocaleDateString() : '-';
    }
    
    return value || '-';
  };

  const getMovementTypeBadge = (type: string) => {
    switch (type) {
      case 'inbound':
        return <Badge className="bg-green-100 text-green-800">Inbound</Badge>;
      case 'outbound':
        return <Badge className="bg-red-100 text-red-800">Outbound</Badge>;
      case 'transfer_to':
        return <Badge className="bg-blue-100 text-blue-800">To Store</Badge>;
      case 'transfer_from':
        return <Badge className="bg-orange-100 text-orange-800">From Store</Badge>;
      default:
        return <Badge variant="outline">{type}</Badge>;
    }
  };

  const getStockBalance = (sku: string, destination: string): number => {
    const summary = stockSummary.find(s => s.sku === sku);
    if (!summary) return 0;
    
    if (destination === 'warehouse') {
      return summary.warehouse_quantity;
    } else {
      // Find balance for specific store
      const storeBalance = stockSummary.find(s => s.sku === sku);
      // This is simplified - in reality you'd query the balance view
      return storeBalance?.total_in_stores || 0;
    }
  };

  return (
    <div className="px-4 py-6 sm:px-0">
      <Card>
        <CardHeader>
          <CardTitle>Stock Moves Management</CardTitle>
          <CardDescription>
            Date | SKU | Qty | Destination
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Filters and Actions */}
          <div className="flex flex-wrap gap-4 mb-6">
            <Input
              placeholder="Search by SKU or Item..."
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value, page: 1 })}
              className="max-w-xs"
            />
            <select
              value={filters.destination || ''}
              onChange={(e) => setFilters({ 
                ...filters, 
                destination: e.target.value,
                page: 1 
              })}
              className="px-3 py-2 border rounded"
            >
              <option value="">All Destinations</option>
              <option value="warehouse">Warehouse</option>
              {stores.map(store => (
                <option key={store.id} value={store.name}>{store.name}</option>
              ))}
            </select>
            <select
              value={filters.movement_type || ''}
              onChange={(e) => setFilters({ 
                ...filters, 
                movement_type: e.target.value as any,
                page: 1 
              })}
              className="px-3 py-2 border rounded"
            >
              <option value="">All Types</option>
              <option value="inbound">Inbound</option>
              <option value="outbound">Outbound</option>
              <option value="transfer_to">To Store</option>
              <option value="transfer_from">From Store</option>
            </select>
            <Button variant="outline" onClick={loadStockMoves} disabled={loading}>
              {loading ? 'Loading...' : 'Load Stock Moves'}
            </Button>
            <Button
              variant={bulkMode ? "default" : "outline"}
              onClick={() => {
                setBulkMode(!bulkMode);
                setSelectedStockMoves([]);
              }}
            >
              {bulkMode ? 'Exit Bulk Mode' : 'Bulk Mode'}
            </Button>
            {bulkMode && selectedStockMoves.length > 0 && (
              <>
                <Button onClick={() => setShowBulkEditForm(!showBulkEditForm)}>
                  Edit Selected ({selectedStockMoves.length})
                </Button>
                <Button variant="destructive" onClick={handleBulkDelete}>
                  Delete Selected ({selectedStockMoves.length})
                </Button>
              </>
            )}
            <Button onClick={() => setShowAddForm(!showAddForm)}>
              {showAddForm ? 'Cancel' : 'Add Stock Move'}
            </Button>
            <Button variant="outline" onClick={() => setShowBulkForm(!showBulkForm)}>
              {showBulkForm ? 'Cancel' : 'Bulk Add'}
            </Button>
          </div>
          
          {/* Add Stock Move Form */}
          {showAddForm && (
            <div className="border rounded-lg p-4 mb-4 bg-gray-50">
              <h3 className="text-lg font-semibold mb-4">Add New Stock Move</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="text-sm font-medium">Date*</label>
                  <Input
                    type="date"
                    value={newStockMove.move_date}
                    onChange={(e) => setNewStockMove(prev => ({ ...prev, move_date: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">SKU*</label>
                  <Input
                    placeholder="SKU"
                    value={newStockMove.sku}
                    onChange={(e) => setNewStockMove(prev => ({ ...prev, sku: e.target.value }))}
                    onBlur={(e) => validateSKU(e.target.value)}
                    className={validationErrors.sku ? 'border-red-500' : ''}
                  />
                  {validationErrors.sku && (
                    <p className="text-xs text-red-500 mt-1">{validationErrors.sku}</p>
                  )}
                </div>
                <div>
                  <label className="text-sm font-medium">Quantity*</label>
                  <Input
                    type="number"
                    placeholder="Quantity"
                    value={newStockMove.quantity}
                    onChange={(e) => setNewStockMove(prev => ({ ...prev, quantity: parseInt(e.target.value) || 0 }))}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Positive = To destination, Negative = From destination
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium">Destination*</label>
                  <select
                    value={newStockMove.destination}
                    onChange={(e) => setNewStockMove(prev => ({ ...prev, destination: e.target.value }))}
                    className="w-full px-3 py-2 border rounded"
                  >
                    <option value="warehouse">Warehouse</option>
                    {stores.map(store => (
                      <option key={store.id} value={store.name}>{store.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="mt-4">
                <Button onClick={handleAddStockMove} disabled={!newStockMove.sku || !newStockMove.move_date || newStockMove.quantity === 0}>
                  Save Stock Move
                </Button>
              </div>
            </div>
          )}
          
          {/* Bulk Add Form */}
          {showBulkForm && (
            <div className="border rounded-lg p-4 mb-4 bg-gray-50">
              <h3 className="text-lg font-semibold mb-2">Bulk Add Stock Moves</h3>
              <p className="text-sm text-gray-600 mb-4">
                Format: Date | SKU | Qty | Destination
              </p>
              <div className="mb-4">
                <textarea
                  className="w-full h-64 p-3 border rounded-md font-mono text-sm"
                  placeholder="Paste your data here...&#10;&#10;Example:&#10;2024-01-15&#9;WIN-001&#9;100&#9;warehouse&#10;2024-01-16&#9;WIN-001&#9;20&#9;Main Store&#10;2024-01-17&#9;WIN-001&#9;-5&#9;Main Store"
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={handleBulkPaste} disabled={loading}>
                  {loading ? 'Adding...' : 'Add Stock Moves'}
                </Button>
                <Button variant="outline" onClick={() => setBulkText('')}>
                  Clear
                </Button>
              </div>
            </div>
          )}
          
          {/* Bulk Edit Form */}
          {showBulkEditForm && (
            <div className="border rounded-lg p-4 mb-4 bg-gray-50">
              <h3 className="text-lg font-semibold mb-4">Bulk Edit Selected Stock Moves</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium">Destination</label>
                  <select
                    value={bulkEditValues.destination}
                    onChange={(e) => setBulkEditValues(prev => ({ ...prev, destination: e.target.value }))}
                    className="w-full px-3 py-2 border rounded"
                  >
                    <option value="">Keep Original</option>
                    <option value="warehouse">Warehouse</option>
                    {stores.map(store => (
                      <option key={store.id} value={store.name}>{store.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium">Quantity Adjustment</label>
                  <Input
                    type="number"
                    placeholder="Leave blank to keep"
                    value={bulkEditValues.quantity_adjustment || ''}
                    onChange={(e) => setBulkEditValues(prev => ({ ...prev, quantity_adjustment: parseInt(e.target.value) || undefined }))}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Date</label>
                  <Input
                    type="date"
                    placeholder="Leave blank to keep"
                    value={bulkEditValues.move_date || ''}
                    onChange={(e) => setBulkEditValues(prev => ({ ...prev, move_date: e.target.value }))}
                  />
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <Button onClick={handleBulkEdit} disabled={loading}>
                  {loading ? 'Updating...' : 'Update Selected'}
                </Button>
                <Button variant="outline" onClick={() => setShowBulkEditForm(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
          
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
          
          {/* Stock Moves Table */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  {bulkMode && (
                    <th className="text-left p-3">
                      <input
                        type="checkbox"
                        checked={selectedStockMoves.length === stockMoves.length}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedStockMoves(stockMoves.map(s => s.id));
                          } else {
                            setSelectedStockMoves([]);
                          }
                        }}
                      />
                    </th>
                  )}
                  <th className="text-left p-3 font-medium">Date</th>
                  <th className="text-left p-3 font-medium">SKU</th>
                  <th className="text-center p-3 font-medium">Quantity</th>
                  <th className="text-left p-3 font-medium">Destination</th>
                  <th className="text-left p-3 font-medium">Type</th>
                  <th className="text-left p-3 font-medium">Notes</th>
                  {!bulkMode && <th className="text-center p-3 font-medium">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {stockMoves.map((stockMove) => (
                  <tr key={stockMove.id} className="border-b hover:bg-gray-50">
                    {bulkMode && (
                      <td className="p-3">
                        <input
                          type="checkbox"
                          checked={selectedStockMoves.includes(stockMove.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedStockMoves([...selectedStockMoves, stockMove.id]);
                            } else {
                              setSelectedStockMoves(selectedStockMoves.filter(id => id !== stockMove.id));
                            }
                          }}
                        />
                      </td>
                    )}
                    <td className="p-3">{stockMove.move_date}</td>
                    <td className="p-3 font-medium">{stockMove.sku}</td>
                    <td className="p-3 text-center">{stockMove.quantity}</td>
                    <td className="p-3">{stockMove.destination}</td>
                    <td className="p-3">{getMovementTypeBadge(stockMove.movement_type)}</td>
                    <td className="p-3 text-gray-600">{stockMove.notes || '-'}</td>
                    {!bulkMode && (
                      <td className="p-3 text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(stockMove.id, stockMove)}
                          className="mr-2"
                        >
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(stockMove.id)}
                          className="text-red-600 hover:text-red-800"
                        >
                          Delete
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
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
                                            
                                              
