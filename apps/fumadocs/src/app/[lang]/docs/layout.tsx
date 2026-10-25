import { DocsLayout } from "@/components/ai/layout";
import { baseOptions } from "@/lib/layout.shared";
import { source } from "@/lib/source";

const Layout = async ({ children, params }: LayoutProps<"/[lang]/docs">) => {
  const { lang } = await params;

  return (
    <DocsLayout tree={source.getPageTree(lang)} {...baseOptions(lang)}>
      {children}
    </DocsLayout>
  );
};

export default Layout;
