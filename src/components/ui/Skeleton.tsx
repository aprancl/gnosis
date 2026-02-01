/**
 * Skeleton - Loading placeholder component with pulse animation.
 * Used for content loading states across the application.
 */

interface SkeletonProps {
  className?: string;
}

export default function Skeleton({ className = "" }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-blue-100/60 ${className}`}
      aria-hidden="true"
    />
  );
}
