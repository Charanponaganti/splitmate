import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'splitmate.session';
const SERVER_KEY = 'splitmate.server';
/** Sent with every request; the server lists it as a trusted origin. */
const APP_ORIGIN = 'splitmate://';
const TIMEOUT_MS = 20_000;

export const DEFAULT_SERVER = normalizeServerUrl(process.env.EXPO_PUBLIC_API_URL ?? '');

let serverUrl = DEFAULT_SERVER;
let token: string | null = null;
let unauthorizedHandler: (() => void) | null = null;

export class ApiError extends Error {
  readonly status: number;
  readonly fieldErrors?: Record<string, string>;
  constructor(message: string, status: number, fieldErrors?: Record<string, string>) {
    super(message);
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

export function normalizeServerUrl(value: string): string {
  let url = value.trim().replace(/\/+$/, '');
  if (url && !/^https?:\/\//i.test(url)) url = `http://${url}`;
  return url;
}

export function getServerUrl() {
  return serverUrl;
}

export function getToken() {
  return token;
}

export function onUnauthorized(handler: (() => void) | null) {
  unauthorizedHandler = handler;
}

export async function loadStoredSession() {
  const [storedToken, storedServer] = await Promise.all([
    SecureStore.getItemAsync(TOKEN_KEY),
    SecureStore.getItemAsync(SERVER_KEY),
  ]);
  if (storedServer) serverUrl = storedServer;
  token = storedToken;
  return { token, serverUrl };
}

export async function setServerUrl(value: string) {
  serverUrl = normalizeServerUrl(value);
  await SecureStore.setItemAsync(SERVER_KEY, serverUrl);
}

async function setToken(value: string | null) {
  token = value;
  if (value) await SecureStore.setItemAsync(TOKEN_KEY, value);
  else await SecureStore.deleteItemAsync(TOKEN_KEY);
}

async function request(url: string, init: RequestInit): Promise<Response> {
  if (!serverUrl) throw new ApiError('Set the server address first.', 0);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch {
    throw new ApiError(`Can't reach the server at ${serverUrl}. Check your connection.`, 0);
  } finally {
    clearTimeout(timer);
  }
}

function headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    Accept: 'application/json',
    Origin: APP_ORIGIN,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

/** Calls the SplitMate JSON API (`/api/v1/...`) as the signed-in user. */
export async function api<T>(path: string, options: { method?: Method; body?: unknown } = {}): Promise<T> {
  const method = options.method ?? 'GET';
  const response = await request(`${serverUrl}/api/v1/${path.replace(/^\//, '')}`, {
    method,
    headers: headers(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const json = (await response.json().catch(() => null)) as { data?: T; error?: string; fieldErrors?: Record<string, string> } | null;
  if (response.status === 401) {
    unauthorizedHandler?.();
    throw new ApiError(json?.error ?? 'Please sign in again.', 401);
  }
  if (!response.ok) {
    throw new ApiError(json?.error ?? 'Something went wrong. Please try again.', response.status, json?.fieldErrors);
  }
  return (json?.data ?? null) as T;
}

/* Auth --------------------------------------------------------------------- */

async function authCall(path: string, body: Record<string, unknown>) {
  const response = await request(`${serverUrl}/api/auth/${path}`, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
  const json = (await response.json().catch(() => null)) as { token?: string; message?: string } | null;
  if (!response.ok) {
    const message =
      response.status === 429
        ? 'Too many attempts. Please wait a minute and try again.'
        : (json?.message ?? 'Something went wrong. Please try again.');
    throw new ApiError(message, response.status);
  }
  return response.headers.get('set-auth-token') ?? json?.token ?? null;
}

export async function signInWithEmail(email: string, password: string) {
  await setToken(null);
  const newToken = await authCall('sign-in/email', { email: email.trim().toLowerCase(), password });
  if (!newToken) throw new ApiError('Sign-in failed. Please try again.', 500);
  await setToken(newToken);
}

export async function signUpWithEmail(name: string, email: string, password: string) {
  await setToken(null);
  const newToken = await authCall('sign-up/email', { name: name.trim(), email: email.trim().toLowerCase(), password });
  if (!newToken) throw new ApiError('Account created. Please sign in.', 200);
  await setToken(newToken);
}

export async function signOutSession() {
  if (token) {
    await authCall('sign-out', {}).catch(() => undefined);
  }
  await setToken(null);
}

/* Receipts ----------------------------------------------------------------- */

export async function uploadReceipt(groupId: string, file: { uri: string; name: string; type: string }) {
  const form = new FormData();
  form.append('groupId', groupId);
  form.append('file', { uri: file.uri, name: file.name, type: file.type } as unknown as Blob);
  const response = await request(`${serverUrl}/api/attachments`, { method: 'POST', headers: headers(), body: form });
  const json = (await response.json().catch(() => null)) as { id?: string; fileName?: string; error?: string } | null;
  if (!response.ok || !json?.id) throw new ApiError(json?.error ?? 'Upload failed.', response.status);
  return { id: json.id, fileName: json.fileName ?? file.name };
}

export function attachmentUrl(id: string) {
  return `${serverUrl}/api/attachments/${id}`;
}
