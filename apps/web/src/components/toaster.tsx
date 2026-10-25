"use client";

import { Toaster } from "@wovain/ui/components/sonner";

/** Toasts for the signed-in app and the auth pages; public pages don't ship sonner. */
export const AppToaster = () => <Toaster richColors />;
