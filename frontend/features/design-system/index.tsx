"use client";

import { DesignSystemContent } from "./components/design-system-content";
import { DesignSystemPreviewProvider } from "./state/preview-context";

export default function DesignSystemPage() {
  return (
    <DesignSystemPreviewProvider>
      <DesignSystemContent />
    </DesignSystemPreviewProvider>
  );
}
