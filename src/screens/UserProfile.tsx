import { UserRound } from "lucide-react";
import { PageHead } from "../components/ui";

/** Someone else's profile (#/u/<username>). Owned by the Social agent. */
export default function UserProfile({ username }: { username: string }) {
  void username;
  return <PageHead icon={UserRound} title="Profile" sub="Coming soon" />;
}
