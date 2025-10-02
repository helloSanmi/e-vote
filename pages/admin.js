// frontend/pages/admin.js
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/router";
import io from "socket.io-client";
import nigeriaLGAs from "../data/nigeria-lgas.json";
import { resolveImageUrl } from "../utils/resolveImageUrl";

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

export default function Admin() {
  const router = useRouter();
  const [socket, setSocket] = useState(null);

  const [message, setMessage] = useState("");
  const [showPopup, setShowPopup] = useState(false);

  const [name, setName] = useState("");
  const [lga, setLga] = useState("");
  const [photoPreview, setPhotoPreview] = useState("");
  const photoInputRef = useRef(null);

  // Note the change below: we'll treat 'published' as a boolean instead of 0 or 1
  const [unpublishedCandidates, setUnpublishedCandidates] = useState([]);
  const [publishedCandidates, setPublishedCandidates] = useState([]);

  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [period, setPeriod] = useState(null);

  const [results, setResults] = useState([]);
  const [activeTab, setActiveTab] = useState("current");

  const [periods, setPeriods] = useState([]);
  const [selectedPastPeriod, setSelectedPastPeriod] = useState(null);
  const [pastCandidates, setPastCandidates] = useState([]);
  const [pastResults, setPastResults] = useState([]);
  const [showPreview, setShowPreview] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState(null);

  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: "Bearer " + token } : {}),
  };

  const asBool = (value) => value === true || value === 1 || value === "1";

  useEffect(() => {
    if (typeof window === "undefined") return;
    const token = localStorage.getItem("token");
    const isAdminFlag = localStorage.getItem("isAdmin");
    if (!token || isAdminFlag !== "true") {
      router.replace("/login");
      return;
    }
    setAuthReady(true);
  }, [router]);

  // Initialize Socket.io
  useEffect(() => {
    if (!authReady) return;
    const newSocket = io(serverUrl);
    setSocket(newSocket);
    return () => newSocket.close();
  }, [authReady]);

  // Socket event listeners
  useEffect(() => {
    if (!authReady || !socket) return;
    socket.on("candidatesUpdated", loadCandidates);
    socket.on("votingStarted", (data) => {
      setMessage(`Voting has started${data && data.periodId ? ` (Period ${data.periodId})` : ""}`);
      setShowPopup(true);
      loadCurrentPeriod();
      loadCandidates();
      loadResults();
    });
    socket.on("voteCast", loadResults);
    socket.on("resultsPublished", () => {
      setMessage("Results have been published");
      setShowPopup(true);
      loadCurrentPeriod();
      loadCandidates();
      loadResults();
      loadAllPeriods().then((updatedPeriods) => {
        const latest = updatedPeriods?.[0];
        if (latest?.resultsPublished) {
          setActiveTab("past");
          setSelectedPastPeriod(String(latest.id));
          loadPastPeriodData(latest.id);
        }
      });
    });

    return () => {
      socket.off("candidatesUpdated");
      socket.off("votingStarted");
      socket.off("voteCast");
      socket.off("resultsPublished");
    };
  }, [socket]);

  const closePopup = () => {
    setShowPopup(false);
    setMessage("");
  };

  const loadCurrentPeriod = async () => {
    try {
      const res = await fetch(`${serverUrl}/api/admin/get-period`, { headers });
      if (!res.ok) {
        setPeriod(null);
        return;
      }
      const data = await res.json();
      setPeriod(data);
    } catch {
      setPeriod(null);
    }
  };

  // IMPORTANT FIX HERE:
  // In MSSQL, a BIT column often returns true/false, not 1/0.
  // We'll filter with !c.published (unpublished) and c.published (published).
  const loadCandidates = async () => {
    try {
      const res = await fetch(`${serverUrl}/api/admin/get-candidates`, { headers });
      if (!res.ok) {
        setUnpublishedCandidates([]);
        setPublishedCandidates([]);
        return;
      }
      const data = await res.json();
      if (Array.isArray(data)) {
        const unpublished = data.filter((c) => !asBool(c.published));
        const published = data.filter((c) => asBool(c.published));
        setUnpublishedCandidates(unpublished);
        setPublishedCandidates(published);
      }
    } catch {
      setUnpublishedCandidates([]);
      setPublishedCandidates([]);
    }
  };

  const loadResults = async () => {
    try {
      const res = await fetch(`${serverUrl}/api/admin/results`, { headers });
      if (!res.ok) {
        setResults([]);
        return;
      }
      const data = await res.json();
      if (Array.isArray(data)) setResults(data);
    } catch {
      setResults([]);
    }
  };

  const loadAllPeriods = async () => {
    try {
      const res = await fetch(`${serverUrl}/api/admin/periods`, { headers });
      if (!res.ok) {
        setPeriods([]);
        return [];
      }
      const data = await res.json();
      if (Array.isArray(data)) {
        setPeriods(data);
        return data;
      }
      setPeriods([]);
      return [];
    } catch {
      setPeriods([]);
      return [];
    }
  };

  const loadPastPeriodData = async (pId) => {
    try {
      const candidatesRes = await fetch(`${serverUrl}/api/admin/candidates?periodId=${pId}`, {
        headers,
      });
      if (candidatesRes.ok) {
        const candidatesData = await candidatesRes.json();
        setPastCandidates(candidatesData || []);
      } else {
        setPastCandidates([]);
      }
    } catch {
      setPastCandidates([]);
    }

    try {
      const resultsRes = await fetch(`${serverUrl}/api/admin/results?periodId=${pId}`, {
        headers,
      });
      if (resultsRes.ok) {
        const resultsData = await resultsRes.json();
        setPastResults(resultsData || []);
      } else {
        setPastResults([]);
      }
    } catch {
      setPastResults([]);
    }
  };

  useEffect(() => {
    if (!authReady) return;
    loadCurrentPeriod();
    loadCandidates();
    loadResults();
    loadAllPeriods();
  }, [authReady]);

  useEffect(() => {
    if (!authReady) return;
    if (selectedPastPeriod) loadPastPeriodData(selectedPastPeriod);
  }, [selectedPastPeriod, authReady]);

  const handlePhotoChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      setPhotoPreview("");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setPhotoPreview(reader.result || "");
    };
    reader.onerror = () => {
      setPhotoPreview("");
    };
    reader.readAsDataURL(file);
  };

  const addCandidate = async () => {
    if (!name.trim() || !lga.trim()) {
      setMessage("Please provide candidate name and LGA");
      setShowPopup(true);
      return;
    }
    const payload = { name, lga };
    if (photoPreview) {
      payload.photoData = photoPreview;
    }

    const res = await fetch(`${serverUrl}/api/admin/add-candidate`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      setName("");
      setLga("");
      setPhotoPreview("");
      if (photoInputRef.current) {
        photoInputRef.current.value = "";
      }
      setMessage("Candidate added successfully");
      setShowPopup(true);
      loadCandidates();
      socket?.emit("triggerUpdate", "candidatesUpdated");
    } else {
      const data = await res.json().catch(() => ({}));
      setMessage(data.error || "Error adding candidate");
      setShowPopup(true);
    }
  };

  const removeCandidate = async (candidateId) => {
    const res = await fetch(
      `${serverUrl}/api/admin/remove-candidate?candidateId=${candidateId}`,
      { method: "DELETE", headers }
    );
    if (res.ok) {
      setMessage("Candidate removed");
      setShowPopup(true);
      loadCandidates();
      socket?.emit("triggerUpdate", "candidatesUpdated");
    } else {
      const data = await res.json().catch(() => ({}));
      setMessage(data.error || "Error removing candidate");
      setShowPopup(true);
    }
  };

  const startVoting = async () => {
    if (!startTime || !endTime) {
      setMessage("Please select start and end times");
      setShowPopup(true);
      return;
    }
    const res = await fetch(`${serverUrl}/api/admin/start-voting`, {
      method: "POST",
      headers,
      body: JSON.stringify({ startTime, endTime }),
    });
    if (res.ok) {
      const data = await res.json();
      setMessage(data.message);
      setShowPopup(true);
      setStartTime("");
      setEndTime("");
      loadCurrentPeriod();
      loadCandidates();
      loadResults();
      socket?.emit("triggerUpdate", "votingStarted", { periodId: data.periodId });
    } else {
      const data = await res.json().catch(() => ({}));
      setMessage(data.error || "Error starting voting");
      setShowPopup(true);
    }
  };

  const endVotingEarly = async () => {
    const res = await fetch(`${serverUrl}/api/admin/end-voting`, {
      method: "POST",
      headers,
    });
    if (res.ok) {
      setMessage("Voting ended early");
      setShowPopup(true);
      loadCurrentPeriod();
      loadResults();
      socket?.emit("triggerUpdate", "votingEnded");
    } else {
      const data = await res.json().catch(() => ({}));
      setMessage(data.error || "Error ending voting");
      setShowPopup(true);
    }
  };

  const publishResults = async () => {
    const res = await fetch(`${serverUrl}/api/admin/publish-results`, {
      method: "POST",
      headers,
    });
    if (res.ok) {
      const data = await res.json();
      setMessage("Results published");
      setShowPopup(true);
      loadCurrentPeriod();
      loadResults();
      socket?.emit("triggerUpdate", "resultsPublished");
    } else {
      const data = await res.json().catch(() => ({}));
      setMessage(data.error || "Error publishing results");
      setShowPopup(true);
    }
  };

  const deletePastPeriod = async () => {
    if (!selectedPastPeriod) {
      return;
    }

    if (confirmConfig) return;

    setConfirmConfig({
      title: "Delete Past Period",
      description:
        "This will remove the period, its candidates, votes, and uploaded photos. This cannot be undone.",
      confirmLabel: "Delete",
      confirmTone: "danger",
      onConfirm: async () => {
        const res = await fetch(`${serverUrl}/api/admin/period?periodId=${selectedPastPeriod}`, {
          method: "DELETE",
          headers,
        });

        const data = await res.json().catch(() => ({}));

        if (res.ok) {
          setMessage(data.message || "Past period deleted");
          setShowPopup(true);
          const deletedId = selectedPastPeriod;
          setSelectedPastPeriod(null);
          setPastCandidates([]);
          setPastResults([]);
          setPeriods((prev) => prev.filter((p) => p.id !== Number(deletedId)));
          loadAllPeriods();
          loadCurrentPeriod();
          loadResults();
          socket?.emit("triggerUpdate", "periodDeleted", { periodId: Number(deletedId) });
          socket?.emit("triggerUpdate", "candidatesUpdated");
        } else {
          setMessage(data.error || "Error deleting period");
          setShowPopup(true);
        }
      },
    });
  };

  if (!authReady) {
    return null;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-10 py-2">
      <PopupModal show={showPopup} message={message} onClose={closePopup} />

      <section className="glass-card px-8 py-10 text-center">
        <h1 className="text-3xl font-bold text-slate-900">Administrative Control Center</h1>
        <p className="mt-3 text-slate-600">
          Manage candidates, orchestrate voting periods, and monitor live participation in one streamlined workspace.
        </p>
      </section>

      <div className="glass-card flex flex-wrap items-center justify-center gap-4 px-6 py-4">
        <button
          onClick={() => setActiveTab("current")}
          className={`rounded-full px-5 py-2 text-sm font-semibold transition ${
            activeTab === "current"
              ? "bg-blue-600 text-white shadow-sm"
              : "border border-slate-200 text-slate-600 hover:border-blue-400 hover:text-blue-600"
          }`}
        >
          Current Period
        </button>
        <button
          onClick={() => setActiveTab("past")}
          className={`rounded-full px-5 py-2 text-sm font-semibold transition ${
            activeTab === "past"
              ? "bg-blue-600 text-white shadow-sm"
              : "border border-slate-200 text-slate-600 hover:border-blue-400 hover:text-blue-600"
          }`}
        >
          Past Periods
        </button>
      </div>

      {activeTab === "current" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="glass-card space-y-6 px-6 py-8">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Add Candidate (Unpublished)</h2>
              <p className="mt-1 text-sm text-slate-600">Prepare candidate profiles ahead of publication.</p>
            </div>
            <div className="flex flex-col gap-4 sm:flex-row">
              <div className="w-full">
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Candidate Name</label>
                <input
                  placeholder="Candidate Name"
                  className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="w-full">
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Local Government Area</label>
                <select
                  className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  value={lga}
                  onChange={(e) => setLga(e.target.value)}
                >
                  <option value="">Select LGA</option>
                  {nigeriaLGAs.map(({ state, lgas }) => (
                    <optgroup key={state} label={state}>
                      {lgas.map((lgaName) => (
                        <option key={`${state}-${lgaName}`} value={lgaName}>
                          {lgaName}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Candidate Photo</label>
              <input
                type="file"
                accept="image/*"
                ref={photoInputRef}
                onChange={handlePhotoChange}
                className="mt-2 w-full rounded-lg border border-dashed border-slate-300 bg-white px-3 py-2 text-sm text-slate-600 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
              {photoPreview && (
                <div className="mt-3 flex items-center gap-3">
                  <img
                    src={buildPhotoSrc(photoPreview)}
                    onError={handleImgError}
                    alt="Candidate preview"
                    className="h-16 w-16 rounded-full border border-slate-200 object-cover shadow-sm"
                  />
                  <button
                    onClick={() => {
                      setPhotoPreview("");
                      if (photoInputRef.current) {
                        photoInputRef.current.value = "";
                      }
                    }}
                    className="text-sm font-semibold text-red-600 transition hover:text-red-500"
                  >
                    Remove photo
                  </button>
                </div>
              )}
            </div>
            <button
              onClick={addCandidate}
              className="flex w-full items-center justify-center gap-3 rounded-full bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500"
            >
              Add Candidate
            </button>

            <div className="max-h-64 overflow-auto rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
              <h3 className="text-lg font-semibold text-slate-900">Unpublished Candidates</h3>
              {unpublishedCandidates.length === 0 && (
                <p className="mt-2 text-sm text-slate-600">No unpublished candidates yet.</p>
              )}
              <div className="mt-3 space-y-2">
                {unpublishedCandidates.map((c) => (
                  <div key={c.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                    <span>{c.name} ({c.lga})</span>
                    <button
                      onClick={() => removeCandidate(c.id)}
                      className="rounded-full bg-red-500 px-3 py-1 text-xs font-semibold text-white transition hover:bg-red-400"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="glass-card space-y-6 px-6 py-8">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Start Voting & Live Results</h2>
              <p className="mt-1 text-sm text-slate-600">Schedule the election window and keep tabs on real-time performance.</p>
            </div>
            <div className="flex flex-col gap-4 sm:flex-row">
              <div className="w-full">
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Start Time</label>
                <input
                  type="datetime-local"
                  className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </div>
              <div className="w-full">
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">End Time</label>
                <input
                  type="datetime-local"
                  className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                />
              </div>
            </div>
            <button
              onClick={startVoting}
              className="flex w-full items-center justify-center gap-3 rounded-full bg-emerald-500 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-400"
            >
              Start Voting
            </button>

            {period && (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                <p className="font-semibold text-blue-600">Current Period ID: {period.id}</p>
                <p className="mt-1">Starts: {new Date(period.startTime).toLocaleString()}</p>
                <p className="mt-1">Ends: {new Date(period.endTime).toLocaleString()}</p>
                {!asBool(period.resultsPublished) && (
                  <div className="mt-4 flex flex-wrap gap-3">
                    <button
                      onClick={endVotingEarly}
                      className="rounded-full bg-red-500 px-4 py-2 text-xs font-semibold text-white transition hover:bg-red-400"
                    >
                      End Voting Now
                    </button>
                    <button
                      onClick={publishResults}
                      className="rounded-full bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-500"
                    >
                      Publish Results
                    </button>
                  </div>
                )}
              </div>
            )}

            <div>
              <h3 className="text-lg font-semibold text-slate-900">Published Candidates</h3>
              <div className="mt-3 max-h-48 overflow-auto rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                {publishedCandidates.length === 0 && (
                  <p className="text-sm text-slate-600">No published candidates yet.</p>
                )}
                <div className="mt-2 space-y-2">
                  {publishedCandidates.map((c) => (
                    <div key={c.id} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                      {c.name} ({c.lga})
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-slate-900">Live Results</h3>
              <div className="mt-3 max-h-48 overflow-auto rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                {results.length === 0 && <p className="text-sm text-slate-600">No votes yet.</p>}
                {results.length > 0 && (
                  <table className="w-full border-collapse text-left text-sm text-slate-700">
                    <thead>
                      <tr className="text-xs uppercase tracking-wide text-blue-600">
                        <th className="border-b border-slate-200 py-2 font-semibold">Candidate</th>
                        <th className="border-b border-slate-200 py-2 font-semibold">LGA</th>
                        <th className="border-b border-slate-200 py-2 font-semibold text-right">Votes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.map((r) => (
                        <tr key={r.name} className="odd:bg-white">
                          <td className="py-2 pr-2 text-slate-700">{r.name}</td>
                          <td className="py-2 pr-2 text-slate-500">{r.lga}</td>
                          <td className="py-2 text-right font-semibold text-blue-600">{r.votes}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>

          <div className="glass-card col-span-1 space-y-4 px-6 py-8 md:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">Preview Published Candidates</h2>
                <p className="text-sm text-slate-600">Toggle a compact gallery of everyone currently live to voters.</p>
              </div>
              <button
                onClick={() => setShowPreview(!showPreview)}
                className="rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-400"
              >
                {showPreview ? "Hide Preview" : "Show Preview"}
              </button>
            </div>
            {showPreview && (
              <div className="max-h-64 overflow-auto rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <h3 className="text-lg font-semibold text-slate-900">Published Candidates</h3>
                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {publishedCandidates.map((c) => (
                    <div key={c.id} className="glass-card flex flex-col items-center gap-3 px-4 py-5 text-center">
                      <img
                        src={buildPhotoSrc(c.photoSrc, c.photoUrl)}
                        onError={handleImgError}
                        alt={c.name}
                        className="h-20 w-20 rounded-full border border-slate-200 object-cover shadow-sm"
                      />
                      <div>
                        <h4 className="text-sm font-semibold text-slate-900">{c.name}</h4>
                        <p className="text-xs text-slate-500">{c.lga}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "past" && (
        <div className="glass-card space-y-6 px-6 py-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Past Voting Periods</h2>
              <p className="text-sm text-slate-600">Review historic sessions, manage archives, or remove outdated periods.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={loadAllPeriods}
                className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-blue-400 hover:text-blue-600"
              >
                Refresh Periods
              </button>
              <button
                onClick={deletePastPeriod}
                disabled={!selectedPastPeriod}
                className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                  selectedPastPeriod
                    ? "bg-red-500 text-white shadow-sm hover:bg-red-400"
                    : "bg-red-100 text-red-300 cursor-not-allowed"
                }`}
              >
                Delete Selected Period
              </button>
            </div>
          </div>

          <select
            className="w-full rounded-full border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            value={selectedPastPeriod || ""}
            onChange={(e) => setSelectedPastPeriod(e.target.value)}
          >
            <option value="">Select a Past Period</option>
            {periods
              .filter((p) => p.id !== (period ? period.id : null))
              .map((p) => (
                <option key={p.id} value={p.id} className="bg-white text-slate-700">
                  Period {p.id} (Starts: {new Date(p.startTime).toLocaleString()}, Ends: {new Date(p.endTime).toLocaleString()})
                </option>
              ))}
          </select>

          {selectedPastPeriod && pastCandidates.length > 0 && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-slate-900">Candidates for Period {selectedPastPeriod}</h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {pastCandidates.map((c) => (
                  <div key={c.id} className="glass-card flex flex-col items-center gap-3 px-4 py-5 text-center">
                    <img
                      src={buildPhotoSrc(c.photoSrc, c.photoUrl)}
                      onError={handleImgError}
                      alt={c.name}
                      className="h-20 w-20 rounded-full border border-slate-200 object-cover shadow-sm"
                    />
                    <div>
                      <h4 className="text-sm font-semibold text-slate-900">{c.name}</h4>
                      <p className="text-xs text-slate-500">{c.lga}</p>
                    </div>
                  </div>
                ))}
              </div>

              <h3 className="text-lg font-semibold text-slate-900">Results for Period {selectedPastPeriod}</h3>
              <div className="max-h-64 overflow-auto rounded-2xl border border-slate-200 bg-slate-50">
                <table className="w-full border-collapse text-left text-sm text-slate-700">
                  <thead className="text-xs uppercase tracking-wide text-blue-600">
                    <tr>
                      <th className="border-b border-slate-200 px-4 py-2 font-semibold">Candidate</th>
                      <th className="border-b border-slate-200 px-4 py-2 font-semibold">LGA</th>
                      <th className="border-b border-slate-200 px-4 py-2 text-right font-semibold">Votes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pastResults.map((r) => (
                      <tr key={r.name} className="odd:bg-white">
                        <td className="px-4 py-2 text-slate-700">{r.name}</td>
                        <td className="px-4 py-2 text-slate-500">{r.lga}</td>
                        <td className="px-4 py-2 text-right font-semibold text-blue-600">{r.votes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
      {confirmConfig && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur">
          <div className="glass-card w-full max-w-sm px-6 py-8 text-center space-y-4">
            <h2 className="text-xl font-semibold text-slate-900">{confirmConfig.title}</h2>
            <p className="text-sm text-slate-600">{confirmConfig.description}</p>
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
              <button
                onClick={() => setConfirmConfig(null)}
                className="w-full rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-blue-400 hover:text-blue-600 sm:w-32"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  const onConfirm = confirmConfig.onConfirm;
                  setConfirmConfig(null);
                  if (typeof onConfirm === "function") {
                    await onConfirm();
                  }
                }}
                className={`w-full rounded-full px-4 py-2 text-sm font-semibold text-white shadow-sm transition sm:w-32 ${
                  confirmConfig.confirmTone === "danger" ? "bg-red-500 hover:bg-red-400" : "bg-blue-600 hover:bg-blue-500"
                }`}
              >
                {confirmConfig.confirmLabel || "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
