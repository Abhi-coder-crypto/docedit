import { useState, useEffect, useCallback } from "react";
import { Download, Upload, Search, RefreshCw, Image, Clock, CheckCircle, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useDropzone } from "react-dropzone";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface ImageRequest {
  id: string;
  userId: string;
  employeeId: string;
  displayName: string;
  originalFileName: string;
  originalFilePath: string;
  editedFileName?: string;
  editedFilePath?: string;
  status: 'pending' | 'completed';
  uploadedAt: string;
  completedAt?: string;
}

export default function AdminDashboard() {
  const { toast } = useToast();
  const [requests, setRequests] = useState<ImageRequest[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<ImageRequest | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [totalRequests, setTotalRequests] = useState(0);
  const [stats, setStats] = useState({ total: 0, pending: 0, completed: 0, users: 0 });
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const LIMIT = 10;

  const fetchRequests = useCallback(async (isInitial = true) => {
    if (isLoading) return;
    
    setIsLoading(true);
    const currentOffset = isInitial ? 0 : offset;
    
    try {
      let success = false;
      let retryCount = 0;
      const maxClientRetries = 5;

      while (!success && retryCount < maxClientRetries) {
        try {
          const response = await fetch(`/api/admin/requests?limit=${LIMIT}&offset=${currentOffset}&t=${Date.now()}`, {
            method: 'GET',
            headers: {
              'Accept': 'application/json'
            }
          });
          
          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            if (response.status === 503 && retryCount < maxClientRetries - 1) {
              retryCount++;
              await new Promise(r => setTimeout(r, 2000 * retryCount));
              continue;
            }
            throw new Error(`Server returned ${response.status}: ${errorData.message || 'Unknown error'}`);
          }
          
          const data = await response.json();
          
          if (isInitial) {
            setRequests(data.requests);
            setOffset(data.requests.length);
          } else {
            setRequests(prev => {
              const newRequests = data.requests.filter(
                (newReq: any) => !prev.some(existingReq => String(existingReq.id) === String(newReq.id))
              );
              return [...prev, ...newRequests];
            });
            setOffset(prev => prev + data.requests.length);
          }
          
          setTotalRequests(data.total);
          setStats({
            total: data.total,
            pending: data.pendingCount || 0,
            completed: data.completedCount || 0,
            users: data.uniqueUsers || 0
          });
          setHasMore(data.hasMore);
          success = true;
        } catch (err: any) {
          if (retryCount >= maxClientRetries - 1) throw err;
          retryCount++;
          await new Promise(r => setTimeout(r, 2000 * retryCount));
        }
      }
    } catch (error: any) {
      if (isInitial) {
        toast({
          title: "Connection Issue",
          description: error.message || 'Failed to fetch requests',
          variant: "destructive",
        });
      }
    } finally {
      setIsLoading(false);
    }
  }, [toast, offset, LIMIT, isLoading]); 

  useEffect(() => {
    fetchRequests(true);
    
    // Add a periodic refresh every 60 seconds for background updates
    const interval = setInterval(() => {
      fetchRequests(true);
    }, 60000);
    
    return () => clearInterval(interval);
  }, []); 

  const loadMore = () => {
    if (hasMore && !isLoading) {
      fetchRequests(false);
    }
  };

  const filteredRequests = requests.filter(req => 
    req.displayName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    req.employeeId?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const onDrop = async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0 || !selectedRequest) return;

    const file = acceptedFiles[0];
    if (file.size > 1 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Maximum file size is 1MB. Please compress the edited image.",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    
    const formData = new FormData();
    formData.append('editedImage', file);

    try {
      const response = await fetch(`/api/admin/upload-edited/${selectedRequest.id}`, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Upload failed');
      }

      toast({
        title: "Success",
        description: "Edited image uploaded successfully",
      });

      await fetchRequests();
      setSelectedRequest(null);
    } catch (error: any) {
      toast({
        title: "Upload Failed",
        description: error.message || 'Failed to upload edited image',
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': [] },
    maxFiles: 1,
    disabled: isUploading,
    maxSize: 1 * 1024 * 1024,
    onDropRejected: (fileRejections) => {
      fileRejections.forEach((rejection) => {
        if (rejection.errors.some(e => e.code === 'file-too-large')) {
          toast({
            title: "File too large",
            description: "Maximum file size for edited images is 1MB. Please compress before uploading.",
            variant: "destructive",
          });
        }
      });
    }
  });

  const downloadImage = async (requestId: string, type: 'original' | 'edited') => {
    try {
      const response = await fetch(`/api/images/download-by-id/${requestId}/${type}`);
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Download failed');
      }
      
      const blob = await response.blob();
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = `${type}-image`;
      
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?([^"]+)"?/);
        if (match) {
          filename = match[1];
        }
      }
      
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      toast({
        title: "Download Failed",
        description: error.message || 'Failed to download image',
        variant: "destructive",
      });
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800">
      <header className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white sticky top-0 z-50 shadow-lg">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-md">
              <Image className="h-5 w-5 text-white" />
            </div>
            <div>
              <span className="font-bold text-lg">Admin Portal</span>
              <p className="text-xs text-slate-400 hidden sm:block">Background Removal System</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-3 px-3 py-1.5 rounded-lg bg-slate-800/30">
              <Avatar className="h-8 w-8 border-2 border-indigo-400/50">
                <AvatarFallback className="bg-gradient-to-br from-indigo-500 to-purple-600 text-white text-xs font-medium">
                  AD
                </AvatarFallback>
              </Avatar>
              <div className="text-right">
                <p className="text-sm font-medium">Admin</p>
                <p className="text-xs text-indigo-300">Administrator</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Card className="bg-white/80 dark:bg-slate-800/80 backdrop-blur border-0 shadow-md overflow-visible">
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm text-muted-foreground">Total Requests</p>
                  <p className="text-2xl font-bold text-foreground" data-testid="text-total-requests">{totalRequests}</p>
                </div>
                <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg">
                  <Image className="h-6 w-6 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white/80 dark:bg-slate-800/80 backdrop-blur border-0 shadow-md overflow-visible">
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm text-muted-foreground">Pending</p>
                  <p className="text-2xl font-bold text-amber-600" data-testid="text-pending-count">{stats.pending}</p>
                </div>
                <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg">
                  <Clock className="h-6 w-6 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white/80 dark:bg-slate-800/80 backdrop-blur border-0 shadow-md overflow-visible">
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm text-muted-foreground">Completed</p>
                  <p className="text-2xl font-bold text-green-600" data-testid="text-completed-count">{stats.completed}</p>
                </div>
                <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center shadow-lg">
                  <CheckCircle className="h-6 w-6 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white/80 dark:bg-slate-800/80 backdrop-blur border-0 shadow-md overflow-visible">
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm text-muted-foreground">Unique Users</p>
                  <p className="text-2xl font-bold text-indigo-600" data-testid="text-unique-users">{stats.users}</p>
                </div>
                <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-indigo-400 to-purple-600 flex items-center justify-center shadow-lg">
                  <Users className="h-6 w-6 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">User Requests</h1>
            <p className="text-muted-foreground">Manage and process background removal requests</p>
          </div>
          <div className="flex gap-2 w-full md:w-auto">
            <Button 
              variant="outline" 
              onClick={() => fetchRequests(true)} 
              disabled={isLoading} 
              className="bg-white/80 dark:bg-slate-800/80 backdrop-blur" 
              data-testid="button-refresh"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <div className="relative w-full md:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Search users..." 
                className="pl-10 bg-white/80 dark:bg-slate-800/80 backdrop-blur border-0 shadow-sm"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                data-testid="input-search"
              />
            </div>
          </div>
        </div>

        <Card className="bg-white/80 dark:bg-slate-800/80 backdrop-blur border-0 shadow-lg overflow-hidden">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/80 dark:bg-slate-700/50 hover:bg-slate-50/80 dark:hover:bg-slate-700/50">
                  <TableHead className="font-semibold">User</TableHead>
                  <TableHead className="font-semibold">File</TableHead>
                  <TableHead className="font-semibold">Date</TableHead>
                  <TableHead className="font-semibold">Status</TableHead>
                  <TableHead className="text-right font-semibold">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12">
                      <RefreshCw className="h-8 w-8 animate-spin mx-auto text-indigo-500" />
                      <p className="mt-3 text-muted-foreground">Loading requests...</p>
                    </TableCell>
                  </TableRow>
                ) : filteredRequests.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12">
                      <div className="h-16 w-16 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center mx-auto mb-4">
                        <Image className="h-8 w-8 text-muted-foreground" />
                      </div>
                      <p className="text-muted-foreground">No requests found</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRequests.map((req) => (
                    <TableRow 
                      key={req.id} 
                      className="hover:bg-slate-50/50 dark:hover:bg-slate-700/30 transition-colors"
                      data-testid={`row-request-${req.id}`}
                    >
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-9 w-9 border border-slate-200 dark:border-slate-600">
                            <AvatarFallback className="bg-gradient-to-br from-slate-200 to-slate-300 dark:from-slate-600 dark:to-slate-700 text-slate-600 dark:text-slate-300 text-xs font-medium">
                              {req.displayName ? getInitials(req.displayName) : 'U'}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium text-foreground">{req.displayName}</p>
                            <p className="text-xs text-muted-foreground">ID: {req.employeeId}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <p className="text-sm text-muted-foreground truncate max-w-[200px]" title={req.originalFileName}>
                          {req.originalFileName}
                        </p>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(req.uploadedAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant={req.status === 'completed' ? 'default' : 'secondary'}
                          className={req.status === 'completed' 
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-0' 
                            : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-0'
                          }
                          data-testid={`badge-status-${req.id}`}
                        >
                          {req.status === 'completed' ? (
                            <><CheckCircle className="h-3 w-3 mr-1" /> Completed</>
                          ) : (
                            <><Clock className="h-3 w-3 mr-1" /> Pending</>
                          )}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2 flex-wrap">
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={() => downloadImage(req.id, 'original')}
                            className="bg-white/50 dark:bg-slate-700/50"
                            data-testid={`button-download-original-${req.id}`}
                          >
                            <Download className="h-4 w-4 mr-1.5" />
                            Original
                          </Button>
                          {req.status === 'completed' && req.editedFilePath && (
                            <Button 
                              variant="outline" 
                              size="sm" 
                              onClick={() => downloadImage(req.id, 'edited')}
                              className="bg-green-50 text-green-700 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400 dark:hover:bg-green-900/30 border-green-200 dark:border-green-800"
                              data-testid={`button-download-edited-${req.id}`}
                            >
                              <Download className="h-4 w-4 mr-1.5" />
                              Edited
                            </Button>
                          )}
                          {req.status === 'pending' && (
                            <Button 
                              size="sm" 
                              onClick={() => setSelectedRequest(req)}
                              className="bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white shadow-md"
                              data-testid={`button-upload-edit-${req.id}`}
                            >
                              <Upload className="h-4 w-4 mr-1.5" />
                              Upload Edit
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
                {!isLoading && hasMore && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-6">
                      <Button 
                        variant="ghost" 
                        onClick={loadMore} 
                        className="text-indigo-600 hover:text-indigo-700 font-medium"
                      >
                        Load More Data (10 items)
                      </Button>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </main>

      <Dialog open={!!selectedRequest} onOpenChange={(open) => !open && setSelectedRequest(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                <Upload className="h-4 w-4 text-white" />
              </div>
              Upload Edited Image
            </DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <Card className="bg-slate-50 dark:bg-slate-800/50 border-0">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className="bg-gradient-to-br from-slate-200 to-slate-300 dark:from-slate-600 dark:to-slate-700 text-sm">
                      {selectedRequest?.displayName ? getInitials(selectedRequest.displayName) : 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium">{selectedRequest?.displayName}</p>
                    <p className="text-xs text-muted-foreground">ID: {selectedRequest?.employeeId}</p>
                  </div>
                </div>
                <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
                  <p className="text-xs text-muted-foreground">Original File</p>
                  <p className="text-sm font-medium truncate">{selectedRequest?.originalFileName}</p>
                </div>
              </CardContent>
            </Card>
            
            <div 
              {...getRootProps()}
              className={`p-8 border-2 border-dashed rounded-xl text-center space-y-3 cursor-pointer transition-all
                ${isDragActive 
                  ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20' 
                  : 'border-slate-300 dark:border-slate-600 hover:border-indigo-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                }
                ${isUploading ? 'opacity-50 pointer-events-none' : ''}
              `}
              data-testid="dropzone-edited"
            >
              <input {...getInputProps()} />
              {isUploading ? (
                <>
                  <div className="h-14 w-14 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center mx-auto">
                    <RefreshCw className="h-7 w-7 text-indigo-600 dark:text-indigo-400 animate-spin" />
                  </div>
                  <p className="text-sm font-medium">Uploading...</p>
                </>
              ) : (
                <>
                  <div className="h-14 w-14 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center mx-auto">
                    <Upload className="h-7 w-7 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Click or drag to upload</p>
                    <p className="text-xs text-muted-foreground">PNG or JPG with transparent background</p>
                  </div>
                </>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedRequest(null)} data-testid="button-cancel-upload">
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
