import type { FinanceSummary, Memo } from '../api/client';

export const fallbackMemos: Memo[] = [
  {
    id: 'local-1',
    title: '整理今天的关键事项',
    content: '确认后端 API、聊天服务地址和每日同步节奏。',
    tags: ['today', 'ops'],
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'local-2',
    title: '财务看板 MVP',
    content: '先展示收入、支出、净额和分类汇总，后续接真实账户聚合。',
    tags: ['finance'],
    updatedAt: new Date(Date.now() - 86400000).toISOString(),
  },
];

export const fallbackFinance: FinanceSummary = {
  incomeTotal: 12800,
  expenseTotal: 3920,
  net: 8880,
  currency: 'CNY',
  byCategory: [
    { category: '餐饮', type: 'EXPENSE', total: 920, count: 18 },
    { category: '工资', type: 'INCOME', total: 12800, count: 1 },
    { category: '交通', type: 'EXPENSE', total: 310, count: 9 },
  ],
};
