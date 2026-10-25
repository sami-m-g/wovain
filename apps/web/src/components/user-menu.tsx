"use client";

import { Button } from "@wovain/ui/components/button";
import { Skeleton } from "@wovain/ui/components/skeleton";
import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";

import { Link } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";

// The dropdown only ships to signed-in visitors.
const AccountMenu = dynamic(() => import("@/components/account-menu"), {
  loading: () => <Skeleton className="h-9 w-24 rounded-lg" />,
});

/** Signed out: Sign in link. Signed in: account menu with sign out. */
const UserMenu = () => {
  const t = useTranslations("Common");
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return <Skeleton className="h-9 w-24 rounded-lg" />;
  }

  if (!session) {
    return (
      <Button
        className="h-9 rounded-lg px-3 text-sm"
        nativeButton={false}
        render={<Link href="/login" prefetch={false} />}
        variant="ghost"
      >
        {t("signIn")}
      </Button>
    );
  }

  return <AccountMenu session={session} />;
};

export default UserMenu;
