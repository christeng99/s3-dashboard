'use client';

import React, { useState, useCallback, useEffect } from 'react';
import {
  Trash2,
  Download,
  Folder,
  FileIcon,
  RefreshCw,
  ChevronLeft,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

// Format bytes into human-readable format (B/KB/MB/GB)
const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// Format date to readable format in user's local timezone
const formatDate = (date: Date | string | undefined): string => {
  if (!date) return '';

  const dateObj = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(dateObj.getTime())) return '';

  return dateObj.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

interface S3Object {
  key: string;
  size?: number;
  lastModified?: Date;
  isFolder?: boolean;
  itemCount?: number; // For folders: count of items inside
}

export function S3Explorer() {
  const [files, setFiles] = useState<S3Object[]>([]);
  const [currentPath, setCurrentPath] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedFile, setSelectedFile] = useState<S3Object | null>(null);
  const [viewContent, setViewContent] = useState(false);
  const [fileContent, setFileContent] = useState('');
  const [bucketName, setBucketName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [viewType, setViewType] = useState<'text' | 'json'>('text');
  const [fileSizeBytes, setFileSizeBytes] = useState<number>(0);

  // Load initial bucket info and files on mount
  useEffect(() => {
    loadBucketInfo();
  }, []);

  // Load files when currentPath changes
  useEffect(() => {
    loadFiles();
  }, [currentPath]);

  const loadBucketInfo = useCallback(async () => {
    const bucket = process.env.NEXT_PUBLIC_S3_BUCKET || 'S3 Bucket';
    setBucketName(bucket);
  }, []);

  const loadFiles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/s3/list', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prefix: currentPath,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to load files');
      }

      const data = await response.json();
      // Parse items to extract virtual folders and files at current level only
      const allItems = data.files || [];
      const itemsMap = new Map<string, S3Object>();
      const folderContents = new Map<string, number>(); // Track item count per folder

      allItems.forEach((item: S3Object) => {
        // Remove current path prefix to get relative path
        let relativePath = item.key;
        if (currentPath && item.key.startsWith(currentPath)) {
          relativePath = item.key.slice(currentPath.length);
        }

        if (!relativePath) return; // Skip if empty

        // Check if this is a direct child or nested
        const slashIndex = relativePath.indexOf('/');

        if (slashIndex === -1) {
          // This is a direct file child
          itemsMap.set(item.key, item);
        } else {
          // This is a nested item, extract the folder name
          const folderName = relativePath.substring(0, slashIndex);
          const folderKey = currentPath + folderName + '/';

          // Count items in this folder
          folderContents.set(
            folderKey,
            (folderContents.get(folderKey) || 0) + 1,
          );

          // Only add if not already added
          if (!itemsMap.has(folderKey)) {
            itemsMap.set(folderKey, {
              key: folderKey,
              isFolder: true,
              size: 0,
              itemCount: folderContents.get(folderKey) || 0,
            });
          } else {
            // Update count for existing folder
            const folder = itemsMap.get(folderKey);
            if (folder) {
              folder.itemCount = folderContents.get(folderKey) || 0;
            }
          }
        }
      });

      // Convert map to array and sort (folders first, then files, alphabetically by name)
      const itemsList = Array.from(itemsMap.values()).sort((a, b) => {
        if (a.isFolder && !b.isFolder) return -1;
        if (!a.isFolder && b.isFolder) return 1;

        // Sort by display name (without path prefix)
        const aName = a.key.startsWith(currentPath)
          ? a.key.slice(currentPath.length).replace(/\/$/, '').trim()
          : a.key;
        const bName = b.key.startsWith(currentPath)
          ? b.key.slice(currentPath.length).replace(/\/$/, '').trim()
          : b.key;

        return aName.localeCompare(bName);
      });

      console.log(itemsList);
      setFiles(itemsList);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to load files';
      setError(message);
      console.error('Error loading files:', err);
    } finally {
      setLoading(false);
    }
  }, [currentPath]);

  const deleteFile = useCallback(
    async (fileKey: string, isFolder: boolean = false) => {
      const itemType = isFolder ? 'folder' : 'file';
      if (
        !confirm(
          `Are you sure you want to delete this ${itemType}? This action cannot be undone.`,
        )
      ) {
        return;
      }

      try {
        setLoading(true);
        const response = await fetch('/api/s3/delete', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            key: fileKey,
          }),
        });

        if (!response.ok) {
          throw new Error(`Failed to delete ${itemType}`);
        }

        await loadFiles();
        setSelectedFile(null);
        alert(
          `${itemType.charAt(0).toUpperCase() + itemType.slice(1)} deleted successfully`,
        );
      } catch (error) {
        console.error(`Error deleting ${itemType}:`, error);
        alert(`Failed to delete ${itemType}`);
      } finally {
        setLoading(false);
      }
    },
    [loadFiles],
  );

  const viewFile = useCallback(async (fileKey: string) => {
    try {
      setLoading(true);
      const response = await fetch('/api/s3/get', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          key: fileKey,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to read file');
      }

      const data = await response.json();
      const contentSize = new Blob([data.content || '']).size;
      setFileSizeBytes(contentSize);

      const MAX_VIEW_SIZE = 5 * 1024 * 1024; // 5MB

      if (contentSize > MAX_VIEW_SIZE) {
        // File is larger than 5MB, show message only
        setFileContent('');
        setViewType('text');
      } else {
        const content = data.content || '';
        setFileContent(content);

        // Auto-detect if content is JSON
        let detectedViewType: 'text' | 'json' = 'text';
        try {
          JSON.parse(content);
          detectedViewType = 'json';
        } catch {
          // Not valid JSON, use text view
        }
        setViewType(detectedViewType);
      }

      setSelectedFile({ key: fileKey, isFolder: false, size: contentSize });
      setViewContent(true);
    } catch (error) {
      console.error('Error reading file:', error);
      alert(error instanceof Error ? error.message : 'Failed to read file');
    } finally {
      setLoading(false);
    }
  }, []);

  const downloadFile = useCallback(async (fileKey: string) => {
    try {
      const response = await fetch('/api/s3/get', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          key: fileKey,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to download file');
      }

      const data = await response.json();
      const element = document.createElement('a');
      element.setAttribute(
        'href',
        'data:text/plain;charset=utf-8,' + encodeURIComponent(data.content),
      );
      element.setAttribute('download', fileKey.split('/').pop() || 'download');
      element.style.display = 'none';
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);
    } catch (error) {
      console.error('Error downloading file:', error);
      alert('Failed to download file');
    }
  }, []);

  const navigateToFolder = (folderKey: string) => {
    setCurrentPath(folderKey);
    setSelectedFile(null);
    setViewContent(false);
  };

  const goBack = () => {
    if (currentPath) {
      const parts = currentPath.split('/').filter(Boolean);
      parts.pop();
      setCurrentPath(parts.length ? parts.join('/') + '/' : '');
      setSelectedFile(null);
    }
  };

  const formatJsonString = (str: string): string => {
    try {
      const parsed = JSON.parse(str);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return str;
    }
  };

  const getFormattedContent = (): string => {
    if (viewType === 'json') {
      return formatJsonString(fileContent);
    }
    return fileContent;
  };

  if (error) {
    return (
      <Card className="p-6 border-red-200 bg-red-50">
        <h2 className="text-lg font-bold text-red-900 mb-4">Error</h2>
        <p className="text-red-700 mb-4">{error}</p>
        <Button onClick={loadFiles}>Retry</Button>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold">Bucket: {bucketName}</h2>
          </div>
          <div className="flex gap-2">
            {currentPath && (
              <Button
                variant="outline"
                size="sm"
                onClick={goBack}
                className="gap-2"
              >
                <ChevronLeft className="h-4 w-4" />
                Back
              </Button>
            )}
            <Button
              variant="outline"
              size="icon"
              onClick={loadFiles}
              disabled={loading}
              title="Refresh"
            >
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            </Button>
          </div>
        </div>

        {/* Path Display */}
        <div className="text-sm text-muted-foreground">
          Path: {currentPath ? currentPath : 'Root'}
        </div>
      </Card>

      {viewContent && (
        <Dialog open={viewContent} onOpenChange={setViewContent}>
          <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
            <DialogHeader className="border-b pb-3 flex-shrink-0">
              <DialogTitle className="break-all text-base pr-8">
                {selectedFile?.key || 'File Content'}
              </DialogTitle>
            </DialogHeader>

            {fileSizeBytes > 5 * 1024 * 1024 ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <p className="text-lg font-semibold text-muted-foreground mb-4">
                    File is too large to view
                  </p>
                  <p className="text-sm text-muted-foreground mb-6">
                    File size: {formatBytes(fileSizeBytes)} (max 5 MB for
                    viewing)
                  </p>
                  <Button
                    onClick={() => {
                      if (selectedFile?.key) downloadFile(selectedFile.key);
                    }}
                    className="gap-2"
                  >
                    <Download className="h-4 w-4" />
                    Download File
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div className="border-b pb-3 px-6 flex items-center justify-between flex-shrink-0">
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium">View as:</label>
                    <select
                      value={viewType}
                      onChange={(e) =>
                        setViewType(e.target.value as 'text' | 'json')
                      }
                      className="px-2 py-1 rounded border bg-neutral-900 border-neutral-700 text-sm cursor-pointer hover:bg-neutral-800"
                    >
                      <option value="text">Text</option>
                      <option value="json">JSON</option>
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (selectedFile?.key) downloadFile(selectedFile.key);
                      }}
                      title="Download file"
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (selectedFile?.key) {
                          deleteFile(selectedFile.key, false);
                          setViewContent(false);
                        }
                      }}
                      disabled={loading}
                      title="Delete file"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>

                <div className="flex-1 overflow-auto rounded border bg-muted p-4">
                  <pre className="whitespace-pre-wrap break-words text-sm font-mono">
                    {getFormattedContent()}
                  </pre>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>
      )}

      <Card className="p-4 relative">
        <h3 className="mb-4 font-semibold">Files & Folders</h3>
        <div className="relative min-h-[400px]">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center rounded border bg-black/30 backdrop-blur-sm z-50">
              <div className="flex flex-col items-center gap-4">
                <div className="relative w-12 h-12">
                  <RefreshCw className="w-12 h-12 text-white animate-spin" />
                </div>
                <p className="text-sm font-medium text-white">Loading...</p>
              </div>
            </div>
          )}
          {!loading && files.length === 0 ? (
            <p className="text-sm text-muted-foreground">No files found</p>
          ) : (
            <div className="grid gap-2">
              {files.map((file) => {
                const displayName = file.key.startsWith(currentPath)
                  ? file.key.slice(currentPath.length).replace(/\/$/, '')
                  : file.key;

                return (
                  <div
                    key={file.key}
                    className={cn(
                      'flex items-center justify-between rounded border p-3 hover:bg-muted/50 transition-colors cursor-pointer group',
                      selectedFile?.key === file.key &&
                        'bg-muted border-blue-400',
                    )}
                    onClick={() => {
                      if (file.isFolder) {
                        navigateToFolder(file.key);
                      } else {
                        viewFile(file.key);
                      }
                    }}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {file.isFolder ? (
                        <Folder className="h-5 w-5 text-blue-500 flex-shrink-0" />
                      ) : (
                        <FileIcon className="h-5 w-5 text-gray-500 flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2">
                          <p className="text-sm font-medium truncate">
                            {displayName}
                          </p>
                        </div>
                        <div className="text-xs text-muted-foreground flex gap-4 mt-1">
                          <span>
                            {file.isFolder
                              ? `${file.itemCount || 0} item${file.itemCount !== 1 ? 's' : ''}`
                              : file.size
                                ? formatBytes(file.size)
                                : ''}
                          </span>
                          {file.lastModified && (
                            <span>{formatDate(file.lastModified)}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      {!file.isFolder && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            downloadFile(file.key);
                          }}
                          title="Download file"
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteFile(file.key, file.isFolder);
                        }}
                        disabled={loading}
                        title={`Delete ${file.isFolder ? 'folder' : 'file'}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
