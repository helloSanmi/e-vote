// Add link to FAQ and Contact in the homepage or navbar if desired
// Example adding in homepage (frontend/pages/index.js) a link to FAQ

// frontend/pages/index.js
import Link from 'next/link';
import { useEffect, useState } from 'react';
const serverUrl = process.env.NEXT_PUBLIC_API_URL;

export default function Home() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [userName, setUserName] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      setLoggedIn(false);
      setUserName("");
      return;
    }

    const fetchUser = async () => {
      try {
        const res = await fetch(`${serverUrl}/api/auth/me`, {
          headers: { Authorization: "Bearer " + token },
        });

        if (!res.ok) {
          setLoggedIn(false);
          setUserName("");
          return;
        }

        const data = await res.json();
        if (data.id) {
          setLoggedIn(true);
          const preferredName = data.fullName || data.username || data.email;
          setUserName(preferredName || "");
        } else {
          setLoggedIn(false);
          setUserName("");
        }
      } catch {
        setLoggedIn(false);
        setUserName("");
      }
    };

    fetchUser();
  }, []);

  return (
    <div className="space-y-12">
      <section className="glass-card mx-auto max-w-4xl px-8 py-12 text-center">
        <span className="inline-flex items-center justify-center rounded-full border border-blue-200 bg-blue-50 px-4 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-blue-700">
          Trusted Digital Elections
        </span>
        {loggedIn ? (
          <>
            <h1 className="mt-6 text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
              Welcome back, {userName?.split(' ')[0] || 'Voter'}
            </h1>
            <p className="mt-4 text-lg text-slate-600">
              Cast your vote, monitor live tallies, and revisit past exercises — everything in one transparent dashboard.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <Link href="/vote">
                <span className="rounded-full bg-blue-600 px-6 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500">
                  Go to Voting Booth
                </span>
              </Link>
              <Link href="/results">
                <span className="rounded-full border border-slate-200 px-6 py-2 text-sm font-semibold text-slate-600 transition hover:border-blue-500 hover:text-blue-600">
                  View Live Results
                </span>
              </Link>
              <Link href="/faq">
                <span className="rounded-full border border-slate-200 px-6 py-2 text-sm font-medium text-blue-600 transition hover:border-blue-400">
                  Read FAQ
                </span>
              </Link>
            </div>
          </>
        ) : (
          <>
            <h1 className="mt-6 text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
              Secure Elections for Tech Analytics
            </h1>
            <p className="mt-4 text-lg text-slate-600">
              Register, verify, and participate in a seamless e-voting process. Real-time transparency powered by modern web technologies.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <Link href="/register">
                <span className="rounded-full bg-blue-600 px-6 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500">
                  Create an Account
                </span>
              </Link>
              <Link href="/login">
                <span className="rounded-full border border-slate-200 px-6 py-2 text-sm font-semibold text-slate-600 transition hover:border-blue-500 hover:text-blue-600">
                  Login to Continue
                </span>
              </Link>
              <Link href="/faq">
                <span className="rounded-full border border-slate-200 px-6 py-2 text-sm font-medium text-blue-600 transition hover:border-blue-400">
                  Explore FAQ
                </span>
              </Link>
            </div>
          </>
        )}
      </section>

      <section className="grid gap-6 md:grid-cols-3">
        {[{
          title: "Tamper-Proof",
          copy: "Each vote is tied to a verified user session, ensuring accountability and fairness.",
          chip: "bg-emerald-50 text-emerald-700"
        }, {
          title: "Live Insights",
          copy: "Results update instantly once published so everyone stays informed in real time.",
          chip: "bg-sky-50 text-sky-700"
        }, {
          title: "Historical Trail",
          copy: "Revisit past elections, compare outcomes, and build institutional memory effortlessly.",
          chip: "bg-indigo-50 text-indigo-700"
        }].map(({ title, copy, chip }) => (
          <div key={title} className="glass-card h-full text-left space-y-4">
            <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${chip}`}>
              {title}
            </span>
            <p className="mt-4 text-base text-slate-600">
              {copy}
            </p>
          </div>
        ))}
      </section>

      <section className="glass-card mx-auto max-w-5xl px-8 py-10">
        <h2 className="text-2xl font-semibold text-slate-900">Why Our Platform?</h2>
        <p className="mt-4 text-slate-600">
          Built for the Tech Analytics community, our e-voting solution blends modern design with secure infrastructure. Voting windows are scheduled precisely, participation is strictly one vote per user, and admins retain control over when results are published.
        </p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">Security</p>
            <p className="mt-2 text-sm text-slate-600">Encrypted APIs with token-based verification make sure only authorised votes count.</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">Transparency</p>
            <p className="mt-2 text-sm text-slate-600">Real-time sockets broadcast events so voters see status changes the instant they happen.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
