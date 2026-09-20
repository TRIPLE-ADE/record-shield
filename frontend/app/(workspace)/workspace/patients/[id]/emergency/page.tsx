import EmergencyPage from "@/features/emergency";

export default async function EmergencyRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EmergencyPage patientId={id} />;
}
