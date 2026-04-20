import { ProjectPage } from "./project-page";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default function ProjectPageRoute() {
  // Data loading lives in the client page so draft project chat IDs can be
  // generated after hydration and promoted through the bootstrap flow.
  return <ProjectPage />;
}
