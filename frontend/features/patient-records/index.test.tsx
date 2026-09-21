import { render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import { beforeEach, expect, test, vi } from "vitest";
import { clearApiSession } from "@/lib/api/client";
import { login } from "@/features/auth/api";
import { installMockApi } from "@/lib/mock-api";
import { createEncounter, getLocalRecords } from "./api";
import {
  DEMO_PATIENT_ID,
  DEMO_UNITY_ENCOUNTER_ID,
  DEMO_UNITY_WARD_ID,
} from "@/lib/mock-api/records";
import { QueryProvider } from "@/lib/query/provider";
import PatientRecordsPage from ".";

vi.mock("next/navigation", () => ({
  default: {},
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
}));

const runtime = installMockApi();

beforeEach(async () => {
  runtime.reset();
  clearApiSession();
  await login({ username: "grace.unity", password: "synthetic-example-password" });
});

test("shows a patient workspace and an in-context nursing write form", async () => {
  render(
    <QueryProvider>
      <PatientRecordsPage patientId={DEMO_PATIENT_ID} />
    </QueryProvider>,
  );

  await expect.element(page.getByRole("heading", { level: 1, name: "Musa Ibrahim" })).toBeVisible();
  await expect.element(page.getByText("HSP-99210 · Unity Medical")).toBeVisible();
  await expect.element(page.getByText("Patient record")).toBeVisible();

  await userEvent.click(page.getByRole("button", { name: "Nursing" }));
  await expect
    .element(page.getByRole("heading", { level: 2, name: "Nursing notes" }))
    .toBeVisible();
  await expect.element(page.getByText("Add nursing note")).toBeVisible();
  await expect.element(page.getByText(/Patient resting comfortably/)).toBeVisible();
});

test("submits a nursing note through the contract-backed form", async () => {
  render(
    <QueryProvider>
      <PatientRecordsPage patientId={DEMO_PATIENT_ID} />
    </QueryProvider>,
  );

  await userEvent.click(page.getByRole("button", { name: "Nursing" }));
  const note = page.getByRole("textbox", { name: "Note" });
  await userEvent.fill(note, "Checked the patient and updated the evening care plan.");
  await userEvent.click(page.getByRole("button", { name: "Save note" }));

  await expect
    .element(page.getByText("Checked the patient and updated the evening care plan."))
    .toBeVisible();
});

test("protects an unsaved note when changing categories", async () => {
  render(
    <QueryProvider>
      <PatientRecordsPage patientId={DEMO_PATIENT_ID} />
    </QueryProvider>,
  );
  await userEvent.click(page.getByRole("button", { name: "Nursing", exact: true }));
  await userEvent.fill(
    page.getByRole("textbox", { name: "Note", exact: true }),
    "This draft should stay with the selected patient visit.",
  );
  await userEvent.click(page.getByRole("button", { name: "Vitals", exact: true }));
  await expect.element(page.getByRole("dialog")).toBeVisible();
  await userEvent.click(page.getByRole("button", { name: "Keep editing" }));
  await expect
    .element(page.getByRole("textbox", { name: "Note", exact: true }))
    .toHaveValue("This draft should stay with the selected patient visit.");
  await userEvent.click(page.getByRole("button", { name: "Vitals", exact: true }));
  await userEvent.click(page.getByRole("button", { name: "Discard draft" }));
  await expect.element(page.getByText("Add vital", { exact: true })).toBeVisible();
});

test("saves a note to the selected open visit rather than the demographics visit", async () => {
  const { encounter } = await createEncounter({
    patient_id: DEMO_PATIENT_ID,
    type: "EMERGENCY",
    ward_id: DEMO_UNITY_WARD_ID,
  });
  render(
    <QueryProvider>
      <PatientRecordsPage patientId={DEMO_PATIENT_ID} />
    </QueryProvider>,
  );
  await expect
    .element(page.getByRole("combobox", { name: "Current visit" }))
    .toHaveValue(encounter.id);
  await userEvent.click(page.getByRole("button", { name: "Nursing", exact: true }));
  await userEvent.fill(
    page.getByRole("textbox", { name: "Note", exact: true }),
    "New visit observation belongs to the chosen open visit.",
  );
  await userEvent.selectOptions(
    page.getByRole("combobox", { name: "Current visit" }),
    DEMO_UNITY_ENCOUNTER_ID,
  );
  await userEvent.click(page.getByRole("button", { name: "Keep editing" }));
  await expect
    .element(page.getByRole("combobox", { name: "Current visit" }))
    .toHaveValue(encounter.id);
  await userEvent.click(page.getByRole("button", { name: "Save note" }));
  await expect
    .element(
      page.getByText("New visit observation belongs to the chosen open visit.", { exact: true }),
    )
    .toBeVisible();
  const records = await getLocalRecords({
    patientId: DEMO_PATIENT_ID,
    domain: "nursing_notes",
    purpose: "treatment",
  });
  expect(
    records.items.find(
      (item) =>
        "text" in item.payload &&
        item.payload.text === "New visit observation belongs to the chosen open visit.",
    )?.encounter_id,
  ).toBe(encounter.id);
});
