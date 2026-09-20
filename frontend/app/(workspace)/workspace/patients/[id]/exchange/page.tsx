import ExchangePage from "@/features/exchange";

export default async function ExchangeRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ExchangePage patientId={id} />;
}
