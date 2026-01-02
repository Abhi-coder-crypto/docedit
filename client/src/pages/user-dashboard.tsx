import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { useDropzone } from "react-dropzone";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, CheckCircle2, Clock, Download, LogOut, Image as ImageIcon, RefreshCw, Wifi, WifiOff, CloudUpload, FileImage, Calendar, Sparkles, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useWebSocket, WSMessage } from "@/hooks/use-websocket";

interface ImageRequest {
  id: string;
  originalFileName: string;
  originalFilePath: string;
  editedFileName?: string;
  editedFilePath?: string;
  status: 'pending' | 'completed';
  uploadedAt: string;
  completedAt?: string;
}

export default function UserDashboard() {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const [requests, setRequests] = useState<ImageRequest[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const handleWebSocketMessage = useCallback((message: WSMessage) => {
    if (message.type === 'image_edited') {
      const editedRequest = message.data;
      setRequests(prev => prev.map(req => 
        req.id === editedRequest.id 
          ? { 
              ...req, 
              status: 'completed' as const,
              editedFileName: editedRequest.editedFileName,
              editedFilePath: editedRequest.editedFilePath,
              completedAt: editedRequest.completedAt,
            }
          : req
      ));
      toast({
        title: "Image Ready!",
        description: `Your image "${editedRequest.originalFileName}" has been edited and is ready for download.`,
      });
    }
  }, [toast]);

  const { isConnected } = useWebSocket(handleWebSocketMessage);

  const fetchRequests = useCallback(async () => {
    if (!user?.id) return;
    
    try {
      const response = await fetch(`/api/images/user/${user.id}`);
      const data = await response.json();
      
      if (response.ok) {
        setRequests(data.requests || []);
      }
    } catch (error) {
      console.error('Failed to fetch requests:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const onDrop = async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0 || !user) return;

    setIsUploading(true);
    setUploadProgress(0);
    
    const formData = new FormData();
    formData.append('image', acceptedFiles[0]);
    formData.append('userId', user.id);
    formData.append('employeeId', user.employeeId);
    formData.append('displayName', user.displayName);

    try {
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => Math.min(prev + 10, 90));
      }, 200);

      const response = await fetch('/api/images/upload', {
        method: 'POST',
        body: formData,
      });

      clearInterval(progressInterval);
      setUploadProgress(100);

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Upload failed');
      }

      await fetchRequests();
      setShowSuccessDialog(true);
    } catch (error: any) {
      toast({
        title: "Upload Failed",
        description: error.message || 'Failed to upload image',
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': [] },
    maxFiles: 1,
    disabled: isUploading,
  });

  const downloadFile = async (requestId: string, type: 'original' | 'edited') => {
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-100">
      <header className="bg-white/80 backdrop-blur-lg border-b border-slate-200/50 sticky top-0 z-50">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-blue-600 to-cyan-500 p-2.5 rounded-xl shadow-lg shadow-blue-500/20">
              <ImageIcon className="h-5 w-5 text-white" />
            </div>
            <div>
              <span className="font-bold text-lg tracking-tight text-slate-800">Cipla Portal</span>
              <span className="hidden sm:inline text-slate-400 text-sm ml-2">Image Processing</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 rounded-full" title={isConnected ? 'Real-time updates active' : 'Reconnecting...'}>
              {isConnected ? (
                <>
                  <Wifi className="h-3.5 w-3.5 text-green-500" />
                  <span className="text-xs text-green-600 font-medium hidden sm:inline">Live</span>
                </>
              ) : (
                <>
                  <WifiOff className="h-3.5 w-3.5 text-slate-400 animate-pulse" />
                  <span className="text-xs text-slate-500 hidden sm:inline">Connecting...</span>
                </>
              )}
            </div>
            <div className="hidden md:flex items-center gap-3 px-4 py-2 bg-slate-50 rounded-xl">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-cyan-400 rounded-full flex items-center justify-center text-white font-semibold text-sm">
                {user?.displayName?.charAt(0).toUpperCase()}
              </div>
              <div className="text-sm">
                <p className="font-medium text-slate-800">{user?.displayName}</p>
                <p className="text-xs text-slate-500">ID: {user?.employeeId}</p>
              </div>
            </div>

            <Button variant="ghost" size="icon" onClick={logout} className="text-slate-500 hover:text-slate-700 hover:bg-slate-100" data-testid="button-logout">
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="mb-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4"
          >
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-800 mb-1">
                Welcome, {user?.displayName}
              </h1>
              <p className="text-slate-500">Upload images and track your processing requests.</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={fetchRequests} disabled={isLoading} className="bg-white shadow-sm" data-testid="button-refresh">
                <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </motion.div>
        </div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card className="border-none shadow-xl bg-white mb-8 overflow-hidden">
            <div className="h-1 w-full bg-gradient-to-r from-blue-500 via-cyan-500 to-blue-500" />
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-slate-800">
                <CloudUpload className="h-5 w-5 text-blue-500" />
                Upload Your Image
              </CardTitle>
              <CardDescription>Drag and drop or click to select an image for processing</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-blue-100 rounded-full flex-shrink-0">
                    <Info className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-blue-800 mb-2">Image Requirements</p>
                    <ul className="text-sm text-blue-700 space-y-1 list-disc list-inside">
                      <li>Capture your photo in formal attire</li>
                      <li>The photo should be clicked from the front side</li>
                      <li>A full photo (head to toe) is required to create your final image</li>
                      <li>Half or closeup photos are strictly not accepted</li>
                      <li>Click the photo on a plain white background</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div
                {...getRootProps()}
                className={`
                  min-h-[200px] flex flex-col items-center justify-center rounded-2xl border-2 border-dashed 
                  transition-all duration-300 cursor-pointer relative overflow-hidden
                  ${isDragActive ? 'border-blue-500 bg-blue-50 scale-[1.02]' : 'border-slate-200 hover:border-blue-400 hover:bg-slate-50'}
                `}
                data-testid="dropzone-upload"
              >
                <input {...getInputProps()} data-testid="input-file" />
                
                {isUploading ? (
                  <div className="w-full max-w-xs space-y-4 text-center">
                    <div className="mx-auto w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mb-4">
                      <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                    </div>
                    <h3 className="font-semibold text-lg text-slate-800">Uploading...</h3>
                    <Progress value={uploadProgress} className="h-2" />
                    <p className="text-sm text-slate-500">{uploadProgress}% complete</p>
                  </div>
                ) : (
                  <div className="text-center space-y-4 p-8">
                    <motion.div 
                      animate={{ y: isDragActive ? -10 : 0 }}
                      className="mx-auto w-20 h-20 bg-gradient-to-br from-blue-100 to-cyan-100 rounded-2xl flex items-center justify-center shadow-sm"
                    >
                      <Upload className={`h-10 w-10 ${isDragActive ? 'text-blue-600' : 'text-blue-500'}`} />
                    </motion.div>
                    <div className="space-y-2">
                      <h3 className="font-bold text-xl text-slate-800">
                        {isDragActive ? 'Drop your image here' : 'Upload your image'}
                      </h3>
                      <p className="text-slate-500 max-w-sm mx-auto">
                        Supports JPG, PNG, and WebP files up to 10MB
                      </p>
                    </div>
                    <Button className="mt-4 bg-gradient-to-r from-blue-600 to-cyan-500 hover:opacity-90" data-testid="button-select-file">
                      <Sparkles className="h-4 w-4 mr-2" />
                      Select File
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {requests.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-xl font-bold text-slate-800">Your Requests</h2>
              <Badge variant="secondary" className="bg-slate-100">{requests.length}</Badge>
            </div>
            <div className="space-y-4">
              {requests.map((request, index) => (
                <motion.div
                  key={request.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                >
                  <Card className="border-none shadow-lg overflow-hidden hover:shadow-xl transition-shadow" data-testid={`card-request-${request.id}`}>
                    <div className={`h-1.5 w-full ${request.status === 'completed' ? 'bg-gradient-to-r from-green-400 to-emerald-500' : 'bg-gradient-to-r from-amber-400 to-orange-500'}`} />
                    <CardContent className="p-6">
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                          <div className={`p-3 rounded-xl ${request.status === 'completed' ? 'bg-green-100' : 'bg-amber-100'}`}>
                            <FileImage className={`h-6 w-6 ${request.status === 'completed' ? 'text-green-600' : 'text-amber-600'}`} />
                          </div>
                          <div>
                            <h3 className="font-semibold text-slate-800 mb-1">{request.originalFileName}</h3>
                            <div className="flex items-center gap-3 text-sm text-slate-500 flex-wrap">
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3.5 w-3.5" />
                                {new Date(request.uploadedAt).toLocaleDateString()}
                              </span>
                              {request.status === 'completed' ? (
                                <Badge className="bg-green-500 hover:bg-green-600" data-testid={`badge-status-${request.id}`}>
                                  <CheckCircle2 className="h-3 w-3 mr-1" />
                                  Completed
                                </Badge>
                              ) : (
                                <Badge variant="secondary" className="text-amber-600 bg-amber-50" data-testid={`badge-status-${request.id}`}>
                                  <Clock className="h-3 w-3 mr-1" />
                                  Pending
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2 flex-wrap">
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => downloadFile(request.id, 'original')}
                            className="gap-2"
                            data-testid={`button-download-original-${request.id}`}
                          >
                            <Download className="h-4 w-4" />
                            Original
                          </Button>
                          
                          {request.status === 'completed' && request.editedFilePath && (
                            <Button 
                              size="sm"
                              onClick={() => downloadFile(request.id, 'edited')}
                              className="gap-2 bg-gradient-to-r from-green-500 to-emerald-500 hover:opacity-90"
                              data-testid={`button-download-edited-${request.id}`}
                            >
                              <Download className="h-4 w-4" />
                              Edited
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </main>

      <Dialog open={showSuccessDialog} onOpenChange={setShowSuccessDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <motion.div 
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="mx-auto w-16 h-16 bg-gradient-to-br from-green-400 to-emerald-500 rounded-2xl flex items-center justify-center mb-4 shadow-lg"
            >
              <CheckCircle2 className="h-8 w-8 text-white" />
            </motion.div>
            <DialogTitle className="text-center text-xl">Image Uploaded Successfully!</DialogTitle>
            <DialogDescription className="text-center pt-2">
              You can download your edited image after 3 days.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:justify-center">
            <Button onClick={() => setShowSuccessDialog(false)} className="w-full sm:w-auto bg-gradient-to-r from-blue-600 to-cyan-500 hover:opacity-90" data-testid="button-close-success">
              Got it, thanks
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Loader2({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}
