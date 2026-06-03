/**
 * WebSocketClient — thin wrapper used by the Observatory.
 * The main Observatory class manages its own WebSocket directly;
 * this module is kept for plugin/external integrations that want
 * a standalone client without the full Three.js scene.
 */

export class WebSocketClient {
  /**
   * @param {string} url  WebSocket URL, e.g. ws://87.99.158.55:3000/ws/sensing
   * @param {(frame: object) => void} onFrame  called for each parsed SensingFrame
   */
  constructor(url, onFrame) {
    this._url = url;
    this._onFrame = onFrame;
    this._ws = null;
    this._reconnectMs = 2000;
    this._stopped = false;
    this._connect();
  }

  _connect() {
    if (this._stopped) return;
    this._ws = new WebSocket(this._url);

    this._ws.onopen = () => {
      console.log('[WebSocketClient] connected', this._url);
      this._reconnectMs = 2000;
    };

    this._ws.onmessage = (evt) => {
      try {
        const frame = JSON.parse(evt.data);
        this._onFrame(frame);
      } catch {}
    };

    this._ws.onclose = () => {
      if (!this._stopped) {
        console.log(`[WebSocketClient] closed, retrying in ${this._reconnectMs}ms`);
        setTimeout(() => this._connect(), this._reconnectMs);
        this._reconnectMs = Math.min(30000, this._reconnectMs * 2);
      }
    };

    this._ws.onerror = () => {};
  }

  stop() {
    this._stopped = true;
    if (this._ws) this._ws.close();
  }
}
