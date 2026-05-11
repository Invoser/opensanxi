import {
  Bot,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  CircleDollarSign,
  ExternalLink,
  Home,
  Menu,
  MessageSquareText,
  NotebookText,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  apiClient,
  config,
  type FinanceSummary,
  type Memo,
  type MemoInput,
  type Transaction,
  type TransactionInput,
  type TransactionType,
} from './api/client';
import { fallbackFinance, fallbackMemos } from './data/fallback';

type RouteId = 'home' | 'memos' | 'finance' | 'chat' | 'settings';

type NavItem = {
  id: RouteId;
  label: string;
  icon: typeof Home;
};

type MemoFormState = {
  title: string;
  content: string;
  tags: string;
};

type TransactionFormState = {
  type: TransactionType;
  amount: string;
  currency: string;
  category: string;
  description: string;
  occurredAt: string;
};

type MarkdownNode = {
  children?: MarkdownNode[];
  tagName?: string;
  type?: string;
  value?: string;
};

const navItems: NavItem[] = [
  { id: 'home', label: '首页', icon: Home },
  { id: 'memos', label: 'Memos', icon: NotebookText },
  { id: 'finance', label: 'Finance', icon: CircleDollarSign },
  { id: 'chat', label: 'Chat', icon: MessageSquareText },
  { id: 'settings', label: 'Settings', icon: Settings },
];

const routeTitles: Record<RouteId, string> = {
  home: '首页',
  memos: 'Memos',
  finance: 'Finance',
  chat: 'Chat',
  settings: 'Settings',
};

const emptyMemoForm: MemoFormState = {
  title: '',
  content: '',
  tags: '',
};

const emptyTransactionForm: TransactionFormState = {
  type: 'EXPENSE',
  amount: '',
  currency: 'CNY',
  category: '',
  description: '',
  occurredAt: toDatetimeLocal(new Date().toISOString()),
};

function MarkdownContent({ value, compact = false }: { value: string; compact?: boolean }) {
  return (
    <div className={compact ? 'markdown-content compact' : 'markdown-content'}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          table: ({ children, node, ...props }) => (
            <>
              <table {...props}>{children}</table>
              <MobileMarkdownTable node={node as MarkdownNode | undefined} />
            </>
          ),
        }}
      >
        {value}
      </ReactMarkdown>
    </div>
  );
}

function MobileMarkdownTable({ node }: { node?: MarkdownNode }) {
  const rows = parseMarkdownTable(node);
  const headers = rows[0] ?? [];
  const bodyRows = rows.slice(1).filter((row) => row.some(Boolean));

  if (headers.length === 0 || bodyRows.length === 0) return null;

  return (
    <div className="mobile-markdown-table" aria-label="移动端表格">
      {bodyRows.map((row, rowIndex) => (
        <dl className="mobile-markdown-row" key={`${row.join('|')}-${rowIndex}`}>
          {headers.map((header, cellIndex) => {
            const value = row[cellIndex];
            if (!header && !value) return null;
            return (
              <div className="mobile-markdown-cell" key={`${header}-${cellIndex}`}>
                <dt>{header || `字段 ${cellIndex + 1}`}</dt>
                <dd>{value || '-'}</dd>
              </div>
            );
          })}
        </dl>
      ))}
    </div>
  );
}

function parseMarkdownTable(node?: MarkdownNode): string[][] {
  return getMarkdownNodesByTag(node, 'tr').map((row) =>
    (row.children ?? [])
      .filter((cell) => cell.tagName === 'th' || cell.tagName === 'td')
      .map((cell) => getMarkdownNodeText(cell).trim()),
  );
}

function getMarkdownNodeText(node?: MarkdownNode): string {
  if (!node) return '';
  if (typeof node.value === 'string') return node.value;
  return (node.children ?? []).map(getMarkdownNodeText).join('');
}

function getMarkdownNodesByTag(node: MarkdownNode | undefined, tagName: string): MarkdownNode[] {
  if (!node) return [];
  const matchingNodes = node.tagName === tagName ? [node] : [];
  return [...matchingNodes, ...(node.children ?? []).flatMap((child) => getMarkdownNodesByTag(child, tagName))];
}

function getInitialRoute(): RouteId {
  const candidate = window.location.hash.replace('#/', '') as RouteId;
  return navItems.some((item) => item.id === candidate) ? candidate : 'home';
}

