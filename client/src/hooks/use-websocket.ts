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
  return host.includes('vercel.app') || host.includes('vercel.com');
}

function isReplitDeployment(): boolean {
  const host = window.location.host;
  return host.includes('replit.dev') || host.includes('repl.co');
}

export function isServerlessDeployment(): boolean {
  const isServerless = isNetlifyDeployment() || isVercelDeployment();
  const isReplit = isReplitDeployment();
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
    
    if (serverless) {
      return;
    }
    
    if (!shouldReconnectRef.current) {
      return;
    }
    
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
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
        onMessage?.(message);
      } catch (error) {
        console.error('[WebSocket] Failed to parse message:', error);
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      
      if (shouldReconnectRef.current) {
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, 3000);
      }
    };

    ws.onerror = (error) => {
      console.error('[WebSocket] Error:', error);
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