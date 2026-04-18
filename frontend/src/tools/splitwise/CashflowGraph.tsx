import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { Settlement } from "../../api/types";
import { formatMoney } from "../../lib/format";

interface Props {
  participants: { id: string; display_name: string; balance_cents: number }[];
  settlements: Settlement[];
  currency: string;
  highlightUserId?: string | null;
}

/**
 * Simple SVG cashflow graph: users are placed on a circle, each settlement
 * becomes an arrow from debtor to creditor with the amount on it.
 *
 * Intentionally dependency-free and "good enough" for typical friend-group
 * sizes (<= ~10 participants).
 */
export default function CashflowGraph({
  participants,
  settlements,
  currency,
  highlightUserId,
}: Props) {
  const { t } = useTranslation();

  // Only include participants that actually appear in the settlements or
  // carry a non-zero balance — otherwise a big group with most people
  // settled would look cluttered.
  const activeIds = useMemo(() => {
    const set = new Set<string>();
    for (const s of settlements) {
      set.add(s.from_user_id);
      set.add(s.to_user_id);
    }
    for (const p of participants) {
      if (p.balance_cents !== 0) set.add(p.id);
    }
    return set;
  }, [settlements, participants]);

  const nodes = participants.filter((p) => activeIds.has(p.id));

  const width = 560;
  const height = 360;
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) / 2 - 70;

  const positions = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    const n = Math.max(nodes.length, 1);
    nodes.forEach((node, i) => {
      // Start at the top (-PI/2) and go clockwise.
      const angle = -Math.PI / 2 + (i * 2 * Math.PI) / n;
      map.set(node.id, {
        x: cx + radius * Math.cos(angle),
        y: cy + radius * Math.sin(angle),
      });
    });
    return map;
  }, [nodes, cx, cy, radius]);

  if (nodes.length === 0) {
    return (
      <p className="card p-8 text-center text-sm text-slate-500 dark:text-slate-400">
        {t("splitwise.overview.graph.settled")}
      </p>
    );
  }

  if (nodes.length === 1) {
    const only = nodes[0];
    return (
      <div className="card p-6 text-center text-sm text-slate-500 dark:text-slate-400">
        {t("splitwise.overview.graph.onlyOne", { name: only.display_name })}
      </div>
    );
  }

  const nodeRadius = 26;

  return (
    <div className="card overflow-hidden p-3">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full"
        role="img"
        aria-label={t("splitwise.overview.graph.aria")}
      >
        <defs>
          <marker
            id="cashflow-arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M0,0 L10,5 L0,10 z" className="fill-slate-500 dark:fill-slate-300" />
          </marker>
        </defs>

        {settlements.map((s, i) => {
          const from = positions.get(s.from_user_id);
          const to = positions.get(s.to_user_id);
          if (!from || !to) return null;
          const dx = to.x - from.x;
          const dy = to.y - from.y;
          const len = Math.hypot(dx, dy) || 1;
          // Shorten the line so it ends at the circle edge, not its centre.
          const ux = dx / len;
          const uy = dy / len;
          const x1 = from.x + ux * nodeRadius;
          const y1 = from.y + uy * nodeRadius;
          const x2 = to.x - ux * nodeRadius;
          const y2 = to.y - uy * nodeRadius;

          // Curve edges slightly to avoid overlap and give room for the label.
          // The control point is offset perpendicular to the line direction,
          // rotating depending on which side of the circle we are on.
          const midX = (x1 + x2) / 2;
          const midY = (y1 + y2) / 2;
          const normalX = -uy;
          const normalY = ux;
          const bulge = 28;
          const ctrlX = midX + normalX * bulge;
          const ctrlY = midY + normalY * bulge;

          const labelX = midX + normalX * (bulge + 4);
          const labelY = midY + normalY * (bulge + 4);

          const touchesUser =
            highlightUserId &&
            (s.from_user_id === highlightUserId || s.to_user_id === highlightUserId);

          return (
            <g key={i}>
              <path
                d={`M ${x1},${y1} Q ${ctrlX},${ctrlY} ${x2},${y2}`}
                fill="none"
                className={
                  touchesUser
                    ? "stroke-brand-500 dark:stroke-brand-400"
                    : "stroke-slate-400 dark:stroke-slate-500"
                }
                strokeWidth={touchesUser ? 2.5 : 1.75}
                markerEnd="url(#cashflow-arrow)"
              />
              <text
                x={labelX}
                y={labelY}
                textAnchor="middle"
                dominantBaseline="middle"
                className="fill-slate-700 stroke-white text-[11px] font-medium tabular-nums dark:fill-slate-100 dark:stroke-slate-900"
                strokeWidth={3}
                strokeLinejoin="round"
                style={{ paintOrder: "stroke" }}
              >
                {formatMoney(s.amount_cents, currency)}
              </text>
            </g>
          );
        })}

        {nodes.map((node) => {
          const pos = positions.get(node.id);
          if (!pos) return null;
          const isMe = node.id === highlightUserId;
          const balance = node.balance_cents;
          const fillClass =
            balance > 0
              ? "fill-emerald-100 dark:fill-emerald-900/60"
              : balance < 0
                ? "fill-rose-100 dark:fill-rose-900/60"
                : "fill-slate-100 dark:fill-slate-800";
          const strokeClass = isMe
            ? "stroke-brand-500 dark:stroke-brand-400"
            : balance > 0
              ? "stroke-emerald-500 dark:stroke-emerald-400"
              : balance < 0
                ? "stroke-rose-500 dark:stroke-rose-400"
                : "stroke-slate-400 dark:stroke-slate-500";

          const initials = node.display_name
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((w) => w[0]?.toUpperCase() ?? "")
            .join("");

          // Place the name label outside the circle, pushed away from the centre.
          const dirX = (pos.x - cx) / (Math.hypot(pos.x - cx, pos.y - cy) || 1);
          const dirY = (pos.y - cy) / (Math.hypot(pos.x - cx, pos.y - cy) || 1);
          const nameX = pos.x + dirX * (nodeRadius + 14);
          const nameY = pos.y + dirY * (nodeRadius + 14);

          return (
            <g key={node.id}>
              <circle
                cx={pos.x}
                cy={pos.y}
                r={nodeRadius}
                className={`${fillClass} ${strokeClass}`}
                strokeWidth={isMe ? 2.5 : 1.75}
              />
              <text
                x={pos.x}
                y={pos.y}
                textAnchor="middle"
                dominantBaseline="central"
                className="fill-slate-700 text-[12px] font-semibold dark:fill-slate-100"
              >
                {initials || "?"}
              </text>
              <text
                x={nameX}
                y={nameY}
                textAnchor="middle"
                dominantBaseline="central"
                className="fill-slate-700 text-[11px] dark:fill-slate-200"
              >
                {node.display_name}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
