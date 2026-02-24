"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import AppTopNav from "@/components/AppTopNav";
import { useLanguage } from "@/components/LanguageProvider";
import {
  NotificationItem,
  getErrorMessage,
  getMe,
  listNotifications,
  logout,
  markAllNotificationsRead,
  markNotificationRead
} from "@/lib/api";
import { clearAuth, getAuthToken, setStoredUser } from "@/lib/auth-client";
import { withLocale } from "@/lib/i18n";

function pretty(value: string) {
  return value.replaceAll("_", " ");
}

export default function NotificationsPage() {
  const router = useRouter();
  const { locale } = useLanguage();
  const t = (enText: string, arText: string) => withLocale(locale, enText, arText);

  const [role, setRole] = useState<"CUSTOMER" | "PROVIDER" | "ADMIN" | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadNotifications() {
    setLoading(true);
    setError(null);

    try {
      const token = getAuthToken();
      if (!token) {
        router.replace("/signin");
        return;
      }
      const [me, notificationResponse] = await Promise.all([
        getMe(token),
        listNotifications(token, unreadOnly ? { unread: 1 } : {})
      ]);
      setStoredUser(me);
      setRole(me.role);
      setNotifications(notificationResponse.results);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadNotifications();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unreadOnly]);

  async function handleSignOut() {
    try {
      const token = getAuthToken();
      if (token) {
        await logout(token);
      }
    } finally {
      clearAuth();
      router.replace("/signin");
    }
  }

  async function handleMarkRead(notificationId: number) {
    setActionLoading(`one-${notificationId}`);
    setError(null);
    setMessage(null);
    try {
      const token = getAuthToken();
      if (!token) {
        throw new Error(t("Please sign in first.", "يرجى تسجيل الدخول أولاً."));
      }
      await markNotificationRead(token, notificationId);
      setMessage(t("Notification marked as read.", "تم تعليم الإشعار كمقروء."));
      await loadNotifications();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setActionLoading(null);
    }
  }

  async function handleMarkAllRead() {
    setActionLoading("all");
    setError(null);
    setMessage(null);
    try {
      const token = getAuthToken();
      if (!token) {
        throw new Error(t("Please sign in first.", "يرجى تسجيل الدخول أولاً."));
      }
      const response = await markAllNotificationsRead(token);
      setMessage(t(`${response.updated} notifications marked as read.`, `تم تعليم ${response.updated} إشعار كمقروء.`));
      await loadNotifications();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <div className="app-shell">
      <AppTopNav
        links={[
          { href: "/", label: "Home" },
          { href: "/dashboard", label: "Dashboard" },
          { href: "/bookings", label: "Bookings" },
          { href: "/messages", label: "Messages" }
        ]}
        actions={
          <button className="btn btn-ghost" onClick={handleSignOut}>
            {t("Sign Out", "تسجيل الخروج")}
          </button>
        }
      />

      <main className="container page-container">
        <section className="panel">
          <h1 className="page-title">{t("Notifications", "الإشعارات")}</h1>
          <p className="page-sub">{t("In-app alerts for bookings, disputes, messages, and admin updates.", "تنبيهات داخل التطبيق للحجوزات والنزاعات والرسائل وتحديثات الإدارة.")}</p>
          <div className="quick-links">
            <button className={`btn ${unreadOnly ? "btn-primary" : "btn-outline"}`} onClick={() => setUnreadOnly((previous) => !previous)}>
              {unreadOnly ? t("Show All", "عرض الكل") : t("Unread Only", "غير المقروء فقط")}
            </button>
            <button className="btn btn-primary" onClick={() => void handleMarkAllRead()} disabled={actionLoading === "all"}>
              {actionLoading === "all" ? t("Updating...", "جارٍ التحديث...") : t("Mark All as Read", "تعليم الكل كمقروء")}
            </button>
            {role === "PROVIDER" ? (
              <Link href="/dashboard/provider/manage" className="btn btn-outline">{t("Provider Tools", "أدوات المزود")}</Link>
            ) : null}
            {role === "ADMIN" ? (
              <Link href="/admin/panel" className="btn btn-outline">{t("Admin Panel", "لوحة الإدارة")}</Link>
            ) : null}
          </div>
        </section>

        {loading ? <section className="panel">{t("Loading notifications...", "جاري تحميل الإشعارات...")}</section> : null}
        {message ? <p className="notice success">{message}</p> : null}
        {error ? <p className="notice error">{error}</p> : null}

        {!loading ? (
          <section className="cards-grid">
            {notifications.length === 0 ? (
              <article className="panel compact-card">{t("No notifications found.", "لا توجد إشعارات.")}</article>
            ) : (
              notifications.map((item) => (
                <article key={item.id} className="panel compact-card">
                  <div className="meta-row">
                    <span className={`status-pill ${item.is_read ? "status-unpaid" : "status-accepted"}`}>
                      {item.is_read ? t("Read", "مقروء") : t("Unread", "غير مقروء")}
                    </span>
                    <span className="status-pill">{pretty(item.event_type)}</span>
                  </div>
                  <h3 className="section-title">{item.title}</h3>
                  <p className="page-sub mini">{item.body}</p>
                  <p className="page-sub mini">
                    {t("Actor", "المنفذ")}: {item.actor_name || t("System", "النظام")} • {new Date(item.created_at).toLocaleString()}
                  </p>
                  {!item.is_read ? (
                    <button className="btn btn-outline" onClick={() => void handleMarkRead(item.id)} disabled={actionLoading === `one-${item.id}`}>
                      {actionLoading === `one-${item.id}` ? t("Updating...", "جارٍ التحديث...") : t("Mark as Read", "تعليم كمقروء")}
                    </button>
                  ) : null}
                </article>
              ))
            )}
          </section>
        ) : null}
      </main>
    </div>
  );
}

