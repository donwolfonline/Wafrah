import Link from "next/link";
import { CircleHelp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getAppTranslations } from "@/i18n/request";

interface HeaderHelpLinkProps {
  touchTarget?: boolean;
}

export async function HeaderHelpLink({
  touchTarget = false,
}: HeaderHelpLinkProps) {
  const tNav = await getAppTranslations("nav");

  return (
    <Button
      asChild
      variant="ghost"
      size={touchTarget ? "default" : "sm"}
      className={touchTarget ? "min-h-11 gap-1.5 px-3" : "gap-1.5"}
    >
      <Link href="/help" aria-label={tNav("help")}>
        <CircleHelp className="size-4" />
        <span className="hidden sm:inline">{tNav("help")}</span>
      </Link>
    </Button>
  );
}
