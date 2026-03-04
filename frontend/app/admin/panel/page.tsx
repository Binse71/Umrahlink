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
  PayoutLedger,
  adminRefundBooking,
  approvePayout,
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
  listPayoutLedger,
  markPayoutFailed,
  markPayoutPaid,
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

type DisputeDecisionType = "APPROVE_REFUND" | "APPROVE_RELEASE" | "PARTIAL_REMEDY" | "REJECT_CLAIM";

interface DisputeDecisionDialogState {
  disputeId: number;
  decision: DisputeDecisionType;
  requireNote: boolean;
  title: string;
  successMessage: string;
}

export default function AdminPanelPage() {
  const router = useRouter();
  const { locale } = useLanguage();
  const t = (enText: string, arText: string) => withLocale(locale, enText, arText);

  const [providers, setProviders] = useState<AdminProviderProfile[]>([]);
  const [users, setUsers] = useState<ApiUser[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [payouts, setPayouts] = useState<PayoutLedger[]>([]);

  const [providerStatusFilter, setProviderStatusFilter] = useState("PENDING");
  const [userRoleFilter, setUserRoleFilter] = useState<"" | "CUSTOMER" | "PROVIDER" | "ADMIN">("");
  const [userBannedFilter, setUserBannedFilter] = useState<"" | 0 | 1>("");

  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sectionErrors, setSectionErrors] = useState<string[]>([]);
  const [decisionDialog, setDecisionDialog] = useState<DisputeDecisionDialogState | null>(null);
  const [decisionNote, setDecisionNote] = useState("");

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

      const [providerResponse, usersResponse, bookingsResponse, disputesResponse, payoutResponse] = await Promise.allSettled([
        listAdminProviders(token, providerStatusFilter || undefined),
        listAdminUsers(token, {
          role: userRoleFilter || undefined,
          banned: userBannedFilter === "" ? undefined : userBannedFilter
        }),
        listMyBookings(token),
        listDisputes(token),
        listPayoutLedger(token)
      ]);

      const failedSections: string[] = [];

      if (providerResponse.status === "fulfilled") {
        setProviders(providerResponse.value.results);
      } else {
        setProviders([]);
        failedSections.push(t("Provider Moderation", "إدارة المزودين"));
      }

      if (usersResponse.status === "fulfilled") {
        setUsers(usersResponse.value.results);
      } else {
        setUsers([]);
        failedSections.push(t("User Moderation", "إدارة المستخدمين"));
      }

      if (bookingsResponse.status === "fulfilled") {
        setBookings(bookingsResponse.value.results);
      } else {
        setBookings([]);
        failedSections.push(t("Booking Escrow Controls", "عناصر تحكم ضمان الحجوزات"));
      }

      if (disputesResponse.status === "fulfilled") {
        setDisputes(disputesResponse.value.results);
      } else {
        setDisputes([]);
        failedSections.push(t("Dispute Resolution", "حل النزاعات"));
      }

      if (payoutResponse.status === "fulfilled") {
        setPayouts(payoutResponse.value.results);
      } else {
        setPayouts([]);
        failedSections.push(t("Provider Payout Queue", "طابور سحوبات المزودين"));
      }

      setSectionErrors(failedSections);
      setError(null);
    } catch (err) {
      setError(getErrorMessage(err));
      setSectionErrors([]);
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

  const decisionActionKey = decisionDialog
    ? `dispute-decision-${decisionDialog.disputeId}-${decisionDialog.decision}`
    : null;

  function openDecisionDialog(config: DisputeDecisionDialogState) {
    setDecisionDialog(config);
    setDecisionNote("");
    setError(null);
  }

  function closeDecisionDialog() {
    if (decisionActionKey && actionLoading === decisionActionKey) {
      return;
    }
    setDecisionDialog(null);
    setDecisionNote("");
  }

  async function submitDecisionDialog() {
    if (!decisionDialog || !decisionActionKey) {
      return;
    }
    const trimmedNote = decisionNote.trim();
    if (decisionDialog.requireNote && !trimmedNote) {
      setError(t("Admin note is required for this decision.", "مطلوب ملاحظة من الإدارة لهذا القرار."));
      return;
    }

    await runAction(decisionActionKey, async () => {
      const token = getAuthToken();
      if (!token) {
        throw new Error(t("Please sign in first.", "يرجى تسجيل الدخول أولاً."));
      }
      await decideDispute(token, decisionDialog.disputeId, {
        decision: decisionDialog.decision,
        note: trimmedNote || undefined
      });
      setMessage(decisionDialog.successMessage);
      setDecisionDialog(null);
      setDecisionNote("");
    });
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
            <article>
              <strong>{payouts.filter((item) => item.status !== "PAID").length}</strong>
              <span>{t("Open Payouts", "سحوبات مفتوحة")}</span>
            </article>
          </div>
        </section>

        {loading ? <section className="panel">{t("Loading admin data...", "جاري تحميل بيانات الإدارة...")}</section> : null}
        {message ? <p className="notice success">{message}</p> : null}
        {error ? <p className="notice error">{error}</p> : null}
        {!error && sectionErrors.length > 0 ? (
          <p className="notice error">
            {t("Some sections failed to load:", "تعذر تحميل بعض الأقسام:")} {sectionErrors.join(", ")}
          </p>
        ) : null}

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
                      <p className="page-sub mini">
                        {t("Payout Method", "طريقة السحب")}: {provider.payout_method ? pretty(provider.payout_method) : t("Not set", "غير محدد")}
                      </p>
                      {provider.payout_method && Object.keys(provider.payout_details || {}).length > 0 ? (
                        <p className="page-sub mini">
                          {t("Payout Details", "تفاصيل السحب")}: {JSON.stringify(provider.payout_details)}
                        </p>
                      ) : null}
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
                      <p className="page-sub mini">
                        {t("Provider completion", "تأكيد المزود")}:{" "}
                        {booking.provider_completed_confirmed_at ? t("Confirmed", "مؤكد") : t("Pending", "قيد الانتظار")}
                      </p>
                      <p className="page-sub mini">
                        {t("Customer completion", "تأكيد العميل")}:{" "}
                        {booking.customer_completed_confirmed_at ? t("Confirmed", "مؤكد") : t("Pending", "قيد الانتظار")}
                      </p>
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
                            !["PAID", "HELD"].includes(booking.escrow_status) ||
                            !booking.ready_for_escrow_release
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
              <h2 className="section-title">{t("Provider Payout Queue", "طابور سحوبات المزودين")}</h2>
              <div className="cards-grid">
                {payouts.length === 0 ? (
                  <article className="panel compact-card">{t("No payouts found.", "لا توجد سجلات سحب.")}</article>
                ) : (
                  payouts.slice(0, 30).map((payout) => (
                    <article key={payout.id} className="panel compact-card">
                      <h3 className="section-title">{t("Payout", "سحب")} #{payout.id}</h3>
                      <p className="page-sub mini">{t("Provider", "المزود")}: {payout.provider_name}</p>
                      <p className="page-sub mini">{t("Booking Ref", "مرجع الحجز")}: {payout.booking_reference}</p>
                      <div className="meta-row">
                        <span className={`status-pill status-${payout.status.toLowerCase()}`}>{pretty(payout.status)}</span>
                        <span className="status-pill">{payout.payout_method ? pretty(payout.payout_method) : t("Not set", "غير محدد")}</span>
                      </div>
                      <p className="page-sub mini">{t("Gross", "الإجمالي")}: {payout.gross_amount}</p>
                      <p className="page-sub mini">{t("Platform Fee", "رسوم المنصة")}: {payout.platform_fee}</p>
                      <p className="page-sub mini"><strong>{t("Net", "الصافي")}: {payout.net_amount}</strong></p>
                      {Object.keys(payout.payout_details_snapshot || {}).length > 0 ? (
                        <p className="page-sub mini">
                          {t("Destination", "وجهة الدفع")}: {JSON.stringify(payout.payout_details_snapshot)}
                        </p>
                      ) : null}
                      {payout.approved_at ? (
                        <p className="page-sub mini">
                          {t("Approved", "تمت الموافقة")}: {new Date(payout.approved_at).toLocaleString()}
                        </p>
                      ) : null}
                      {payout.paid_at ? (
                        <p className="page-sub mini">
                          {t("Paid", "تم الدفع")}: {new Date(payout.paid_at).toLocaleString()}
                        </p>
                      ) : null}
                      {payout.admin_note ? <p className="page-sub mini">{t("Note", "ملاحظة")}: {payout.admin_note}</p> : null}
                      <div className="card-actions">
                        <button
                          className="btn btn-outline"
                          onClick={() =>
                            void runAction(`payout-approve-${payout.id}`, async () => {
                              const token = getAuthToken();
                              if (!token) {
                                throw new Error(t("Please sign in first.", "يرجى تسجيل الدخول أولاً."));
                              }
                              const note = window.prompt(t("Approval note (optional):", "ملاحظة الموافقة (اختيارية):"), "") ?? "";
                              await approvePayout(token, payout.id, note);
                              setMessage(t("Payout approved.", "تمت الموافقة على السحب."));
                            })
                          }
                          disabled={actionLoading === `payout-approve-${payout.id}` || !["PENDING", "FAILED"].includes(payout.status)}
                        >
                          {t("Approve", "موافقة")}
                        </button>
                        <button
                          className="btn btn-primary"
                          onClick={() =>
                            void runAction(`payout-paid-${payout.id}`, async () => {
                              const token = getAuthToken();
                              if (!token) {
                                throw new Error(t("Please sign in first.", "يرجى تسجيل الدخول أولاً."));
                              }
                              const note = window.prompt(t("Payout note (optional):", "ملاحظة الدفع (اختيارية):"), "") ?? "";
                              await markPayoutPaid(token, payout.id, note);
                              setMessage(t("Payout marked as paid.", "تم تعليم السحب كمدفوع."));
                            })
                          }
                          disabled={actionLoading === `payout-paid-${payout.id}` || payout.status !== "APPROVED"}
                        >
                          {t("Mark Paid", "تعليم كمدفوع")}
                        </button>
                        <button
                          className="btn btn-ghost"
                          onClick={() =>
                            void runAction(`payout-failed-${payout.id}`, async () => {
                              const token = getAuthToken();
                              if (!token) {
                                throw new Error(t("Please sign in first.", "يرجى تسجيل الدخول أولاً."));
                              }
                              const note = window.prompt(t("Failure note:", "ملاحظة الفشل:"), "") ?? "";
                              await markPayoutFailed(token, payout.id, note);
                              setMessage(t("Payout marked as failed.", "تم تعليم السحب كفاشل."));
                            })
                          }
                          disabled={actionLoading === `payout-failed-${payout.id}` || payout.status === "PAID"}
                        >
                          {t("Mark Failed", "تعليم كفاشل")}
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
                            openDecisionDialog({
                              disputeId: dispute.id,
                              decision: "APPROVE_REFUND",
                              requireNote: false,
                              title: t("Approve refund", "اعتماد الاسترداد"),
                              successMessage: t("Dispute decided: refund.", "تم إصدار القرار: استرداد.")
                            })
                          }
                          disabled={actionLoading === `dispute-decision-${dispute.id}-APPROVE_REFUND` || dispute.status === "RESOLVED"}
                        >
                          {t("Approve Refund", "اعتماد الاسترداد")}
                        </button>
                        <button
                          className="btn btn-ghost"
                          onClick={() =>
                            openDecisionDialog({
                              disputeId: dispute.id,
                              decision: "APPROVE_RELEASE",
                              requireNote: false,
                              title: t("Approve release", "اعتماد الإفراج"),
                              successMessage: t("Dispute decided: release escrow.", "تم إصدار القرار: إفراج الضمان.")
                            })
                          }
                          disabled={actionLoading === `dispute-decision-${dispute.id}-APPROVE_RELEASE` || dispute.status === "RESOLVED"}
                        >
                          {t("Approve Release", "اعتماد الإفراج")}
                        </button>
                        <button
                          className="btn btn-outline"
                          onClick={() =>
                            openDecisionDialog({
                              disputeId: dispute.id,
                              decision: "PARTIAL_REMEDY",
                              requireNote: true,
                              title: t("Partial remedy decision", "قرار الحل الجزئي"),
                              successMessage: t("Dispute decided: partial remedy.", "تم إصدار القرار: حل جزئي.")
                            })
                          }
                          disabled={actionLoading === `dispute-decision-${dispute.id}-PARTIAL_REMEDY` || dispute.status === "RESOLVED"}
                        >
                          {t("Partial Remedy", "حل جزئي")}
                        </button>
                        <button
                          className="btn btn-ghost"
                          onClick={() =>
                            openDecisionDialog({
                              disputeId: dispute.id,
                              decision: "REJECT_CLAIM",
                              requireNote: false,
                              title: t("Reject dispute claim", "رفض مطالبة النزاع"),
                              successMessage: t("Dispute claim rejected.", "تم رفض مطالبة النزاع.")
                            })
                          }
                          disabled={actionLoading === `dispute-decision-${dispute.id}-REJECT_CLAIM` || dispute.status === "RESOLVED"}
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

      {decisionDialog ? (
        <div className="admin-modal-overlay" role="presentation">
          <section className="admin-modal panel" role="dialog" aria-modal="true" aria-labelledby="dispute-decision-title">
            <h3 id="dispute-decision-title" className="section-title">
              {decisionDialog.title}
            </h3>
            <p className="page-sub mini">
              {t("Dispute", "النزاع")} #{decisionDialog.disputeId}
            </p>
            <label className="field">
              {decisionDialog.requireNote
                ? t("Admin Note (required)", "ملاحظة الإدارة (مطلوبة)")
                : t("Admin Note (optional)", "ملاحظة الإدارة (اختيارية)")}
              <textarea
                className="textarea"
                rows={4}
                value={decisionNote}
                onChange={(event) => setDecisionNote(event.target.value)}
                placeholder={t("Write the internal decision note.", "اكتب ملاحظة قرار الإدارة.")}
              />
            </label>
            <div className="admin-modal-actions">
              <button className="btn btn-ghost" onClick={closeDecisionDialog} disabled={actionLoading === decisionActionKey}>
                {t("Cancel", "إلغاء")}
              </button>
              <button
                className="btn btn-primary"
                onClick={() => void submitDecisionDialog()}
                disabled={
                  actionLoading === decisionActionKey ||
                  (decisionDialog.requireNote && !decisionNote.trim())
                }
              >
                {actionLoading === decisionActionKey ? t("Saving...", "جارٍ الحفظ...") : t("Confirm Decision", "تأكيد القرار")}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
