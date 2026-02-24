"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";

import AppTopNav from "@/components/AppTopNav";
import { useLanguage } from "@/components/LanguageProvider";
import {
  BookingThread,
  ChatMessage,
  getErrorMessage,
  getMe,
  getThread,
  listMessages,
  logout,
  markMessageRead,
  sendMessage
} from "@/lib/api";
import { clearAuth, getAuthToken, setStoredUser } from "@/lib/auth-client";
import { withLocale } from "@/lib/i18n";

export default function ThreadPage() {
  const params = useParams<{ threadId: string }>();
  const router = useRouter();
  const { locale } = useLanguage();
  const t = (enText: string, arText: string) => withLocale(locale, enText, arText);
  const threadId = useMemo(() => Number.parseInt(params.threadId ?? "", 10), [params.threadId]);

  const [thread, setThread] = useState<BookingThread | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [viewerId, setViewerId] = useState<number | null>(null);
  const [draft, setDraft] = useState("");

  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadThreadData(silent = false) {
      if (!silent) {
        setLoading(true);
      }

      try {
        if (Number.isNaN(threadId)) {
          throw new Error(withLocale(locale, "Invalid thread id.", "معرّف المحادثة غير صالح."));
        }

        const token = getAuthToken();
        if (!token) {
          router.replace("/signin");
          return;
        }

        const [me, threadResponse, messageResponse] = await Promise.all([
          getMe(token),
          getThread(token, threadId),
          listMessages(token, threadId)
        ]);

        if (!active) {
          return;
        }

        setStoredUser(me);
        setViewerId(me.id);
        setThread(threadResponse);
        setMessages(messageResponse.results);

        const unreadIncoming = messageResponse.results.filter(
          (item) => item.sender !== me.id && item.read_at === null
        );

        if (unreadIncoming.length > 0) {
          await Promise.all(unreadIncoming.map((item) => markMessageRead(token, item.id)));
          const refreshed = await listMessages(token, threadId);
          if (active) {
            setMessages(refreshed.results);
          }
        }
      } catch (err) {
        if (!silent && active) {
          setError(getErrorMessage(err));
        }
      } finally {
        if (!silent && active) {
          setLoading(false);
        }
      }
    }

    setError(null);
    void loadThreadData();

    const interval = window.setInterval(() => {
      void loadThreadData(true);
    }, 8000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [locale, router, threadId]);

  async function handleSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.trim() || Number.isNaN(threadId)) {
      return;
    }

    setSending(true);
    setError(null);

    try {
      const token = getAuthToken();
      if (!token) {
        throw new Error(t("Please sign in first.", "يرجى تسجيل الدخول أولاً."));
      }

      await sendMessage(token, {
        thread: threadId,
        body: draft.trim()
      });

      setDraft("");
      const refreshed = await listMessages(token, threadId);
      setMessages(refreshed.results);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSending(false);
    }
  }

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

  return (
    <div className="app-shell">
      <AppTopNav
        links={[
          { href: "/", label: "Home" },
          { href: "/messages", label: "Threads" },
          { href: thread ? `/bookings/${thread.booking}` : "/bookings", label: "Booking" },
          { href: "/notifications", label: "Notifications" }
        ]}
        actions={
          <button className="btn btn-ghost" onClick={handleSignOut}>
            {t("Sign Out", "تسجيل الخروج")}
          </button>
        }
      />

      <main className="container page-container narrow">
        {loading ? <section className="panel">{t("Loading conversation...", "جاري تحميل المحادثة...")}</section> : null}
        {error ? <p className="notice error">{error}</p> : null}

        {!loading && !error && thread ? (
          <section className="panel chat-shell">
            <div className="chat-head">
              <h1 className="page-title">{t("Booking Chat", "محادثة الحجز")}</h1>
              <p className="page-sub mini">{t("Booking ref", "مرجع الحجز")}: {thread.booking_reference}</p>
            </div>

            <div className="chat-list">
              {messages.length === 0 ? (
                <p className="page-sub mini">{t("No messages yet. Start the conversation.", "لا توجد رسائل بعد. ابدأ المحادثة.")}</p>
              ) : (
                messages.map((item) => {
                  const mine = viewerId === item.sender;
                  return (
                    <article key={item.id} className={`chat-item ${mine ? "mine" : ""}`}>
                      <p>{item.body}</p>
                      <div className="chat-meta">
                        <span>{item.sender_name || t("User", "مستخدم")}</span>
                        <span>{new Date(item.created_at).toLocaleString()}</span>
                        <span>{item.read_at ? t("Read", "مقروءة") : t("Unread", "غير مقروءة")}</span>
                      </div>
                    </article>
                  );
                })
              )}
            </div>

            {thread.is_closed ? (
              <p className="notice warn">{t("This thread is closed.", "هذه المحادثة مغلقة.")}</p>
            ) : (
              <form className="chat-input-row" onSubmit={handleSend}>
                <input
                  className="input"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder={t("Type your message...", "اكتب رسالتك...")}
                />
                <button className="btn btn-primary" type="submit" disabled={sending}>
                  {sending ? t("Sending...", "جارٍ الإرسال...") : t("Send", "إرسال")}
                </button>
              </form>
            )}

            <div className="card-actions">
              <Link href={`/bookings/${thread.booking}`} className="inline-link">
                {t("View Booking", "عرض الحجز")}
              </Link>
              <Link href="/messages" className="inline-link">
                {t("Back to Threads", "العودة إلى المحادثات")}
              </Link>
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}
