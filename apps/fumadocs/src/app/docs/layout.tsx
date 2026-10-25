import { DocsLayout } from "@/components/ai/layout";
import { baseOptions } from "@/lib/layout.shared";
import { source } from "@/lib/source";

const Layout = ({ children }: LayoutProps<"/docs">) => (
  <DocsLayout tree={source.getPageTree()} {...baseOptions()}>
    {children}
  </DocsLayout>
);

export default Layout;
