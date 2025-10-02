// frontend/pages/results.js
import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import io from "socket.io-client";
import { resolveImageUrl } from "../utils/resolveImageUrl";

function PopupModal({ show, message, onClose }) {
  if (!show) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur">
      <div className="glass-card w-full max-w-sm px-6 py-6 text-center">
        <p className="text-sm text-slate-700">{message}</p>
        <button
          onClick={onClose}
          className="mt-4 inline-flex rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500"
        >
          OK
        </button>
      </div>
    </div>
  );
}

const serverUrl = process.env.NEXT_PUBLIC_API_URL;
const placeholderImage = "/placeholder.svg";
const buildPhotoSrc = (...values) => {
  for (const raw of values) {
    const resolved = resolveImageUrl(raw, serverUrl);
    if (resolved) {
      return resolved;
    }
  }
  return placeholderImage;
};
const handleImgError = (event) => {
  event.currentTarget.onerror = null;
  event.currentTarget.src = placeholderImage;
};

export default function Results() {
  const router = useRouter();
  const [socket, setSocket] = useState(null);
  const [results, setResults] = useState([]);
  const [canView, setCanView] = useState(false);
  const [totalVotes, setTotalVotes] = useState(0);
  const [message, setMessage] = useState("");
  const [showPopup, setShowPopup] = useState(false);

  const userId = typeof window !== "undefined" ? localStorage.getItem("userId") : null;
  const [periodId, setPeriodId] = useState(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const token = localStorage.getItem("token");
    if (!token) {
      router.replace("/login");
      return;
    }
    setAuthReady(true);
  }, [router]);

  useEffect(() => {
    if (!authReady) return;
    const newSocket = io(serverUrl);
    setSocket(newSocket);
    return () => newSocket.close();
  }, [authReady]);

  useEffect(() => {
    if (!authReady || !socket) return;
    // When results are published, refresh
    socket.on("resultsPublished", () => {
      setMessage("Results have just been published!");
      setShowPopup(true);
      if (periodId && userId) fetchResults(periodId, userId);
    });
    socket.on("votingStarted", () => {
      // If a new voting started, reset this page if needed
      setResults([]);
      setCanView(false);
    });
    return () => {
      socket.off("resultsPublished");
      socket.off("votingStarted");
    };
  }, [socket, periodId, userId]);

  const closePopup = () => {
    setShowPopup(false);
    setMessage("");
  };

  // First, fetch the current period
  const fetchCurrentPeriod = async () => {
    try {
      const res = await fetch(`${serverUrl}/api/public/period`);
      if (!res.ok) {
        setPeriodId(null);
        setResults([]);
        setCanView(false);
        return;
      }
      const data = await res.json();
      if (data && data.id) {
        setPeriodId(data.id);
        if (userId) fetchResults(data.id, userId);
      } else {
        setPeriodId(null);
        setResults([]);
        setCanView(false);
      }
    } catch {
      setPeriodId(null);
      setResults([]);
      setCanView(false);
    }
  };

  const fetchResults = async (pid, uid) => {
    const url = `${serverUrl}/api/public/public-results?periodId=${pid}&userId=${uid}`;
    const res = await fetch(url);
    if (!res.ok) {
      setCanView(false);
      setResults([]);
      setTotalVotes(0);
      return;
    }
    const data = await res.json();
    if (data.noParticipation) {
      setCanView(false);
      setResults([]);
      setTotalVotes(0);
      setMessage("You didn't participate in this voting session, so you cannot view the results.");
      setShowPopup(true);
      return;
    }
    if (data.published) {
      setCanView(true);
      setResults(data.results);
      const sum = data.results.reduce((acc, cur) => acc + cur.votes, 0);
      setTotalVotes(sum);
    } else {
      setCanView(false);
      setResults([]);
      setTotalVotes(0);
    }
  };

  useEffect(() => {
    if (!authReady) return;
    fetchCurrentPeriod();
  }, [authReady]);

  if (!authReady) {
    return null;
  }

  if (!canView) {
    return (
      <>
        <PopupModal show={showPopup} message={message} onClose={closePopup} />
        <div className="mx-auto max-w-xl">
          <div className="glass-card px-8 py-12 text-center">
            <h1 className="text-2xl font-semibold text-slate-900">Results not available</h1>
            <p className="mt-4 text-slate-600">
              {message || "Please wait until results are published or confirm you participated in the voting session."}
            </p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <PopupModal show={showPopup} message={message} onClose={closePopup} />
      <div className="space-y-8">
        <section className="glass-card mx-auto max-w-4xl px-8 py-10 text-center">
          <h1 className="text-3xl font-bold text-slate-900">Election Results</h1>
          <p className="mt-4 text-sm font-medium uppercase tracking-[0.3em] text-blue-600">
            Total Votes Cast: {totalVotes}
          </p>
          <p className="mt-4 text-slate-600">
            Only participants of this voting period can view the final tally. Share the results responsibly.
          </p>
        </section>

        <div className="mx-auto grid w-full max-w-6xl gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((result) => (
            <div
              key={result.name}
              className="glass-card flex h-full flex-col items-center gap-4 px-6 py-8 text-center"
            >
              <img
                src={buildPhotoSrc(result.photoSrc, result.photoUrl)}
                onError={handleImgError}
                alt={result.name}
                className="h-24 w-24 rounded-full border border-slate-200 object-cover shadow-sm"
              />
              <div>
                <h2 className="text-lg font-semibold text-slate-900">{result.name}</h2>
                <p className="mt-1 text-sm text-slate-500">{result.lga}</p>
              </div>
              <div className="mt-auto flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-4 py-1 text-sm font-semibold text-blue-700">
                {result.votes} Votes
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
