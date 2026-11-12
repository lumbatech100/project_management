import Image from "next/image";
import { cn } from "@/lib/utils";

/** Logo LumbaTech. Latar hitam asli dihilangkan supaya bisa dipakai di halaman terang dan sidebar gelap. */
export function Logo({
  className,
  priority,
  variant = "brand",
}: {
  className?: string;
  priority?: boolean;
  variant?: "brand" | "light";
}) {
  return (
    <Image
      src={variant === "light" ? "/lumbatech-logo-light.png" : "/lumbatech-logo.png"}
      alt="LumbaTech"
      width={640}
      height={97}
      priority={priority}
      className={cn("h-7 w-auto", className)}
    />
  );
}
