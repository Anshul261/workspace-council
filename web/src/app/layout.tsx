import type { Metadata } from "next";
import "@copilotkit/react-core/v2/styles.css";
import "./styles.css";

import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Workspace Council",
  description: "A research, writing, review, and publishing team for Ambiguous",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
