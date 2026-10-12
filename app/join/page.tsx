import { JoinForm } from "@/components/AuthForms";

export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code = "" } = await searchParams;
  return <JoinForm invitationCode={code} />;
}
