import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { X, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

interface BulkProgressProps {
  isUploading: boolean;
  progress: number;
  processed?: number;
  total?: number;
  error?: string | null;
  onCancel?: () => void;
  result?: {
    success: number;
    failed: number;
    errors?: any[];
  };
}

export function BulkProgress({
  isUploading,
  progress,
  processed,
  total,
  error,
  onCancel,
  result
}: BulkProgressProps) {
  if (!isUploading && !error && !result) return null;
  
  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {isUploading && <Loader2 className="h-5 w-5 animate-spin" />}
          {error && <AlertCircle className="h-5 w-5 text-red-500" />}
          {result && !error && <CheckCircle className="h-5 w-5 text-green-500" />}
          Bulk Upload Progress
        </CardTitle>
        <CardDescription>
          {isUploading && 'Processing your data...'}
          {error && 'Upload failed'}
          {result && !error && 'Upload completed'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isUploading && (
          <div className="space-y-4">
            <div className="flex justify-between text-sm">
              <span>Progress</span>
              <span>{progress}% ({processed || 0} / {total || 0})</span>
            </div>
            <Progress value={progress} className="w-full" />
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={onCancel} {...({} as any)}>
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
            </div>
          </div>
        )}
        
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        
        {result && !error && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-green-600 font-semibold">Success:</span> {result.success}
              </div>
              <div>
                <span className={result.failed > 0 ? "text-red-600 font-semibold" : "text-gray-600 font-semibold"}>
                  Failed: {result.failed}
                </span>
              </div>
            </div>
            
            {result.errors && result.errors.length > 0 && (
              <details className="mt-4">
                <summary className="cursor-pointer text-sm text-gray-600 hover:text-gray-800">
                  View Errors ({result.errors.length})
                </summary>
                <div className="mt-2 max-h-40 overflow-y-auto text-xs bg-gray-50 p-2 rounded">
                  {result.errors.slice(0, 10).map((error, index) => (
                    <div key={index} className="mb-1">
                      Chunk {error.chunk}: {error.error}
                    </div>
                  ))}
                  {result.errors.length > 10 && (
                    <div className="text-gray-500 italic">
                      ... and {result.errors.length - 10} more errors
                    </div>
                  )}
                </div>
              </details>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
