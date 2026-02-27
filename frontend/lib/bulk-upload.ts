import { useState } from 'react';

export interface BulkUploadOptions {
  batchSize?: number;
  maxRetries?: number;
  onProgress?: (processed: number, total: number) => void;
  onError?: (error: Error, chunk: number) => void;
  signal?: AbortSignal;
}

export class BulkUploadManager {
  private static readonly DEFAULT_BATCH_SIZE = 1000;
  private static readonly MAX_RETRIES = 3;
  
  /**
   * Upload large datasets in chunks to prevent UI freezing
   */
  static async uploadInChunks<T>(
    data: T[],
    uploadFunction: (chunk: T[]) => Promise<any>,
    options: BulkUploadOptions = {}
  ): Promise<{ success: number; failed: number; errors: any[] }> {
    const {
      batchSize = this.DEFAULT_BATCH_SIZE,
      maxRetries = this.MAX_RETRIES,
      onProgress,
      onError,
      signal
    } = options;
    
    // Split data into chunks
    const chunks: T[][] = [];
    for (let i = 0; i < data.length; i += batchSize) {
      chunks.push(data.slice(i, i + batchSize));
    }
    
    let successCount = 0;
    let failedCount = 0;
    const errors: any[] = [];
    
    // Process chunks with delays to prevent overwhelming the server
    for (let i = 0; i < chunks.length; i++) {
      // Check if aborted
      if (signal?.aborted) {
        throw new Error('Upload aborted');
      }
      
      const chunk = chunks[i];
      let retries = 0;
      
      while (retries <= maxRetries) {
        try {
          await uploadFunction(chunk);
          successCount += chunk.length;
          
          // Report progress
          if (onProgress) {
            onProgress(successCount + failedCount, data.length);
          }
          
          break; // Success, move to next chunk
          
        } catch (error) {
          retries++;
          
          if (retries > maxRetries) {
            failedCount += chunk.length;
            errors.push({
              chunk: i + 1,
              error: error instanceof Error ? error.message : String(error),
              affectedRows: chunk.length
            });
            
            if (onError) {
              onError(error instanceof Error ? error : new Error(String(error)), i);
            }
            break;
          }
          
          // Exponential backoff
          await this.delay(Math.pow(2, retries) * 1000);
        }
      }
      
      // Small delay between chunks to prevent server overload
      if (i < chunks.length - 1) {
        await this.delay(100);
      }
    }
    
    return { success: successCount, failed: failedCount, errors };
  }
  
  /**
   * Parse CSV data in chunks to prevent UI freezing
   */
  static async parseCSVInChunks(
    csvText: string,
    chunkSize: number = 10000,
    onProgress?: (processed: number, total: number) => void
  ): Promise<any[]> {
    return new Promise((resolve) => {
      const lines = csvText.split('\n');
      const header = lines[0].split(',');
      const results: any[] = [];
      let processed = 0;
      
      // Process in chunks using setTimeout to prevent blocking
      function processChunk(startIndex: number) {
        const endIndex = Math.min(startIndex + chunkSize, lines.length);
        
        for (let i = startIndex; i < endIndex; i++) {
          if (i === 0) continue; // Skip header
          
          const values = lines[i].split(',');
          if (values.length === header.length) {
            const obj: any = {};
            header.forEach((key, index) => {
              obj[key.trim()] = values[index]?.trim() || '';
            });
            results.push(obj);
          }
          processed++;
        }
        
        // Report progress
        if (onProgress) {
          onProgress(processed, lines.length);
        }
        
        // Process next chunk or resolve
        if (endIndex < lines.length) {
          setTimeout(() => processChunk(endIndex), 0);
        } else {
          resolve(results);
        }
      }
      
      // Start processing
      setTimeout(() => processChunk(1), 0);
    });
  }
  
  /**
   * Validate large datasets before upload
   */
  static validateDataset(data: any[], requiredFields: string[]): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];
    const sampleSize = Math.min(100, data.length); // Check first 100 rows
    
    for (let i = 0; i < sampleSize; i++) {
      const row = data[i];
      const missingFields = requiredFields.filter(field => !row[field]);
      
      if (missingFields.length > 0) {
        errors.push(`Row ${i + 1}: Missing required fields: ${missingFields.join(', ')}`);
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
  
  private static delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Hook for managing bulk upload state
 */
export function useBulkUpload() {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  
  const startUpload = async <T>(
    data: T[],
    uploadFunction: (chunk: T[]) => Promise<any>,
    options?: BulkUploadOptions
  ) => {
    const controller = new AbortController();
    setAbortController(controller);
    setIsUploading(true);
    setError(null);
    setProgress(0);
    
    try {
      const result = await BulkUploadManager.uploadInChunks(
        data,
        uploadFunction,
        {
          ...options,
          signal: controller.signal,
          onProgress: (processed, total) => {
            setProgress(Math.round((processed / total) * 100));
            options?.onProgress?.(processed, total);
          }
        }
      );
      
      return result;
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Upload failed');
      throw error;
    } finally {
      setIsUploading(false);
      setAbortController(null);
    }
  };
  
  const cancelUpload = () => {
    if (abortController) {
      abortController.abort();
    }
  };
  
  return {
    isUploading,
    progress,
    error,
    startUpload,
    cancelUpload
  };
}
