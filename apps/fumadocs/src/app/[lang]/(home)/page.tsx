import { redirect } from "next/navigation";

import { i18n } from "@/lib/i18n";
import { docsRoute } from "@/lib/shared";

const HomePage = async ({ params }: PageProps<"/[lang]">) => {
  const { lang } = await params;

  redirect(lang === i18n.defaultLanguage ? docsRoute : `/${lang}${docsRoute}`);
};

export default HomePage;
