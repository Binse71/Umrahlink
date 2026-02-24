"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import AppTopNav from "@/components/AppTopNav";
import { useLanguage } from "@/components/LanguageProvider";
import {
  AdminProviderProfile,
  ApiUser,
  Booking,
  Dispute,
  adminRefundBooking,
  approveAdminProvider,
  banAdminProvider,
  banAdminUser,
  decideDispute,
  getErrorMessage,
  getMe,
  listAdminProviders,
  listAdminUsers,
  listDisputes,
  listMyBookings,
  logout,
  moveDisputeToReview,
  rejectAdminProvider,
  releaseEscrow,
  unbanAdminUser
} from "@/lib/api";
import { clearAuth, getAuthToken, setStoredUser } from "@/lib/auth-client";
import { withLocale } from "@/lib/i18n";

function pretty(value: string) {
  return value.replaceAll("_", " ");
}

export default function AdminPanelPage() {
  const router = useRouter();
  const { locale } = useLanguage();
  const t = (enText: string, arText: string) => withLocale(locale, enText, arText);

  const [providers, setProviders] = useState<AdminProviderProfile[]>([]);
  const [users, setUsers] = useState<ApiUser[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [disputes, setDisputes] = useState<Dispute[]>([]);

  const [providerStatusFilter, setProviderStatusFilter] = useState("PENDING");
  const [userRoleFilter, setUserRoleFilter] = useState<"" | "CUSTOMER" | "PROVIDER" | "ADMIN">("");
  const [userBannedFilter, setUserBannedFilter] = useState<"" | 0 | 1>("");

  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadData() {
    setLoading(true);
    setError(null);

    try {
      const token = getAuthToken();
      if (!token) {
        router.replace("/signin");
        return;
      }

      const me = await getMe(token);
      if (!(me.role === "ADMIN" || me.is_staff)) {
        router.replace("/dashboard");
        return;
      }
      setStoredUser(me);

      const [providerResponse, usersResponse, bookingsResponse, disputesResponse] = await Promise.all([
        listAdminProviders(token, providerStatusFilter || undefined),
        listAdminUsers(token, {
          role: userRoleFilter || undefined,
          banned: userBannedFilter === "" ? undefined : userBannedFilter
        }),
        listMyBookings(token),
        listDisputes(token)
      ]);

      setProviders(providerResponse.results);
      setUsers(usersResponse.results);
      setBookings(bookingsResponse.results);
      setDisputes(disputesResponse.results);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providerStatusFilter, userRoleFilter, userBannedFilter]);

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

  async function runAction(actionKey: string, callback: () => Promise<void>) {
    setActionLoading(actionKey);
    setError(null);
    setMessage(null);
    try {
      await callback();
      await loadData();
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
          { href: "/notifications", label: "Notifications" }
        ]}
        actions={
          <button className="btn btn-ghost" onClick={handleSignOut}>
            {t("Sign Out", "تسجيل الخروج")}
          </button>
        }
      />

      <main className="container page-container">
        <section className="panel">
          <h1 className="page-title">{t("Admin Control Panel", "لوحة تحكم الإدارة")}</h1>
          <p className="page-sub">{t("Approve providers, moderate users, manage escrow, and resolve disputes.", "اعتمد المزودين وراقب المستخدمين وأدر الضمان المالي وحل النزاعات.")}</p>
          <div className="kpi-grid">
            <article>
              <strong>{providers.length}</strong>
              <span>{t("Provider Records", "سجلات المزودين")}</span>
            </article>
            <article>
              <strong>{users.length}</strong>
              <span>{t("User Records", "سجلات المستخدمين")}</span>
            </article>
            <article>
              <strong>{disputes.filter((item) => item.status !== "RESOLVED").length}</strong>
              <span>{t("Open Disputes", "النزاعات المفتوحة")}</span>
            </article>
          </div>
        </section>

        {loading ? <section className="panel">{t("Loading admin data...", "جاري تحميل بيانات الإدارة...")}</section> : null}
        {message ? <p className="notice success">{message}</p> : null}
        {error ? <p className="notice error">{error}</p> : null}

        {!loading ? (
          <>
            <section className="panel">
              <h2 className="section-title">{t("Provider Moderation", "إدارة المزودين")}</h2>
              <div className="field-grid">
                <label className="field">
                  {t("Status Filter", "فلتر الحالة")}
                  <select className="select" value={providerStatusFilter} onChange={(event) => setProviderStatusFilter(event.target.value)}>
                    <option value="PENDING">{t("Pending", "معلق")}</option>
                    <option value="APPROVED">{t("Approved", "معتمد")}</option>
                    <option value="REJECTED">{t("Rejected", "مرفوض")}</option>
                    <option value="SUSPENDED">{t("Suspended", "موقوف")}</option>
                  </select>
                </label>
              </div>

              <div className="cards-grid">
                {providers.length === 0 ? (
                  <article className="panel compact-card">{t("No providers for this status.", "لا يوجد مزودون بهذه الحالة.")}</article>
                ) : (
                  providers.map((provider) => (
                    <article key={provider.id} className="panel compact-card">
                      <div className="provider-inline-head">
                        {provider.profile_photo_url ? (
                          <img
                            src={provider.profile_photo_url}
                            alt={provider.professional_name}
                            className="provider-photo-sm"
                          />
                        ) : (
                          <div className="provider-photo-fallback provider-photo-sm">
                            {(provider.professional_name || "P").slice(0, 1).toUpperCase()}
                          </div>
                        )}
                        <p className="page-sub mini">{provider.user.username}</p>
                      </div>

                      <h3 className="section-title">{provider.professional_name}</h3>
                      <p className="page-sub mini">{provider.user.email}</p>
                      <div className="meta-row">
                        <span className={`status-pill status-${provider.verification_status.toLowerCase()}`}>{pretty(provider.verification_status)}</span>
                        <span>{t("City", "المدينة")}: {provider.city || "-"}</span>
                        <span>{t("Years", "سنوات")}: {provider.years_experience}</span>
                      </div>
                      <div className="card-actions">
                        {provider.verification_status !== "APPROVED" ? (
                          <button
                            className="btn btn-primary"
                            onClick={() =>
                              void runAction(`provider-approve-${provider.id}`, async () => {
                                const token = getAuthToken();
                                if (!token) {
                                  throw new Error(t("Please sign in first.", "يرجى تسجيل الدخول أولاً."));
                                }
                                await approveAdminProvider(token, provider.id);
                                setMessage(t("Provider approved.", "تم اعتماد المزود."));
                              })
                            }
                            disabled={actionLoading === `provider-approve-${provider.id}`}
                          >
                            {t("Approve", "اعتماد")}
                          </button>
                        ) : null}

                        <button
                          className="btn btn-outline"
                          onClick={() =>
                            void runAction(`provider-reject-${provider.id}`, async () => {
                              const reason = window.prompt(t("Optional rejection reason:", "سبب الرفض (اختياري):"), "") ?? "";
                              const token = getAuthToken();
                              if (!token) {
                                throw new Error(t("Please sign in first.", "يرجى تسجيل الدخول أولاً."));
                              }
                              await rejectAdminProvider(token, provider.id, reason);
                              setMessage(t("Provider rejected.", "تم رفض المزود."));
                            })
                          }
                          disabled={actionLoading === `provider-reject-${provider.id}`}
                        >
                          {t("Reject", "رفض")}
                        </button>

                        <button
                          className="btn btn-ghost"
                          onClick={() =>
                            void runAction(`provider-ban-${provider.id}`, async () => {
                              const token = getAuthToken();
                              if (!token) {
                                throw new Error(t("Please sign in first.", "يرجى تسجيل الدخول أولاً."));
                              }
                              await banAdminProvider(token, provider.id);
                              setMessage(t("Provider account banned.", "تم حظر حساب المزود."));
                            })
                          }
                          disabled={actionLoading === `provider-ban-${provider.id}`}
                        >
                          {t("Ban User", "حظر المستخدم")}
                        </button>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </section>

            <section className="panel">
              <h2 className="section-title">{t("User Moderation", "إدارة المستخدمين")}</h2>
              <div className="field-grid">
                <label className="field">
                  {t("Role Filter", "فلتر الدور")}
                  <select className="select" value={userRoleFilter} onChange={(event) => setUserRoleFilter(event.target.value as "" | "CUSTOMER" | "PROVIDER" | "ADMIN")}>
                    <option value="">{t("All", "الكل")}</option>
                    <option value="CUSTOMER">{t("Customer", "عميل")}</option>
                    <option value="PROVIDER">{t("Provider", "مزود")}</option>
                    <option value="ADMIN">{t("Admin", "إدارة")}</option>
                  </select>
                </label>
                <label className="field">
                  {t("Ban Filter", "فلتر الحظر")}
                  <select className="select" value={String(userBannedFilter)} onChange={(event) => {
                    if (event.target.value === "0") {
                      setUserBannedFilter(0);
                    } else if (event.target.value === "1") {
                      setUserBannedFilter(1);
                    } else {
                      setUserBannedFilter("");
                    }
                  }}>
                    <option value="">{t("All", "الكل")}</option>
                    <option value="0">{t("Not Banned", "غير محظور")}</option>
                    <option value="1">{t("Banned", "محظور")}</option>
                  </select>
                </label>
              </div>

              <div className="cards-grid">
                {users.length === 0 ? (
                  <article className="panel compact-card">{t("No users found.", "لا يوجد مستخدمون.")}</article>
                ) : (
                  users.map((user) => (
                    <article key={user.id} className="panel compact-card">
                      <h3 className="section-title">{user.username}</h3>
                      <p className="page-sub mini">{user.email}</p>
                      <div className="meta-row">
                        <span className="status-pill">{user.role}</span>
                        <span className={`status-pill ${user.is_banned ? "status-cancelled" : "status-accepted"}`}>
                          {user.is_banned ? t("Banned", "محظور") : t("Active", "نشط")}
                        </span>
                      </div>
                      <div className="card-actions">
                        {user.is_banned ? (
                          <button
                            className="btn btn-outline"
                            onClick={() =>
                              void runAction(`user-unban-${user.id}`, async () => {
                                const token = getAuthToken();
                                if (!token) {
                                  throw new Error(t("Please sign in first.", "يرجى تسجيل الدخول أولاً."));
                                }
                                await unbanAdminUser(token, user.id);
                                setMessage(t("User unbanned.", "تم فك حظر المستخدم."));
                              })
                            }
                            disabled={actionLoading === `user-unban-${user.id}`}
                          >
                            {t("Unban", "فك الحظر")}
                          </button>
                        ) : (
                          <button
                            className="btn btn-ghost"
                            onClick={() =>
                              void runAction(`user-ban-${user.id}`, async () => {
                                const token = getAuthToken();
                                if (!token) {
                                  throw new Error(t("Please sign in first.", "يرجى تسجيل الدخول أولاً."));
                                }
                                await banAdminUser(token, user.id);
                                setMessage(t("User banned.", "تم حظر المستخدم."));
                              })
                            }
                            disabled={actionLoading === `user-ban-${user.id}`}
                          >
                            {t("Ban", "حظر")}
                          </button>
                        )}
                      </div>
                    </article>
                  ))
                )}
              </div>
            </section>

            <section className="panel">
              <h2 className="section-title">{t("Booking Escrow Controls", "عناصر تحكم ضمان الحجوزات")}</h2>
              <div className="cards-grid bookings-grid">
                {bookings.length === 0 ? (
                  <article className="panel compact-card">{t("No bookings found.", "لا توجد حجوزات.")}</article>
                ) : (
                  bookings.slice(0, 20).map((booking) => (
                    <article key={booking.id} className="panel compact-card">
                      <h3 className="section-title">{booking.service_title}</h3>
                      <p className="page-sub mini">{t("Ref", "المرجع")}: {booking.reference}</p>
                      <div className="meta-row">
                        <span className={`status-pill status-${booking.status.toLowerCase()}`}>{pretty(booking.status)}</span>
                        <span className={`status-pill status-${booking.escrow_status.toLowerCase()}`}>{pretty(booking.escrow_status)}</span>
                      </div>
                      <p className="page-sub mini">{booking.total_amount} {booking.service_currency}</p>
                      <div className="card-actions">
                        <button
                          className="btn btn-outline"
                          onClick={() =>
                            void runAction(`booking-release-${booking.id}`, async () => {
                              const token = getAuthToken();
                              if (!token) {
                                throw new Error(t("Please sign in first.", "يرجى تسجيل الدخول أولاً."));
                              }
                              await releaseEscrow(token, booking.id);
                              setMessage(t("Escrow released.", "تم الإفراج عن الضمان."));
                            })
                          }
                          disabled={
                            actionLoading === `booking-release-${booking.id}` ||
                            booking.status !== "COMPLETED" ||
                            !["PAID", "HELD"].includes(booking.escrow_status)
                          }
                        >
                          {t("Release Escrow", "إفراج الضمان")}
                        </button>
                        <button
                          className="btn btn-ghost"
                          onClick={() =>
                            void runAction(`booking-refund-${booking.id}`, async () => {
                              const token = getAuthToken();
                              if (!token) {
                                throw new Error(t("Please sign in first.", "يرجى تسجيل الدخول أولاً."));
                              }
                              await adminRefundBooking(token, booking.id);
                              setMessage(t("Manual refund issued.", "تم إصدار استرداد يدوي."));
                            })
                          }
                          disabled={actionLoading === `booking-refund-${booking.id}` || booking.escrow_status === "REFUNDED"}
                        >
                          {t("Issue Refund", "إصدار استرداد")}
                        </button>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </section>

            <section className="panel">
              <h2 className="section-title">{t("Dispute Resolution", "حل النزاعات")}</h2>
              <div className="cards-grid">
                {disputes.length === 0 ? (
                  <article className="panel compact-card">{t("No disputes found.", "لا توجد نزاعات.")}</article>
                ) : (
                  disputes.slice(0, 20).map((dispute) => (
                    <article key={dispute.id} className="panel compact-card">
                      <h3 className="section-title">{t("Case", "الحالة")} #{dispute.id}</h3>
                      <p className="page-sub mini">{t("Booking", "الحجز")}: {dispute.booking_reference}</p>
                      <div className="meta-row">
                        <span className={`status-pill status-${dispute.status.toLowerCase()}`}>{pretty(dispute.status)}</span>
                        <span className="status-pill">{pretty(dispute.requested_resolution)}</span>
                      </div>
                      <p className="page-sub mini">{dispute.reason}</p>
                      <div className="card-actions">
                        <button
                          className="btn btn-outline"
                          onClick={() =>
                            void runAction(`dispute-review-${dispute.id}`, async () => {
                              const token = getAuthToken();
                              if (!token) {
                                throw new Error(t("Please sign in first.", "يرجى تسجيل الدخول أولاً."));
                              }
                              await moveDisputeToReview(token, dispute.id);
                              setMessage(t("Dispute moved to review.", "تم نقل النزاع للمراجعة."));
                            })
                          }
                          disabled={actionLoading === `dispute-review-${dispute.id}` || dispute.status === "RESOLVED"}
                        >
                          {t("Move to Review", "نقل للمراجعة")}
                        </button>
                        <button
                          className="btn btn-primary"
                          onClick={() =>
                            void runAction(`dispute-refund-${dispute.id}`, async () => {
                              const token = getAuthToken();
                              if (!token) {
                                throw new Error(t("Please sign in first.", "يرجى تسجيل الدخول أولاً."));
                              }
                              const note = window.prompt(t("Optional admin note:", "ملاحظة الإدارة (اختياري):"), "") ?? "";
                              await decideDispute(token, dispute.id, { decision: "APPROVE_REFUND", note });
                              setMessage(t("Dispute decided: refund.", "تم إصدار القرار: استرداد."));
                            })
                          }
                          disabled={actionLoading === `dispute-refund-${dispute.id}` || dispute.status === "RESOLVED"}
                        >
                          {t("Approve Refund", "اعتماد الاسترداد")}
                        </button>
                        <button
                          className="btn btn-ghost"
                          onClick={() =>
                            void runAction(`dispute-release-${dispute.id}`, async () => {
                              const token = getAuthToken();
                              if (!token) {
                                throw new Error(t("Please sign in first.", "يرجى تسجيل الدخول أولاً."));
                              }
                              const note = window.prompt(t("Optional admin note:", "ملاحظة الإدارة (اختياري):"), "") ?? "";
                              await decideDispute(token, dispute.id, { decision: "APPROVE_RELEASE", note });
                              setMessage(t("Dispute decided: release escrow.", "تم إصدار القرار: إفراج الضمان."));
                            })
                          }
                          disabled={actionLoading === `dispute-release-${dispute.id}` || dispute.status === "RESOLVED"}
                        >
                          {t("Approve Release", "اعتماد الإفراج")}
                        </button>
                        <button
                          className="btn btn-outline"
                          onClick={() =>
                            void runAction(`dispute-partial-${dispute.id}`, async () => {
                              const token = getAuthToken();
                              if (!token) {
                                throw new Error(t("Please sign in first.", "يرجى تسجيل الدخول أولاً."));
                              }
                              const note = window.prompt(t("Admin note required for partial remedy:", "ملاحظة الإدارة للحل الجزئي:"), "") ?? "";
                              await decideDispute(token, dispute.id, { decision: "PARTIAL_REMEDY", note });
                              setMessage(t("Dispute decided: partial remedy.", "تم إصدار القرار: حل جزئي."));
                            })
                          }
                          disabled={actionLoading === `dispute-partial-${dispute.id}` || dispute.status === "RESOLVED"}
                        >
                          {t("Partial Remedy", "حل جزئي")}
                        </button>
                        <button
                          className="btn btn-ghost"
                          onClick={() =>
                            void runAction(`dispute-reject-${dispute.id}`, async () => {
                              const token = getAuthToken();
                              if (!token) {
                                throw new Error(t("Please sign in first.", "يرجى تسجيل الدخول أولاً."));
                              }
                              const note = window.prompt(t("Optional rejection note:", "ملاحظة الرفض (اختياري):"), "") ?? "";
                              await decideDispute(token, dispute.id, { decision: "REJECT_CLAIM", note });
                              setMessage(t("Dispute claim rejected.", "تم رفض مطالبة النزاع."));
                            })
                          }
                          disabled={actionLoading === `dispute-reject-${dispute.id}` || dispute.status === "RESOLVED"}
                        >
                          {t("Reject Claim", "رفض المطالبة")}
                        </button>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </section>
          </>
        ) : null}
      </main>
    </div>
  );
}
