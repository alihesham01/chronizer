'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { auth } from '@/lib/auth';

export default function SettingsPage() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');

  const brandInfo = JSON.parse(localStorage.getItem('brand_info') || '{}');
  const ownerInfo = JSON.parse(localStorage.getItem('owner_info') || '{}');

  const handleInviteUser = async () => {
    setMessage({ type: 'error', text: 'User invitations are managed by the admin. Contact admin@chronizer.com to request an invite link.' });
  };

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'Passwords do not match' });
      return;
    }

    if (!currentPassword) {
      setMessage({ type: 'error', text: 'Please enter your current password' });
      return;
    }

    if (newPassword.length < 8) {
      setMessage({ type: 'error', text: 'New password must be at least 8 characters' });
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem('auth_token');
      const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
      const res = await fetch(`${API_BASE}/api/auth/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to change password');
      setMessage({ type: 'success', text: 'Password changed successfully' });
      setNewPassword('');
      setConfirmPassword('');
      setCurrentPassword('');
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
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle>Profile Information</CardTitle>
              <CardDescription>Update your personal information</CardDescription>
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
              <p className="text-sm text-gray-500">Contact support to update profile information</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="brand">
          <Card>
            <CardHeader>
              <CardTitle>Brand Information</CardTitle>
              <CardDescription>Your brand details and settings</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Brand Name</Label>
                <Input value={brandInfo.name || ''} disabled />
              </div>
              <div>
                <Label>Subdomain</Label>
                <Input value={`${brandInfo.subdomain}.chronizer.com`} disabled />
              </div>
              <div className="flex gap-2">
                <Label>Primary Color</Label>
                <div 
                  className="w-8 h-8 rounded border"
                  style={{ backgroundColor: brandInfo.primaryColor || '#3b82f6' }}
                />
              </div>
              <p className="text-sm text-gray-500">Contact support to update brand information</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="users">
          <Card>
            <CardHeader>
              <CardTitle>User Management</CardTitle>
              <CardDescription>Invite users to your brand</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Enter email address"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="flex-1"
                />
                <Button onClick={handleInviteUser} disabled={loading}>
                  {loading ? 'Sending...' : 'Send Invite'}
                </Button>
              </div>
              <div className="space-y-2">
                <h4 className="font-medium">Current Users</h4>
                <div className="flex items-center justify-between p-3 border rounded">
                  <div>
                    <p className="font-medium">{ownerInfo.firstName} {ownerInfo.lastName}</p>
                    <p className="text-sm text-gray-500">{ownerInfo.email}</p>
                  </div>
                  <Badge>Owner</Badge>
                </div>
              </div>
              <p className="text-sm text-gray-500">
                Only the brand owner can invite new users. Contact support for additional user management.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security">
          <Card>
            <CardHeader>
              <CardTitle>Security Settings</CardTitle>
              <CardDescription>Manage your password and security</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Current Password</Label>
                <Input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                />
              </div>
              <div>
                <Label>New Password</Label>
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>
              <div>
                <Label>Confirm New Password</Label>
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
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
