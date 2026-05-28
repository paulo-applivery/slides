import type { Metadata } from "next";
import localFont from "next/font/local";
import { Toaster } from "sonner";
import { auth } from "@/auth";
import { Providers } from "@/components/providers";
import "./globals.css";

/**
 * Outfit — self-hosted (brand rule: never Google CDN). We only ship 400 / 500 / 600
 * weights; bold ≥ 700 is forbidden by the design system.
 *
 * Outfit is the single typeface across the entire surface — `.t-mono` adds
 * `font-variant-numeric: tabular-nums` for column-aligned numbers without
 * pulling in a second font family.
 */
const outfit = localFont({
  variable: "--font-outfit",
  display: "swap",
  src: [
    { path: "../../public/fonts/400-Outfit-Regular.ttf", weight: "400", style: "normal" },
    { path: "../../public/fonts/Outfit-Medium.ttf", weight: "500", style: "normal" },
    { path: "../../public/fonts/500-Outfit-SemiBold.ttf", weight: "600", style: "normal" },
  ],
});

export const metadata: Metadata = {
  title: "Applivery Atlas — Sales performance dashboards",
  description: "Live revenue dashboards and TV slideshows from Stripe and HubSpot.",
  icons: {
    icon: "/assets/favicon_blue.svg",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Read the session once at the layout level so the SessionProvider on the
  // client gets seeded — saves a network round-trip for the initial render.
  const session = await auth();

  return (
    <html lang="en" data-theme="light" className={outfit.variable}>
      <body>
        <Providers session={session}>{children}</Providers>
        <Toaster
          theme="light"
          richColors
          position="top-right"
          toastOptions={{
            classNames: {
              toast: "!font-sans !rounded-[var(--radius-md)] !shadow-md",
            },
          }}
        />
      </body>
    </html>
  );
}
