// frontend/pages/register.js
import { useState } from "react";
import { useRouter } from "next/router";

const serverUrl = process.env.NEXT_PUBLIC_API_URL;

export default function Register() {
  const [formData, setFormData] = useState({ fullName: "", username: "", email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [errorModal, setErrorModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const router = useRouter();

  // Allow spaces in the fullName field by not trimming the value
  const handleChange = (e) => {
    const { name, value } = e.target;
    // Do NOT trim the value, so spaces remain intact
    setFormData({ ...formData, [name]: value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Register
      const res = await fetch(`${serverUrl}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      setLoading(false);

      if (!res.ok) {
        setErrorModal(true);
        setErrorMessage(data.error || "Error registering user");
        return;
      }

      // Auto-login after successful registration
      const loginRes = await fetch(`${serverUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: formData.email, password: formData.password }),
      });
      const loginData = await loginRes.json();
      if (!loginRes.ok || !loginData.token) {
        setErrorModal(true);
        setErrorMessage("Error logging in after registration");
        return;
      }

      // Store token, fetch user info
      localStorage.setItem("token", loginData.token);
      const meRes = await fetch(`${serverUrl}/api/auth/me`, {
        headers: { "Authorization": "Bearer " + loginData.token },
      });
      const meData = await meRes.json();
      if (!meRes.ok || !meData.id) {
        setErrorModal(true);
        setErrorMessage("Error fetching user info");
        return;
      }

      // Determine admin or normal user
      if (loginData.isAdmin) {
        localStorage.setItem("isAdmin", "true");
        localStorage.setItem("userId", meData.id);
        router.push("/admin");
      } else {
        localStorage.removeItem("isAdmin");
        localStorage.setItem("userId", meData.id);
        router.push("/");
      }
    } catch (error) {
      setLoading(false);
      setErrorModal(true);
      setErrorMessage("Network or server error occurred");
    }
  };

  return (
    <div className="mx-auto grid max-w-5xl gap-8 py-8 md:grid-cols-[1.05fr_1fr]">
      <section className="glass-card hidden flex-col gap-6 px-8 py-10 md:flex">
        <div>
          <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-emerald-700">
            Join the Community
          </span>
          <h1 className="mt-6 text-3xl font-bold text-slate-900">Create your voter profile</h1>
          <p className="mt-3 text-slate-600">
            Register in minutes and unlock secure access to every Tech Analytics election event.
          </p>
        </div>
        <ul className="space-y-3 text-sm text-slate-600">
          <li className="flex items-start gap-3">
            <span className="mt-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">1</span>
            Fill in your full name and preferred username for identification.
          </li>
          <li className="flex items-start gap-3">
            <span className="mt-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">2</span>
            Provide a valid email and password — we’ll verify your vote with these details.
          </li>
          <li className="flex items-start gap-3">
            <span className="mt-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">3</span>
            Cast your ballot, follow real-time stats, and revisit past elections.
          </li>
        </ul>
      </section>

      <div className="glass-card px-8 py-10">
        <h2 className="text-2xl font-semibold text-slate-900 text-center">Register</h2>
        <p className="mt-2 text-center text-sm text-slate-600">Complete the form below to get started with secure e-voting.</p>
        <form onSubmit={handleSubmit} className="mt-8 space-y-6">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Full Name</label>
            <input
              type="text"
              name="fullName"
              value={formData.fullName}
              onChange={handleChange}
              className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-300"
              placeholder="Your full name"
              required
              minLength={3}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Username</label>
            <input
              type="text"
              name="username"
              value={formData.username}
              onChange={handleChange}
              className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-300"
              placeholder="Choose a username"
              required
              minLength={3}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Email</label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-300"
              placeholder="yourname@example.com"
              required
              pattern="^[^@\s]+@[^@\s]+\.[^@\s]+$"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Password</label>
            <input
              type="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-300"
              placeholder="Choose a strong password"
              required
              minLength={6}
              title="Password must be at least 6 characters long"
            />
          </div>
          <button className="flex w-full items-center justify-center gap-3 rounded-full bg-emerald-500 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-400" disabled={loading}>
            {loading ? (
              <>
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-transparent"></span>
                Registering...
              </>
            ) : (
              "Register"
            )}
          </button>
        </form>
        <div className="mt-6 text-center text-sm text-slate-600">
          Already have an account? {" "}
          <a href="/login" className="font-semibold text-emerald-600 transition hover:text-emerald-500">
            Go to Login
          </a>
        </div>
      </div>

      {errorModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur">
          <div className="glass-card w-full max-w-sm px-6 py-6 text-center">
            <p className="text-sm text-slate-700">{errorMessage}</p>
            <button
              onClick={() => setErrorModal(false)}
              className="mt-4 inline-flex rounded-full border border-slate-200 px-5 py-2 text-sm font-semibold text-slate-700 transition hover:border-emerald-500 hover:text-emerald-600"
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
