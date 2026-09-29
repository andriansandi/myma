import type { HTMLAttributes, ReactNode } from "react";

export type BadgeVariant =
  | "default"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "neutral";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  children: ReactNode;
}

const variantClasses: Record<BadgeVariant, string> = {
  default:
    "bg-slate-100 text-slate-700 ring-slate-500/10",
  success:
    "bg-green-50 text-green-700 ring-green-600/20",
  warning:
    "bg-amber-50 text-amber-700 ring-amber-600/20",
  danger:
    "bg-red-50 text-red-700 ring-red-600/20",
  info:
    "bg-violet-50 text-violet-700 ring-violet-600/20",
  neutral:
    "bg-slate-50 text-slate-600 ring-slate-500/10",
};

export function Badge({
  variant = "default",
  children,
  className = "",
  ...props
}: BadgeProps) {
  const base =
    "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset";
  return (
    <span
      className={`${base} ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
}
