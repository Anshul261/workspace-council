"use client";

import { CopilotKit } from "@copilotkit/react-core/v2";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <CopilotKit
      runtimeUrl="/api/copilotkit"
      defaultThrottleMs={120}
      onError={({ type, error, context }) => {
        console.error("[workspace-council]", type, error, context);
      }}
    >
      {children}
    </CopilotKit>
  );
}
