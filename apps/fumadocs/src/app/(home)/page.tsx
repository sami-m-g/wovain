import { redirect } from "next/navigation";

import { docsRoute } from "@/lib/shared";

const HomePage = () => redirect(docsRoute);

export default HomePage;
