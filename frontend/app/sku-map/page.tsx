'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { skuMapApi, SkuMapping, StoreGroup } from '@/lib/sku-map';
import { productsApi, Product } from '@/lib/products';
import { storesApi, Store } from '@/lib/stores';

export default function SkuMapPage() {
  const router = useRouter();

  // Data
  const [groups, setGroups] = useState<StoreGroup[]>([]);
  const [mappings, setMappings] = useState<SkuMapping[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [stores, setStores] = useState<Store[]>([]);

  // UI state
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Add mapping form
  const [showAddForm, setShowAddForm] = useState(false);
  const [newMapping, setNewMapping] = useState({ store_group: '', store_sku: '', product_id: '', notes: '' });
  const [adding, setAdding] = useState(false);

  // Editing
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, any>>({});

  // Bulk paste
  const [showBulkForm, setShowBulkForm] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [bulkGroup, setBulkGroup] = useState('');

  // Pagination
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 0 });

  // Derived: unique store groups from stores (for dropdown when creating new groups)
  const storeGroupNames = Array.from(new Set(stores.map(s => s.group || s.name).filter(Boolean)));

  const loadGroups = useCallback(async () => {
    try {
      const res = await skuMapApi.getGroups();
      setGroups(res.data);
    } catch {}
  }, []);

  const loadMappings = useCallback(async () => {
    try {
      setLoading(true);
      const res = await skuMapApi.getMappings({
        store_group: selectedGroup || undefined,
        search: search || undefined,
        page: pagination.page,
        limit: 50,
      });
      setMappings(res.data);
      setPagination(prev => ({ ...prev, total: res.pagination.total, totalPages: res.pagination.totalPages }));
    } catch (err: any) {
      setError(err.message || 'Failed to load mappings');
    } finally {
      setLoading(false);
    }
  }, [selectedGroup, search, pagination.page]);

  const loadProducts = useCallback(async () => {
    try {
      const res = await productsApi.getProducts({ limit: 500 });
      setProducts(res.data);
    } catch {}
  }, []);

  const loadStores = useCallback(async () => {
    try {
      const res = await storesApi.getStores({ limit: 200 });
      setStores(res.data);
    } catch {}
  }, []);

  useEffect(() => { loadGroups(); loadProducts(); loadStores(); }, [loadGroups, loadProducts, loadStores]);
  useEffect(() => { loadMappings(); }, [loadMappings]);

  const handleAdd = async () => {
    if (!newMapping.store_group || !newMapping.store_sku || !newMapping.product_id) {
      setError('Store group, store SKU, and product are required');
      return;
    }
    try {
      setAdding(true);
      setError('');
      await skuMapApi.createMapping(newMapping);
      setSuccess('Mapping added');
      setNewMapping({ store_group: '', store_sku: '', product_id: '', notes: '' });
      setShowAddForm(false);
      loadMappings();
      loadGroups();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAdding(false);
    }
  };

  const handleBulkAdd = async () => {
    if (!bulkGroup || !bulkText.trim()) {
      setError('Store group and paste data are required');
      return;
    }
    const lines = bulkText.trim().split('\n').filter(Boolean);
    const mappingsToCreate = lines.map(line => {
      const parts = line.split('\t').length > 1 ? line.split('\t') : line.split(',');
      const storeSku = parts[0]?.trim();
      const productSku = parts[1]?.trim();
      const product = products.find(p => p.sku === productSku);
      return { store_group: bulkGroup, store_sku: storeSku, product_id: product?.id || '', notes: '' };
    }).filter(m => m.store_sku && m.product_id);

    if (mappingsToCreate.length === 0) {
      setError('No valid mappings found. Format: StoreSKU [tab/comma] InternalSKU');
      return;
    }

    try {
      setAdding(true);
      setError('');
      const res = await skuMapApi.bulkCreateMappings(mappingsToCreate);
      setSuccess(`Created ${res.created} mappings${res.errors.length > 0 ? `, ${res.errors.length} skipped` : ''}`);
      setBulkText('');
      setShowBulkForm(false);
      loadMappings();
      loadGroups();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this mapping?')) return;
    try {
      await skuMapApi.deleteMapping(id);
      loadMappings();
      loadGroups();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const startEdit = (m: SkuMapping) => {
    setEditingId(m.id);
    setEditValues({ store_sku: m.store_sku, product_id: m.product_id, notes: m.notes || '' });
  };

  const saveEdit = async (id: string) => {
    try {
      await skuMapApi.updateMapping(id, editValues);
      setEditingId(null);
      loadMappings();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const cancelEdit = () => { setEditingId(null); setEditValues({}); };

  // Clear messages after 4s
  useEffect(() => {
    if (success) { const t = setTimeout(() => setSuccess(''), 4000); return () => clearTimeout(t); }
  }, [success]);
  useEffect(() => {
    if (error) { const t = setTimeout(() => setError(''), 6000); return () => clearTimeout(t); }
  }, [error]);

  // Group mappings by store_group for the "All" view
  const groupedMappings: Record<string, SkuMapping[]> = {};
  mappings.forEach(m => {
    if (!groupedMappings[m.store_group]) groupedMappings[m.store_group] = [];
    groupedMappings[m.store_group].push(m);
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">SKU-Store Map</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Map external store SKUs to your internal product codes. Branches of the same store share mappings.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { setShowBulkForm(!showBulkForm); setShowAddForm(false); }}>
            Bulk Paste
          </Button>
          <Button size="sm" onClick={() => { setShowAddForm(!showAddForm); setShowBulkForm(false); }}>
            + Add Mapping
          </Button>
        </div>
      </div>

      {/* Messages */}
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      {success && <Alert><AlertDescription className="text-green-700">{success}</AlertDescription></Alert>}

      {/* Add Single Mapping Form */}
      {showAddForm && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">New Mapping</CardTitle>
            <CardDescription>Map a store&apos;s SKU to one of your internal products</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <div>
                <Label className="text-xs mb-1 block">Store Group</Label>
                <Input
                  list="store-groups-list"
                  placeholder="e.g. Noon, Amazon"
                  value={newMapping.store_group}
                  onChange={e => setNewMapping({ ...newMapping, store_group: e.target.value })}
                />
                <datalist id="store-groups-list">
                  {Array.from(new Set([...groups.map(g => g.store_group), ...storeGroupNames])).map(g => (
                    <option key={g} value={g} />
                  ))}
                </datalist>
              </div>
              <div>
                <Label className="text-xs mb-1 block">Store SKU</Label>
                <Input
                  placeholder="Store's product code"
                  value={newMapping.store_sku}
                  onChange={e => setNewMapping({ ...newMapping, store_sku: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-xs mb-1 block">Internal Product</Label>
                <select
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={newMapping.product_id}
                  onChange={e => setNewMapping({ ...newMapping, product_id: e.target.value })}
                >
                  <option value="">Select product...</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-xs mb-1 block">Notes</Label>
                <Input
                  placeholder="Optional"
                  value={newMapping.notes}
                  onChange={e => setNewMapping({ ...newMapping, notes: e.target.value })}
                />
              </div>
              <div className="flex items-end gap-2">
                <Button size="sm" onClick={handleAdd} disabled={adding} className="w-full">
                  {adding ? 'Adding...' : 'Add'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Bulk Paste Form */}
      {showBulkForm && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Bulk Paste Mappings</CardTitle>
            <CardDescription>Paste tab-separated or comma-separated data: StoreSKU, InternalSKU (one per line)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label className="text-xs mb-1 block">Store Group</Label>
                <Input
                  list="bulk-groups-list"
                  placeholder="e.g. Noon"
                  value={bulkGroup}
                  onChange={e => setBulkGroup(e.target.value)}
                />
                <datalist id="bulk-groups-list">
                  {Array.from(new Set([...groups.map(g => g.store_group), ...storeGroupNames])).map(g => (
                    <option key={g} value={g} />
                  ))}
                </datalist>
              </div>
            </div>
            <div>
              <Label className="text-xs mb-1 block">Paste Data</Label>
              <textarea
                className="w-full h-32 rounded-md border border-input bg-background px-3 py-2 text-sm font-mono resize-y"
                placeholder={`STORE-SKU-001\tINTERNAL-SKU-A\nSTORE-SKU-002\tINTERNAL-SKU-B`}
                value={bulkText}
                onChange={e => setBulkText(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">
                {bulkText.trim().split('\n').filter(Boolean).length} line(s) detected
              </p>
            </div>
            <Button size="sm" onClick={handleBulkAdd} disabled={adding}>
              {adding ? 'Importing...' : 'Import Mappings'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Store Group Tabs + Search */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex flex-wrap gap-1.5">
          <Button
            variant={selectedGroup === null ? 'default' : 'outline'}
            size="sm"
            onClick={() => { setSelectedGroup(null); setPagination(p => ({ ...p, page: 1 })); }}
          >
            All
            <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5">{groups.reduce((s, g) => s + parseInt(g.mapping_count), 0)}</Badge>
          </Button>
          {groups.map(g => (
            <Button
              key={g.store_group}
              variant={selectedGroup === g.store_group ? 'default' : 'outline'}
              size="sm"
              onClick={() => { setSelectedGroup(g.store_group); setPagination(p => ({ ...p, page: 1 })); }}
            >
              {g.store_group}
              <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5">{g.mapping_count}</Badge>
            </Button>
          ))}
        </div>
        <div className="sm:ml-auto w-full sm:w-64">
          <Input
            placeholder="Search SKU or product..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPagination(p => ({ ...p, page: 1 })); }}
          />
        </div>
      </div>

      {/* Mappings Table */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <p className="text-muted-foreground">Loading mappings...</p>
        </div>
      ) : mappings.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground mb-2">
              {selectedGroup ? `No mappings for "${selectedGroup}" yet.` : 'No SKU mappings created yet.'}
            </p>
            <Button size="sm" variant="outline" onClick={() => setShowAddForm(true)}>
              Add your first mapping
            </Button>
          </CardContent>
        </Card>
      ) : selectedGroup ? (
        /* Single group view — flat table */
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{selectedGroup}</CardTitle>
              <span className="text-xs text-muted-foreground">{pagination.total} mapping{pagination.total !== 1 ? 's' : ''}</span>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Store SKU</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">→</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Internal SKU</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Product</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Notes</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {mappings.map(m => (
                    <tr key={m.id} className="border-b hover:bg-muted/20 transition-colors">
                      {editingId === m.id ? (
                        <>
                          <td className="px-4 py-2">
                            <Input className="h-8 text-xs" value={editValues.store_sku} onChange={e => setEditValues({ ...editValues, store_sku: e.target.value })} />
                          </td>
                          <td className="px-4 py-2 text-muted-foreground">→</td>
                          <td colSpan={2} className="px-4 py-2">
                            <select className="w-full h-8 rounded-md border text-xs bg-background px-2" value={editValues.product_id} onChange={e => setEditValues({ ...editValues, product_id: e.target.value })}>
                              {products.map(p => <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>)}
                            </select>
                          </td>
                          <td className="px-4 py-2">
                            <Input className="h-8 text-xs" value={editValues.notes} onChange={e => setEditValues({ ...editValues, notes: e.target.value })} />
                          </td>
                          <td className="px-4 py-2 text-right space-x-1">
                            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => saveEdit(m.id)}>Save</Button>
                            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={cancelEdit}>Cancel</Button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-4 py-2 font-mono text-xs">{m.store_sku}</td>
                          <td className="px-4 py-2 text-muted-foreground">→</td>
                          <td className="px-4 py-2 font-mono text-xs font-semibold">{m.product_sku}</td>
                          <td className="px-4 py-2 text-xs text-muted-foreground">
                            {m.product_name}
                            {m.product_size && <span className="ml-1">· {m.product_size}</span>}
                            {m.product_colour && <span className="ml-1">· {m.product_colour}</span>}
                          </td>
                          <td className="px-4 py-2 text-xs text-muted-foreground">{m.notes || '—'}</td>
                          <td className="px-4 py-2 text-right space-x-1">
                            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => startEdit(m)}>Edit</Button>
                            <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => handleDelete(m.id)}>Delete</Button>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : (
        /* All groups view — grouped cards */
        <div className="space-y-4">
          {Object.entries(groupedMappings).map(([group, items]) => (
            <Card key={group}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base">{group}</CardTitle>
                    <Badge variant="outline" className="text-[10px]">{items.length} mapping{items.length !== 1 ? 's' : ''}</Badge>
                  </div>
                  <Button size="sm" variant="ghost" className="text-xs" onClick={() => setSelectedGroup(group)}>
                    View all →
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40">
                        <th className="text-left px-4 py-2 font-medium text-muted-foreground text-xs">Store SKU</th>
                        <th className="text-left px-4 py-2 font-medium text-muted-foreground text-xs">→</th>
                        <th className="text-left px-4 py-2 font-medium text-muted-foreground text-xs">Internal SKU</th>
                        <th className="text-left px-4 py-2 font-medium text-muted-foreground text-xs">Product</th>
                        <th className="text-right px-4 py-2 font-medium text-muted-foreground text-xs">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.slice(0, 5).map(m => (
                        <tr key={m.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-1.5 font-mono text-xs">{m.store_sku}</td>
                          <td className="px-4 py-1.5 text-muted-foreground text-xs">→</td>
                          <td className="px-4 py-1.5 font-mono text-xs font-semibold">{m.product_sku}</td>
                          <td className="px-4 py-1.5 text-xs text-muted-foreground">{m.product_name}</td>
                          <td className="px-4 py-1.5 text-right">
                            <Button size="sm" variant="ghost" className="h-6 text-xs text-destructive" onClick={() => handleDelete(m.id)}>Delete</Button>
                          </td>
                        </tr>
                      ))}
                      {items.length > 5 && (
                        <tr>
                          <td colSpan={5} className="px-4 py-1.5 text-xs text-muted-foreground text-center">
                            +{items.length - 5} more — <button className="underline" onClick={() => setSelectedGroup(group)}>view all</button>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Page {pagination.page} of {pagination.totalPages} · {pagination.total} total
          </p>
          <div className="flex gap-1">
            <Button size="sm" variant="outline" disabled={pagination.page <= 1} onClick={() => setPagination(p => ({ ...p, page: p.page - 1 }))}>
              Previous
            </Button>
            <Button size="sm" variant="outline" disabled={pagination.page >= pagination.totalPages} onClick={() => setPagination(p => ({ ...p, page: p.page + 1 }))}>
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
