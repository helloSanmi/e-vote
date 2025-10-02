// frontend/pages/login.js
// Add "Forgot Password" link which opens a modal to enter email.
// No backend logic implemented here, just show UI. On submit, show a message (simulate process).

import { useState } from "react";
import { useRouter } from "next/router";

const serverUrl = process.env.NEXT_PUBLIC_API_URL;

export default function Login() {
  const [formData, setFormData] = useState({ email: "", password: "" });
  const [showModal, setShowModal] = useState(false);
  const [errorModal, setErrorModal] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotMessage, setForgotMessage] = useState("");
  const router = useRouter();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({...formData, [name]: value.trim()});
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    const res = await fetch(`${serverUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify(formData)
    });
    const data = await res.json();
    setLoading(false);

    if (res.ok && data.token) {
      localStorage.setItem("token", data.token);
      const meRes = await fetch(`${serverUrl}/api/auth/me`, {
        headers: {
          "Authorization": "Bearer " + data.token
        }
      });
      const meData = await meRes.json();
      if (meRes.ok && meData.id) {
        if (data.isAdmin) {
          localStorage.setItem("isAdmin", "true");
          localStorage.setItem("userId", meData.id);
          router.push("/admin");
        } else {
          localStorage.removeItem("isAdmin");
          localStorage.setItem("userId", meData.id);
          router.push("/");
        }
      } else {
        setErrorModal(true);
        setMessage("Invalid credentials");
      }
    } else {
      if (data.error && data.error.includes("not found")) {
        setShowModal(true);
      } else {
        setErrorModal(true);
        setMessage("Invalid credentials");
      }
    }
  };

  const handleForgotSubmit = (e) => {
    e.preventDefault();
    // Simulate sending reset link
    setForgotMessage("If this email is registered, a password reset link will be sent shortly.");
  };

  return (
    <div className="mx-auto grid max-w-5xl gap-8 py-8 md:grid-cols-[1.05fr_1fr]">
      <section className="glass-card hidden flex-col gap-6 px-8 py-10 md:flex">
        <div>
          <span className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-blue-700">
            Welcome Back
          </span>
          <h1 className="mt-6 text-3xl font-bold text-slate-900">Sign in to continue voting</h1>
          <p className="mt-3 text-slate-600">
            Access the live voting booth, monitor results in real time, and manage your participation with ease.
          </p>
        </div>
        <ul className="space-y-3 text-sm text-slate-600">
          <li className="flex items-start gap-3">
            <span className="mt-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-blue-600">1</span>
            Enter your registered email or username alongside your password.
          </li>
          <li className="flex items-start gap-3">
            <span className="mt-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-blue-600">2</span>
            Instantly connect to ongoing elections and cast a single, secure vote.
          </li>
          <li className="flex items-start gap-3">
            <span className="mt-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-blue-600">3</span>
            Review both live and past results once you have participated.
          </li>
        </ul>
      </section>

      <div className="glass-card px-8 py-10">
        <h2 className="text-2xl font-semibold text-slate-900">Login</h2>
        <p className="mt-2 text-sm text-slate-600">Enter your credentials to access the Tech Analytics voting experience.</p>
        <form onSubmit={handleSubmit} className="mt-8 space-y-6">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Email or Username</label>
            <input
              type="text"
              name="email"
              value={formData.email}
              onChange={handleChange}
              className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-300"
              placeholder="Enter your email or username"
              required
              minLength={3}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Password</label>
            <input
              type="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-300"
              placeholder="Enter your password"
              required
              minLength={6}
              title="Password must be at least 6 characters long"
            />
          </div>
          <button className="flex w-full items-center justify-center gap-3 rounded-full bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500" disabled={loading}>
            {loading ? (
              <>
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-transparent"></span>
                Logging in...
              </>
            ) : (
              "Login"
            )}
          </button>
        </form>
        <div className="mt-6 text-center">
          <button onClick={() => setShowForgotModal(true)} className="text-sm font-semibold text-blue-600 transition hover:text-blue-500">
            Forgot Password?
          </button>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur">
          <div className="glass-card w-full max-w-sm px-6 py-8 text-left">
            <h3 className="text-xl font-semibold text-slate-900">User not found</h3>
            <p className="mt-3 text-sm text-slate-600">
              You have not registered yet. Would you like to create an account now?
            </p>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-blue-400 hover:text-blue-600"
              >
                Cancel
              </button>
              <button
                onClick={() => { setShowModal(false); router.push("/register"); }}
                className="flex-1 rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500"
              >
                Register
              </button>
            </div>
          </div>
        </div>
      )}

      {errorModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur">
          <div className="glass-card w-full max-w-sm px-6 py-6 text-center">
            <p className="text-sm text-slate-700">{message}</p>
            <button
              onClick={() => setErrorModal(false)}
              className="mt-4 inline-flex rounded-full border border-slate-200 px-5 py-2 text-sm font-semibold text-slate-700 transition hover:border-blue-400 hover:text-blue-600"
            >
              OK
            </button>
          </div>
        </div>
      )}

      {showForgotModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur">
          <div className="glass-card w-full max-w-sm px-6 py-8">
            <h3 className="text-xl font-semibold text-slate-900 text-center">Reset Password</h3>
            <form onSubmit={handleForgotSubmit} className="mt-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Enter your email</label>
                <input
                  type="email"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value.trim())}
                  className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-300"
                  placeholder="yourname@example.com"
                  required
                  pattern="^[^@\s]+@[^@\s]+\.[^@\s]+$"
                />
              </div>
              <button className="flex w-full items-center justify-center gap-2 rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500">
                Send Reset Link
              </button>
            </form>
            {forgotMessage && <p className="mt-4 text-center text-sm text-slate-600">{forgotMessage}</p>}
            <div className="mt-4 text-center">
              <button onClick={() => {setShowForgotModal(false); setForgotMessage("");}} className="text-sm font-semibold text-blue-600 transition hover:text-blue-500">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
