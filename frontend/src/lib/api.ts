import { useAuthStore } from '../store/authStore';

const BASE_URL = `${import.meta.env.VITE_API_URL ?? ''}/api`;

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function send(method: HttpMethod, path: string, body?: unknown): Promise<Response> {
  const token = useAuthStore.getState().token;

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (response.status === 401 && token) useAuthStore.getState().logout();

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new ApiError(response.status, payload?.message ?? response.statusText);
  }

  return response;
}

async function request<T>(method: HttpMethod, path: string, body?: unknown): Promise<T> {
  return (await (await send(method, path, body)).json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
  blob: async (path: string) => (await send('GET', path)).blob(),
};
