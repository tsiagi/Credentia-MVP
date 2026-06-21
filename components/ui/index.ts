// components/ui/index.ts
// Barrel for the Cairn UI primitive layer (Batch 1). Import from
// "@/components/ui" so pages stop hand-rolling markup.
export { cn } from "./cn";
export { Button } from "./Button";
export type { ButtonProps, ButtonVariant, ButtonSize } from "./Button";
export { Card, CardHeader, CardTitle, CardDescription, CardBody } from "./Card";
export type { CardProps } from "./Card";
export { Badge, VerifiedBadge, AIEstimateBadge } from "./Badge";
export type { BadgeProps, BadgeTone } from "./Badge";
export { StatusPill } from "./StatusPill";
export type { StatusPillProps, Status } from "./StatusPill";
export { PageHeader } from "./PageHeader";
export type { PageHeaderProps } from "./PageHeader";
export { DataTable } from "./DataTable";
export type { DataTableProps, Column } from "./DataTable";
export { Modal } from "./Modal";
export type { ModalProps } from "./Modal";
export { ToastProvider, useToast } from "./Toast";
export { Skeleton, SkeletonText } from "./Skeleton";
export type { SkeletonProps } from "./Skeleton";
export { EmptyState } from "./EmptyState";
export type { EmptyStateProps } from "./EmptyState";
// Re-export the existing motion primitives so they live behind one entrypoint.
export { AnimatedNumber, Reveal, GrowBar, useCountUp, prefersReducedMotion } from "./motion";
