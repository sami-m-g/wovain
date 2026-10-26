"use client";

import { Button } from "@wovain/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@wovain/ui/components/dropdown-menu";
import { useTranslations } from "next-intl";

import { useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";
import { resetAnalytics } from "@/lib/consent-store";

/** The signed-in account menu; loaded only for signed-in visitors. */
const AccountMenu = ({
  session,
}: {
  session: { user: { email: string; name: string } };
}) => {
  const router = useRouter();
  const t = useTranslations("Common");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label={`${session.user.name} (${t("account")})`}
            // Replays block the trigger (its label carries the name) and mask
            // the menu's email (instrumentation-client.ts).
            className="ph-no-capture h-9 max-w-48 rounded-lg px-3 text-sm"
            variant="outline"
          />
        }
      >
        <span className="truncate">{session.user.name}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="bg-card ph-mask">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{session.user.email}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => {
              authClient.signOut({
                fetchOptions: {
                  onSuccess: () => {
                    // The next visitor on this browser is anonymous again.
                    resetAnalytics();
                    router.push("/");
                  },
                },
              });
            }}
            variant="destructive"
          >
            {t("signOut")}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default AccountMenu;
