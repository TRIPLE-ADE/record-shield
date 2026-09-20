import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { expect, test } from "vitest";
import Home from "./page";

test("renders the home page", async () => {
  render(<Home />);
  await expect
    .element(page.getByRole("heading", { level: 1 }))
    .toHaveTextContent("To get started, edit the page.tsx file.");
});
