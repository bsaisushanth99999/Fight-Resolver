import type { Metadata } from "next";
import {
  ClerkProvider,
  Show,
  SignInButton,
  SignUpButton,
  UserButton,
  OrganizationSwitcher,
} from "@clerk/nextjs";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "The Arbitration Panel",
  description: "A fair, unbiased panel of 5 judges for marital disputes",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <ClerkProvider
      appearance={{
        variables: {
          colorPrimary: "#d6b678",
          colorBackground: "#f8fafc",
          colorText: "#0f172a",
          colorInputBackground: "#ffffff",
          colorInputText: "#0f172a",
          colorNeutral: "#334155",
          colorDanger: "#dc2626",
        },
        elements: {
          card: {
            backgroundColor: "#f8fafc",
            color: "#0f172a",
            border: "1px solid #cbd5e1",
          },
          modalContent: {
            backgroundColor: "#f8fafc",
            color: "#0f172a",
          },
          formFieldInput: {
            backgroundColor: "#ffffff",
            color: "#0f172a",
            borderColor: "#cbd5e1",
          },
          formFieldLabel: {
            color: "#334155",
          },
          footerActionText: {
            color: "#334155",
          },
        },
      }}
    >
      <html lang="en">
        <body
          className={`${geistSans.variable} ${geistMono.variable} antialiased`}
          style={{ margin: 0, background: "#1e293b", minHeight: "100vh" }}
        >
          <header
            className="topbar"
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "16px 24px",
              borderBottom: "1px solid #cbd5e1",
              background: "#f8fafc",
              fontFamily: "'Georgia', serif",
            }}
          >
            <a
              className="topbar-brand"
              href="/"
              style={{
                color: "#0f172a",
                textDecoration: "none",
                fontSize: 18,
                fontWeight: 400,
                letterSpacing: "0.04em",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span style={{ fontSize: 22 }}>⚖</span>
              The Arbitration Panel
            </a>

            <div className="topbar-actions" style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <Show when="signed-out">
                <SignInButton mode="modal">
                  <button
                    style={{
                      background: "#ffffff",
                      color: "#0f172a",
                      border: "1px solid #cbd5e1",
                      borderRadius: 8,
                      padding: "8px 16px",
                      fontSize: 13,
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    Sign In
                  </button>
                </SignInButton>
                <SignUpButton mode="modal">
                  <button
                    style={{
                      background: "#d6b678",
                      color: "#0f172a",
                      border: "none",
                      borderRadius: 8,
                      padding: "8px 16px",
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    Sign Up
                  </button>
                </SignUpButton>
              </Show>
              <Show when="signed-in">
                <OrganizationSwitcher
                  hidePersonal
                  createOrganizationMode="modal"
                  appearance={{
                    elements: {
                      organizationSwitcherTrigger: {
                        backgroundColor: "#ffffff",
                        color: "#0f172a",
                        border: "1px solid #cbd5e1",
                      },
                    },
                  }}
                />
                <UserButton
                  appearance={{
                    elements: {
                      userButtonTrigger: {
                        backgroundColor: "#ffffff",
                        border: "1px solid #cbd5e1",
                      },
                    },
                  }}
                />
              </Show>
            </div>
          </header>

          <main>{children}</main>
        </body>
      </html>
    </ClerkProvider>
  );
}
