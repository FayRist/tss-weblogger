/**
 * WebSocket connection utility for managing WebSocket connections with automatic reconnection
 */

export interface WebSocketConnectionConfig {
  url: string;
  onMessage?: (event: MessageEvent) => void;
  onOpen?: () => void;
  onClose?: (event: CloseEvent) => void;
  onError?: (error: Event) => void;
  maxReconnectAttempts?: number;
  reconnectDelay?: number;
}

export interface WebSocketConnection {
  ws: WebSocket | null;
  reconnectAttempts: number;
  reconnectTimeout: any;
  connect: () => void;
  disconnect: () => void;
  isConnected: () => boolean;
}

/**
 * Creates a WebSocket connection with automatic reconnection
 */
export function createWebSocketConnection(config: WebSocketConnectionConfig): WebSocketConnection {
  const maxReconnectAttempts = config.maxReconnectAttempts ?? 5;
  const reconnectDelay = config.reconnectDelay ?? 3000;

  const connection: WebSocketConnection = {
    ws: null,
    reconnectAttempts: 0,
    reconnectTimeout: null,
    connect: () => {
      if (connection.ws && connection.ws.readyState === WebSocket.OPEN) {
        console.log('[WS] Already connected');
        return;
      }

      if (connection.ws && connection.ws.readyState === WebSocket.CONNECTING) {
        console.log('[WS] Already connecting');
        return;
      }

      try {
        console.log('[WS] Connecting to:', config.url);
        connection.ws = new WebSocket(config.url);

        connection.ws.onopen = () => {
          console.log('[WS] Connected successfully');
          connection.reconnectAttempts = 0;
          if (connection.reconnectTimeout) {
            clearTimeout(connection.reconnectTimeout);
            connection.reconnectTimeout = null;
          }
          if (config.onOpen) {
            config.onOpen();
          }
        };

        connection.ws.onmessage = (event) => {
          if (config.onMessage) {
            config.onMessage(event);
          }
        };

        connection.ws.onclose = (event) => {
          console.log('[WS] Connection closed', event.code, event.reason);
          connection.ws = null;
          handleReconnect();
          if (config.onClose) {
            config.onClose(event);
          }
        };

        connection.ws.onerror = (error) => {
          console.error('[WS] Error occurred:', error);
          if (config.onError) {
            config.onError(error);
          }
        };

      } catch (error) {
        console.error('[WS] Failed to create connection:', error);
        handleReconnect();
      }
    },
    disconnect: () => {
      if (connection.reconnectTimeout) {
        clearTimeout(connection.reconnectTimeout);
        connection.reconnectTimeout = null;
      }
      if (connection.ws) {
        connection.ws.close();
        connection.ws = null;
      }
      connection.reconnectAttempts = maxReconnectAttempts;
    },
    isConnected: () => {
      return connection.ws?.readyState === WebSocket.OPEN;
    }
  };

  function handleReconnect(): void {
    if (connection.reconnectAttempts >= maxReconnectAttempts) {
      console.log('[WS] Max reconnect attempts reached');
      return;
    }

    connection.reconnectAttempts++;
    console.log(`[WS] Reconnecting (attempt ${connection.reconnectAttempts}/${maxReconnectAttempts})...`);
    connection.reconnectTimeout = setTimeout(() => {
      connection.connect();
    }, reconnectDelay);
  }

  return connection;
}

