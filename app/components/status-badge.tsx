import { useTranslation } from "react-i18next";
import { Badge, type Tone } from "~/components/ui";

const tones: Record<string, Tone> = {
  draft: "slate", scheduled: "amber", published: "green", archived: "slate", active: "green", inactive: "red",
  submitted: "blue", graded: "green", returned: "amber", in_progress: "amber", approved: "green", ai_proposed: "amber",
  present: "green", absent: "red", late: "amber", excused: "blue", pending: "amber", ready: "green",
};

export function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  return <Badge tone={tones[status] ?? "slate"}>{t(`status.${status}`)}</Badge>;
}
