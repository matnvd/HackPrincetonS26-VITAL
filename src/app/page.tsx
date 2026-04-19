"use client";

import { useState, useCallback } from "react";
import type { Patient } from "./types";
import HospitalTriageAI from "./components/sources";
import Dashboard from "./components/Dashboard";

export default function Home() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [activeTab, setActiveTab] = useState<"dashboard" | "sources">("dashboard");
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const handlePatientsChange = useCallback((p: Patient[]) => {
    setPatients(p);
  }, []);

  const handleDismiss = useCallback((key: string) => {
    setDismissed((prev) => new Set([...prev, key]));
  }, []);

  const visible = patients.filter((p) => !dismissed.has(`${p.cameraLabel}:${p.id}`));

  const counts = {
    CRITICAL:   visible.filter((p) => p.triage === "CRITICAL").length,
    URGENT:     visible.filter((p) => p.triage === "URGENT").length,
    STABLE:     visible.filter((p) => p.triage === "STABLE").length,
    MONITORING: visible.filter((p) => p.triage === "MONITORING").length,
  };

  const STATUS_CHIPS: { key: keyof typeof counts; label: string; color: string; bg: string }[] = [
    { key: "CRITICAL",   label: "Critical",   color: "#fca5a5", bg: "#7f1d1d" },
    { key: "URGENT",     label: "Urgent",     color: "#fcd34d", bg: "#78350f" },
    { key: "STABLE",     label: "Stable",     color: "#6ee7b7", bg: "#065f46" },
    { key: "MONITORING", label: "Monitoring", color: "#93c5fd", bg: "#1e3a5f" },
  ];

  return (
    <div className="min-h-screen" style={{ background: "#09090f", color: "white" }}>
      {/* Tab bar */}
      <div style={{ display: "flex", alignItems: "flex-end", borderBottom: "1px solid rgba(255,255,255,0.08)", padding: "12px 16px 0" }}>
        <button
          onClick={() => setActiveTab("dashboard")}
          style={{
            background: activeTab === "dashboard" ? "rgba(255,255,255,0.06)" : "transparent",
            border: "none",
            borderBottom: activeTab === "dashboard" ? "2px solid #f87171" : "2px solid transparent",
            padding: "8px 16px 10px",
            cursor: "pointer",
            marginRight: 4,
            borderRadius: "8px 8px 0 0",
            textAlign: "left",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: activeTab === "dashboard" ? "white" : "#64748b" }}>Dashboard</span>
            {visible.length > 0 && (
              <span style={{ background: "#ef4444", color: "white", fontSize: 10, fontWeight: 700, width: 18, height: 18, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {visible.length}
              </span>
            )}
          </div>
          <div style={{ fontSize: 11, color: "#334155" }}>Urgency-ranked patient cards</div>
        </button>

        <button
          onClick={() => setActiveTab("sources")}
          style={{
            background: activeTab === "sources" ? "rgba(255,255,255,0.06)" : "transparent",
            border: "none",
            borderBottom: activeTab === "sources" ? "2px solid #94a3b8" : "2px solid transparent",
            padding: "8px 16px 10px",
            cursor: "pointer",
            borderRadius: "8px 8px 0 0",
            textAlign: "left",
          }}
        >
          <div style={{ marginBottom: 2 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: activeTab === "sources" ? "white" : "#64748b" }}>Sources</span>
          </div>
          <div style={{ fontSize: 11, color: "#334155" }}>Live feed and uploaded footage</div>
        </button>

        {/* Triage counts — right side of tab bar */}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, paddingBottom: 10 }}>
          {STATUS_CHIPS.filter((c) => counts[c.key] > 0).map((c) => (
            <span key={c.key} style={{ display: "flex", alignItems: "center", gap: 5, background: c.bg, color: c.color, fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 999 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: c.color, display: "inline-block" }} />
              {counts[c.key]} {c.label}
            </span>
          ))}
          {visible.length === 0 && (
            <span style={{ fontSize: 11, color: "#334155" }}>No patients</span>
          )}
        </div>
      </div>

      {/* Dashboard tab */}
      <div style={{ display: activeTab === "dashboard" ? "block" : "none", padding: 20 }}>
        <Dashboard patients={visible} onDismiss={handleDismiss} />
      </div>

      {/* Sources tab — always mounted so cameras stay running */}
      <div style={{ display: activeTab === "sources" ? "block" : "none" }}>
        <HospitalTriageAI onPatientsChange={handlePatientsChange} />
      </div>
    </div>
  );
}
