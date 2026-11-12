import { PencilRuler } from "lucide-react";
import { PageHead } from "../components/ui";

/** Edit a plan (#/program/<id>). Owned by the Programs agent. */
export default function ProgramEditor({ id }: { id: string }) {
  void id;
  return <PageHead icon={PencilRuler} title="Edit plan" sub="Coming soon" />;
}
