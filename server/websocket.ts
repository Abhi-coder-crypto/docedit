import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { log } from './index';

interface WSClient {
  ws: WebSocket;
  userId?: string;
  role?: 'admin' | 'user';
}

const clients: Set<WSClient> = new Set();

export function setupWebSocket(httpServer: Server) {
  const wss = new WebSocketServer({ server: httpServer, path: '/api/ws-app' });

  wss.on('connection', (ws) => {
    const client: WSClient = { ws };
    clients.add(client);
    log('New WebSocket connection', 'websocket');

    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());
        
        if (data.type === 'register') {
          client.userId = data.userId;
          client.role = data.role;
          log(`Client registered: userId=${data.userId}, role=${data.role}`, 'websocket');
        }
      } catch (error) {
        log(`WebSocket message parse error: ${error}`, 'websocket');
      }
    });

    ws.on('close', () => {
      clients.delete(client);
      log('WebSocket connection closed', 'websocket');
    });

    ws.on('error', (error) => {
      log(`WebSocket error: ${error}`, 'websocket');
      clients.delete(client);
    });

    ws.send(JSON.stringify({ type: 'connected', message: 'Connected to real-time updates' }));
  });

  log('WebSocket server initialized', 'websocket');
  return wss;
}

export function notifyNewImageUpload(imageRequest: {
  id: string;
  userId: string;
  employeeId: string;
  displayName: string;
  originalFileName: string;
  originalFilePath: string;
  status: string;
  uploadedAt: Date;
}) {
  const message = JSON.stringify({
    type: 'new_image_upload',
    data: imageRequest,
  });

  clients.forEach(client => {
    if (client.ws.readyState === WebSocket.OPEN && client.role === 'admin') {
      client.ws.send(message);
      log(`Notified admin about new image upload from ${imageRequest.displayName}`, 'websocket');
    }
  });
}

export function notifyImageEdited(imageRequest: {
  id: string;
  userId: string;
  employeeId: string;
  displayName: string;
  originalFileName: string;
  originalFilePath: string;
  editedFileName: string;
  editedFilePath: string;
  status: string;
  uploadedAt: Date;
  completedAt: Date;
}) {
  const message = JSON.stringify({
    type: 'image_edited',
    data: imageRequest,
  });

  clients.forEach(client => {
    if (client.ws.readyState === WebSocket.OPEN && client.userId === imageRequest.userId) {
      client.ws.send(message);
      log(`Notified user ${imageRequest.displayName} about edited image`, 'websocket');
    }
  });
}
