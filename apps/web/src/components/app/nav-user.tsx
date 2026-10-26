"use client";

import { Avatar, AvatarFallback } from "@wovain/ui/components/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@wovain/ui/components/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@wovain/ui/components/sidebar";
import { Skeleton } from "@wovain/ui/components/skeleton";
import { BookOpen, ChevronsUpDown, LogOut } from "lucide-react";
import { useTranslations } from "next-intl";

import { useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";
import { resetAnalytics } from "@/lib/consent-store";

const WHITESPACE = /\s+/u;
const MAX_INITIALS = 2;

/** "Uma Audit" → "UA"; falls back to the email's first letter. */
const initialsOf = (name: string, email: string) => {
  const letters = name
    .trim()
    .split(WHITESPACE)
    .slice(0, MAX_INITIALS)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
  return letters || email.charAt(0).toUpperCase();
};

const Identity = ({ email, name }: { email: string; name: string }) => (
  <>
    <Avatar>
      <AvatarFallback>{initialsOf(name, email)}</AvatarFallback>
    </Avatar>
    <span className="grid min-w-0 flex-1 text-start text-sm leading-tight">
      <span className="truncate font-medium">{name}</span>
      <span className="truncate text-xs">{email}</span>
    </span>
  </>
);

/** sidebar-07's NavUser: who is signed in, the docs and sign out. */
export const NavUser = ({ docsUrl }: { docsUrl: string }) => {
  const t = useTranslations("Common");
  const header = useTranslations("Header");
  const router = useRouter();
  const { isMobile } = useSidebar();
  const { data: session, isPending } = authClient.useSession();

  if (isPending || !session) {
    // Fixed width: SidebarMenuSkeleton's random width breaks hydration.
    return <Skeleton className="bg-sidebar-accent h-12 w-full rounded-md" />;
  }
  const { email, name } = session.user;

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                aria-label={`${name} (${t("account")})`}
                // Replays block the trigger (it carries the name and email).
                className="ph-no-capture aria-expanded:bg-sidebar-accent"
                size="lg"
              />
            }
          >
            <Identity email={email} name={name} />
            <ChevronsUpDown aria-hidden="true" className="ms-auto" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="ph-mask min-w-56"
            side={isMobile ? "top" : "right"}
            sideOffset={8}
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="flex items-center gap-2 font-normal">
                <Identity email={email} name={name} />
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem
                render={
                  // oxlint-disable-next-line jsx-a11y/anchor-has-content, jsx-a11y/control-has-associated-label -- the menu item renders the label inside
                  <a href={docsUrl} />
                }
              >
                <BookOpen aria-hidden="true" />
                {header("docs")}
              </DropdownMenuItem>
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
              >
                <LogOut aria-hidden="true" />
                {t("signOut")}
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
};
