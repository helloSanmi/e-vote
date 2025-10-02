// frontend/pages/vote.js
import { useState, useEffect } from "react";
import io from "socket.io-client";

const serverUrl = process.env.NEXT_PUBLIC_API_URL;
const placeholderImage = "/placeholder.svg";

export default function Vote() {
  const [socket, setSocket] = useState(null);
  const [period, setPeriod] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [timeLeft, setTimeLeft] = useState(null);
  const [votingNotStarted, setVotingNotStarted] = useState(true);
  const [votingEnded, setVotingEnded] = useState(false);
  const [resultsPublished, setResultsPublished] = useState(false);
  const [showVoteModal, setShowVoteModal] = useState(false);
  const [alreadyVotedCandidate, setAlreadyVotedCandidate] = useState(null);
  const [message, setMessage] = useState("");
  const userId = typeof window !== "undefined" ? localStorage.getItem("userId") : null;
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;

  useEffect(() => {
    const newSocket = io(serverUrl);
    setSocket(newSocket);
    return () => newSocket.close();
  }, []);

  // Listen for admin starting voting
  useEffect(() => {
    if (!socket) return;
    socket.on("votingStarted", () => {
      fetchPeriod();
      fetchCandidates();
    });
    socket.on("votingEnded", () => {
      fetchPeriod();
    });
    socket.on("resultsPublished", () => {
      setResultsPublished(true);
    });
    return () => {
      socket.off("votingStarted");
      socket.off("votingEnded");
      socket.off("resultsPublished");
    };
  }, [socket]);

  const fetchPeriod = async () => {
    const res = await fetch(`${serverUrl}/api/public/period`);
    const data = await res.json();
    setPeriod(data);
    if (!data) return;
    const now = new Date();
    const start = new Date(data.startTime);
    const end = new Date(data.endTime);
    const toBool = (value) => value === true || value === 1 || value === "1";
    const forcedEnded = toBool(data.forcedEnded);
    setResultsPublished(toBool(data.resultsPublished));
    if (forcedEnded || now > end) {
      setVotingEnded(true);
      setVotingNotStarted(false);
    } else if (now < start) {
      setVotingNotStarted(true);
      calculateTimeLeft(start);
    } else if (now >= start && now <= end) {
      setVotingNotStarted(false);
      calculateTimeLeft(end);
    }
  };

  const fetchCandidates = async () => {
    if (!period) return;
    const res = await fetch(`${serverUrl}/api/public/candidates?periodId=${period.id}`);
    const data = await res.json();
    setCandidates(data);
  };

  const checkUserVote = async () => {
    if (!userId || !period) return;
    const res = await fetch(
      `${serverUrl}/api/public/uservote?userId=${userId}&periodId=${period.id}`
    );
    const voteData = await res.json();
    if (voteData && voteData.candidateId) {
      setSelectedCandidate(voteData.candidateId);
      const votedFor = candidates.find((c) => c.id === voteData.candidateId);
      if (votedFor) setAlreadyVotedCandidate(votedFor.name);
    }
  };

  const calculateTimeLeft = (target) => {
    const now = new Date();
    const diff = target - now;
    if (diff <= 0) {
      fetchPeriod();
      return;
    }
    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    setTimeLeft(`${hours}h ${minutes}m ${seconds}s`);
    setTimeout(() => calculateTimeLeft(target), 1000);
  };

  const handleVote = async () => {
    if (!selectedCandidate || votingNotStarted || votingEnded) return;
    if (!token || !userId) {
      setMessage("Please login first.");
      return;
    }
    if (alreadyVotedCandidate) return;
    const res = await fetch(`${serverUrl}/api/vote`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify({ userId: parseInt(userId, 10), candidateId: selectedCandidate }),
    });
    if (res.ok) {
      setMessage("");
      setShowVoteModal(true);
      const votedFor = candidates.find((c) => c.id === selectedCandidate);
      if (votedFor) setAlreadyVotedCandidate(votedFor.name);
    } else {
      const data = await res.json().catch(() => ({}));
      setMessage(data.error || "Unable to submit vote. Please try again.");
    }
  };

  useEffect(() => {
    fetchPeriod();
    // We'll fetch candidates after we know the period
  }, []);

  useEffect(() => {
    if (period) {
      fetchCandidates();
    }
  }, [period]);

  useEffect(() => {
    if (candidates.length > 0 && period) {
      checkUserVote();
    }
  }, [candidates, period]);

  if (!period) {
    return (
      <div className="mx-auto max-w-xl">
        <div className="glass-card px-8 py-12 text-center">
          <h2 className="text-2xl font-semibold text-slate-900">No Voting Currently</h2>
          <p className="mt-4 text-slate-600">
            There is no active voting session at the moment. Please check back later for the next election window.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {message && (
        <div className="glass-card mx-auto max-w-3xl px-6 py-4 text-center text-sm font-semibold text-red-600">
          {message}
        </div>
      )}

      {votingNotStarted && !votingEnded && (
        <div className="glass-card mx-auto max-w-3xl px-8 py-10 text-center">
          <h2 className="text-2xl font-bold text-slate-900">Voting has not started yet</h2>
          {timeLeft && <p className="mt-4 text-lg text-blue-600">Starts in: {timeLeft}</p>}
          <p className="mt-6 text-slate-600">
            The voting booth will open automatically when the countdown ends. Stay close so you do not miss your chance.
          </p>
        </div>
      )}

      {!votingNotStarted && !votingEnded && (
        <div className="space-y-8">
          <div className="glass-card mx-auto max-w-4xl px-8 py-10 text-center">
            <h1 className="text-3xl font-bold text-slate-900">Vote for Your Candidate</h1>
            {timeLeft && <p className="mt-3 text-sm font-medium text-blue-600 uppercase tracking-[0.3em]">Voting ends in {timeLeft}</p>}
            {alreadyVotedCandidate && (
              <p className="mt-4 text-sm font-semibold text-emerald-600">
                You have already voted for {alreadyVotedCandidate}.
              </p>
            )}
            {!alreadyVotedCandidate && (
              <p className="mt-4 text-slate-600">
                Select a candidate below and submit your choice. You can only vote once per election period.
              </p>
            )}
          </div>

          <div className="mx-auto grid w-full max-w-5xl gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {candidates.length === 0 && (
              <div className="glass-card col-span-full px-6 py-8 text-center text-slate-600">
                No candidates available at the moment.
              </div>
            )}
            {candidates.map((candidate) => {
              const isSelected = selectedCandidate === candidate.id;
              const isDisabled = alreadyVotedCandidate && !isSelected;
              return (
                <button
                  type="button"
                  key={candidate.id}
                  onClick={() => {
                    if (!alreadyVotedCandidate) setSelectedCandidate(candidate.id);
                  }}
                  disabled={isDisabled}
                  className={`glass-card flex flex-col items-center gap-4 px-6 py-8 text-center transition ${
                    isSelected ? "border-blue-400 ring-2 ring-blue-200" : "hover:border-blue-200"
                  } ${isDisabled ? "opacity-60" : ""}`}
                >
                  <img
                    src={candidate.photoUrl || placeholderImage}
                    alt={candidate.name}
                    className="h-24 w-24 rounded-full border border-slate-200 object-cover shadow-sm"
                  />
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">{candidate.name}</h2>
                    <p className="mt-1 text-sm text-slate-500">{candidate.lga}</p>
                  </div>
                </button>
              );
            })}
          </div>

          {!alreadyVotedCandidate && selectedCandidate && candidates.length > 0 && (
            <div className="mx-auto flex w-full max-w-3xl justify-center">
              <button
                onClick={handleVote}
                className="flex w-full items-center justify-center gap-3 rounded-full bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500 sm:w-auto"
              >
                Submit Vote
              </button>
            </div>
          )}

          {alreadyVotedCandidate && (
            <div className="glass-card mx-auto max-w-3xl px-6 py-5 text-center text-sm text-emerald-600">
              Thank you! Your vote has already been recorded.
            </div>
          )}
        </div>
      )}

      {votingEnded && (
        <div className="glass-card mx-auto max-w-3xl px-8 py-10 text-center">
          <h2 className="text-2xl font-bold text-slate-900">Voting has ended</h2>
          {!resultsPublished && (
            <p className="mt-4 text-slate-600">Results will be published shortly. Stay tuned.</p>
          )}
          {resultsPublished && (
            <div className="mt-6 flex flex-wrap items-center justify-center gap-4">
              <a
                href="/results"
                className="rounded-full bg-blue-600 px-6 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500"
              >
                View Current Results
              </a>
              <a
                href="/past-results"
                className="rounded-full border border-slate-200 px-6 py-2 text-sm font-semibold text-slate-600 transition hover:border-blue-400 hover:text-blue-600"
              >
                View Past Results
              </a>
            </div>
          )}
        </div>
      )}

      {showVoteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur">
          <div className="glass-card w-full max-w-sm px-6 py-8 text-center">
            <h2 className="text-xl font-semibold text-slate-900">Vote Submitted</h2>
            <p className="mt-3 text-sm text-slate-600">Your vote has been recorded successfully!</p>
            <button
              onClick={() => setShowVoteModal(false)}
              className="mt-6 inline-flex rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500"
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
