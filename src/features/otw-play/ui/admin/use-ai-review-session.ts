import { useRef, useState } from "react";

export function useAiReviewSession(key: string) {
  const [rangeEnabled, setRangeEnabled] = useState(false);
  const [start, setStart] = useState("0");
  const [end, setEnd] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [songChoice, setSongChoice] = useState("");
  const generation = useRef(0);
  const autoJob = useRef<string | null>(null);
  const appliedJob = useRef<string | null>(null);
  const notificationJob = useRef<string | null>(null);
  const initialized = useRef(false);
  const previousScope = useRef<string | null>(null);
  const [sessionKey, setSessionKey] = useState(key);
  if (sessionKey !== key) {
    setSessionKey(key);
    generation.current++;
    initialized.current = false;
    previousScope.current = null;
    autoJob.current = null;
    appliedJob.current = null;
    notificationJob.current = null;
    setRangeEnabled(false); setStart("0"); setEnd(""); setJobId(null);
    setLaunching(false); setError(null); setSelected(null); setSongChoice("");
  }
  return { rangeEnabled, setRangeEnabled, start, setStart, end, setEnd, jobId, setJobId,
    launching, setLaunching, error, setError, selected, setSelected, songChoice, setSongChoice,
    generation, autoJob, appliedJob, notificationJob, initialized, previousScope };
}
