"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import AppTopNav from "@/components/AppTopNav";
import { useLanguage } from "@/components/LanguageProvider";
import { getErrorMessage, getMe } from "@/lib/api";
import { getAuthToken, setStoredUser } from "@/lib/auth-client";
import { withLocale } from "@/lib/i18n";

export default function DashboardRedirectPage() {
  const router = useRouter();
  const { locale } = useLanguage();
  const t = (enText: string, arText: string) => withLocale(locale, enText, arText);
  const [message, setMessage] = useState(withLocale(locale, "Checking your account...", "جاري التحقق من حسابك..."));

  useEffect(() => {
    let active = true;

    async function run() {
      const token = getAuthToken();
      if (!token) {
        router.replace("/signin");
        return;
      }

      try {
        const me = await getMe(token);
        setStoredUser(me);
        if (!active) {
          return;
        }

        if (me.role === "ADMIN" || me.is_staff) {
          router.replace("/admin/panel");
        } else if (me.role === "PROVIDER") {
          router.replace("/dashboard/provider");
        } else {
          router.replace("/dashboard/customer");
        }
      } catch (error) {
        if (!active) {
          return;
        }
        setMessage(getErrorMessage(error));
      }
    }

    void run();
    return () => {
      active = false;
    };
  }, [router]);

  return (
    <div className="app-shell">
      <AppTopNav links={[{ href: "/", label: "Home" }, { href: "/marketplace", label: "Marketplace" }, { href: "/signin", label: "Sign In" }]} />
      <main className="container page-container">
        <section className="panel">{message}</section>
      </main>
    </div>
  );
}
