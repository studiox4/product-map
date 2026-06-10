import { cn } from "@/lib/utils"

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("shimmer rounded-xl bg-[#eef1f5]", className)}
      {...props}
    />
  )
}

export { Skeleton }
