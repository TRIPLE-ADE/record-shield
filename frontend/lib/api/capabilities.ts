// Capabilities absent from the connected backend's published OpenAPI contract.
// Update this list only after the corresponding endpoints are integration-tested.
const mock = !process.env.NEXT_PUBLIC_API_URL;
export const apiCapabilities = {
  patientContext: mock,
  worklist: mock,
  notificationRead: mock,
};