export function App() {
  const [route, setRoute] = useState<RouteId>(getInitialRoute);
  const [navOpen, setNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [memos, setMemos] = useState<Memo[]>(fallbackMemos);
  const [finance, setFinance] = useState<FinanceSummary>(fallbackFinance);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [apiStatus, setApiStatus] = useState<'idle' | 'syncing' | 'offline'>('idle');

  useEffect(() => {
    const onHashChange = () => setRoute(getInitialRoute());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    void refreshData();
  }, []);

  async function refreshData() {
    setApiStatus('syncing');
    const [memoResult, financeResult, transactionResult] = await Promise.all([
      apiClient.getMemos(),
      apiClient.getFinanceSummary(),
      apiClient.getTransactions(),
    ]);

    if (memoResult.ok) {
      setMemos(memoResult.data);
    }

    if (financeResult.ok) {
      setFinance(financeResult.data);
    }

    if (transactionResult.ok) {
      setTransactions(transactionResult.data);
    }

    setApiStatus(memoResult.ok || financeResult.ok || transactionResult.ok ? 'idle' : 'offline');
  }

  async function saveMemo(input: MemoInput, id?: string) {
    const result = id ? await apiClient.updateMemo(id, input) : await apiClient.createMemo(input);
    if (!result.ok) {
      window.alert(`Memo 保存失败：${result.error}`);
      return false;
    }
    await refreshData();
    return true;
  }

  async function removeMemo(id: string) {
    const result = await apiClient.deleteMemo(id);
    if (!result.ok) {
      window.alert(`Memo 删除失败：${result.error}`);
      return false;
    }
    await refreshData();
    return true;
  }

  async function saveTransaction(input: TransactionInput, id?: string) {
    const result = id
      ? await apiClient.updateTransaction(id, input)
      : await apiClient.createTransaction(input);
    if (!result.ok) {
      window.alert(`收支记录保存失败：${result.error}`);
      return false;
    }
    await refreshData();
    return true;
  }

  async function removeTransaction(id: string) {
    const result = await apiClient.deleteTransaction(id);
    if (!result.ok) {
      window.alert(`收支记录删除失败：${result.error}`);
      return false;
    }
    await refreshData();
    return true;
  }

  function navigate(nextRoute: RouteId) {
    window.location.hash = `/${nextRoute}`;
    setRoute(nextRoute);
    setNavOpen(false);
  }

  const shellClass = [
    'shell',
    navOpen ? 'nav-is-open' : '',
    sidebarCollapsed ? 'sidebar-is-collapsed' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={shellClass}>
      <aside className="sidebar" aria-label="主导航">
        <div className="brand">
          <div className="brand-main">
            <div className="brand-mark" aria-hidden="true">
              <Bot size={22} />
            </div>
            <div className="brand-copy">
              <strong>Assistant</strong>
              <span>Personal OS</span>
            </div>
          </div>
          <button
            className="sidebar-toggle desktop-only"
            onClick={() => setSidebarCollapsed((value) => !value)}
            type="button"
            aria-label={sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'}
            title={sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'}
          >
            {sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
          <button
            className="sidebar-toggle mobile-only"
            onClick={() => setNavOpen(false)}
            type="button"
            aria-label="收起侧边栏"
            title="收起侧边栏"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="nav-list">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                className={route === item.id ? 'nav-item active' : 'nav-item'}
                key={item.id}
                onClick={() => navigate(item.id)}
                type="button"
                title={item.label}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <button
        className="nav-scrim mobile-only"
        onClick={() => setNavOpen(false)}
        type="button"
        aria-label="收起侧边栏"
        tabIndex={navOpen ? 0 : -1}
      />

      <main className="main">
        <header className="topbar">
          <button
            className="icon-button mobile-only"
            onClick={() => setNavOpen((value) => !value)}
            type="button"
            aria-label={navOpen ? '关闭导航' : '打开导航'}
          >
            {navOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <div>
            <p className="eyebrow">Personal Assistant</p>
            <h1>{routeTitles[route]}</h1>
          </div>
          <button className="sync-button" onClick={refreshData} type="button">
            <RefreshCw size={16} className={apiStatus === 'syncing' ? 'spin' : ''} />
            <span>{apiStatus === 'offline' ? '本地数据' : '同步'}</span>
          </button>
        </header>

        {route === 'home' && <HomePage finance={finance} memos={memos} onNavigate={navigate} />}
        {route === 'memos' && (
          <MemosPage memos={memos} onSave={saveMemo} onDelete={removeMemo} />
        )}
        {route === 'finance' && (
          <FinancePage
            finance={finance}
            transactions={transactions}
            onSave={saveTransaction}
            onDelete={removeTransaction}
          />
        )}
        {route === 'chat' && <ChatPage />}
        {route === 'settings' && <SettingsPage />}
      </main>
    </div>
  );
}

function HomePage({
  finance,
  memos,
  onNavigate,
}: {
  finance: FinanceSummary;
  memos: Memo[];
  onNavigate: (route: RouteId) => void;
}) {
  return (
    <section className="page-grid">
      <div className="metric-row">
        <Metric label="净收入" value={formatMoney(finance.net, finance.currency)} />
        <Metric label="收入" value={formatMoney(finance.incomeTotal, finance.currency)} />
        <Metric label="支出" value={formatMoney(finance.expenseTotal, finance.currency)} />
      </div>

      <section className="panel wide">
        <PanelHeader title="最近 Memos" action="查看全部" onAction={() => onNavigate('memos')} />
        <div className="memo-list">
          {memos.slice(0, 3).map((memo) => (
            <MemoRow key={memo.id} memo={memo} />
          ))}
        </div>
      </section>

      <section className="panel">
        <PanelHeader title="分类收支" action="Finance" onAction={() => onNavigate('finance')} />
        <CategoryList finance={finance} />
      </section>

      <section className="panel">
        <PanelHeader title="Chat" action="打开" onAction={() => onNavigate('chat')} />
        <div className="chat-card compact">
          <MessageSquareText size={28} />
          <span>{config.chatUrl ? 'Chat service ready' : '未配置聊天地址'}</span>
        </div>
      </section>
    </section>
  );
}

function MemosPage({
  memos,
  onSave,
  onDelete,
}: {
  memos: Memo[];
  onSave: (memo: MemoInput, id?: string) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
}) {
  const [query, setQuery] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | undefined>();
  const [form, setForm] = useState<MemoFormState>(emptyMemoForm);
  const [saving, setSaving] = useState(false);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return memos;
    return memos.filter((memo) =>
      [memo.title, memo.content, ...memo.tags].some((value) => value.toLowerCase().includes(needle)),
    );
  }, [memos, query]);

  function beginCreate() {
    setEditingId(undefined);
    setForm(emptyMemoForm);
    setFormOpen(true);
  }

  function beginEdit(memo: Memo) {
    setEditingId(memo.id);
    setForm({
      title: memo.title,
      content: memo.content,
      tags: memo.tags.join(', '),
    });
    setFormOpen(true);
  }

  async function submitMemo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = {
      title: form.title.trim(),
      content: form.content.trim(),
      tags: parseTags(form.tags),
    };
    if (!input.title || !input.content) return;
    setSaving(true);
    const ok = await onSave(input, editingId);
    setSaving(false);
    if (ok) {
      setFormOpen(false);
      setEditingId(undefined);
      setForm(emptyMemoForm);
    }
  }

  async function handleDelete(memo: Memo) {
    if (!window.confirm(`删除 memo「${memo.title}」？`)) return;
    await onDelete(memo.id);
  }

  return (
    <section className="page-stack">
      <div className="toolbar">
        <label className="search-box">
          <Search size={18} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索 memo"
            type="search"
          />
        </label>
        <button className="primary-button" onClick={beginCreate} type="button">
          <Plus size={16} />
          <span>新建</span>
        </button>
      </div>

      {formOpen && (
        <form className="editor-panel" onSubmit={submitMemo}>
          <div className="form-grid">
            <label className="field">
              <span>标题</span>
              <input
                value={form.title}
                onChange={(event) => setForm((value) => ({ ...value, title: event.target.value }))}
                required
              />
            </label>
            <label className="field">
              <span>标签</span>
              <input
                value={form.tags}
                onChange={(event) => setForm((value) => ({ ...value, tags: event.target.value }))}
                placeholder="逗号分隔"
              />
            </label>
          </div>
          <label className="field">
            <span>内容</span>
            <textarea
              value={form.content}
              onChange={(event) => setForm((value) => ({ ...value, content: event.target.value }))}
              required
              rows={4}
            />
          </label>
          <div className="form-actions">
            <button className="secondary-button" onClick={() => setFormOpen(false)} type="button">
              <X size={16} />
              <span>取消</span>
            </button>
            <button className="primary-button" disabled={saving} type="submit">
              <Save size={16} />
              <span>{saving ? '保存中' : '保存'}</span>
            </button>
          </div>
        </form>
      )}

      <div className="memo-grid">
        {filtered.map((memo) => (
          <article className="memo-card" key={memo.id}>
            <div className="card-topline">
              <div>
                <h2>{memo.title}</h2>
                <time>{formatDate(memo.updatedAt)}</time>
              </div>
              <div className="row-actions">
                <button
                  className="icon-button compact"
                  onClick={() => beginEdit(memo)}
                  type="button"
                  aria-label="编辑 memo"
                  title="编辑"
                >
                  <Pencil size={16} />
                </button>
                <button
                  className="icon-button compact danger"
                  onClick={() => handleDelete(memo)}
                  type="button"
                  aria-label="删除 memo"
                  title="删除"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
            <MarkdownContent value={memo.content} />
            <div className="tag-row">
              {memo.tags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function FinancePage({
  finance,
  transactions,
  onSave,
  onDelete,
}: {
  finance: FinanceSummary;
  transactions: Transaction[];
  onSave: (transaction: TransactionInput, id?: string) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | undefined>();
  const [form, setForm] = useState<TransactionFormState>(emptyTransactionForm);
  const [saving, setSaving] = useState(false);

  function beginCreate() {
    setEditingId(undefined);
    setForm({
      ...emptyTransactionForm,
      occurredAt: toDatetimeLocal(new Date().toISOString()),
    });
    setFormOpen(true);
  }

  function beginEdit(transaction: Transaction) {
    setEditingId(transaction.id);
    setForm({
      type: transaction.type,
      amount: String(transaction.amount),
      currency: transaction.currency,
      category: transaction.category,
      description: transaction.description ?? '',
      occurredAt: toDatetimeLocal(transaction.occurredAt),
    });
    setFormOpen(true);
  }

  async function submitTransaction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) return;

    const input = {
      type: form.type,
      amount,
      currency: form.currency.trim().toUpperCase() || 'CNY',
      category: form.category.trim(),
      description: form.description.trim() || undefined,
      occurredAt: fromDatetimeLocal(form.occurredAt),
    };
    if (!input.category || input.currency.length !== 3) return;

    setSaving(true);
    const ok = await onSave(input, editingId);
    setSaving(false);
    if (ok) {
      setFormOpen(false);
      setEditingId(undefined);
      setForm(emptyTransactionForm);
    }
  }

  async function handleDelete(transaction: Transaction) {
    const label = `${transaction.category} ${formatMoney(Number(transaction.amount), transaction.currency)}`;
    if (!window.confirm(`删除收支记录「${label}」？`)) return;
    await onDelete(transaction.id);
  }

  return (
    <section className="page-stack">
      <div className="metric-row">
        <Metric label="净收入" value={formatMoney(finance.net, finance.currency)} />
        <Metric label="收入" value={formatMoney(finance.incomeTotal, finance.currency)} />
        <Metric label="支出" value={formatMoney(finance.expenseTotal, finance.currency)} />
      </div>

      <div className="toolbar">
        <span className="toolbar-title">收支明细</span>
        <button className="primary-button" onClick={beginCreate} type="button">
          <Plus size={16} />
          <span>新增记录</span>
        </button>
      </div>

      {formOpen && (
        <form className="editor-panel" onSubmit={submitTransaction}>
          <div className="segmented-control" aria-label="收支类型">
            {(['EXPENSE', 'INCOME'] as TransactionType[]).map((type) => (
              <button
                className={form.type === type ? 'active' : ''}
                key={type}
                onClick={() => setForm((value) => ({ ...value, type }))}
                type="button"
              >
                {type === 'EXPENSE' ? '支出' : '收入'}
              </button>
            ))}
          </div>
          <div className="form-grid three">
            <label className="field">
              <span>金额</span>
              <input
                value={form.amount}
                onChange={(event) => setForm((value) => ({ ...value, amount: event.target.value }))}
                min="0.01"
                step="0.01"
                type="number"
                required
              />
            </label>
            <label className="field">
              <span>币种</span>
              <input
                value={form.currency}
                onChange={(event) => setForm((value) => ({ ...value, currency: event.target.value }))}
                maxLength={3}
                required
              />
            </label>
            <label className="field">
              <span>发生时间</span>
              <input
                value={form.occurredAt}
                onChange={(event) => setForm((value) => ({ ...value, occurredAt: event.target.value }))}
                type="datetime-local"
                required
              />
            </label>
          </div>
          <div className="form-grid">
            <label className="field">
              <span>分类</span>
              <input
                value={form.category}
                onChange={(event) => setForm((value) => ({ ...value, category: event.target.value }))}
                required
              />
            </label>
            <label className="field">
              <span>说明</span>
              <input
                value={form.description}
                onChange={(event) => setForm((value) => ({ ...value, description: event.target.value }))}
              />
            </label>
          </div>
          <div className="form-actions">
            <button className="secondary-button" onClick={() => setFormOpen(false)} type="button">
              <X size={16} />
              <span>取消</span>
            </button>
            <button className="primary-button" disabled={saving} type="submit">
              <Save size={16} />
              <span>{saving ? '保存中' : '保存'}</span>
            </button>
          </div>
        </form>
      )}

      <section className="panel full">
        <PanelHeader title="最近记录" />
        <div className="transaction-list">
          {transactions.length === 0 && <p className="muted">暂无收支记录。</p>}
          {transactions.map((transaction) => (
            <article className="transaction-row" key={transaction.id}>
              <div className="transaction-main">
                <span className={transaction.type === 'INCOME' ? 'pill income' : 'pill expense'}>
                  {transaction.type === 'INCOME' ? '收入' : '支出'}
                </span>
                <div>
                  <strong>{transaction.category}</strong>
                  <span>
                    {transaction.description || '无说明'} · {formatDate(transaction.occurredAt)}
                  </span>
                </div>
              </div>
              <div className="transaction-side">
                <strong className={transaction.type === 'INCOME' ? 'positive' : 'negative'}>
                  {transaction.type === 'INCOME' ? '+' : '-'}
                  {formatMoney(Number(transaction.amount), transaction.currency)}
                </strong>
                <div className="row-actions">
                  <button
                    className="icon-button compact"
                    onClick={() => beginEdit(transaction)}
                    type="button"
                    aria-label="编辑收支记录"
                    title="编辑"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    className="icon-button compact danger"
                    onClick={() => handleDelete(transaction)}
                    type="button"
                    aria-label="删除收支记录"
                    title="删除"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="panel full">
        <PanelHeader title="分类收支" />
        <CategoryList finance={finance} />
      </section>
    </section>
  );
}

function ChatPage() {
  const chatUrl = config.chatUrl;

  return (
    <section className="page-stack">
      <section className="panel full chat-launcher">
        {chatUrl ? (
          <a className="primary-link" href={chatUrl} target="_blank" rel="noreferrer">
            <ExternalLink size={16} />
            <span>打开 Chat</span>
          </a>
        ) : (
          <div className="empty-state">
            <MessageSquareText size={34} />
            <h2>Chat URL 未配置</h2>
            <p>设置 VITE_CHAT_URL 后，这里会加载聊天服务。</p>
          </div>
        )}
      </section>
    </section>
  );
}

function SettingsPage() {
  return (
    <section className="page-stack narrow">
      <section className="panel full">
        <PanelHeader title="Runtime" />
        <div className="settings-list">
          <SettingRow label="API Base URL" value={config.apiBaseUrl} />
          <SettingRow label="Chat URL" value={config.chatUrl || '未配置'} />
          <SettingRow label="Locale" value="zh-CN" />
          <SettingRow label="Build" value={import.meta.env.MODE} />
        </div>
      </section>
    </section>
  );
}

function PanelHeader({
  title,
  action,
  onAction,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="panel-header">
      <h2>{title}</h2>
      {action && (
        <button className="text-button" onClick={onAction} type="button">
          <span>{action}</span>
          <ChevronRight size={16} />
        </button>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <article className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function MemoRow({ memo }: { memo: Memo }) {
  return (
    <article className="memo-row">
      <div>
        <h3>{memo.title}</h3>
        <MarkdownContent compact value={memo.content} />
      </div>
      <time>{formatDate(memo.updatedAt)}</time>
    </article>
  );
}

function CategoryList({ finance }: { finance: FinanceSummary }) {
  return (
    <div className="watchlist">
      {finance.byCategory.length === 0 && <p className="muted">暂无交易分类。</p>}
      {finance.byCategory.map((row) => (
        <article className="asset-row" key={`${row.category}-${row.type}`}>
          <div>
            <strong>{row.category}</strong>
            <span>{row.type} · {row.count} records</span>
          </div>
          <div className="asset-price">
            <strong>{formatMoney(row.total, finance.currency)}</strong>
            <span className={row.type === 'INCOME' ? 'positive' : 'negative'}>
              {row.type === 'INCOME' ? '收入' : '支出'}
            </span>
          </div>
        </article>
      ))}
    </div>
  );
}

function SettingRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="setting-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function formatMoney(value: number, currency: string) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function parseTags(value: string) {
  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function toDatetimeLocal(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 16);
}

function fromDatetimeLocal(value: string) {
  return new Date(value).toISOString();
}
