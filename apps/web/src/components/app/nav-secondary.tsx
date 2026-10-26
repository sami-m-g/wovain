import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@wovain/ui/components/sidebar";
import { BookOpen, ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";

/** sidebar-07's NavSecondary: help links that leave the app, below the main nav. */
export const NavSecondary = ({ docsUrl }: { docsUrl: string }) => {
  const t = useTranslations("Shell");

  return (
    <SidebarGroup className="mt-auto">
      <SidebarGroupContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              render={
                <a
                  aria-label={t("docsLabel")}
                  href={docsUrl}
                  rel="noopener noreferrer"
                  target="_blank"
                />
              }
              tooltip={t("docs")}
            >
              <BookOpen aria-hidden="true" />
              <span>{t("docs")}</span>
              <ExternalLink
                aria-hidden="true"
                className="ms-auto size-3.5 opacity-60 group-data-[collapsible=icon]:hidden"
              />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
};
