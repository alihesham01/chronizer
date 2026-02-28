'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export default function SettingsPage() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');

  const [brandInfo, setBrandInfo] = useState<any>({});
  const [ownerInfo, setOwnerInfo] = useState<any>({});
  const [brandName, setBrandName] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#3b82f6');
  const [secondaryColor, setSecondaryColor] = useState('#64748b');

  useEffect(() => {
    const bi = JSON.parse(localStorage.getItem('brand_info') || '{}');
    const oi = JSON.parse(localStorage.getItem('owner_info') || '{}');
    setBrandInfo(bi);
    setOwnerInfo(oi);
    setBrandName(bi.name || '');
    setPrimaryColor(bi.primaryColor || '#3b82f6');
    setSecondaryColor(bi.secondaryColor || '#64748b');
  }, []);

  const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;

  const handleSaveBrand = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch(`${API_BASE}/api/brand/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: brandName, primaryColor, secondaryColor }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update brand');
      const updated = { ...brandInfo, name: data.data.name, primaryColor: data.data.primary_color, secondaryColor: data.data.secondary_color };
      setBrandInfo(updated);
      localStorage.setItem('brand_info', JSON.stringify(updated));
      setMessage({ type: 'success', text: 'Brand settings updated' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) { setMessage({ type: 'error', text: 'Passwords do not match' }); return; }
    if (!currentPassword) { setMessage({ type: 'error', text: 'Please enter your current password' }); return; }
    if (newPassword.length < 8) { setMessage({ type: 'error', text: 'New password must be at least 8 characters' }); return; }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to change password');
      setMessage({ type: 'success', text: 'Password changed successfully' });
      setNewPassword(''); setConfirmPassword(''); setCurrentPassword('');
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Failed to change password' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-gray-600">Manage your account and brand settings</p>
      </div>

      {message && (
        <Alert className={`mb-6 ${message.type === 'error' ? 'border-red-200 bg-red-50' : 'border-green-200 bg-green-50'}`}>
          <AlertDescription className={message.type === 'error' ? 'text-red-800' : 'text-green-800'}>
            {message.text}
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="brand">Brand</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle>Profile Information</CardTitle>
              <CardDescription>Your account details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>First Name</Label>
                  <Input value={ownerInfo.firstName || ''} disabled />
                </div>
                <div>
                  <Label>Last Name</Label>
                  <Input value={ownerInfo.lastName || ''} disabled />
                </div>
              </div>
              <div>
                <Label>Email</Label>
                <Input value={ownerInfo.email || ''} disabled />
              </div>
              <div>
                <Label>Subdomain</Label>
                <Input value={`${brandInfo.subdomain || ''}.chronizer.com`} disabled />
              </div>
              <p className="text-xs text-gray-400">Profile name and email cannot be changed at this time.</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="brand">
          <Card>
            <CardHeader>
              <CardTitle>Brand Settings</CardTitle>
              <CardDescription>Customize your brand appearance</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Brand Name</Label>
                <Input value={brandName} onChange={e => setBrandName(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Primary Color</Label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} className="w-10 h-10 rounded border cursor-pointer" />
                    <Input value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} className="font-mono" />
                  </div>
                </div>
                <div>
                  <Label>Secondary Color</Label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={secondaryColor} onChange={e => setSecondaryColor(e.target.value)} className="w-10 h-10 rounded border cursor-pointer" />
                    <Input value={secondaryColor} onChange={e => setSecondaryColor(e.target.value)} className="font-mono" />
                  </div>
                </div>
              </div>
              <Button onClick={handleSaveBrand} disabled={loading}>
                {loading ? 'Saving...' : 'Save Brand Settings'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security">
          <Card>
            <CardHeader>
              <CardTitle>Change Password</CardTitle>
              <CardDescription>Update your login credentials</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Current Password</Label>
                <Input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} />
              </div>
              <div>
                <Label>New Password</Label>
                <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Minimum 8 characters" />
              </div>
              <div>
                <Label>Confirm New Password</Label>
                <Input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
              </div>
              <Button onClick={handleChangePassword} disabled={loading}>
                {loading ? 'Updating...' : 'Change Password'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
