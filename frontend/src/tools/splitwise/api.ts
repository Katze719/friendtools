import { api } from "../../api/client";
import type { Expense, Payment, SplitwiseSummary } from "../../api/types";

export interface ExpenseInput {
  description: string;
  amount_cents: number;
  paid_by: string;
  splits: { user_id: string; amount_cents: number }[];
  happened_at?: string;
}

export interface PaymentInput {
  from_user: string;
  to_user: string;
  amount_cents: number;
  note?: string;
  happened_at?: string;
}

export const splitwiseApi = {
  summary: (groupId: string) =>
    api<SplitwiseSummary>(`/api/groups/${groupId}/splitwise/summary`),
  listExpenses: (groupId: string) =>
    api<Expense[]>(`/api/groups/${groupId}/splitwise/expenses`),
  getExpense: (groupId: string, expenseId: string) =>
    api<Expense>(`/api/groups/${groupId}/splitwise/expenses/${expenseId}`),
  createExpense: (groupId: string, payload: ExpenseInput) =>
    api<Expense>(`/api/groups/${groupId}/splitwise/expenses`, {
      method: "POST",
      body: payload,
    }),
  updateExpense: (groupId: string, expenseId: string, payload: ExpenseInput) =>
    api<Expense>(`/api/groups/${groupId}/splitwise/expenses/${expenseId}`, {
      method: "PUT",
      body: payload,
    }),
  deleteExpense: (groupId: string, expenseId: string) =>
    api<{ ok: boolean }>(
      `/api/groups/${groupId}/splitwise/expenses/${expenseId}`,
      { method: "DELETE" },
    ),

  listPayments: (groupId: string) =>
    api<Payment[]>(`/api/groups/${groupId}/splitwise/payments`),
  createPayment: (groupId: string, payload: PaymentInput) =>
    api<Payment>(`/api/groups/${groupId}/splitwise/payments`, {
      method: "POST",
      body: payload,
    }),
  deletePayment: (groupId: string, paymentId: string) =>
    api<{ ok: boolean }>(
      `/api/groups/${groupId}/splitwise/payments/${paymentId}`,
      { method: "DELETE" },
    ),
};
