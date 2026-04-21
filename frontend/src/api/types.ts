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
  /** `null` means invites are closed - nobody can join. Owners can open
   *  the group (which generates a fresh code) or close it again. */
  invite_code: string | null;
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
  /** `null` means invites are closed - see {@link GroupSummary.invite_code}. */
  invite_code: string | null;
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
  /** Minimum-transaction settlement plan (A may pay C directly). */
  settlements: Settlement[];
  /** Pairwise debts as they arose from expenses, netted per pair. */
  direct_settlements: Settlement[];
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
  /** Optional link to a trip in the same group. When set, this expense
   *  contributes to that trip's budget. `null` means general group expense. */
  trip_id: string | null;
  trip_name: string | null;
  splits: ExpenseSplit[];
}

export interface Payment {
  id: string;
  group_id: string;
  from_user_id: string;
  from_display_name: string;
  to_user_id: string;
  to_display_name: string;
  amount_cents: number;
  note: string | null;
  happened_at: string;
  created_at: string;
}

export interface TripDestination {
  name: string;
  lat?: number | null;
  lng?: number | null;
}

/**
 * A concrete trip inside a group. Each group can have multiple trips;
 * links, folders, packing items, and itinerary items all scope to a
 * specific trip id.
 */
export interface Trip {
  id: string;
  group_id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  destinations: TripDestination[];
  budget_cents: number | null;
  /** Sum of expenses tied to this trip (in cents). */
  spent_cents: number;
  position: number;
  created_by: string;
  created_by_display_name: string;
  created_at: string;
  updated_at: string;
}

export interface TripLink {
  id: string;
  trip_id: string;
  url: string;
  title: string | null;
  description: string | null;
  image_url: string | null;
  site_name: string | null;
  /** Manual overrides set by the user when the unfurl didn't produce a good
   * title or image. Prefer these over `title` / `image_url` when rendering. */
  title_override: string | null;
  image_override: string | null;
  note: string;
  added_by: string;
  added_by_display_name: string;
  created_at: string;
  fetched_at: string | null;
  likes: number;
  dislikes: number;
  /** 1 = like, -1 = dislike, 0 = no vote. */
  my_vote: 1 | -1 | 0;
  /** Null means the link lives in the implicit "Unsorted" bucket. */
  folder_id: string | null;
  folder_name: string | null;
  position: number;
}

export interface TripFolder {
  id: string;
  trip_id: string;
  name: string;
  created_by: string;
  created_by_display_name: string;
  created_at: string;
  link_count: number;
}

export interface TripPackingItem {
  id: string;
  trip_id: string;
  name: string;
  quantity: string;
  category: string;
  is_packed: boolean;
  assigned_to: string | null;
  assigned_to_display_name: string | null;
  position: number;
  created_by: string;
  created_by_display_name: string;
  created_at: string;
  updated_at: string;
}

export interface TripItineraryItem {
  id: string;
  trip_id: string;
  /** ISO date (YYYY-MM-DD) */
  day_date: string;
  title: string;
  /** HH:MM:SS or HH:MM */
  start_time: string | null;
  end_time: string | null;
  location: string;
  note: string;
  link_id: string | null;
  link_title: string | null;
  link_url: string | null;
  position: number;
  created_by: string;
  created_by_display_name: string;
  created_at: string;
  updated_at: string;
}

export interface CalendarEvent {
  id: string;
  /** Present only for group-owned events. */
  group_id: string | null;
  /** Present only for personal events. */
  owner_user_id: string | null;
  title: string;
  description: string;
  location: string;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  category: CalendarCategoryRef | null;
  created_by: string;
  created_by_display_name: string;
  created_at: string;
  updated_at: string;
}

export interface CalendarCategoryRef {
  id: string;
  name: string;
  color: string;
}

export interface CalendarCategory extends CalendarCategoryRef {
  group_id: string | null;
  owner_user_id: string | null;
  created_at: string;
}

export interface ShoppingList {
  id: string;
  /** Present only for group-owned lists. */
  group_id: string | null;
  /** Present only for personal lists (visible only to this user). */
  owner_user_id: string | null;
  name: string;
  /** Number of unchecked items on this list. */
  items_open: number;
  /** Number of items ticked off. */
  items_done: number;
  created_by: string;
  created_at: string;
}

export interface ShoppingItem {
  id: string;
  /** Present only for items on group-owned lists. */
  group_id: string | null;
  /** Present only for items on personal lists. */
  owner_user_id: string | null;
  /** List this item belongs to. Every item has exactly one parent list. */
  list_id: string;
  name: string;
  quantity: string;
  note: string;
  is_done: boolean;
  done_at: string | null;
  done_by: string | null;
  done_by_display_name: string | null;
  added_by: string;
  added_by_display_name: string;
  created_at: string;
}

export type TaskPriority = "low" | "normal" | "high";

export interface Task {
  id: string;
  /** Present only for group tasks (shared with the group). */
  group_id: string | null;
  /** Present only for personal tasks (visible only to this user). */
  owner_user_id: string | null;
  title: string;
  description: string;
  priority: TaskPriority;
  /** ISO date (YYYY-MM-DD) or null when unscheduled. */
  due_date: string | null;
  is_done: boolean;
  done_at: string | null;
  done_by: string | null;
  done_by_display_name: string | null;
  assigned_to: string | null;
  assigned_to_display_name: string | null;
  created_by: string;
  created_by_display_name: string;
  created_at: string;
  updated_at: string;
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
