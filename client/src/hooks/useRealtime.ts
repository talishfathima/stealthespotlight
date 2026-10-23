import { useEffect, useRef, useState, useCallback } from "react";
import { io, type Socket } from "socket.io-client";
import { getAuthToken } from "../utils/api";

let sharedSocket: Socket | null = null;

function authPayload() {
  const token = getAuthToken();
  return token ? { authToken: token } : {};
}

function getSocket(): Socket {
  if (!sharedSocket) {
    sharedSocket = io("/", {
      withCredentials: true,
      auth: authPayload(),
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 4000,
    });
  }
  return sharedSocket;
}

/** Reconnect the live socket after a login/logout so it picks up the new identity. */
export function refreshSocketAuth() {
  if (!sharedSocket) return;
  sharedSocket.auth = authPayload();
  sharedSocket.disconnect().connect();
}

export function useSocketState<T>(fallback: T | null = null) {
  const [state, setState] = useState<T | null>(fallback);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const socket = getSocket();
    socketRef.current = socket;

    const onState = (next: T) => setState(next);
    const onConnect = () => {
      setConnected(true);
      socket.emit("request_state");
    };
    const onDisconnect = () => setConnected(false);

    socket.on("state", onState);
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    setConnected(socket.connected);
    socket.emit("request_state");

    return () => {
      socket.off("state", onState);
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
    };
  }, []);

  const requestState = useCallback(() => {
    socketRef.current?.emit("request_state");
  }, []);

  return { state, connected, requestState };
}

/**
 * Authoritative clock: measure the offset between the server clock and the
 * local clock once, then derive timestamps from the server clock so all
 * devices agree.
 */
export function useServerClock() {
  const offsetRef = useRef(0);

  useEffect(() => {
    const socket = getSocket();
    const onClock = (payload: { serverTime: string }) => {
      const receivedLocally = Date.now();
      const sentServer = new Date(payload.serverTime).getTime();
      // Approximate one-way latency as negligible relative to a 10s countdown.
      offsetRef.current = sentServer - receivedLocally;
    };
    socket.on("clock", onClock);
    // Also estimate offset from the most recent state payload's serverTime.
    const onState = (payload: { serverTime?: string }) => {
      if (payload?.serverTime) {
        offsetRef.current = new Date(payload.serverTime).getTime() - Date.now();
      }
    };
    socket.on("state", onState);
    return () => {
      socket.off("clock", onClock);
      socket.off("state", onState);
    };
  }, []);

  const now = useCallback(() => Date.now() + offsetRef.current, []);
  const subscribe = useCallback((fn: () => void) => {
    const id = window.setInterval(fn, 200);
    return () => window.clearInterval(id);
  }, []);

  return { now, subscribe, offset: offsetRef };
}

export function useElapsed(since: string | null): number {
  const { now, subscribe } = useServerClock();
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!since) {
      setElapsed(0);
      return;
    }
    const startMs = new Date(since).getTime();
    const tick = () => setElapsed(Math.max(0, Math.floor((now() - startMs) / 1000)));
    tick();
    return subscribe(tick);
  }, [since, now, subscribe]);

  return elapsed;
}


