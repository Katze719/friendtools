export interface User {
  id: string;
  email: string;
  display_name: string;
  status: "pending" | "approved";
  is_admin: boolean;
  created_at: string;
}

export interface LoginResponse {
  token: string;
  user: User;
}

export interface RegisterResponse {
  status: "pending" | "approved";
  token?: string;
  user: User;
}

export interface GroupSummary {
  id: string;
  name: string;
  invite_code: string;
  currency: string;
  created_at: string;
  member_count: number;
  my_role: "owner" | "member";
}

export interface Member {
  id: string;
  display_name: string;
  email: string;
  role: "owner" | "member";
  joined_at: string;
}

export interface GroupDetail {
  id: string;
  name: string;
  invite_code: string;
  currency: string;
  created_by: string;
  created_at: string;
  members: Member[];
  my_role: "owner" | "member";
}

export interface Balance {
  user_id: string;
  display_name: string;
  balance_cents: number;
}

export interface Settlement {
  from_user_id: string;
  from_display_name: string;
  to_user_id: string;
  to_display_name: string;
  amount_cents: number;
}

export interface SplitwiseSummary {
  currency: string;
  balances: Balance[];
  settlements: Settlement[];
  my_balance_cents: number;
}

export interface ExpenseSplit {
  user_id: string;
  display_name: string;
  amount_cents: number;
}

export interface Expense {
  id: string;
  group_id: string;
  paid_by: string;
  paid_by_display_name: string;
  description: string;
  amount_cents: number;
  happened_at: string;
  created_at: string;
  splits: ExpenseSplit[];
}

export interface TripLink {
  id: string;
  url: string;
  title: string | null;
  description: string | null;
  image_url: string | null;
  site_name: string | null;
  note: string;
  added_by: string;
  added_by_display_name: string;
  created_at: string;
  fetched_at: string | null;
  likes: number;
  dislikes: number;
  /** 1 = like, -1 = dislike, 0 = no vote. */
  my_vote: 1 | -1 | 0;
}

export interface AdminUserRow {
  id: string;
  email: string;
  display_name: string;
  status: "pending" | "approved";
  is_admin: boolean;
  approved_at: string | null;
  created_at: string;
}
