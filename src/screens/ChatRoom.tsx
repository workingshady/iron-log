import { MessageCircle } from "lucide-react";
import { PageHead } from "../components/ui";

/** One conversation (#/chat/<id>). Owned by the Chat agent. */
export default function ChatRoomScreen({ id }: { id: string }) {
  void id;
  return <PageHead icon={MessageCircle} title="Chat" sub="Coming soon" />;
}
