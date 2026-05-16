export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status?: number };

export type Memo = {
  id: string;
  title: string;
  content: string;
  tags: string[];
  updatedAt: string;
};

export type MemoInput = Pick<Memo, 'title' | 'content' | 'tags'>;

export type TransactionType = 'INCOME' | 'EXPENSE';

export type Transaction = {
  id: string;
  type: TransactionType;
  amount: number | string;
  currency: string;
  category: string;
  description?: string | null;
  occurredAt: string;
  createdAt?: string;
  updatedAt?: string;
};

export type TransactionInput = {
  type: TransactionType;
  amount: number;
  currency: string;
  category: string;
  description?: string;
  occurredAt: string;
};

export type FinanceSummary = {
  incomeTotal: number;
  expenseTotal: number;
  net: number;
  currency: string;
  byCategory: Array<{
    category: string;
    type: string;
    total: number;
    count: number;
  }>;
};

export type BackupFile = {
  app?: 'opensanxi';
  formatVersion: 1;
  exportedAt?: string;
  data: {
    memos: Array<Memo & { archived?: boolean; createdAt: string; updatedAt: string }>;
    transactions: Array<Transaction & { createdAt: string; updatedAt: string }>;
  };
};

export type RestoreResult = {
  ok: true;
  restoredAt: string;
  mode: 'merge' | 'replace';
  memoCount: number;
  transactionCount: number;
};

export type AssistantSettings = {
  apiBaseUrl: string;
  chatUrl: string;
  locale: string;
  compactMode: boolean;
};

const defaultApiBaseUrl = '/api';

function normalizeApiBaseUrl(value: string) {
  if (/^https?:\/\//i.test(value)) {
    return value.endsWith('/') ? value : `${value}/`;
  }

  const path = value.startsWith('/') ? value : `/${value}`;
  const normalizedPath = path.endsWith('/') ? path : `${path}/`;
  return new URL(normalizedPath, window.location.origin).toString();
}

export const config = {
  apiBaseUrl: normalizeApiBaseUrl(import.meta.env.VITE_API_BASE_URL || defaultApiBaseUrl),
  chatUrl: import.meta.env.VITE_CHAT_URL || '/chat/',
};

async function request<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  const url = new URL(path, config.apiBaseUrl.endsWith('/') ? config.apiBaseUrl : `${config.apiBaseUrl}/`);
  const headers = new Headers(init?.headers);

  if (init?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  try {
    const response = await fetch(url, {
      ...init,
      headers,
    });

    if (!response.ok) {
      return {
        ok: false,
        error: `Request failed with status ${response.status}`,
        status: response.status,
      };
    }

    if (response.status === 204) {
      return { ok: true, data: undefined as T };
    }

    const text = await response.text();
    return { ok: true, data: (text ? JSON.parse(text) : undefined) as T };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown network error',
    };
  }
}

type ListResponse<T> = {
  items: T[];
  total: number;
};

type TransactionSummaryResponse = {
  income: { total: number; count: number };
  expense: { total: number; count: number };
  net: number;
  byCategory: Array<{
    category: string;
    type: string;
    currency: string;
    total: number;
    count: number;
  }>;
};

export const apiClient = {
  async getMemos(): Promise<ApiResult<Memo[]>> {
    const result = await request<ListResponse<Memo>>('memos');
    return result.ok ? { ok: true, data: result.data.items } : result;
  },
  createMemo: (memo: MemoInput) =>
    request<Memo>('memos', {
      method: 'POST',
      body: JSON.stringify(memo),
    }),
  updateMemo: (id: string, memo: Partial<MemoInput>) =>
    request<Memo>(`memos/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(memo),
    }),
  deleteMemo: (id: string) =>
    request<void>(`memos/${id}`, {
      method: 'DELETE',
    }),
  async getTransactions(): Promise<ApiResult<Transaction[]>> {
    const result = await request<ListResponse<Transaction>>('transactions?limit=100');
    return result.ok ? { ok: true, data: result.data.items } : result;
  },
  createTransaction: (transaction: TransactionInput) =>
    request<Transaction>('transactions', {
      method: 'POST',
      body: JSON.stringify(transaction),
    }),
  updateTransaction: (id: string, transaction: Partial<TransactionInput>) =>
    request<Transaction>(`transactions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(transaction),
    }),
  deleteTransaction: (id: string) =>
    request<void>(`transactions/${id}`, {
      method: 'DELETE',
    }),
  async getFinanceSummary(): Promise<ApiResult<FinanceSummary>> {
    const result = await request<TransactionSummaryResponse>('transactions/summary');
    if (!result.ok) return result;
    const firstCurrency = result.data.byCategory[0]?.currency ?? 'CNY';
    return {
      ok: true,
      data: {
        incomeTotal: result.data.income.total,
        expenseTotal: result.data.expense.total,
        net: result.data.net,
        currency: firstCurrency,
        byCategory: result.data.byCategory,
      },
    };
  },
  getSettings: () => request<AssistantSettings>('settings'),
  updateSettings: (settings: Partial<AssistantSettings>) =>
    request<AssistantSettings>('settings', {
      method: 'PATCH',
      body: JSON.stringify(settings),
    }),
  async exportBackup(): Promise<ApiResult<BackupFile>> {
    return request<BackupFile>('backups/export');
  },
  restoreBackup: (backup: BackupFile, mode: 'merge' | 'replace') =>
    request<RestoreResult>('backups/restore', {
      method: 'POST',
      body: JSON.stringify({ backup, mode }),
    }),
};
