// components/Layout.js
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";

const serverUrl = process.env.NEXT_PUBLIC_API_URL;

export default function Layout({ children }) {
  const [loggedIn, setLoggedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checkComplete, setCheckComplete] = useState(false);
  const [userName, setUserName] = useState("");
  const router = useRouter();

  // Fetch user data and determine admin/regular user
  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) {
      setLoggedIn(false);
      setIsAdmin(false);
      setUserName("");
      setCheckComplete(true);
      return;
    }

    const fetchUser = async () => {
      try {
        const res = await fetch(`${serverUrl}/api/auth/me`, {
          headers: { Authorization: "Bearer " + token },
        });
        if (res.ok) {
          const userData = await res.json();
          setLoggedIn(true);
          // Extract first name
          let firstName = "User";
          if (userData.fullName && userData.fullName.trim()) {
            firstName = userData.fullName.split(" ")[0];
          } else if (userData.username && userData.username.trim()) {
            firstName = userData.username;
          } else if (userData.email && userData.email.includes("@")) {
            firstName = userData.email.split("@")[0];
          }
          setUserName(firstName);

          const adminFlag = localStorage.getItem("isAdmin");
          setIsAdmin(adminFlag === "true");
        } else {
          // Token invalid or expired
          localStorage.removeItem("token");
          setLoggedIn(false);
          setIsAdmin(false);
          setUserName("");
        }
      } catch {
        // Fetch error
        localStorage.removeItem("token");
        setLoggedIn(false);
        setIsAdmin(false);
        setUserName("");
      }
      setCheckComplete(true);
    };
    fetchUser();
  }, [router]);

  // Handle route transitions for a loading indicator
  useEffect(() => {
    const handleStart = () => setLoading(true);
    const handleStop = () => setLoading(false);

    router.events.on("routeChangeStart", handleStart);
    router.events.on("routeChangeComplete", handleStop);
    router.events.on("routeChangeError", handleStop);

    return () => {
      router.events.off("routeChangeStart", handleStart);
      router.events.off("routeChangeComplete", handleStop);
      router.events.off("routeChangeError", handleStop);
    };
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("userId");
    localStorage.removeItem("isAdmin");
    setLoggedIn(false);
    setIsAdmin(false);
    setUserName("");
    setCheckComplete(true);
    router.push("/");
  };

  if (!checkComplete) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-slate-200 border-t-blue-500"></div>
      </div>
    );
  }

  const isAdminPage = router.pathname === "/admin";
  const navButton =
    "rounded-full bg-white px-4 py-1.5 text-sm font-medium text-slate-600 shadow-sm hover:text-blue-600 hover:shadow-md transition";
  const primaryButton =
    "rounded-full bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white shadow hover:bg-blue-500";
  const isActive = (path) => router.pathname === path;
  const logoutButton =
    "rounded-full border border-red-200 px-4 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 transition";

  return (
    <div className="relative min-h-screen bg-white">

      {loading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/80 backdrop-blur">
          <div className="h-14 w-14 animate-spin rounded-full border-4 border-slate-200 border-t-blue-500"></div>
        </div>
      )}

      <div className="relative z-10 flex min-h-screen flex-col">
        <header className="sticky top-0 z-30 mx-auto w-full max-w-6xl px-4 pt-6">
          <div className="glass-panel flex flex-col gap-4 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <Link href="/">
                <div className="flex items-center gap-3">
                  <img
                    src="/logo.png"
                    alt="App Logo"
                    className="h-10 w-10 rounded-full border border-slate-200 shadow-sm"
                  />
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-600">E-Vote</p>
                    <p className="text-lg font-bold text-slate-900">Secure Voting Platform</p>
                  </div>
                </div>
              </Link>
              {loggedIn && userName && (
                <span className="hidden text-sm font-medium text-slate-600 sm:inline">
                  Welcome back, {userName}!
                </span>
              )}
            </div>

            <nav className="flex flex-wrap items-center justify-center gap-3">
              {!loggedIn && (
                <>
                  <Link href="/register">
                    <span className={isActive("/register") ? primaryButton : navButton}>Register</span>
                  </Link>
                  <Link href="/login">
                    <span className={isActive("/login") ? primaryButton : navButton}>Login</span>
                  </Link>
                </>
              )}
              {loggedIn && !isAdmin && (
                <>
                  <Link href="/vote">
                    <span className={isActive("/vote") ? primaryButton : navButton}>Vote</span>
                  </Link>
                  <Link href="/results">
                    <span className={isActive("/results") ? primaryButton : navButton}>Results</span>
                  </Link>
                  <Link href="/past-results">
                    <span className={isActive("/past-results") ? primaryButton : navButton}>Past Results</span>
                  </Link>
                </>
              )}
              {loggedIn && isAdmin && !isAdminPage && (
                <Link href="/admin">
                  <span className={navButton}>Admin</span>
                </Link>
              )}
              {loggedIn && (
                <button onClick={handleLogout} className={logoutButton}>
                  Logout
                </button>
              )}
            </nav>
          </div>
        </header>

        <main className="relative z-10 w-full flex-1 px-4 pb-16 pt-10 sm:pt-14">
          <div className="mx-auto w-full max-w-6xl page-enter">
            {children}
          </div>
        </main>

        <footer className="mx-auto w-full max-w-6xl px-4 pb-10">
          <div className="glass-panel rounded-2xl px-6 py-4 text-center text-sm text-slate-600">
            &copy; {new Date().getFullYear()} EVote
          </div>
        </footer>
      </div>
    </div>
  );
}
