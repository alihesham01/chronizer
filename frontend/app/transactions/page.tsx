'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { transactionsApi, Transaction, TransactionFilters } from '@/lib/transactions';
import { storesApi, Store } from '@/lib/stores';

export default function TransactionsPage() {
  const router = useRouter();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, any>>({});
  const [filters, setFilters] = useState<TransactionFilters>({
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
  const [selectedTransactions, setSelectedTransactions] = useState<string[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showBulkForm, setShowBulkForm] = useState(false);
  const [showBulkEditForm, setShowBulkEditForm] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [bulkEditValues, setBulkEditValues] = useState<Partial<Transaction> & { quantity_adjustment?: number; price_adjustment?: number }>({});
  const [newTransaction, setNewTransaction] = useState<Partial<Transaction>>({
    transaction_date: new Date().toISOString().split('T')[0],
    store_id: '',
    sku: '',
    quantity_sold: 0,
    selling_price: 0
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

  const loadTransactions = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await transactionsApi.getTransactions(filters);
      setTransactions(response.data);
      setPagination({
        total: response.pagination.total,
        totalPages: response.pagination.totalPages,
        hasMore: response.pagination.hasMore
      });
    } catch (error: any) {
      console.error('Load transactions error:', error);
      setError(error.message || 'Failed to load transactions');
    } finally {
      setLoading(false);
    }
  };

  const validateSKU = async (sku: string): Promise<boolean> => {
    if (!sku) {
      setValidationErrors(prev => ({ ...prev, sku: 'SKU is required' }));
      return false;
    }

    const validation = await transactionsApi.validateSKU(sku);
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

  const handleAddTransaction = async () => {
    try {
      // Validate SKU
      const isValid = await validateSKU(newTransaction.sku || '');
      if (!isValid) {
        alert('Please fix validation errors before saving');
        return;
      }

      if (!newTransaction.transaction_date || !newTransaction.selling_price) {
        alert('Please fill in all required fields');
        return;
      }

      await transactionsApi.createTransaction(newTransaction as any);
      setTransactions([...transactions]);
      setShowAddForm(false);
      setNewTransaction({
        transaction_date: new Date().toISOString().split('T')[0],
        store_id: '',
        sku: '',
        quantity_sold: 0,
        selling_price: 0
      });
      alert('Transaction added successfully');
      loadTransactions();
    } catch (error: any) {
      alert(error.message || 'Failed to add transaction');
    }
  };

  const handleBulkPaste = async () => {
    try {
      const lines = bulkText.trim().split('\n');
      const headers = ['transaction_date', 'store_id', 'sku', 'quantity_sold', 'selling_price'];
      
      const transactionsToCreate: any[] = [];
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        let parts = line.includes('\t') ? line.split('\t') : line.split(/\s{2,}|\,/);
        parts = parts.map(p => p.replace(/^"(.*)"$/, '').trim());
        
        const txn: any = {};
        headers.forEach((header, index) => {
          let value = parts[index] || '';
          
          if (header === 'quantity_sold') {
            value = value.replace(/,/g, '');
            txn[header] = value ? parseInt(value) : 0;
          } else if (header === 'selling_price') {
            value = value.replace(/,/g, '');
            txn[header] = value ? parseFloat(value) : 0;
          } else if (header === 'store_id') {
            // Try to find store by name
            const store = stores.find(s => s.name.toLowerCase() === value.toLowerCase());
            txn[header] = store ? store.id : value;
          } else {
            txn[header] = value || undefined;
          }
        });
        
        if (!txn.transaction_date || !txn.sku) continue;
        
        transactionsToCreate.push(txn);
      }
      
      if (transactionsToCreate.length === 0) {
        alert('No valid transactions found in the pasted data');
        return;
      }
      
      const response = await transactionsApi.bulkCreateTransactions(transactionsToCreate);
      
      if (response.success) {
        setShowBulkForm(false);
        setBulkText('');
        alert(`Successfully added ${response.created} transactions${response.errors ? ` (${response.errors.length} errors)` : ''}`);
        loadTransactions();
      }
    } catch (error: any) {
      alert(error.message || 'Failed to add transactions in bulk');
    }
  };

  const handleEdit = (txnId: string, txn: Transaction) => {
    setEditing(txnId);
    setEditValues({ [txnId]: { ...txn } });
  };

  const handleSave = async (txnId: string) => {
    try {
      const updates = editValues[txnId];
      
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
      delete updates.status;
      delete updates.created_at;
      delete updates.updated_at;
      
      await transactionsApi.updateTransaction(txnId, updates);
      setEditing(null);
      setEditValues({ ...editValues, [txnId]: undefined });
      loadTransactions();
    } catch (error: any) {
      alert(error.message || 'Failed to update transaction');
    }
  };

  const handleCancel = (txnId: string) => {
    setEditing(null);
    setEditValues({ ...editValues, [txnId]: undefined });
  };

  const handleDelete = async (txnId: string) => {
    if (!confirm('Are you sure you want to delete this transaction?')) return;
    
    try {
      await transactionsApi.deleteTransaction(txnId);
      setTransactions(transactions.filter(t => t.id !== txnId));
    } catch (error: any) {
      alert(error.message || 'Failed to delete transaction');
    }
  };

  const handleBulkEdit = async () => {
    if (selectedTransactions.length === 0) {
      alert('Please select transactions to edit');
      return;
    }

    try {
      let successCount = 0;
      let failCount = 0;

      for (const txnId of selectedTransactions) {
        try {
          const updates = { ...bulkEditValues };
          
          // Remove fields that shouldn't be updated
          delete updates.id;
          delete updates.brand_id;
          delete updates.status;
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
            await transactionsApi.updateTransaction(txnId, filteredUpdates);
            successCount++;
          }
        } catch (error) {
          failCount++;
          console.error(`Failed to update transaction ${txnId}:`, error);
        }
      }

      alert(`Bulk edit complete: ${successCount} updated, ${failCount} failed`);
      setShowBulkEditForm(false);
      setBulkEditValues({});
      setSelectedTransactions([]);
      setBulkMode(false);
      loadTransactions();
    } catch (error: any) {
      alert(error.message || 'Failed to bulk edit transactions');
    }
  };

  const handleBulkDelete = async () => {
    if (selectedTransactions.length === 0) {
      alert('Please select transactions to delete');
      return;
    }

    if (!confirm(`Are you sure you want to delete ${selectedTransactions.length} transactions?`)) {
      return;
    }

    try {
      let successCount = 0;
      let failCount = 0;

      for (const txnId of selectedTransactions) {
        try {
          await transactionsApi.deleteTransaction(txnId);
          successCount++;
        } catch (error) {
          failCount++;
          console.error(`Failed to delete transaction ${txnId}:`, error);
        }
      }

      alert(`Bulk delete complete: ${successCount} deleted, ${failCount} failed`);
      setSelectedTransactions([]);
      setBulkMode(false);
      loadTransactions();
    } catch (error: any) {
      alert(error.message || 'Failed to bulk delete transactions');
    }
  };

  const renderEditableCell = (txn: Transaction, field: keyof Transaction, value: any) => {
    if (editing === txn.id) {
      if (field === 'transaction_date') {
        return (
          <input
            type="date"
            value={editValues[txn.id][field] || ''}
            onChange={(e) => setEditValues({
              ...editValues,
              [txn.id]: { ...editValues[txn.id], [field]: e.target.value }
            })}
            className="w-full px-2 py-1 border rounded"
          />
        );
      } else if (field === 'store_id') {
        return (
          <select
            value={editValues[txn.id][field] || ''}
            onChange={(e) => setEditValues({
              ...editValues,
              [txn.id]: { ...editValues[txn.id], [field]: e.target.value }
            })}
            className="w-full px-2 py-1 border rounded"
          >
            <option value="">No Store</option>
            {stores.map(store => (
              <option key={store.id} value={store.id}>{store.name}</option>
            ))}
          </select>
        );
      } else if (field === 'sku') {
        return (
          <input
            type="text"
            value={editValues[txn.id][field] || ''}
            onChange={(e) => setEditValues({
              ...editValues,
              [txn.id]: { ...editValues[txn.id], [field]: e.target.value }
            })}
            onBlur={(e) => validateSKU(e.target.value)}
            className={`w-full px-2 py-1 border rounded ${validationErrors.sku ? 'border-red-500' : ''}`}
          />
        );
      } else if (field === 'quantity_sold' || field === 'selling_price') {
        return (
          <input
            type="number"
            step={field === 'selling_price' ? '0.01' : '1'}
            value={editValues[txn.id][field] || ''}
            onChange={(e) => setEditValues({
              ...editValues,
              [txn.id]: { ...editValues[txn.id], [field]: field === 'selling_price' ? parseFloat(e.target.value) : parseInt(e.target.value) }
            })}
            className="w-full px-2 py-1 border rounded"
          />
        );
      } else {
        return (
          <input
            type="text"
            value={editValues[txn.id][field] || ''}
            onChange={(e) => setEditValues({
              ...editValues,
              [txn.id]: { ...editValues[txn.id], [field]: e.target.value }
            })}
            className="w-full px-2 py-1 border rounded"
            disabled
          />
        );
      }
    }
    
    if (field === 'selling_price') {
      return value ? `$${value.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '-';
    }
    
    if (field === 'transaction_date') {
      return value ? new Date(value).toLocaleDateString() : '-';
    }
    
    return value || '-';
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'sale':
        return <Badge variant="default">Sale</Badge>;
      case 'return':
        return <Badge variant="destructive">Return</Badge>;
      case 'adjustment':
        return <Badge variant="secondary">Adjustment</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="px-4 py-6 sm:px-0">
      <Card>
        <CardHeader>
          <CardTitle>Transactions Management</CardTitle>
          <CardDescription>
            Date | Store | SKU | Qty Sold | Selling Price | Big SKU | Item Name | Colour | Size | Status
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
              value={filters.status || ''}
              onChange={(e) => setFilters({ 
                ...filters, 
                status: e.target.value as any,
                page: 1 
              })}
              className="px-3 py-2 border rounded"
            >
              <option value="">All Status</option>
              <option value="sale">Sale</option>
              <option value="return">Return</option>
              <option value="adjustment">Adjustment</option>
            </select>
            <Button variant="outline" onClick={loadTransactions} disabled={loading}>
              {loading ? 'Loading...' : 'Load Transactions'}
            </Button>
            <Button
              variant={bulkMode ? "default" : "outline"}
              onClick={() => {
                setBulkMode(!bulkMode);
                setSelectedTransactions([]);
              }}
            >
              {bulkMode ? 'Exit Bulk Mode' : 'Bulk Mode'}
            </Button>
            {bulkMode && selectedTransactions.length > 0 && (
              <>
                <Button onClick={() => setShowBulkEditForm(!showBulkEditForm)}>
                  Edit Selected ({selectedTransactions.length})
                </Button>
                <Button variant="destructive" onClick={handleBulkDelete}>
                  Delete Selected ({selectedTransactions.length})
                </Button>
              </>
            )}
            <Button onClick={() => setShowAddForm(!showAddForm)}>
              {showAddForm ? 'Cancel' : 'Add Transaction'}
            </Button>
            <Button variant="outline" onClick={() => setShowBulkForm(!showBulkForm)}>
              {showBulkForm ? 'Cancel' : 'Bulk Add'}
            </Button>
          </div>
          
          {/* Add Transaction Form */}
          {showAddForm && (
            <div className="border rounded-lg p-4 mb-4 bg-gray-50">
              <h3 className="text-lg font-semibold mb-4">Add New Transaction</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                <div>
                  <label className="text-sm font-medium">Date*</label>
                  <Input
                    type="date"
                    value={newTransaction.transaction_date}
                    onChange={(e) => setNewTransaction(prev => ({ ...prev, transaction_date: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Store</label>
                  <select
                    value={newTransaction.store_id}
                    onChange={(e) => setNewTransaction(prev => ({ ...prev, store_id: e.target.value }))}
                    className="w-full px-3 py-2 border rounded"
                  >
                    <option value="">No Store</option>
                    {stores.map(store => (
                      <option key={store.id} value={store.id}>{store.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium">SKU*</label>
                  <Input
                    placeholder="SKU"
                    value={newTransaction.sku}
                    onChange={(e) => setNewTransaction(prev => ({ ...prev, sku: e.target.value }))}
                    onBlur={(e) => validateSKU(e.target.value)}
                    className={validationErrors.sku ? 'border-red-500' : ''}
                  />
                  {validationErrors.sku && (
                    <p className="text-xs text-red-500 mt-1">{validationErrors.sku}</p>
                  )}
                </div>
                <div>
                  <label className="text-sm font-medium">Qty Sold*</label>
                  <Input
                    type="number"
                    placeholder="Quantity"
                    value={newTransaction.quantity_sold}
                    onChange={(e) => setNewTransaction(prev => ({ ...prev, quantity_sold: parseInt(e.target.value) || 0 }))}
                  />
                  <p className="text-xs text-gray-500 mt-1">Negative for returns</p>
                </div>
                <div>
                  <label className="text-sm font-medium">Selling Price*</label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="Price"
                    value={newTransaction.selling_price}
                    onChange={(e) => setNewTransaction(prev => ({ ...prev, selling_price: parseFloat(e.target.value) || 0 }))}
                  />
                </div>
              </div>
              <div className="mt-4">
                <Button onClick={handleAddTransaction} disabled={!newTransaction.sku || !newTransaction.transaction_date}>
                  Save Transaction
                </Button>
              </div>
            </div>
          )}
          
          {/* Bulk Add Form */}
          {showBulkForm && (
            <div className="border rounded-lg p-4 mb-4 bg-gray-50">
              <h3 className="text-lg font-semibold mb-2">Bulk Add Transactions</h3>
              <p className="text-sm text-gray-600 mb-4">
                Format: Date | Store | SKU | Qty Sold | Selling Price
              </p>
              <div className="mb-4">
                <textarea
                  className="w-full h-64 p-3 border rounded-md font-mono text-sm"
                  placeholder="Paste your data here...&#10;&#10;Example:&#10;2024-01-15&#9;Main Store&#9;WIN-001&#9;5&#9;150.00&#10;2024-01-15&#9;Downtown Branch&#9;WIN-002&#9;-1&#9;200.00"
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={handleBulkPaste} disabled={loading}>
                  {loading ? 'Adding...' : 'Add Transactions'}
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
              <h3 className="text-lg font-semibold mb-4">Bulk Edit Selected Transactions</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium">Store</label>
                  <select
                    value={bulkEditValues.store_id}
                    onChange={(e) => setBulkEditValues(prev => ({ ...prev, store_id: e.target.value }))}
                    className="w-full px-3 py-2 border rounded"
                  >
                    <option value="">Keep Original</option>
                    {stores.map(store => (
                      <option key={store.id} value={store.id}>{store.name}</option>
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
                  <label className="text-sm font-medium">Price Adjustment</label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="Leave blank to keep"
                    value={bulkEditValues.price_adjustment || ''}
                    onChange={(e) => setBulkEditValues(prev => ({ ...prev, price_adjustment: parseFloat(e.target.value) || undefined }))}
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
          
          {/* Transactions Table */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  {bulkMode && (
                    <th className="text-left p-3">
                      <input
                        type="checkbox"
                        checked={selectedTransactions.length === transactions.length}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedTransactions(transactions.map(t => t.id));
                          } else {
                            setSelectedTransactions([]);
                          }
                        }}
                      />
                    </th>
                  )}
                  <th className="text-left p-3 font-medium">Date</th>
                  <th className="text-left p-3 font-medium">Store</th>
                  <th className="text-left p-3 font-medium">SKU</th>
                  <th className="text-center p-3 font-medium">Qty Sold</th>
                  <th className="text-right p-3 font-medium">Price</th>
                  <th className="text-left p-3 font-medium">Big SKU</th>
                  <th className="text-left p-3 font-medium">Item Name</th>
                  <th className="text-left p-3 font-medium">Colour</th>
                  <th className="text-left p-3 font-medium">Size</th>
                  <th className="text-center p-3 font-medium">Status</th>
                  {!bulkMode && <th className="text-center p-3 font-medium">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {transactions.map((transaction) => (
                  <tr key={transaction.id} className="border-b hover:bg-gray-50">
                    {bulkMode && (
                      <td className="p-3">
                        <input
                          type="checkbox"
                          checked={selectedTransactions.includes(transaction.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedTransactions([...selectedTransactions, transaction.id]);
                            } else {
                              setSelectedTransactions(selectedTransactions.filter(id => id !== transaction.id));
                            }
                          }}
                        />
                      </td>
                    )}
                    <td className="p-3">{transaction.transaction_date}</td>
                    <td className="p-3">{transaction.store_name || '-'}</td>
                    <td className="p-3 font-medium">{transaction.sku}</td>
                    <td className="p-3 text-center">{transaction.quantity_sold}</td>
                    <td className="p-3 text-right">${transaction.selling_price.toFixed(2)}</td>
                    <td className="p-3 text-gray-600">{transaction.big_sku || '-'}</td>
                    <td className="p-3">{transaction.item_name || '-'}</td>
                    <td className="p-3 text-gray-600">{transaction.colour || '-'}</td>
                    <td className="p-3 text-gray-600">{transaction.size || '-'}</td>
                    <td className="p-3 text-center">{getStatusBadge(transaction.status)}</td>
                    {!bulkMode && (
                      <td className="p-3 text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(transaction.id, transaction)}
                          className="mr-2"
                        >
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(transaction.id)}
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
