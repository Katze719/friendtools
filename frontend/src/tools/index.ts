import type { ComponentType } from "react";
import { Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import SplitwiseOverviewPage from "./splitwise/OverviewPage";
import SplitwiseNewExpensePage from "./splitwise/NewExpensePage";

export interface ToolRoute {
  /** Path relative to the tool's base within a group
   *  (e.g. "/" or "/new-expense"). */
  path: string;
  component: ComponentType;
}

export interface Tool {
  id: string;
  /** i18n key under `tools.<id>.name`. */
  nameKey: string;
  /** i18n key under `tools.<id>.description`. */
  descriptionKey: string;
  /** Segment appended after `/groups/:groupId/` (e.g. `splitwise`). */
  basePath: string;
  icon: LucideIcon;
  /** Tailwind utility classes for the tool tile accent. */
  accent: string;
  routes: ToolRoute[];
}

export const tools: Tool[] = [
  {
    id: "splitwise",
    nameKey: "tools.splitwise.name",
    descriptionKey: "tools.splitwise.description",
    basePath: "splitwise",
    icon: Wallet,
    accent: "bg-emerald-500",
    routes: [
      { path: "/", component: SplitwiseOverviewPage },
      { path: "/new-expense", component: SplitwiseNewExpensePage },
    ],
  },
];

export function toolPath(groupId: string, tool: Tool, sub: string = "/"): string {
  const clean = sub.startsWith("/") ? sub : `/${sub}`;
  const base = `/groups/${groupId}/${tool.basePath}`;
  return clean === "/" ? base : `${base}${clean}`;
}
