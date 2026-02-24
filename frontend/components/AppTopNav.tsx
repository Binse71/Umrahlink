"use client";

import Image from "next/image";
import Link from "next/link";
import { ReactNode } from "react";

import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useLanguage } from "@/components/LanguageProvider";
import { translateUiLabel } from "@/lib/i18n";

type NavLink = {
  href: string;
  label: string;
};

export default function AppTopNav({
  links,
  actions
}: {
  links: NavLink[];
  actions?: ReactNode;
}) {
  const { locale } = useLanguage();

  return (
    <header className="container simple-topbar">
      <Link href="/" className="brand brand-header" aria-label="Umrah Link Home">
        <Image src="/umrah-link-logo.png" alt="Umrah Link logo" width={660} height={660} className="brand-logo brand-logo-header" />
      </Link>

      <nav className="inline-links">
        {links.map((link) => (
          <Link key={link.href + link.label} href={link.href}>
            {translateUiLabel(link.label, locale)}
          </Link>
        ))}
      </nav>

      <div className="inline-actions">
        {actions}
        <LanguageSwitcher />
      </div>
    </header>
  );
}
