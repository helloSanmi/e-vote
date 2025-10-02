// frontend/pages/past-results.js
import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { resolveImageUrl } from "../utils/resolveImageUrl";

const serverUrl = process.env.NEXT_PUBLIC_API_URL;
const placeholderImage = "/placeholder.svg";
const buildPhotoSrc = (...values) => {
  for (const raw of values) {
    const resolved = resolveImageUrl(raw, serverUrl);
    if (resolved) return resolved;
  }
  return placeholderImage;
};
const handleImgError = (event) => {
  event.currentTarget.onerror = null;
  event.currentTarget.src = placeholderImage;
};

export default function PastResults() {
  const router = useRouter();
  const [periods, setPeriods] = useState([]);
  const [selectedPeriod, setSelectedPeriod] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [results, setResults] = useState([]);
  const [noParticipation, setNoParticipation] = useState(false);

  const userId = typeof window !== "undefined" ? localStorage.getItem("userId") : null;
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

  // Load only periods user participated in
  const loadPeriods = async () => {
    if (!authReady) return;
    if (!userId) return;
    try {
      const res = await fetch(`${serverUrl}/api/public/periods?userId=${userId}`);
      if (!res.ok) {
        setPeriods([]);
        return;
      }
      const data = await res.json();
      if (Array.isArray(data)) {
        setPeriods(data);
      }
    } catch {
      setPeriods([]);
    }
  };

  const loadDataForPeriod = async (pId) => {
    if (!authReady) return;
    if (!userId) return;
    // First fetch the candidates
    try {
      const candidatesRes = await fetch(`${serverUrl}/api/public/candidates?periodId=${pId}`);
      if (candidatesRes.ok) {
        const candidatesData = await candidatesRes.json();
        setCandidates(candidatesData || []);
      } else {
        setCandidates([]);
      }
    } catch {
      setCandidates([]);
    }

    // Then fetch the results (if user participated)
    try {
      const resultsRes = await fetch(`${serverUrl}/api/public/public-results?periodId=${pId}&userId=${userId}`);
      if (!resultsRes.ok) {
        setNoParticipation(false);
        setResults([]);
        return;
      }
      const resultsData = await resultsRes.json();
      if (resultsData.noParticipation) {
        setNoParticipation(true);
        setResults([]);
      } else {
        setNoParticipation(false);
        setResults(resultsData.published ? resultsData.results : []);
      }
    } catch {
      setNoParticipation(false);
      setResults([]);
    }
  };

  useEffect(() => {
    if (!authReady) return;
    loadPeriods();
  }, [authReady]);

  useEffect(() => {
    if (!authReady) return;
    if (selectedPeriod) {
      loadDataForPeriod(selectedPeriod);
    }
  }, [selectedPeriod, authReady]);

  if (!authReady) {
    return null;
  }

  return (
    <div className="space-y-10">
      <section className="glass-card mx-auto max-w-4xl px-8 py-10 text-center">
        <h1 className="text-3xl font-bold text-slate-900">Past Results</h1>
        <p className="mt-3 text-slate-600">
          Browse completed election periods you participated in to view candidate line-ups and final tallies.
        </p>
        <div className="mt-6">
          <select
            className="w-full rounded-full border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            value={selectedPeriod || ""}
            onChange={(e) => setSelectedPeriod(e.target.value)}
          >
            <option value="">Select a Past Period</option>
            {periods.map((p) => (
              <option key={p.id} value={p.id} className="bg-white text-slate-700">
                Period {p.id} (Starts: {new Date(p.startTime).toLocaleString()}, Ends: {new Date(p.endTime).toLocaleString()})
              </option>
            ))}
          </select>
        </div>
      </section>

      {selectedPeriod && candidates.length > 0 && !noParticipation && (
        <section className="space-y-6">
          <h2 className="text-center text-xl font-semibold text-slate-900">Candidates for Period {selectedPeriod}</h2>
          <div className="mx-auto grid w-full max-w-5xl gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {candidates.map((c) => (
              <div key={c.id} className="glass-card flex h-full flex-col items-center gap-4 px-6 py-8 text-center">
                <img
                  src={buildPhotoSrc(c.photoSrc, c.photoUrl)}
                  onError={handleImgError}
                  alt={c.name}
                  className="h-24 w-24 rounded-full border border-slate-200 object-cover shadow-sm"
                />
                <div>
                  <h4 className="text-lg font-semibold text-slate-900">{c.name}</h4>
                  <p className="mt-1 text-sm text-slate-500">{c.lga}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {selectedPeriod && noParticipation && (
        <div className="glass-card mx-auto max-w-3xl px-6 py-6 text-center text-sm font-semibold text-red-600">
          You did not participate in this voting period, so you cannot view these results.
        </div>
      )}

      {selectedPeriod && results.length > 0 && !noParticipation && (
        <section className="space-y-6">
          <h2 className="text-center text-xl font-semibold text-slate-900">Results for Period {selectedPeriod}</h2>
          <div className="mx-auto grid w-full max-w-5xl gap-6 sm:grid-cols-2 lg:grid-cols-3">
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
                  <h3 className="text-lg font-semibold text-slate-900">{result.name}</h3>
                  <p className="mt-1 text-sm text-slate-500">{result.lga}</p>
                </div>
                <div className="mt-auto rounded-full border border-blue-200 bg-blue-50 px-4 py-1 text-sm font-semibold text-blue-700">
                  {result.votes} Votes
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
