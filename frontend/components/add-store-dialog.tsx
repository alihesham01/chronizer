'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Store } from 'lucide-react';

const STORE_CHAINS = [
  'Go Native',
  'Gen-Z',
  'Lokal',
  'Locally',
  'Mr Local',
];

interface Branch {
  name: string;
  location: string;
  code: string;
  commission: number;
  rent: number;
}

interface AddStoreDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (storeName: string, branches: Branch[]) => Promise<void>;
}

const emptyBranch = (): Branch => ({
  name: '',
  location: '',
  code: '',
  commission: 0,
  rent: 0,
});

export function AddStoreDialog({ open, onOpenChange, onSubmit }: AddStoreDialogProps) {
  const [selectedChain, setSelectedChain] = useState('');
  const [customChainName, setCustomChainName] = useState('');
  const [branches, setBranches] = useState<Branch[]>([emptyBranch()]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const storeName = selectedChain === 'other' ? customChainName : selectedChain;
  const isValid = storeName.trim() && branches.length > 0 && branches.every(b => b.name.trim());

  const addBranch = () => setBranches([...branches, emptyBranch()]);

  const removeBranch = (index: number) => {
    if (branches.length <= 1) return;
    setBranches(branches.filter((_, i) => i !== index));
  };

  const updateBranch = (index: number, field: keyof Branch, value: string | number) => {
    setBranches(branches.map((b, i) => i === index ? { ...b, [field]: value } : b));
  };

  const handleSubmit = async () => {
    if (!isValid) return;
    setSubmitting(true);
    setError('');
    try {
      await onSubmit(storeName, branches);
      // Reset form
      setSelectedChain('');
      setCustomChainName('');
      setBranches([emptyBranch()]);
      onOpenChange(false);
    } catch (err: any) {
      setError(err.message || 'Failed to create store');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = (isOpen: boolean) => {
    if (!isOpen) {
      setSelectedChain('');
      setCustomChainName('');
      setBranches([emptyBranch()]);
      setError('');
    }
    onOpenChange(isOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Store className="h-5 w-5" />
            Add New Store
          </DialogTitle>
          <DialogDescription>
            Select a store chain and add at least one branch location.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Store Chain Selection */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Store Name</Label>
            <Select value={selectedChain} onValueChange={setSelectedChain}>
              <SelectTrigger>
                <SelectValue placeholder="Select a store chain..." />
              </SelectTrigger>
              <SelectContent>
                {STORE_CHAINS.map((chain) => (
                  <SelectItem key={chain} value={chain}>{chain}</SelectItem>
                ))}
                <SelectItem value="other">Other (Custom Name)</SelectItem>
              </SelectContent>
            </Select>

            {selectedChain === 'other' && (
              <Input
                placeholder="Enter custom store name..."
                value={customChainName}
                onChange={(e) => setCustomChainName(e.target.value)}
                className="mt-2"
                autoFocus
              />
            )}
          </div>

          {/* Branches */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">
                Branches ({branches.length})
              </Label>
              <Button type="button" variant="outline" size="sm" onClick={addBranch}>
                <Plus className="h-4 w-4 mr-1" />
                Add Branch
              </Button>
            </div>

            <div className="space-y-3">
              {branches.map((branch, index) => (
                <div
                  key={index}
                  className="border rounded-lg p-4 space-y-3 bg-gray-50/50 relative"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Branch {index + 1}
                    </span>
                    {branches.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                        onClick={() => removeBranch(index)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2 sm:col-span-1">
                      <Label className="text-xs text-muted-foreground">Branch Name *</Label>
                      <Input
                        placeholder="e.g. Mall of Egypt"
                        value={branch.name}
                        onChange={(e) => updateBranch(index, 'name', e.target.value)}
                      />
                    </div>
                    <div className="col-span-2 sm:col-span-1">
                      <Label className="text-xs text-muted-foreground">Location</Label>
                      <Input
                        placeholder="e.g. 6th of October City"
                        value={branch.location}
                        onChange={(e) => updateBranch(index, 'location', e.target.value)}
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Branch Code</Label>
                      <Input
                        placeholder="e.g. MOE-01"
                        value={branch.code}
                        onChange={(e) => updateBranch(index, 'code', e.target.value)}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs text-muted-foreground">Commission %</Label>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="0"
                          value={branch.commission || ''}
                          onChange={(e) => updateBranch(index, 'commission', parseFloat(e.target.value) || 0)}
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Rent</Label>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="0"
                          value={branch.rent || ''}
                          onChange={(e) => updateBranch(index, 'rent', parseFloat(e.target.value) || 0)}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-3">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!isValid || submitting}>
            {submitting ? 'Creating...' : `Create ${branches.length} Branch${branches.length > 1 ? 'es' : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
