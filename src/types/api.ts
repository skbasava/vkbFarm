export type ApiObject<T> = { data: T };

export type ApiList<T> = {
  data: T[];
  meta: { page: number; pageSize: number; total: number };
};

export type ApiFailure = {
  error: { code: string; message: string; details?: Record<string, unknown> };
};
