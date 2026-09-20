import PatientRecordsPage from "@/features/patient-records";

export default async function PatientRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PatientRecordsPage patientId={id} />;
}
