import { render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import { beforeEach, expect, test, vi } from "vitest";
import { clearApiSession } from "@/lib/api/client";
import { login, logout } from "@/features/auth/api";
import { installMockApi } from "@/lib/mock-api";
import {
  DEMO_PATIENT_ID,
  DEMO_MERCY_ORGANIZATION_ID,
  DEMO_UNITY_ENCOUNTER_ID,
} from "@/lib/mock-api/records";
import { QueryProvider } from "@/lib/query/provider";
import { createConsentRequest, approveConsent, revokeGrant } from "./api";
import { createQueryClient } from "@/lib/query/query-client";
import { QueryClientProvider } from "@tanstack/react-query";
import { exchangeKeys } from "@/hooks/exchange";
import ExchangePage from ".";

vi.mock("next/navigation", () => ({
  default: {},
  redirect: vi.fn(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const runtime = installMockApi();

beforeEach(async () => {
  runtime.reset();
  clearApiSession();
  await login({ username: "amina.unity", password: "synthetic-example-password" });
});

test("defines a source request from a verified receiving context", async () => {
  render(
    <QueryProvider>
      <ExchangePage patientId={DEMO_PATIENT_ID} />
    </QueryProvider>,
  );

  await expect
    .element(page.getByRole("heading", { level: 1, name: "Request records" }))
    .toBeVisible();
  await userEvent.click(page.getByRole("button", { name: "Select Mercy General" }));
  await userEvent.click(page.getByRole("checkbox", { name: "Allergies" }));
  await userEvent.fill(
    page.getByRole("textbox", { name: "Reason for this request" }),
    "Review relevant source allergies before confirming the current treatment plan.",
  );
  await userEvent.click(page.getByRole("button", { name: "Send request" }));

  await expect.element(page.getByText(/Review relevant source allergies/)).toBeVisible();
  await expect.element(page.getByText("Pending")).toBeVisible();
});

test("switches approved record categories and clears revoked access", async () => {
  const allergyRequest = await createConsentRequest({
    patient_id: DEMO_PATIENT_ID,
    source_org_id: DEMO_MERCY_ORGANIZATION_ID,
    receiving_encounter_id: DEMO_UNITY_ENCOUNTER_ID,
    purpose: "treatment",
    requested_domains: ["allergies"],
    reason: "Review allergy records before immediate treatment.",
  });
  const medicationRequest = await createConsentRequest({
    patient_id: DEMO_PATIENT_ID,
    source_org_id: DEMO_MERCY_ORGANIZATION_ID,
    receiving_encounter_id: DEMO_UNITY_ENCOUNTER_ID,
    purpose: "treatment",
    requested_domains: ["medications"],
    reason: "Review medication records before immediate treatment.",
  });
  await logout();
  clearApiSession();
  await login({ username: "musa.patient", password: "synthetic-example-password" });
  const allergies = await approveConsent({
    requestId: allergyRequest.request.id,
    input: {
      selected_domains: ["allergies"],
      duration: "PT24H",
      expected_version: allergyRequest.request.version,
    },
  });
  const medications = await approveConsent({
    requestId: medicationRequest.request.id,
    input: {
      selected_domains: ["medications"],
      duration: "PT24H",
      expected_version: medicationRequest.request.version,
    },
  });
  await logout();
  clearApiSession();
  await login({ username: "amina.unity", password: "synthetic-example-password" });
  const client = createQueryClient();
  render(
    <QueryClientProvider client={client}>
      <ExchangePage patientId={DEMO_PATIENT_ID} />
    </QueryClientProvider>,
  );
  const select = page.getByRole("combobox", { name: "Approved access" });
  await userEvent.selectOptions(select, allergies.grant.id);
  await expect.element(page.getByText(/Penicillin/)).toBeVisible();
  await userEvent.selectOptions(select, medications.grant.id);
  await expect.element(page.getByText(/Penicillin/)).not.toBeInTheDocument();
  await expect.element(select).toHaveValue(medications.grant.id);
  await logout();
  clearApiSession();
  await login({ username: "musa.patient", password: "synthetic-example-password" });
  await revokeGrant({
    grantId: medications.grant.id,
    input: { expected_version: medications.grant.version },
  });
  await logout();
  clearApiSession();
  await login({ username: "amina.unity", password: "synthetic-example-password" });
  await client.invalidateQueries({ queryKey: exchangeKeys.requests(DEMO_PATIENT_ID) });
  await expect.element(select).toHaveValue("");
  await expect.element(page.getByText(/Penicillin/)).not.toBeInTheDocument();
  client.clear();
});
