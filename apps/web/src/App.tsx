import {
  Bot,
  ChevronRight,
  Download,
  FileJson,
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
  type BackupFile,
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

type ParsedTransactionDraft = {
  input: TransactionInput;
  confidence: number;
  warnings: string[];
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
        {route === 'settings' && <SettingsPage onRestoreComplete={refreshData} />}
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
  const [naturalInput, setNaturalInput] = useState('');
  const [parseMessage, setParseMessage] = useState('');
  const [saving, setSaving] = useState(false);

  function beginCreate() {
    setEditingId(undefined);
    setForm({
      ...emptyTransactionForm,
      occurredAt: toDatetimeLocal(new Date().toISOString()),
    });
    setFormOpen(true);
  }

  function applyNaturalLanguageDraft() {
    const draft = parseNaturalTransaction(naturalInput);
    if (!draft) {
      setParseMessage('没有识别到金额。可以试试：“昨天晚饭花了 68” 或 “今天工资收入 12000”。');
      return;
    }

    setEditingId(undefined);
    setForm({
      type: draft.input.type,
      amount: String(draft.input.amount),
      currency: draft.input.currency,
      category: draft.input.category,
      description: draft.input.description ?? naturalInput.trim(),
      occurredAt: toDatetimeLocal(draft.input.occurredAt),
    });
    setFormOpen(true);
    setParseMessage(
      draft.warnings.length > 0
        ? `已预填，请确认：${draft.warnings.join('；')}`
        : `已预填，置信度 ${Math.round(draft.confidence * 100)}%。确认后再保存。`,
    );
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

      <section className="panel full quick-capture">
        <PanelHeader title="自然语言记账" />
        <div className="quick-capture-row">
          <label className="field">
            <span>输入一句话</span>
            <input
              value={naturalInput}
              onChange={(event) => {
                setNaturalInput(event.target.value);
                setParseMessage('');
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  applyNaturalLanguageDraft();
                }
              }}
              placeholder="例如：昨天晚饭花了 68，和朋友吃火锅"
            />
          </label>
          <button className="secondary-button" onClick={applyNaturalLanguageDraft} type="button">
            <ChevronRight size={16} />
            <span>解析预填</span>
          </button>
        </div>
        {parseMessage && <p className="helper-text">{parseMessage}</p>}
      </section>

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
  const chatEntries = [
    {
      title: 'LibreChat',
      description: '当前默认聊天入口，继续使用 OpenSanxi MCP 工具和上下文记录。',
      url: config.chatUrl,
    },
    {
      title: 'Hermes UI',
      description: '新的 Agent 入口，用来体验 Hermes 的工具编排、记忆和 skills 交互。',
      url: config.agentUrl,
    },
  ];

  return (
    <section className="page-stack">
      <section className="panel full">
        <PanelHeader title="Chat 入口" />
        <div className="chat-entry-grid">
          {chatEntries.map((entry) => (
            <article className="chat-entry-card" key={entry.title}>
              <div className="chat-entry-icon">
                <MessageSquareText size={22} />
              </div>
              <div>
                <h2>{entry.title}</h2>
                <p>{entry.description}</p>
              </div>
              {entry.url ? (
                <a className="primary-link" href={entry.url} target="_blank" rel="noreferrer">
                  <ExternalLink size={16} />
                  <span>打开</span>
                </a>
              ) : (
                <p className="helper-text">入口未配置</p>
              )}
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}

function SettingsPage({ onRestoreComplete }: { onRestoreComplete: () => Promise<void> }) {
  const [restoreMode, setRestoreMode] = useState<'merge' | 'replace'>('merge');
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupMessage, setBackupMessage] = useState('');

  async function exportBackup() {
    setBackupBusy(true);
    setBackupMessage('');
    const result = await apiClient.exportBackup();
    setBackupBusy(false);

    if (!result.ok) {
      setBackupMessage(`导出失败：${result.error}`);
      return;
    }

    const exportedAt = result.data.exportedAt ?? new Date().toISOString();
    const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `opensanxi-backup-${exportedAt.slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setBackupMessage(
      `已导出：${result.data.data.memos.length} 条 memo，${result.data.data.transactions.length} 条收支记录。`,
    );
  }

  async function restoreBackup(file: File | undefined) {
    if (!file) return;
    if (
      restoreMode === 'replace' &&
      !window.confirm('replace 会先清空现有 memo 和收支记录，再导入备份。确定继续？')
    ) {
      return;
    }

    setBackupBusy(true);
    setBackupMessage('');
    try {
      const backup = JSON.parse(await file.text()) as BackupFile;
      const result = await apiClient.restoreBackup(backup, restoreMode);
      if (!result.ok) {
        setBackupMessage(`恢复失败：${result.error}`);
        return;
      }
      await onRestoreComplete();
      setBackupMessage(`恢复完成：${result.data.memoCount} 条 memo，${result.data.transactionCount} 条收支记录。`);
    } catch (error) {
      setBackupMessage(error instanceof Error ? `恢复失败：${error.message}` : '恢复失败：备份文件无法读取。');
    } finally {
      setBackupBusy(false);
    }
  }

  return (
    <section className="page-stack narrow">
      <section className="panel full">
        <PanelHeader title="备份与恢复" />
        <div className="backup-actions">
          <button className="primary-button" disabled={backupBusy} onClick={exportBackup} type="button">
            <Download size={16} />
            <span>{backupBusy ? '处理中' : '导出 JSON 备份'}</span>
          </button>
          <label className="file-button">
            <FileJson size={16} />
            <span>导入备份</span>
            <input
              accept="application/json,.json"
              disabled={backupBusy}
              onChange={(event) => {
                void restoreBackup(event.target.files?.[0]);
                event.currentTarget.value = '';
              }}
              type="file"
            />
          </label>
        </div>
        <div className="segmented-control restore-mode" aria-label="恢复模式">
          {(['merge', 'replace'] as const).map((mode) => (
            <button
              className={restoreMode === mode ? 'active' : ''}
              key={mode}
              onClick={() => setRestoreMode(mode)}
              type="button"
            >
              {mode === 'merge' ? '合并' : '替换'}
            </button>
          ))}
        </div>
        <p className="helper-text">
          合并会按 ID 更新或新增数据；替换会先清空现有 memo 和收支记录。备份文件不包含 API Key。
        </p>
        {backupMessage && <p className="helper-text strong">{backupMessage}</p>}
      </section>
      <section className="panel full">
        <PanelHeader title="Runtime" />
        <div className="settings-list">
          <SettingRow label="API Base URL" value={config.apiBaseUrl} />
          <SettingRow label="Chat URL" value={config.chatUrl || '未配置'} />
          <SettingRow label="Agent URL" value={config.agentUrl || '未配置'} />
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

function parseNaturalTransaction(value: string): ParsedTransactionDraft | null {
  const text = value.trim();
  if (!text) return null;

  const normalized = text.replace(/[，。；、]/g, ' ');
  const amountMatch = normalized.match(/(?:￥|¥|rmb|cny|元)?\s*(\d+(?:\.\d{1,2})?)\s*(?:元|块|rmb|cny|yuan)?/i);
  if (!amountMatch) return null;

  const amount = Number(amountMatch[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const lower = normalized.toLowerCase();
  const incomeWords = ['收入', '工资', '奖金', '报销到账', '退款', '收款', '转入', '到账', '赚了'];
  const expenseWords = ['花', '支出', '买', '付', '付款', '消费', '吃', '打车', '缴', '交', '扣款'];
  const type: TransactionType = incomeWords.some((word) => lower.includes(word))
    ? 'INCOME'
    : expenseWords.some((word) => lower.includes(word))
      ? 'EXPENSE'
      : 'EXPENSE';

  const categoryRules: Array<[string, string[]]> = [
    ['餐饮', ['早餐', '午饭', '午餐', '晚饭', '晚餐', '夜宵', '咖啡', '奶茶', '火锅', '吃', '餐']],
    ['交通', ['打车', '地铁', '公交', '停车', '加油', '高铁', '机票', '出租']],
    ['购物', ['买', '购物', '淘宝', '京东', '拼多多', '衣服', '鞋']],
    ['住房', ['房租', '物业', '水电', '电费', '水费', '燃气']],
    ['医疗', ['医院', '药', '体检', '挂号']],
    ['娱乐', ['电影', '游戏', '会员', '演唱会']],
    ['工资', ['工资', '薪水', '奖金']],
    ['退款', ['退款', '退回']],
    ['报销', ['报销']],
  ];
  const category =
    categoryRules.find(([, keywords]) => keywords.some((keyword) => lower.includes(keyword)))?.[0] ??
    (type === 'INCOME' ? '收入' : '日常');

  const occurredAt = parseNaturalDate(lower);
  const warnings: string[] = [];
  if (!incomeWords.some((word) => lower.includes(word)) && !expenseWords.some((word) => lower.includes(word))) {
    warnings.push('未明确识别收支类型，默认按支出处理');
  }
  if (category === '日常' || category === '收入') {
    warnings.push('分类可能需要手动调整');
  }

  const confidence = Math.max(0.55, 0.95 - warnings.length * 0.18);

  return {
    input: {
      type,
      amount,
      currency: 'CNY',
      category,
      description: text,
      occurredAt,
    },
    confidence,
    warnings,
  };
}

function parseNaturalDate(value: string) {
  const now = new Date();
  const date = new Date(now);
  if (value.includes('前天')) {
    date.setDate(date.getDate() - 2);
  } else if (value.includes('昨天') || value.includes('昨晚')) {
    date.setDate(date.getDate() - 1);
  } else if (value.includes('明天')) {
    date.setDate(date.getDate() + 1);
  }

  const hourMinute = value.match(/(\d{1,2})[:：点](\d{1,2})?/);
  if (hourMinute) {
    date.setHours(Number(hourMinute[1]), Number(hourMinute[2] ?? 0), 0, 0);
  } else if (value.includes('早')) {
    date.setHours(8, 0, 0, 0);
  } else if (value.includes('午')) {
    date.setHours(12, 0, 0, 0);
  } else if (value.includes('晚') || value.includes('夜')) {
    date.setHours(19, 0, 0, 0);
  }

  return date.toISOString();
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
