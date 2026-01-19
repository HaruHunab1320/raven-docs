import { Logger } from '@nestjs/common';
import { WebSocketServer } from 'ws';

export class CollabWsAdapter {
  private readonly wss: WebSocketServer;
  private readonly logger = new Logger(CollabWsAdapter.name);

  constructor() {
    this.wss = new WebSocketServer({ noServer: true });
  }

  handleUpgrade(path: string, httpServer: any) {
    httpServer.on('upgrade', (request: any, socket: any, head: any) => {
      try {
        const baseUrl = 'ws://' + request.headers.host + '/';
        const pathname = new URL(request.url, baseUrl).pathname;

        if (pathname === path) {
          this.wss.handleUpgrade(request, socket, head, (ws) => {
            this.wss.emit('connection', ws, request);
          });
        } else if (pathname === '/socket.io/') {
          return;
        } else {
          socket.destroy();
        }
      } catch (err) {
        socket.end('HTTP/1.1 400\r\n' + (err as Error).message);
      }
    });

    return this.wss;
  }

  public destroy() {
    try {
      this.wss.clients.forEach((client) => {
        client.terminate();
      });
      this.wss.close();
    } catch (err) {
      this.logger.error(err);
    }
  }
}
