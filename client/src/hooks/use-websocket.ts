import { useEffect, useRef, useCallback, useState } from 'react';
import { useAuth } from '@/lib/auth-context';

export interface WSMessage {
  type: string;
  data?: any;
  message?: string;
}

function isNetlifyDeployment(): boolean {
  const host = window.location.host;
  return host.includes('netlify.app') || host.includes('netlify.com');
}

function isVercelDeployment(): boolean {
  const host = window.location.host;
  const isVercel = host.includes('vercel.app') || host.includes('vercel.com');
  console.log('[WebSocket] Host:', host, '| isVercel:', isVercel);
  return isVercel;
}

function isReplitDeployment(): boolean {
  const host = window.location.host;
  return host.includes('replit.dev') || host.includes('repl.co');
}

export function isServerlessDeployment(): boolean {
  const isServerless = isNetlifyDeployment() || isVercelDeployment();
  const isReplit = isReplitDeployment();
  console.log('[WebSocket] isServerless:', isServerless, '| isReplit:', isReplit);
  // If on Replit, WebSocket works, so it's not serverless
  if (isReplit) return false;
  return isServerless;
}

export function useWebSocket(onMessage?: (message: WSMessage) => void, forceRole?: 'admin' | 'user') {
  const { user } = useAuth();
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const shouldReconnectRef = useRef(true);

  const connect = useCallback(() => {
    const serverless = isServerlessDeployment();
    console.log('[WebSocket] connect() called, isServerless:', serverless);
    
    if (serverless) {
      console.log('[WebSocket] Skipping WebSocket connection on serverless platform');
      return;
    }
    
    if (!shouldReconnectRef.current) {
      console.log('[WebSocket] shouldReconnect is false, skipping');
      return;
    }
    
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      console.log('[WebSocket] Already connected, skipping');
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    console.log('[WebSocket] Attempting to connect to:', wsUrl);
    
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('WebSocket connected');
      setIsConnected(true);
      
      const role = forceRole || user?.role || 'admin';
      const userId = user?.id || 'admin-' + Date.now();
      
      ws.send(JSON.stringify({
        type: 'register',
        userId: userId,
        role: role,
      }));
    };

    ws.onmessage = (event) => {
      try {
        const message: WSMessage = JSON.parse(event.data);
        console.log('WebSocket message:', message);
        onMessage?.(message);
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
      setIsConnected(false);
      
      if (shouldReconnectRef.current) {
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, 3000);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }, [user, onMessage, forceRole]);

  useEffect(() => {
    shouldReconnectRef.current = true;
    
    // Connect if user exists OR if forceRole is provided (for admin panel without auth)
    if (user || forceRole) {
      connect();
    }

    return () => {
      shouldReconnectRef.current = false;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [user, connect, forceRole]);

  useEffect(() => {
    if (isConnected && wsRef.current?.readyState === WebSocket.OPEN) {
      const role = forceRole || user?.role || 'admin';
      const userId = user?.id || 'admin-' + Date.now();
      
      wsRef.current.send(JSON.stringify({
        type: 'register',
        userId: userId,
        role: role,
      }));
    }
  }, [isConnected, user, forceRole]);

  return {
    isConnected,
    ws: wsRef.current,
    isServerless: isServerlessDeployment(),
  };
}