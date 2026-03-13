"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Legend,
} from "recharts";
import {
  pct,
  numFmt,
  statusColor,
  statusLabel,
  pillStyle,
} from "@/lib/oee-calculator";
import { GaugeCard } from "./GaugeCard";

/* ─── PLANT CONFIG ─── */
const PLANT_CONFIG: Record<
  string,
  { name: string; color: string; icon: string }
> = {
  ponorogo: { name: "Ponorogo", color: "#0066ff", icon: "🏭" },
  pakis: { name: "Pakis", color: "#059669", icon: "🏗" },
  tuban: { name: "Tuban", color: "#d97706", icon: "🏭" },
};

interface DailyRow {
  id: number;
  unit_id: number;
  tanggal: string;
  es_keluar: number;
  total_rusak: number;
  es_keluar_5kg?: number;
  es_keluar_10kg?: number;
  bak1?: number;
  bak2?: number;
  bak3?: number;
  bak3bb?: number;
  bak3bk?: number;
  bak4?: number;
  bak5?: number;
  rusak_p5k?: number;
  rusak_p10k?: number;
  rusak_kt?: number;
  beban_normal?: number;
  beban_puncak?: number;
  total_beban?: number;
  jumlah_mesin?: number;
  prod_jam?: number;
  kapasitas?: number;
  es_tidak_terjual?: number;
  realisasi_order?: number;
  tenaga_kerja?: number;
  output_tk?: number;
  kwh_wbp?: number;
  kwh_lwbp?: number;
  availability?: number;
  performance?: number;
  quality?: number;
  oee?: number;
  agg_availability?: number;
  agg_performance?: number;
  agg_quality?: number;
  agg_oee?: number;
  production_units?: {
    id: number;
    code: string;
    label: string;
    format: string;
  };
}
interface Unit {
  id: number;
  code: string;
  label: string;
  format: string;
}

/* ─── FORMAT TYPE ─── */
type PlantFormat = "balok" | "pakis" | "tuban" | "kristal";

/* ─── FORMAT BADGE helper ─── */
function getFormatBadge(format: string) {
  if (format === "kristal")
    return {
      label: "❄️ Format Kristal",
      bg: "#ede9fe",
      color: "#6d28d9",
      border: "#c4b5fd",
    };
  if (format === "pakis")
    return {
      label: "🧊 Format Pakis",
      bg: "#d1fae5",
      color: "#065f46",
      border: "#6ee7b7",
    };
  if (format === "tuban")
    return {
      label: "🏭 Format Tuban",
      bg: "#fef3c7",
      color: "#92400e",
      border: "#fcd34d",
    };
  return {
    label: "🧊 Format Balok",
    bg: "#dbeafe",
    color: "#1d4ed8",
    border: "#93c5fd",
  };
}

/* ─── CHART TOOLTIP ─── */
function ChartTip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 8,
        padding: "10px 14px",
        fontSize: 12,
        boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 6, color: "#1a1a1a" }}>
        {label}
      </div>
      {payload.map((p: any, i: number) => (
        <div
          key={i}
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 16,
            marginBottom: 2,
          }}
        >
          <span style={{ color: "#6b7280" }}>{p.name}</span>
          <span style={{ color: p.color || "#1a1a1a", fontWeight: 600 }}>
            {typeof p.value === "number" ? p.value.toFixed(1) + "%" : p.value}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ─── COMPARISON TOOLTIP ─── */
function CompareTip({ active, payload, label, isProduction }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 8,
        padding: "10px 14px",
        fontSize: 12,
        boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 6, color: "#1a1a1a" }}>
        {label}
      </div>
      {payload.map((p: any, i: number) => (
        <div
          key={i}
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 16,
            marginBottom: 2,
          }}
        >
          <span style={{ color: p.color || "#6b7280", fontWeight: 500 }}>
            {p.name}
          </span>
          <span style={{ color: p.color || "#1a1a1a", fontWeight: 700 }}>
            {typeof p.value === "number"
              ? isProduction
                ? numFmt(p.value)
                : p.value.toFixed(1) + "%"
              : p.value}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ─── DELTA BADGE ─── */
function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta === null || isNaN(delta))
    return <span style={{ color: "#9ca3af", fontSize: 11 }}>–</span>;
  const isPos = delta >= 0;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 2,
        padding: "2px 8px",
        borderRadius: 20,
        fontSize: 11,
        fontWeight: 700,
        background: isPos ? "#d1fae5" : "#fee2e2",
        color: isPos ? "#065f46" : "#7f1d1d",
      }}
    >
      {isPos ? "▲" : "▼"} {Math.abs(delta).toFixed(1)}pp
    </span>
  );
}

/* ─── COMPARISON METRIC CARD ─── */
function CompareMetricCard({
  label,
  valA,
  valB,
  colorA,
  colorB,
  labelA,
  labelB,
}: {
  label: string;
  valA: number | null;
  valB: number | null;
  colorA: string;
  colorB: string;
  labelA: string;
  labelB: string;
}) {
  const delta = valA !== null && valB !== null ? (valA - valB) * 100 : null;
  const pctA = valA !== null ? (valA * 100).toFixed(1) + "%" : "–";
  const pctB = valB !== null ? (valB * 100).toFixed(1) + "%" : "–";
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 12,
        padding: "18px 20px",
        border: "1px solid #e5e7eb",
        boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: "#9ca3af",
          fontWeight: 600,
          marginBottom: 12,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        {label}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          marginBottom: 10,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 11,
              color: colorA,
              fontWeight: 600,
              marginBottom: 2,
            }}
          >
            {labelA}
          </div>
          <div
            style={{
              fontSize: 26,
              fontWeight: 800,
              color: colorA,
              lineHeight: 1,
            }}
          >
            {pctA}
          </div>
        </div>
        <div style={{ textAlign: "center", padding: "0 8px" }}>
          <DeltaBadge delta={delta} />
        </div>
        <div style={{ textAlign: "right" }}>
          <div
            style={{
              fontSize: 11,
              color: colorB,
              fontWeight: 600,
              marginBottom: 2,
            }}
          >
            {labelB}
          </div>
          <div
            style={{
              fontSize: 26,
              fontWeight: 800,
              color: colorB,
              lineHeight: 1,
            }}
          >
            {pctB}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {[
          { c: colorA, v: valA, p: pctA },
          { c: colorB, v: valB, p: pctB },
        ].map(({ c, v, p }, i) => (
          <div
            key={i}
            style={{ display: "flex", alignItems: "center", gap: 6 }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: c,
                flexShrink: 0,
              }}
            />
            <div
              style={{
                flex: 1,
                height: 6,
                background: "#f3f4f6",
                borderRadius: 3,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${Math.min((v ?? 0) * 100, 100)}%`,
                  height: "100%",
                  background: c,
                  borderRadius: 3,
                  transition: "width 0.6s ease",
                }}
              />
            </div>
            <span
              style={{
                fontSize: 10,
                color: "#9ca3af",
                width: 34,
                textAlign: "right",
              }}
            >
              {p}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═════════════════════════════════════════════════════
   DUPLICATE CONFIRM DIALOG
════════════════════════════════════════════════════= */
interface DuplicateInfo {
  bulan: string;
  format: string;
  existingRows: number;
  newRows: number;
  confirmToken: string;
  firstDate: string;
  lastDate: string;
}

function DuplicateDialog({
  info,
  onConfirm,
  onCancel,
  color,
}: {
  info: DuplicateInfo;
  onConfirm: (token: string) => void;
  onCancel: () => void;
  color: string;
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 16,
          padding: "28px 32px",
          maxWidth: 440,
          width: "100%",
          boxShadow: "0 20px 60px rgba(0,0,0,0.18)",
          border: "1px solid #e5e7eb",
        }}
      >
        <div style={{ fontSize: 36, marginBottom: 12, textAlign: "center" }}>
          ⚠️
        </div>
        <div
          style={{
            fontSize: 16,
            fontWeight: 800,
            color: "#1a1a1a",
            textAlign: "center",
            marginBottom: 8,
          }}
        >
          Data sudah ada di database
        </div>
        <div
          style={{
            fontSize: 13,
            color: "#6b7280",
            textAlign: "center",
            marginBottom: 20,
            lineHeight: 1.6,
          }}
        >
          Data bulan <strong style={{ color: "#1a1a1a" }}>{info.bulan}</strong>{" "}
          untuk unit ini sudah tersimpan di database.
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 10,
            marginBottom: 24,
          }}
        >
          {[
            [
              "📦 Data Existing",
              `${info.existingRows} baris`,
              "#f59e0b",
              "#fffbeb",
              "#fde68a",
            ],
            [
              "📄 File Baru",
              `${info.newRows} baris`,
              color,
              `${color}10`,
              `${color}40`,
            ],
            [
              "📅 Rentang Tanggal",
              `${info.firstDate} s/d`,
              "#6b7280",
              "#f9fafb",
              "#e5e7eb",
            ],
            ["", info.lastDate, "#6b7280", "#f9fafb", "#e5e7eb"],
          ].map(([label, value, textColor, bg, border], i) => (
            <div
              key={i}
              style={{
                background: bg as string,
                border: `1px solid ${border}`,
                borderRadius: 10,
                padding: "12px 14px",
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  color: "#9ca3af",
                  marginBottom: 3,
                  fontWeight: 600,
                }}
              >
                {label}
              </div>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: textColor as string,
                }}
              >
                {value}
              </div>
            </div>
          ))}
        </div>
        <div
          style={{
            background: "#fef3c7",
            border: "1px solid #fde68a",
            borderRadius: 10,
            padding: "10px 14px",
            fontSize: 12,
            color: "#92400e",
            marginBottom: 24,
            lineHeight: 1.5,
          }}
        >
          <strong>⚠ Perhatian:</strong> Jika Anda menimpa, semua data lama untuk
          bulan <strong>{info.bulan}</strong> akan digantikan. Tindakan ini
          tidak dapat dibatalkan.
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1,
              padding: "11px 16px",
              borderRadius: 10,
              border: "1.5px solid #e5e7eb",
              background: "#fff",
              color: "#374151",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Batalkan
          </button>
          <button
            onClick={() => onConfirm(info.confirmToken)}
            style={{
              flex: 1,
              padding: "11px 16px",
              borderRadius: 10,
              border: "none",
              background: "#ef4444",
              color: "#fff",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "inherit",
              boxShadow: "0 4px 12px rgba(239,68,68,0.35)",
            }}
          >
            🔄 Ya, Timpa Data
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═════════════════════════════════════════════════════
   UPLOAD PANEL
════════════════════════════════════════════════════= */
function UploadPanel({
  unit,
  plantCode,
  onSuccess,
}: {
  unit: Unit;
  plantCode: string;
  onSuccess: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{
    type: "ok" | "warn" | "err";
    text: string;
  } | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [duplicateInfo, setDuplicateInfo] = useState<DuplicateInfo | null>(
    null,
  );
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const cfg = PLANT_CONFIG[plantCode];
  const badge = getFormatBadge(unit.format);

  const doUpload = async (file: File, confirmToken?: string) => {
    setUploading(true);
    setMessage({ type: "warn", text: "⏳ Mengupload dan memproses data..." });

    const fd = new FormData();
    fd.append("file", file);
    fd.append("unit_id", String(unit.id));
    fd.append("plant_code", plantCode);
    fd.append("expected_format", unit.format);

    try {
      let res: Response;
      if (confirmToken) {
        fd.append("confirm_token", confirmToken);
        res = await fetch("/api/upload", { method: "PATCH", body: fd });
      } else {
        res = await fetch("/api/upload", { method: "POST", body: fd });
      }

      const data = await res.json();

      if (res.status === 409 && data.duplicate) {
        setMessage(null);
        setPreview(file.name);
        setDuplicateInfo({
          bulan: data.bulan,
          format: data.format,
          existingRows: data.existingRows,
          newRows: data.newRows,
          confirmToken: data.confirmToken,
          firstDate: data.firstDate,
          lastDate: data.lastDate,
        });
        setPendingFile(file);
        setUploading(false);
        return;
      }

      if (!res.ok) throw new Error(data.error);

      const oeeStr =
        data.agg_oee != null ? (data.agg_oee * 100).toFixed(1) + "%" : "–";
      const overMsg = data.overwrite ? " <b>(data lama ditimpa)</b>" : "";
      setMessage({
        type: "ok",
        text: `✅ Berhasil upload <b>${data.rowCount} baris</b> · Bulan: ${data.bulan} · OEE: ${oeeStr}${overMsg}`,
      });
      setPreview(null);
      setPendingFile(null);
      setDuplicateInfo(null);
      onSuccess();
    } catch (e: any) {
      setMessage({ type: "err", text: "⚠ " + e.message });
      setPreview(null);
    }

    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleFileChange = async (file: File | null | undefined) => {
    if (!file) return;
    setMessage(null);
    setPreview(null);
    setDuplicateInfo(null);
    setPendingFile(null);
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      setMessage({ type: "err", text: "File harus berformat .xlsx atau .xls" });
      return;
    }
    setPreview(file.name);
    await doUpload(file);
  };

  const handleConfirmOverwrite = async (token: string) => {
    if (!pendingFile) return;
    setDuplicateInfo(null);
    await doUpload(pendingFile, token);
  };

  const handleCancelOverwrite = () => {
    setDuplicateInfo(null);
    setPendingFile(null);
    setPreview(null);
    setMessage({ type: "warn", text: "Upload dibatalkan." });
    if (fileRef.current) fileRef.current.value = "";
  };

  const msgStyle: Record<string, React.CSSProperties> = {
    ok: {
      background: "#d1fae5",
      color: "#065f46",
      border: "1px solid #6ee7b7",
    },
    warn: {
      background: "#fef9c3",
      color: "#713f12",
      border: "1px solid #fde047",
    },
    err: {
      background: "#fee2e2",
      color: "#7f1d1d",
      border: "1px solid #fca5a5",
    },
  };

  return (
    <>
      {duplicateInfo && (
        <DuplicateDialog
          info={duplicateInfo}
          onConfirm={handleConfirmOverwrite}
          onCancel={handleCancelOverwrite}
          color={cfg?.color ?? "#0066ff"}
        />
      )}
      <div
        style={{
          background: "#fff",
          borderRadius: 12,
          padding: "16px 20px",
          border: "1px solid #e5e7eb",
          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
          marginBottom: 16,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 12,
          }}
        >
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a" }}>
              📂 Upload Data XLSX
            </div>
            <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>
              Hanya menerima file format{" "}
              <b style={{ color: cfg?.color }}>{unit.format.toUpperCase()}</b> ·
              Unit: <b>{unit.label}</b>
            </div>
          </div>
          <div
            style={{
              padding: "4px 12px",
              borderRadius: 20,
              fontSize: 11,
              fontWeight: 700,
              background: badge.bg,
              color: badge.color,
              border: `1px solid ${badge.border}`,
            }}
          >
            {badge.label}
          </div>
        </div>
        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            style={{
              padding: "8px 18px",
              borderRadius: 8,
              border: "none",
              background: uploading ? "#e5e7eb" : (cfg?.color ?? "#0066ff"),
              color: uploading ? "#9ca3af" : "#fff",
              fontSize: 13,
              fontWeight: 600,
              cursor: uploading ? "not-allowed" : "pointer",
              fontFamily: "inherit",
            }}
          >
            {uploading ? "⏳ Memproses..." : "📂 Pilih File XLSX"}
          </button>
          {preview && !uploading && (
            <span
              style={{ fontSize: 12, color: "#6b7280", fontStyle: "italic" }}
            >
              📄 {preview}
            </span>
          )}
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            style={{ display: "none" }}
            onChange={(e) => handleFileChange(e.target.files?.[0])}
          />
        </div>
        {message && (
          <div
            style={{
              marginTop: 10,
              padding: "9px 14px",
              borderRadius: 8,
              fontSize: 12,
              lineHeight: 1.5,
              ...msgStyle[message.type],
            }}
            dangerouslySetInnerHTML={{ __html: message.text }}
          />
        )}
      </div>
    </>
  );
}

/* ════════════════════════════════
   MONTH FILTER BAR
   Menggantikan filter date range — tampil di semua tab kecuali Komparasi
════════════════════════════════ */
function MonthFilterBar({
  rows,
  selectedYm,
  onSelect,
  plantColor,
}: {
  rows: DailyRow[];
  selectedYm: string | null;
  onSelect: (ym: string | null) => void;
  plantColor: string;
}) {
  /* Hitung bulan unik + jumlah hari */
  const monthMap: Record<string, { count: number; oee: number | null }> = {};
  for (const r of rows) {
    const ym = r.tanggal.slice(0, 7);
    if (!monthMap[ym]) monthMap[ym] = { count: 0, oee: r.agg_oee ?? null };
    monthMap[ym].count++;
  }
  const months = Object.entries(monthMap).sort(([a], [b]) =>
    a.localeCompare(b),
  );

  if (months.length === 0) return null;

  const btnBase: React.CSSProperties = {
    padding: "4px 11px",
    borderRadius: 7,
    fontSize: 11,
    fontWeight: 600,
    cursor: "pointer",
    border: "1.5px solid",
    fontFamily: "inherit",
    transition: "all 0.15s",
    whiteSpace: "nowrap" as const,
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 5,
        flexWrap: "wrap",
      }}
    >
      <span
        style={{
          fontSize: 11,
          color: "#9ca3af",
          fontWeight: 500,
          flexShrink: 0,
        }}
      >
        Bulan:
      </span>

      {/* Tombol Semua */}
      <button
        onClick={() => onSelect(null)}
        style={{
          ...btnBase,
          borderColor: selectedYm === null ? "#1a1a1a" : "#e5e7eb",
          background: selectedYm === null ? "#1a1a1a" : "#fafafa",
          color: selectedYm === null ? "#fff" : "#374151",
        }}
      >
        Semua
      </button>

      {/* Tombol per bulan */}
      {months.map(([ym, info]) => {
        const [y, m] = ym.split("-").map(Number);
        const label = new Date(y, m - 1, 1).toLocaleString("id-ID", {
          month: "short",
          year: "2-digit",
        });
        const isSelected = selectedYm === ym;

        /* Warna status OEE di dot kecil */
        const oeeColor =
          info.oee != null
            ? info.oee >= 0.85
              ? "#10b981"
              : info.oee >= 0.6
                ? "#f59e0b"
                : "#ef4444"
            : "#d1d5db";

        return (
          <button
            key={ym}
            onClick={() => onSelect(isSelected ? null : ym)}
            style={{
              ...btnBase,
              borderColor: isSelected ? plantColor : "#e5e7eb",
              background: isSelected ? plantColor : "#fafafa",
              color: isSelected ? "#fff" : "#374151",
              boxShadow: isSelected ? `0 2px 8px ${plantColor}40` : "none",
            }}
          >
            <span
              style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
            >
              {/* Dot indikator OEE */}
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: isSelected ? "rgba(255,255,255,0.7)" : oeeColor,
                  flexShrink: 0,
                  display: "inline-block",
                }}
              />
              {label}
              <span style={{ fontSize: 9, opacity: 0.65, marginLeft: 1 }}>
                ({info.count}h)
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ════════════════════════════════
   PERIOD SELECTOR CARD
════════════════════════════════ */
interface PeriodInfo {
  start: string;
  end: string;
  label: string;
}

function PeriodSelectorCard({
  which,
  color,
  allRows,
  pending,
  onPendingChange,
  confirmed,
  onConfirm,
  label,
  onLabelChange,
  rowCount,
  agg,
  blockedYm,
}: {
  which: "A" | "B";
  color: string;
  allRows: DailyRow[];
  pending: PeriodInfo;
  onPendingChange: (p: PeriodInfo) => void;
  confirmed: PeriodInfo;
  onConfirm: () => void;
  label: string;
  onLabelChange: (v: string) => void;
  rowCount: number;
  agg: {
    oee: number | null;
    avail: number | null;
    perf: number | null;
    qual: number | null;
    totProd: number;
    totRusak: number;
    days: number;
  };
  blockedYm?: string;
}) {
  const monthMap: Record<string, { count: number; oee: number | null }> = {};
  for (const r of allRows) {
    const ym = r.tanggal.slice(0, 7);
    if (!monthMap[ym]) monthMap[ym] = { count: 0, oee: r.agg_oee ?? null };
    monthMap[ym].count++;
  }
  const months = Object.entries(monthMap).sort(([a], [b]) =>
    a.localeCompare(b),
  );

  const isDirty =
    pending.start !== confirmed.start ||
    pending.end !== confirmed.end ||
    pending.label !== confirmed.label;
  const canConfirm =
    pending.start !== "" && pending.end !== "" && pending.start <= pending.end;

  const selectMonth = (ym: string) => {
    const [y, m] = ym.split("-").map(Number);
    const start = `${ym}-01`;
    const end = new Date(y, m, 0).toISOString().slice(0, 10);
    const lbl = new Date(y, m - 1, 1).toLocaleString("id-ID", {
      month: "long",
      year: "numeric",
    });
    onPendingChange({ start, end, label: lbl });
    onLabelChange(lbl);
  };

  const selectedYm = pending.start ? pending.start.slice(0, 7) : "";
  const confirmedYm = confirmed.start ? confirmed.start.slice(0, 7) : "";

  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 14,
        border: `2px solid ${isDirty ? color + "60" : color + "25"}`,
        boxShadow: isDirty
          ? `0 0 0 3px ${color}15`
          : "0 1px 3px rgba(0,0,0,0.05)",
        transition: "all 0.2s",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          background: `${color}08`,
          padding: "16px 20px 14px",
          borderBottom: `1px solid ${color}15`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              background: color,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontSize: 14,
              fontWeight: 800,
              flexShrink: 0,
            }}
          >
            {which}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <input
              value={label}
              onChange={(e) => onLabelChange(e.target.value)}
              style={{
                border: "none",
                outline: "none",
                fontSize: 14,
                fontWeight: 700,
                color: "#1a1a1a",
                background: "transparent",
                fontFamily: "inherit",
                width: "100%",
                padding: 0,
              }}
              placeholder={`Nama Periode ${which}`}
            />
            <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 1 }}>
              {rowCount > 0
                ? `${rowCount} hari dikonfirmasi · ${confirmedYm}`
                : pending.start
                  ? "Belum dikonfirmasi — klik Terapkan"
                  : "Pilih bulan di bawah"}
            </div>
          </div>
          <div
            style={{
              padding: "3px 10px",
              borderRadius: 20,
              fontSize: 10,
              fontWeight: 700,
              flexShrink: 0,
              background: !pending.start
                ? "#f3f4f6"
                : isDirty
                  ? "#fef9c3"
                  : "#d1fae5",
              color: !pending.start
                ? "#9ca3af"
                : isDirty
                  ? "#92400e"
                  : "#065f46",
              border: `1px solid ${!pending.start ? "#e5e7eb" : isDirty ? "#fde047" : "#6ee7b7"}`,
            }}
          >
            {!pending.start
              ? "Kosong"
              : isDirty
                ? "● Perlu Konfirmasi"
                : "✓ Aktif"}
          </div>
        </div>
      </div>

      <div style={{ padding: "16px 20px 20px" }}>
        {months.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "#6b7280",
                marginBottom: 8,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: color,
                  display: "inline-block",
                }}
              />
              Bulan tersedia di database ({months.length} bulan)
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {months.map(([ym, info]) => {
                const [y, m] = ym.split("-").map(Number);
                const lbl = new Date(y, m - 1, 1).toLocaleString("id-ID", {
                  month: "short",
                  year: "2-digit",
                });
                const isPending = selectedYm === ym;
                const isConfirmed = confirmedYm === ym && !isDirty;
                const isBlocked = blockedYm === ym;
                return (
                  <button
                    key={ym}
                    onClick={() => !isBlocked && selectMonth(ym)}
                    title={
                      isBlocked
                        ? `Bulan ini sudah dipakai di Periode ${which === "A" ? "B" : "A"}`
                        : undefined
                    }
                    style={{
                      padding: "5px 11px",
                      borderRadius: 8,
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: isBlocked ? "not-allowed" : "pointer",
                      fontFamily: "inherit",
                      border: `1.5px solid ${isBlocked ? "#e5e7eb" : isPending ? color : isConfirmed ? color + "80" : "#e5e7eb"}`,
                      background: isBlocked
                        ? "#f3f4f6"
                        : isPending
                          ? color
                          : isConfirmed
                            ? color + "12"
                            : "#fafafa",
                      color: isBlocked
                        ? "#d1d5db"
                        : isPending
                          ? "#fff"
                          : isConfirmed
                            ? color
                            : "#374151",
                      boxShadow: isPending ? `0 2px 8px ${color}40` : "none",
                      position: "relative" as const,
                      transition: "all 0.15s",
                      opacity: isBlocked ? 0.6 : 1,
                      textDecoration: isBlocked ? "line-through" : "none",
                    }}
                  >
                    {lbl}
                    <span style={{ fontSize: 9, opacity: 0.75, marginLeft: 4 }}>
                      ({info.count}h)
                    </span>
                    {isConfirmed && !isPending && (
                      <span
                        style={{
                          position: "absolute",
                          top: -3,
                          right: -3,
                          width: 7,
                          height: 7,
                          borderRadius: "50%",
                          background: "#10b981",
                          border: "1.5px solid #fff",
                        }}
                      />
                    )}
                    {isBlocked && (
                      <span
                        style={{
                          position: "absolute",
                          top: -3,
                          right: -3,
                          width: 7,
                          height: 7,
                          borderRadius: "50%",
                          background: "#ef4444",
                          border: "1.5px solid #fff",
                        }}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <button
          onClick={onConfirm}
          disabled={!canConfirm}
          style={{
            width: "100%",
            padding: "10px 16px",
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 700,
            cursor: canConfirm ? "pointer" : "not-allowed",
            border: "none",
            fontFamily: "inherit",
            background: !canConfirm ? "#f3f4f6" : isDirty ? color : "#e5e7eb",
            color: !canConfirm ? "#9ca3af" : isDirty ? "#fff" : "#6b7280",
            boxShadow: isDirty && canConfirm ? `0 4px 12px ${color}40` : "none",
            transition: "all 0.2s",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          {!canConfirm ? (
            <>
              <span>📅</span> Pilih bulan terlebih dahulu
            </>
          ) : isDirty ? (
            <>
              <span>✓</span> Terapkan Periode {which} &nbsp;
              <span style={{ opacity: 0.8, fontSize: 11, fontWeight: 500 }}>
                ({pending.label || pending.start.slice(0, 7)})
              </span>
            </>
          ) : (
            <>
              <span>✓</span> Periode {which} sudah aktif ({rowCount} hari)
            </>
          )}
        </button>

        {rowCount > 0 && !isDirty && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 6,
              marginTop: 12,
            }}
          >
            {(
              [
                ["OEE", agg.oee],
                ["Avail", agg.avail],
                ["Perf", agg.perf],
                ["Qual", agg.qual],
              ] as [string, number | null][]
            ).map(([l, v]) => (
              <div
                key={l}
                style={{
                  background: `${color}08`,
                  borderRadius: 8,
                  padding: "8px 6px",
                  textAlign: "center",
                  border: `1px solid ${color}18`,
                }}
              >
                <div
                  style={{ fontSize: 10, color: "#9ca3af", marginBottom: 2 }}
                >
                  {l}
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color }}>
                  {v !== null ? (v * 100).toFixed(1) + "%" : "–"}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════
   TABLE HEADERS per format
════════════════════════════════ */
function getTabelHeaders(format: PlantFormat): string[] {
  if (format === "kristal")
    return [
      "Tanggal",
      "Es 5kg",
      "Es 10kg",
      "Total Es",
      "Retur 5kg",
      "Retur 10kg",
      "Total Retur",
      "Realisasi",
      "Prod/Jam",
      "Kapasitas",
      "Es Tdk Terjual",
      "kWh WBP",
      "kWh LWBP",
      "Availability",
      "Performance",
      "Quality",
      "OEE",
    ];
  if (format === "pakis")
    return [
      "Tanggal",
      "Es Keluar",
      "Total Rusak",
      "Bak 1",
      "Bak 2",
      "Bbn Normal",
      "Bbn Puncak",
      "Total Beban",
      "Mesin",
      "Prod/Jam",
      "Availability",
      "Performance",
      "Quality",
      "OEE",
    ];
  if (format === "tuban")
    return [
      "Tanggal",
      "Es Keluar",
      "Bak 1",
      "Bak 2",
      "Bak 3 BB",
      "Bak 3 BK",
      "Bak 4",
      "Bak 5",
      "Total Rusak",
      "Bbn Normal",
      "Bbn Puncak",
      "Total Beban",
      "Mesin",
      "Prod/Jam",
      "Availability",
      "Performance",
      "Quality",
      "OEE",
    ];
  return [
    "Tanggal",
    "Es Keluar",
    "Total Rusak",
    "Bak 1",
    "Bak 2",
    "Bak 3",
    "Bbn Normal",
    "Bbn Puncak",
    "Total Beban",
    "Mesin",
    "Prod/Jam",
    "Availability",
    "Performance",
    "Quality",
    "OEE",
  ];
}

/* ─── TABLE ROW component ─── */
function TabelRow({
  r,
  format,
  getDailyOEE,
  getDailyAvail,
  getDailyPerf,
  getDailyQual,
}: {
  r: DailyRow;
  format: PlantFormat;
  getDailyOEE: (r: DailyRow) => number | null;
  getDailyAvail: (r: DailyRow) => number | null;
  getDailyPerf: (r: DailyRow) => number | null;
  getDailyQual: (r: DailyRow) => number | null;
}) {
  const oee = getDailyOEE(r);
  const avail = getDailyAvail(r);
  const perf = getDailyPerf(r);
  const qual = getDailyQual(r);

  const td = (content: React.ReactNode, extra?: React.CSSProperties) => (
    <td style={{ padding: "9px 12px", ...extra }}>{content}</td>
  );

  const tdRusak = (val: number | undefined, bold = false) => {
    const v = val ?? 0;
    return td(v > 0 ? v : "–", {
      color: v > 0 ? "#ef4444" : "#d1d5db",
      fontWeight: bold && v > 0 ? 700 : 400,
    });
  };

  return (
    <tr className="tbl-row" style={{ borderTop: "1px solid #f3f4f6" }}>
      {td(r.tanggal, { whiteSpace: "nowrap", fontWeight: 500 })}

      {format === "kristal" ? (
        <>
          {td(numFmt(r.es_keluar_5kg ?? 0), { color: "#6b7280" })}
          {td(numFmt(r.es_keluar_10kg ?? 0), { color: "#6b7280" })}
          {td(numFmt(r.es_keluar), { fontWeight: 600 })}
          {td(r.rusak_p5k ?? 0, {
            color: (r.rusak_p5k ?? 0) > 0 ? "#ef4444" : "#d1d5db",
          })}
          {td(r.rusak_p10k ?? 0, {
            color: (r.rusak_p10k ?? 0) > 0 ? "#ef4444" : "#d1d5db",
          })}
          {td(r.total_rusak, {
            color: r.total_rusak > 0 ? "#ef4444" : "#d1d5db",
            fontWeight: r.total_rusak > 0 ? 600 : 400,
          })}
          {td(numFmt(r.realisasi_order ?? 0), { color: "#6b7280" })}
          {td(r.prod_jam != null ? r.prod_jam.toFixed(1) : "–", {
            color: "#6b7280",
          })}
          {td(numFmt(r.kapasitas ?? 0), { color: "#6b7280" })}
          {td(numFmt(r.es_tidak_terjual ?? 0), { color: "#6b7280" })}
          {td(r.kwh_wbp ?? "–", { color: "#6b7280" })}
          {td(r.kwh_lwbp ?? "–", { color: "#6b7280" })}
        </>
      ) : format === "pakis" ? (
        <>
          {td(numFmt(r.es_keluar), { fontWeight: 600 })}
          {td(r.total_rusak, {
            color: r.total_rusak > 0 ? "#ef4444" : "#d1d5db",
            fontWeight: r.total_rusak > 0 ? 600 : 400,
          })}
          {tdRusak(r.bak1)}
          {tdRusak(r.bak2)}
          {td(r.beban_normal ?? "–", { color: "#6b7280" })}
          {td((r.beban_puncak ?? 0) > 0 ? r.beban_puncak : 0, {
            color: (r.beban_puncak ?? 0) > 0 ? "#3b82f6" : "#6b7280",
          })}
          {td(r.total_beban ?? "–", { fontWeight: 600, color: "#374151" })}
          {td(r.jumlah_mesin ?? "–", { color: "#6b7280" })}
          {td(r.prod_jam != null ? r.prod_jam.toFixed(1) : "–", {
            color: "#6b7280",
          })}
        </>
      ) : format === "tuban" ? (
        <>
          {td(numFmt(r.es_keluar), { fontWeight: 600 })}
          {tdRusak(r.bak1)}
          {tdRusak(r.bak2)}
          {tdRusak(r.bak3bb)}
          {tdRusak(r.bak3bk)}
          {tdRusak(r.bak4)}
          {tdRusak(r.bak5)}
          {td(r.total_rusak > 0 ? r.total_rusak : "–", {
            color: r.total_rusak > 0 ? "#ef4444" : "#d1d5db",
            fontWeight: r.total_rusak > 0 ? 700 : 400,
            background: r.total_rusak > 0 ? "#fff5f5" : undefined,
            borderLeft: "2px solid #fecaca",
          })}
          {td(r.beban_normal ?? "–", { color: "#6b7280" })}
          {td((r.beban_puncak ?? 0) > 0 ? r.beban_puncak : 0, {
            color: (r.beban_puncak ?? 0) > 0 ? "#3b82f6" : "#6b7280",
          })}
          {td(r.total_beban ?? "–", { fontWeight: 600, color: "#374151" })}
          {td(r.jumlah_mesin ?? "–", { color: "#6b7280" })}
          {td(r.prod_jam != null ? r.prod_jam.toFixed(1) : "–", {
            color: "#6b7280",
          })}
        </>
      ) : (
        <>
          {td(numFmt(r.es_keluar), { fontWeight: 600 })}
          {td(r.total_rusak, {
            color: r.total_rusak > 0 ? "#ef4444" : "#d1d5db",
            fontWeight: r.total_rusak > 0 ? 600 : 400,
          })}
          {tdRusak(r.bak1)}
          {tdRusak(r.bak2)}
          {tdRusak(r.bak3)}
          {td(r.beban_normal ?? "–", { color: "#6b7280" })}
          {td((r.beban_puncak ?? 0) > 0 ? r.beban_puncak : 0, {
            color: (r.beban_puncak ?? 0) > 0 ? "#3b82f6" : "#6b7280",
          })}
          {td(r.total_beban ?? "–", { fontWeight: 600, color: "#374151" })}
          {td(r.jumlah_mesin ?? "–", { color: "#6b7280" })}
          {td(r.prod_jam != null ? r.prod_jam.toFixed(1) : "–", {
            color: "#6b7280",
          })}
        </>
      )}

      {td(pct(avail), { color: statusColor(avail), fontWeight: 600 })}
      {td(pct(perf), { color: statusColor(perf), fontWeight: 600 })}
      {td(pct(qual), { color: statusColor(qual), fontWeight: 600 })}
      {td(pct(oee), { color: statusColor(oee), fontWeight: 700 })}
    </tr>
  );
}

/* ════════════════════════════════
   CACHE HELPERS
════════════════════════════════ */
const cacheKey = (uid: number) => `oee_rows_${uid}`;
const cacheGet = (uid: number): DailyRow[] | null => {
  try {
    const r = sessionStorage.getItem(cacheKey(uid));
    if (!r) return null;
    const { data, ts } = JSON.parse(r);
    if (Date.now() - ts > 600000) {
      sessionStorage.removeItem(cacheKey(uid));
      return null;
    }
    return data;
  } catch {
    return null;
  }
};
const cacheSet = (uid: number, data: DailyRow[]) => {
  try {
    sessionStorage.setItem(
      cacheKey(uid),
      JSON.stringify({ data, ts: Date.now() }),
    );
  } catch {}
};
const cacheClear = (uid: number) => {
  try {
    sessionStorage.removeItem(cacheKey(uid));
  } catch {}
};

/* ════════════════════════════════
   MAIN DASHBOARD
════════════════════════════════ */
export default function OEEDashboard({ plantCode }: { plantCode: string }) {
  const cfg = PLANT_CONFIG[plantCode] ?? {
    name: plantCode,
    color: "#6b7280",
    icon: "🏭",
  };

  const [units, setUnits] = useState<Unit[]>([]);
  const [activeUnit, setActiveUnit] = useState<number | null>(null);
  const [rows, setRows] = useState<DailyRow[]>([]);
  const [selectedYm, setSelectedYm] = useState<string | null>(null); // ← GANTI startDate/endDate
  const [tab, setTab] = useState<
    "overview" | "produksi" | "tabel" | "komparasi"
  >("overview");
  const [loading, setLoading] = useState(true);

  const emptyPeriod: PeriodInfo = { start: "", end: "", label: "" };
  const [pendingA, setPendingA] = useState<PeriodInfo>(emptyPeriod);
  const [pendingB, setPendingB] = useState<PeriodInfo>(emptyPeriod);
  const [confirmedA, setConfirmedA] = useState<PeriodInfo>(emptyPeriod);
  const [confirmedB, setConfirmedB] = useState<PeriodInfo>(emptyPeriod);
  const [labelA, setLabelA] = useState("Periode A");
  const [labelB, setLabelB] = useState("Periode B");

  const COLOR_A = cfg.color;
  const COLOR_B = "#a855f7";

  /* Reset selectedYm saat unit berubah */
  useEffect(() => {
    setSelectedYm(null);
  }, [activeUnit]);

  useEffect(() => {
    fetch("/api/plants")
      .then(async (r) => {
        if (!r.ok) return [];
        const j = await r.json();
        return Array.isArray(j) ? j : [];
      })
      .then((plants: any[]) => {
        const plant = plants.find((p) => p.code === plantCode);
        if (plant) {
          setUnits(plant.production_units ?? []);
          setActiveUnit(plant.production_units?.[0]?.id ?? null);
        }
      })
      .catch((e) => console.error("Units error:", e));
  }, [plantCode]);

  const loadData = useCallback(
    async (forceRefresh = false) => {
      if (!activeUnit) return;
      setLoading(true);
      try {
        if (!forceRefresh) {
          const cached = cacheGet(activeUnit);
          if (cached?.length) {
            setRows(cached);
            setLoading(false);
            return;
          }
        }
        const res = await fetch(`/api/oee?unit_id=${activeUnit}`);
        if (!res.ok) {
          console.error("OEE fetch:", (await res.text()).slice(0, 300));
          setRows([]);
          setLoading(false);
          return;
        }
        const newRows = await res
          .json()
          .then((d: any) => (Array.isArray(d) ? d : []));
        setRows(newRows);
        if (newRows.length) cacheSet(activeUnit, newRows);
      } catch (e) {
        console.error(e);
        setRows([]);
      }
      setLoading(false);
    },
    [activeUnit],
  );

  useEffect(() => {
    loadData();
  }, [activeUnit]);

  const [pendingRefresh, setPendingRefresh] = useState(false);
  const handleUploadSuccess = useCallback(() => {
    if (activeUnit) cacheClear(activeUnit);
    setPendingRefresh(true);
  }, [activeUnit]);
  useEffect(() => {
    if (pendingRefresh) {
      setPendingRefresh(false);
      loadData(true);
    }
  }, [pendingRefresh, loadData]);

  /* ── Filter data berdasarkan bulan yang dipilih ── */
  const data = selectedYm
    ? rows.filter((r) => r.tanggal.startsWith(selectedYm))
    : rows;

  const dataA = rows.filter(
    (r) =>
      confirmedA.start &&
      confirmedA.end &&
      r.tanggal >= confirmedA.start &&
      r.tanggal <= confirmedA.end,
  );
  const dataB = rows.filter(
    (r) =>
      confirmedB.start &&
      confirmedB.end &&
      r.tanggal >= confirmedB.start &&
      r.tanggal <= confirmedB.end,
  );

  const activeUnitFormat = (units.find((u) => u.id === activeUnit)?.format ??
    "balok") as PlantFormat;

  const getDailyOEE = (r: DailyRow): number | null => r.oee ?? null;
  const getDailyAvail = (r: DailyRow): number | null => r.availability ?? null;
  const getDailyPerf = (r: DailyRow): number | null => r.performance ?? null;
  const getDailyQual = (r: DailyRow): number | null => r.quality ?? null;
  const getOEE = (r: DailyRow): number | null => r.agg_oee ?? r.oee ?? null;
  const getAvail = (r: DailyRow): number | null =>
    r.agg_availability ?? r.availability ?? null;
  const getPerf = (r: DailyRow): number | null =>
    r.agg_performance ?? r.performance ?? null;
  const getQual = (r: DailyRow): number | null =>
    r.agg_quality ?? r.quality ?? null;

  /*
   * ── AGGREGATE OEE (untuk GaugeCard & Ringkasan Produksi) ──────────────────
   *
   * Strategi: ambil agg_oee dari baris PERTAMA tiap bulan
   * (backend menyimpan nilai agregat bulanan di setiap baris),
   * lalu rata-ratakan antar bulan yang masuk ke `data`.
   *
   * Kalau hanya 1 bulan dipilih → langsung pakai agg_oee bulan itu.
   * Kalau "Semua" → rata-rata agg_oee semua bulan yang ada.
   * Fallback ke rata-rata harian kalau agg_oee tidak tersedia.
   */
  const computeDisplayAgg = (rs: DailyRow[]) => {
    if (!rs.length) return { oee: null, avail: null, perf: null, qual: null };

    // Kumpulkan nilai agg per bulan (ambil row pertama tiap bulan)
    const seenYm = new Set<string>();
    const monthAggs: {
      oee: number | null;
      avail: number | null;
      perf: number | null;
      qual: number | null;
    }[] = [];

    for (const r of rs) {
      const ym = r.tanggal.slice(0, 7);
      if (seenYm.has(ym)) continue;
      seenYm.add(ym);
      monthAggs.push({
        oee: r.agg_oee ?? null,
        avail: r.agg_availability ?? null,
        perf: r.agg_performance ?? null,
        qual: r.agg_quality ?? null,
      });
    }

    // Cek apakah backend menyediakan nilai agg — kalau iya, rata-ratakan antar bulan
    const hasAgg = monthAggs.some((m) => m.oee !== null);
    if (hasAgg) {
      const avgOf = (key: keyof (typeof monthAggs)[0]) => {
        const vals = monthAggs
          .map((m) => m[key])
          .filter((v): v is number => v !== null);
        return vals.length
          ? vals.reduce((a, b) => a + b, 0) / vals.length
          : null;
      };
      return {
        oee: avgOf("oee"),
        avail: avgOf("avail"),
        perf: avgOf("perf"),
        qual: avgOf("qual"),
      };
    }

    // Fallback: rata-rata harian kalau agg tidak ada
    const avgDaily = (fn: (r: DailyRow) => number | null) => {
      const vals = rs.map(fn).filter((v): v is number => v !== null);
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    };
    return {
      oee: avgDaily(getDailyOEE),
      avail: avgDaily(getDailyAvail),
      perf: avgDaily(getDailyPerf),
      qual: avgDaily(getDailyQual),
    };
  };

  const {
    oee: aggOEE,
    avail: aggAvail,
    perf: aggPerf,
    qual: aggQual,
  } = computeDisplayAgg(data);
  const totProd = data.reduce((s, r) => s + r.es_keluar, 0);
  const totRusak = data.reduce((s, r) => s + r.total_rusak, 0);
  const defRate = totProd > 0 ? totRusak / totProd : 0;
  const avgPerDay = data.length ? Math.round(totProd / data.length) : 0;

  const lineData = data.map((r) => ({
    date: r.tanggal.slice(5),
    OEE: +((getDailyOEE(r) ?? 0) * 100).toFixed(1),
    Availability: +((getDailyAvail(r) ?? 0) * 100).toFixed(1),
    Performance: +((getDailyPerf(r) ?? 0) * 100).toFixed(1),
    Quality: +((getDailyQual(r) ?? 0) * 100).toFixed(1),
  }));
  const barData = data.map((r) => ({
    date: r.tanggal.slice(5),
    "Es Keluar": r.es_keluar,
    Rusak: r.total_rusak,
  }));

  /*
   * computeAgg — dipakai tab Komparasi (Periode A & B)
   * Rata-rata agg_oee per bulan, fallback ke rata-rata harian.
   */
  const computeAgg = (rs: DailyRow[]) => {
    if (!rs.length)
      return {
        oee: null,
        avail: null,
        perf: null,
        qual: null,
        totProd: 0,
        totRusak: 0,
        days: 0,
      };
    const seenYm = new Set<string>();
    const mAggs: {
      oee: number | null;
      avail: number | null;
      perf: number | null;
      qual: number | null;
    }[] = [];
    for (const r of rs) {
      const ym = r.tanggal.slice(0, 7);
      if (seenYm.has(ym)) continue;
      seenYm.add(ym);
      mAggs.push({
        oee: r.agg_oee ?? null,
        avail: r.agg_availability ?? null,
        perf: r.agg_performance ?? null,
        qual: r.agg_quality ?? null,
      });
    }
    const totP = rs.reduce((s, r) => s + r.es_keluar, 0);
    const totR = rs.reduce((s, r) => s + r.total_rusak, 0);
    const hasAgg = mAggs.some((m) => m.oee !== null);
    if (hasAgg) {
      const avgOf = (key: keyof (typeof mAggs)[0]) => {
        const vals = mAggs
          .map((m) => m[key])
          .filter((v): v is number => v !== null);
        return vals.length
          ? vals.reduce((a, b) => a + b, 0) / vals.length
          : null;
      };
      return {
        oee: avgOf("oee"),
        avail: avgOf("avail"),
        perf: avgOf("perf"),
        qual: avgOf("qual"),
        totProd: totP,
        totRusak: totR,
        days: rs.length,
      };
    }
    const avgD = (fn: (r: DailyRow) => number | null) => {
      const vals = rs.map(fn).filter((v): v is number => v !== null);
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    };
    return {
      oee: avgD(getDailyOEE),
      avail: avgD(getDailyAvail),
      perf: avgD(getDailyPerf),
      qual: avgD(getDailyQual),
      totProd: totP,
      totRusak: totR,
      days: rs.length,
    };
  };

  const aggA = computeAgg(dataA);
  const aggB = computeAgg(dataB);

  const maxLen = Math.max(dataA.length, dataB.length);
  const overlayData = Array.from({ length: maxLen }, (_, i) => ({
    idx: `H${i + 1}`,
    [`OEE ${labelA}`]: dataA[i]
      ? +((getDailyOEE(dataA[i]) ?? 0) * 100).toFixed(1)
      : null,
    [`OEE ${labelB}`]: dataB[i]
      ? +((getDailyOEE(dataB[i]) ?? 0) * 100).toFixed(1)
      : null,
  }));

  const radarData = [
    {
      metric: "OEE",
      [labelA]: aggA.oee != null ? +(aggA.oee * 100).toFixed(1) : 0,
      [labelB]: aggB.oee != null ? +(aggB.oee * 100).toFixed(1) : 0,
    },
    {
      metric: "Availability",
      [labelA]: aggA.avail != null ? +(aggA.avail * 100).toFixed(1) : 0,
      [labelB]: aggB.avail != null ? +(aggB.avail * 100).toFixed(1) : 0,
    },
    {
      metric: "Performance",
      [labelA]: aggA.perf != null ? +(aggA.perf * 100).toFixed(1) : 0,
      [labelB]: aggB.perf != null ? +(aggB.perf * 100).toFixed(1) : 0,
    },
    {
      metric: "Quality",
      [labelA]: aggA.qual != null ? +(aggA.qual * 100).toFixed(1) : 0,
      [labelB]: aggB.qual != null ? +(aggB.qual * 100).toFixed(1) : 0,
    },
  ];

  const prodCompareData = [
    { name: "Total Produksi", [labelA]: aggA.totProd, [labelB]: aggB.totProd },
    { name: "Total Defect", [labelA]: aggA.totRusak, [labelB]: aggB.totRusak },
    {
      name: "Rata-rata/Hari",
      [labelA]: aggA.days ? Math.round(aggA.totProd / aggA.days) : 0,
      [labelB]: aggB.days ? Math.round(aggB.totProd / aggB.days) : 0,
    },
  ];

  const tabs: [
    "overview" | "produksi" | "tabel" | "komparasi",
    string,
    string,
  ][] = [
    ["overview", "Overview", "📊"],
    ["produksi", "Produksi & Defect", "🧊"],
    ["tabel", "Data Harian", "📋"],
    ["komparasi", "Komparasi Periode", "⚖️"],
  ];

  const fmtChip = (fmt: PlantFormat) => ({
    bg:
      fmt === "kristal"
        ? "#ede9fe"
        : fmt === "pakis"
          ? "#d1fae5"
          : fmt === "tuban"
            ? "#fef3c7"
            : "#dbeafe",
    color:
      fmt === "kristal"
        ? "#6d28d9"
        : fmt === "pakis"
          ? "#065f46"
          : fmt === "tuban"
            ? "#92400e"
            : "#1d4ed8",
  });

  /* Label periode aktif untuk subtitle */
  const activePeriodLabel = selectedYm
    ? (() => {
        const [y, m] = selectedYm.split("-").map(Number);
        return new Date(y, m - 1, 1).toLocaleString("id-ID", {
          month: "long",
          year: "numeric",
        });
      })()
    : "Semua bulan";

  return (
    <div
      style={{
        fontFamily: "'DM Sans','Segoe UI',sans-serif",
        background: "#f5f7fa",
        color: "#1a1a1a",
        padding: 20,
        minHeight: "100vh",
      }}
    >
      <style>{`
        @keyframes fadeUp { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        .tbl-row:hover td { background:#f9fafb !important; }
        .month-filter-btn { transition: all 0.15s; }
        .month-filter-btn:hover { opacity: 0.85; }
      `}</style>

      {/* SUB-HEADER */}
      <div
        style={{
          background: "#fff",
          padding: "12px 20px",
          borderRadius: 12,
          marginBottom: 16,
          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
          border: "1px solid #e5e7eb",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 10,
          }}
        >
          {/* Kiri: Info pabrik */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: `${cfg.color}18`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 18,
              }}
            >
              {cfg.icon}
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>
                Pabrik {cfg.name}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "#9ca3af",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <span>
                  {units.find((u) => u.id === activeUnit)?.label ?? "–"} ·{" "}
                  {data.length} hari data
                </span>
                {tab !== "komparasi" && selectedYm && (
                  <span
                    style={{
                      padding: "1px 7px",
                      borderRadius: 10,
                      fontSize: 10,
                      fontWeight: 600,
                      background: `${cfg.color}15`,
                      color: cfg.color,
                      border: `1px solid ${cfg.color}30`,
                    }}
                  >
                    {activePeriodLabel}
                  </span>
                )}
                {activeUnitFormat && (
                  <span
                    style={{
                      padding: "1px 7px",
                      borderRadius: 10,
                      fontSize: 10,
                      fontWeight: 600,
                      ...fmtChip(activeUnitFormat),
                    }}
                  >
                    {activeUnitFormat.charAt(0).toUpperCase() +
                      activeUnitFormat.slice(1)}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Kanan: Kontrol */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            {/* Unit tabs */}
            {units.length > 1 && (
              <div style={{ display: "flex", gap: 4 }}>
                {units.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => setActiveUnit(u.id)}
                    style={{
                      padding: "5px 12px",
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 500,
                      cursor: "pointer",
                      border: "1px solid",
                      borderColor: activeUnit === u.id ? cfg.color : "#e5e7eb",
                      background: activeUnit === u.id ? cfg.color : "#fff",
                      color: activeUnit === u.id ? "#fff" : "#6b7280",
                      fontFamily: "inherit",
                    }}
                  >
                    {u.label}
                  </button>
                ))}
              </div>
            )}

            <div style={{ width: 1, height: 20, background: "#e5e7eb" }} />

            {/* Tab navigasi */}
            <div style={{ display: "flex", gap: 4 }}>
              {tabs.map(([id, lbl, icon]) => (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  style={{
                    padding: "5px 12px",
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 500,
                    cursor: "pointer",
                    border: "1px solid",
                    borderColor:
                      tab === id
                        ? id === "komparasi"
                          ? COLOR_B
                          : cfg.color
                        : "#e5e7eb",
                    background:
                      tab === id
                        ? id === "komparasi"
                          ? COLOR_B
                          : cfg.color
                        : "#fff",
                    color: tab === id ? "#fff" : "#6b7280",
                    fontFamily: "inherit",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <span>{icon}</span>
                  <span>{lbl}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── MONTH FILTER BAR — tampil di semua tab kecuali Komparasi ── */}
        {tab !== "komparasi" && rows.length > 0 && (
          <div
            style={{
              marginTop: 12,
              paddingTop: 12,
              borderTop: "1px solid #f3f4f6",
            }}
          >
            <MonthFilterBar
              rows={rows}
              selectedYm={selectedYm}
              onSelect={setSelectedYm}
              plantColor={cfg.color}
            />
          </div>
        )}
      </div>

      {/* UPLOAD PANEL */}
      {units.length > 0 &&
        activeUnit &&
        (() => {
          const u = units.find((u) => u.id === activeUnit);
          return u ? (
            <UploadPanel
              unit={u}
              plantCode={plantCode}
              onSuccess={handleUploadSuccess}
            />
          ) : null;
        })()}

      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: "#9ca3af" }}>
          ⏳ Memuat data...
        </div>
      ) : rows.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: 60,
            background: "#fff",
            borderRadius: 16,
            border: "1.5px dashed #93c5fd",
            color: "#6b7280",
          }}
        >
          <div style={{ fontSize: 32, marginBottom: 12 }}>📂</div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>
            Belum ada data untuk unit ini
          </div>
          <div style={{ fontSize: 12, marginTop: 6 }}>
            Upload file XLSX menggunakan panel di atas.
          </div>
        </div>
      ) : data.length === 0 && selectedYm ? (
        /* Bulan dipilih tapi tidak ada data */
        <div
          style={{
            textAlign: "center",
            padding: 60,
            background: "#fff",
            borderRadius: 16,
            border: "1.5px dashed #e5e7eb",
            color: "#6b7280",
          }}
        >
          <div style={{ fontSize: 32, marginBottom: 12 }}>🗓</div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>
            Tidak ada data untuk {activePeriodLabel}
          </div>
          <div style={{ fontSize: 12, marginTop: 6 }}>
            Pilih bulan lain atau klik <b>Semua</b> untuk melihat seluruh data.
          </div>
        </div>
      ) : (
        <>
          {/* ══ OVERVIEW ══ */}
          {tab === "overview" && (
            <div style={{ animation: "fadeUp .25s ease" }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4,1fr)",
                  gap: 16,
                  marginBottom: 20,
                }}
              >
                <GaugeCard
                  label="OEE"
                  value={aggOEE}
                  sparkData={data.map((r) => getDailyOEE(r))}
                  color={statusColor(aggOEE)}
                  sublabel={`${data.length} hari`}
                />
                <GaugeCard
                  label="Availability"
                  value={aggAvail}
                  sparkData={data.map((r) => getDailyAvail(r))}
                  color="#3b82f6"
                />
                <GaugeCard
                  label="Performance"
                  value={aggPerf}
                  sparkData={data.map((r) => getDailyPerf(r))}
                  color="#f59e0b"
                />
                <GaugeCard
                  label="Quality"
                  value={aggQual}
                  sparkData={data.map((r) => getDailyQual(r))}
                  color="#10b981"
                />
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "300px 1fr",
                  gap: 16,
                  marginBottom: 20,
                }}
              >
                <div
                  style={{
                    background: "#fff",
                    borderRadius: 12,
                    padding: 24,
                    boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                    border: "1px solid #e5e7eb",
                  }}
                >
                  <div
                    style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}
                  >
                    Ringkasan Produksi
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 10,
                    }}
                  >
                    {(
                      [
                        ["Total Produksi", numFmt(totProd) + " bal", cfg.color],
                        ["Total Defect", numFmt(totRusak) + " bal", "#ef4444"],
                        [
                          "Defect Rate",
                          pct(defRate, 2),
                          statusColor(1 - defRate),
                        ],
                        [
                          "Rata-rata/Hari",
                          numFmt(avgPerDay) + " bal",
                          cfg.color,
                        ],
                        ["Hari Dianalisa", String(data.length), "#6b7280"],
                        [
                          "Gap WC",
                          pct(Math.max(0, 0.85 - (aggOEE ?? 0))),
                          aggOEE != null && aggOEE >= 0.85
                            ? "#10b981"
                            : "#ef4444",
                        ],
                      ] as [string, string, string][]
                    ).map(([l, v, c]) => (
                      <div
                        key={l}
                        style={{
                          background: "#f9fafb",
                          borderRadius: 8,
                          padding: "12px 14px",
                        }}
                      >
                        <div
                          style={{
                            fontSize: 11,
                            color: "#9ca3af",
                            marginBottom: 3,
                          }}
                        >
                          {l}
                        </div>
                        <div
                          style={{ fontSize: 16, fontWeight: 700, color: c }}
                        >
                          {v}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div
                  style={{
                    background: "#fff",
                    borderRadius: 12,
                    padding: 24,
                    boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                    border: "1px solid #e5e7eb",
                  }}
                >
                  <div
                    style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}
                  >
                    Tren OEE Harian
                  </div>
                  <ResponsiveContainer width="100%" height={240}>
                    <LineChart data={lineData}>
                      <CartesianGrid
                        strokeDasharray="3 6"
                        stroke="#f3f4f6"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="date"
                        stroke="#d1d5db"
                        tick={{ fontSize: 10, fill: "#9ca3af" }}
                        tickLine={false}
                      />
                      <YAxis
                        domain={[0, 100]}
                        tickFormatter={(v) => v + "%"}
                        stroke="#d1d5db"
                        tick={{ fontSize: 10, fill: "#9ca3af" }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <Tooltip content={<ChartTip />} />
                      <ReferenceLine
                        y={85}
                        stroke="#10b981"
                        strokeDasharray="4 4"
                        strokeOpacity={0.6}
                        label={{
                          value: "85% WC",
                          fill: "#10b981",
                          fontSize: 10,
                          position: "insideTopRight",
                        }}
                      />
                      <Line
                        dataKey="OEE"
                        name="OEE"
                        stroke={statusColor(aggOEE)}
                        strokeWidth={2.5}
                        dot={false}
                        connectNulls
                        activeDot={{ r: 4 }}
                      />
                      <Line
                        dataKey="Availability"
                        name="Availability"
                        stroke="#3b82f6"
                        strokeWidth={1.5}
                        strokeDasharray="4 2"
                        dot={false}
                        connectNulls
                      />
                      <Line
                        dataKey="Performance"
                        name="Performance"
                        stroke="#f59e0b"
                        strokeWidth={1.5}
                        strokeDasharray="4 2"
                        dot={false}
                        connectNulls
                      />
                      <Line
                        dataKey="Quality"
                        name="Quality"
                        stroke="#10b981"
                        strokeWidth={1.5}
                        strokeDasharray="4 2"
                        dot={false}
                        connectNulls
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

          {/* ══ PRODUKSI ══ */}
          {tab === "produksi" && (
            <div
              style={{
                background: "#fff",
                borderRadius: 12,
                padding: 24,
                border: "1px solid #e5e7eb",
                animation: "fadeUp .25s ease",
              }}
            >
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>
                Produksi Harian & Defect
              </div>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={barData} barGap={2}>
                  <CartesianGrid
                    strokeDasharray="3 6"
                    stroke="#f3f4f6"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="date"
                    stroke="#d1d5db"
                    tick={{ fontSize: 10, fill: "#9ca3af" }}
                    tickLine={false}
                  />
                  <YAxis
                    stroke="#d1d5db"
                    tick={{ fontSize: 10, fill: "#9ca3af" }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip content={<ChartTip />} />
                  <Bar
                    dataKey="Es Keluar"
                    name="Es Keluar"
                    radius={[3, 3, 0, 0]}
                  >
                    {barData.map((_, i) => (
                      <Cell key={i} fill={cfg.color} fillOpacity={0.7} />
                    ))}
                  </Bar>
                  <Bar
                    dataKey="Rusak"
                    name="Rusak"
                    fill="#ef4444"
                    radius={[3, 3, 0, 0]}
                    fillOpacity={0.8}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* ══ TABEL ══ */}
          {tab === "tabel" && (
            <div
              style={{
                background: "#fff",
                borderRadius: 12,
                overflow: "hidden",
                border: "1px solid #e5e7eb",
                animation: "fadeUp .25s ease",
              }}
            >
              <div
                style={{
                  padding: "14px 24px",
                  borderBottom: "1px solid #e5e7eb",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span style={{ fontSize: 15, fontWeight: 600 }}>
                  Data OEE Per Hari
                </span>
                <span
                  style={{
                    fontSize: 11,
                    color: "#6b7280",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <span>
                    {data.length} hari · OEE agg:{" "}
                    <strong style={{ color: statusColor(aggOEE) }}>
                      {pct(aggOEE)}
                    </strong>
                  </span>
                  <span
                    style={{
                      padding: "2px 8px",
                      borderRadius: 8,
                      fontSize: 10,
                      fontWeight: 600,
                      ...fmtChip(activeUnitFormat),
                    }}
                  >
                    {activeUnitFormat}
                  </span>
                </span>
              </div>

              {activeUnitFormat === "tuban" && (
                <div
                  style={{
                    padding: "8px 24px",
                    background: "#fffbeb",
                    borderBottom: "1px solid #fde68a",
                    display: "flex",
                    alignItems: "center",
                    gap: 16,
                    flexWrap: "wrap",
                    fontSize: 11,
                    color: "#92400e",
                  }}
                >
                  <span style={{ fontWeight: 700 }}>
                    Keterangan Kolom Rusak:
                  </span>
                  {[
                    ["Bak 1", "Bak 1"],
                    ["Bak 2", "Bak 2"],
                    ["Bak 3 BB", "Bak 3 Bak Besar"],
                    ["Bak 3 BK", "Bak 3 Bak Kecil"],
                    ["Bak 4", "Bak 4"],
                    ["Bak 5", "Bak 5"],
                  ].map(([short, full]) => (
                    <span
                      key={short}
                      style={{ display: "flex", alignItems: "center", gap: 4 }}
                    >
                      <span
                        style={{
                          padding: "1px 7px",
                          borderRadius: 4,
                          background: "#fef3c7",
                          border: "1px solid #fcd34d",
                          fontWeight: 600,
                        }}
                      >
                        {short}
                      </span>
                      <span style={{ color: "#b45309" }}>= {full}</span>
                    </span>
                  ))}
                  <span
                    style={{
                      marginLeft: "auto",
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <span
                      style={{
                        padding: "1px 7px",
                        borderRadius: 4,
                        background: "#fff5f5",
                        border: "2px solid #fecaca",
                        fontWeight: 700,
                        color: "#ef4444",
                      }}
                    >
                      Total Rusak
                    </span>
                    <span style={{ color: "#b45309" }}>
                      = Bak 1+2+3BB+3BK+4+5
                    </span>
                  </span>
                </div>
              )}

              <div
                style={{ overflowX: "auto", maxHeight: 560, overflowY: "auto" }}
              >
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: 12,
                  }}
                >
                  <thead>
                    <tr
                      style={{
                        background: "#f9fafb",
                        position: "sticky",
                        top: 0,
                        zIndex: 1,
                      }}
                    >
                      {getTabelHeaders(activeUnitFormat).map((h, hi) => {
                        const isTotalRusak =
                          activeUnitFormat === "tuban" && h === "Total Rusak";
                        return (
                          <th
                            key={h + hi}
                            style={{
                              padding: "10px 12px",
                              textAlign: "left",
                              color: isTotalRusak ? "#ef4444" : "#6b7280",
                              fontWeight: 600,
                              fontSize: 11,
                              whiteSpace: "nowrap",
                              borderBottom: "1px solid #e5e7eb",
                              borderLeft: isTotalRusak
                                ? "2px solid #fecaca"
                                : undefined,
                              background: isTotalRusak ? "#fff5f5" : undefined,
                            }}
                          >
                            {h}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {data.map((r, i) => (
                      <TabelRow
                        key={i}
                        r={r}
                        format={activeUnitFormat}
                        getDailyOEE={getDailyOEE}
                        getDailyAvail={getDailyAvail}
                        getDailyPerf={getDailyPerf}
                        getDailyQual={getDailyQual}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ══ KOMPARASI PERIODE ══ */}
          {tab === "komparasi" && (
            <div style={{ animation: "fadeUp .25s ease" }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 16,
                  marginBottom: 20,
                }}
              >
                <PeriodSelectorCard
                  which="A"
                  color={COLOR_A}
                  allRows={rows}
                  pending={pendingA}
                  onPendingChange={(p) => {
                    setPendingA(p);
                    if (p.label) setLabelA(p.label);
                  }}
                  confirmed={confirmedA}
                  onConfirm={() => {
                    setConfirmedA(pendingA);
                    if (pendingA.label) setLabelA(pendingA.label);
                  }}
                  label={labelA}
                  onLabelChange={(v) => {
                    setLabelA(v);
                    setPendingA((p) => ({ ...p, label: v }));
                  }}
                  rowCount={dataA.length}
                  agg={aggA}
                  blockedYm={
                    confirmedB.start ? confirmedB.start.slice(0, 7) : undefined
                  }
                />
                <PeriodSelectorCard
                  which="B"
                  color={COLOR_B}
                  allRows={rows}
                  pending={pendingB}
                  onPendingChange={(p) => {
                    setPendingB(p);
                    if (p.label) setLabelB(p.label);
                  }}
                  confirmed={confirmedB}
                  onConfirm={() => {
                    setConfirmedB(pendingB);
                    if (pendingB.label) setLabelB(pendingB.label);
                  }}
                  label={labelB}
                  onLabelChange={(v) => {
                    setLabelB(v);
                    setPendingB((p) => ({ ...p, label: v }));
                  }}
                  rowCount={dataB.length}
                  agg={aggB}
                  blockedYm={
                    confirmedA.start ? confirmedA.start.slice(0, 7) : undefined
                  }
                />
              </div>

              {dataA.length === 0 || dataB.length === 0 ? (
                <div
                  style={{
                    textAlign: "center",
                    padding: "48px 24px",
                    background: "#fff",
                    borderRadius: 12,
                    border: "1.5px dashed #e5e7eb",
                    color: "#9ca3af",
                  }}
                >
                  <div style={{ fontSize: 28, marginBottom: 10 }}>⚖️</div>
                  <div
                    style={{ fontSize: 14, fontWeight: 600, color: "#6b7280" }}
                  >
                    {dataA.length === 0 && dataB.length === 0
                      ? "Konfirmasi dua periode untuk memulai komparasi"
                      : dataA.length === 0
                        ? "Terapkan Periode A terlebih dahulu"
                        : "Terapkan Periode B terlebih dahulu"}
                  </div>
                  <div style={{ fontSize: 12, marginTop: 6 }}>
                    Pilih bulan dari tombol tersedia, lalu klik{" "}
                    <b>Terapkan Periode</b>
                  </div>
                </div>
              ) : (
                <>
                  <div
                    style={{
                      display: "flex",
                      gap: 10,
                      marginBottom: 16,
                      alignItems: "center",
                      flexWrap: "wrap",
                    }}
                  >
                    <span style={{ fontSize: 11, color: "#9ca3af" }}>
                      Membandingkan:
                    </span>
                    {[
                      {
                        lbl: labelA,
                        c: COLOR_A,
                        start: confirmedA.start,
                        end: confirmedA.end,
                        n: dataA.length,
                      },
                      {
                        lbl: labelB,
                        c: COLOR_B,
                        start: confirmedB.start,
                        end: confirmedB.end,
                        n: dataB.length,
                      },
                    ].map((p, i) => (
                      <span
                        key={i}
                        style={{
                          padding: "4px 14px",
                          borderRadius: 20,
                          fontSize: 12,
                          fontWeight: 700,
                          background: `${p.c}12`,
                          color: p.c,
                          border: `1px solid ${p.c}30`,
                        }}
                      >
                        {p.lbl} · {p.start} — {p.end}{" "}
                        <span style={{ opacity: 0.7, fontWeight: 400 }}>
                          ({p.n} hari)
                        </span>
                      </span>
                    ))}
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(4,1fr)",
                      gap: 14,
                      marginBottom: 20,
                    }}
                  >
                    {(
                      [
                        ["OEE", aggA.oee, aggB.oee],
                        ["Availability", aggA.avail, aggB.avail],
                        ["Performance", aggA.perf, aggB.perf],
                        ["Quality", aggA.qual, aggB.qual],
                      ] as [string, number | null, number | null][]
                    ).map(([label, vA, vB]) => (
                      <CompareMetricCard
                        key={label}
                        label={label}
                        valA={vA}
                        valB={vB}
                        colorA={COLOR_A}
                        colorB={COLOR_B}
                        labelA={labelA}
                        labelB={labelB}
                      />
                    ))}
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 16,
                      marginBottom: 20,
                    }}
                  >
                    <div
                      style={{
                        background: "#fff",
                        borderRadius: 12,
                        padding: 24,
                        border: "1px solid #e5e7eb",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 600,
                          marginBottom: 4,
                        }}
                      >
                        Tren OEE Harian (Overlay)
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: "#9ca3af",
                          marginBottom: 14,
                        }}
                      >
                        Hari ke-1 s/d ke-{maxLen} tiap bulan
                      </div>
                      <ResponsiveContainer width="100%" height={220}>
                        <LineChart data={overlayData}>
                          <CartesianGrid
                            strokeDasharray="3 6"
                            stroke="#f3f4f6"
                            vertical={false}
                          />
                          <XAxis
                            dataKey="idx"
                            stroke="#d1d5db"
                            tick={{ fontSize: 9, fill: "#9ca3af" }}
                            tickLine={false}
                            interval="preserveStartEnd"
                          />
                          <YAxis
                            domain={[0, 100]}
                            tickFormatter={(v) => v + "%"}
                            stroke="#d1d5db"
                            tick={{ fontSize: 9, fill: "#9ca3af" }}
                            tickLine={false}
                            axisLine={false}
                          />
                          <Tooltip content={<CompareTip />} />
                          <ReferenceLine
                            y={85}
                            stroke="#10b981"
                            strokeDasharray="4 4"
                            strokeOpacity={0.5}
                          />
                          <Line
                            dataKey={`OEE ${labelA}`}
                            stroke={COLOR_A}
                            strokeWidth={2}
                            dot={false}
                            connectNulls
                            activeDot={{ r: 4 }}
                          />
                          <Line
                            dataKey={`OEE ${labelB}`}
                            stroke={COLOR_B}
                            strokeWidth={2}
                            strokeDasharray="5 3"
                            dot={false}
                            connectNulls
                            activeDot={{ r: 4 }}
                          />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                    <div
                      style={{
                        background: "#fff",
                        borderRadius: 12,
                        padding: 24,
                        border: "1px solid #e5e7eb",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 600,
                          marginBottom: 4,
                        }}
                      >
                        Spider Chart OEE Komponen
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: "#9ca3af",
                          marginBottom: 14,
                        }}
                      >
                        Perbandingan A × P × Q antar dua bulan
                      </div>
                      <ResponsiveContainer width="100%" height={220}>
                        <RadarChart data={radarData} outerRadius={80}>
                          <PolarGrid stroke="#f3f4f6" />
                          <PolarAngleAxis
                            dataKey="metric"
                            tick={{ fontSize: 11, fill: "#6b7280" }}
                          />
                          <PolarRadiusAxis
                            domain={[0, 100]}
                            tick={{ fontSize: 9, fill: "#9ca3af" }}
                            tickCount={4}
                          />
                          <Radar
                            name={labelA}
                            dataKey={labelA}
                            stroke={COLOR_A}
                            fill={COLOR_A}
                            fillOpacity={0.15}
                            strokeWidth={2}
                          />
                          <Radar
                            name={labelB}
                            dataKey={labelB}
                            stroke={COLOR_B}
                            fill={COLOR_B}
                            fillOpacity={0.15}
                            strokeWidth={2}
                          />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                          <Tooltip content={<CompareTip />} />
                        </RadarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div
                    style={{
                      background: "#fff",
                      borderRadius: 12,
                      padding: 24,
                      border: "1px solid #e5e7eb",
                      marginBottom: 20,
                    }}
                  >
                    <div
                      style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}
                    >
                      Perbandingan Produksi
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "#9ca3af",
                        marginBottom: 16,
                      }}
                    >
                      Total produksi, defect, dan rata-rata per hari
                    </div>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={prodCompareData} barGap={6}>
                        <CartesianGrid
                          strokeDasharray="3 6"
                          stroke="#f3f4f6"
                          vertical={false}
                        />
                        <XAxis
                          dataKey="name"
                          stroke="#d1d5db"
                          tick={{ fontSize: 11, fill: "#6b7280" }}
                          tickLine={false}
                        />
                        <YAxis
                          stroke="#d1d5db"
                          tick={{ fontSize: 10, fill: "#9ca3af" }}
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={(v) => numFmt(v)}
                        />
                        <Tooltip content={<CompareTip isProduction />} />
                        <Bar
                          dataKey={labelA}
                          fill={COLOR_A}
                          fillOpacity={0.8}
                          radius={[4, 4, 0, 0]}
                        />
                        <Bar
                          dataKey={labelB}
                          fill={COLOR_B}
                          fillOpacity={0.8}
                          radius={[4, 4, 0, 0]}
                        />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  <div
                    style={{
                      background: "#fff",
                      borderRadius: 12,
                      border: "1px solid #e5e7eb",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        padding: "14px 24px",
                        borderBottom: "1px solid #e5e7eb",
                      }}
                    >
                      <span style={{ fontSize: 14, fontWeight: 600 }}>
                        Tabel Ringkasan Komparasi
                      </span>
                    </div>
                    <table
                      style={{
                        width: "100%",
                        borderCollapse: "collapse",
                        fontSize: 13,
                      }}
                    >
                      <thead>
                        <tr style={{ background: "#f9fafb" }}>
                          {[
                            "Metrik",
                            labelA,
                            labelB,
                            "Selisih (A − B)",
                            "Unggul",
                          ].map((h, i) => (
                            <th
                              key={h}
                              style={{
                                padding: "10px 20px",
                                textAlign: i === 0 ? "left" : "center",
                                color: "#6b7280",
                                fontWeight: 600,
                                fontSize: 11,
                                borderBottom: "1px solid #e5e7eb",
                              }}
                            >
                              {h === labelA ? (
                                <span style={{ color: COLOR_A }}>{h}</span>
                              ) : h === labelB ? (
                                <span style={{ color: COLOR_B }}>{h}</span>
                              ) : (
                                h
                              )}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(
                          [
                            ["OEE", aggA.oee, aggB.oee, false],
                            ["Availability", aggA.avail, aggB.avail, false],
                            ["Performance", aggA.perf, aggB.perf, false],
                            ["Quality", aggA.qual, aggB.qual, false],
                            [
                              "Defect Rate",
                              aggA.totProd > 0
                                ? aggA.totRusak / aggA.totProd
                                : null,
                              aggB.totProd > 0
                                ? aggB.totRusak / aggB.totProd
                                : null,
                              true,
                            ],
                          ] as [string, number | null, number | null, boolean][]
                        ).map(([lbl, vA, vB, inv]) => {
                          const delta =
                            vA !== null && vB !== null ? (vA - vB) * 100 : null;
                          const aWins =
                            delta !== null
                              ? inv
                                ? delta < 0
                                : delta > 0
                              : false;
                          const bWins =
                            delta !== null
                              ? inv
                                ? delta > 0
                                : delta < 0
                              : false;
                          return (
                            <tr
                              key={String(lbl)}
                              className="tbl-row"
                              style={{ borderTop: "1px solid #f3f4f6" }}
                            >
                              <td
                                style={{
                                  padding: "11px 20px",
                                  fontWeight: 600,
                                  color: "#374151",
                                }}
                              >
                                {lbl}
                              </td>
                              <td
                                style={{
                                  padding: "11px 20px",
                                  textAlign: "center",
                                  fontWeight: 700,
                                  color: COLOR_A,
                                }}
                              >
                                {vA !== null
                                  ? (vA * 100).toFixed(1) + "%"
                                  : "–"}
                              </td>
                              <td
                                style={{
                                  padding: "11px 20px",
                                  textAlign: "center",
                                  fontWeight: 700,
                                  color: COLOR_B,
                                }}
                              >
                                {vB !== null
                                  ? (vB * 100).toFixed(1) + "%"
                                  : "–"}
                              </td>
                              <td
                                style={{
                                  padding: "11px 20px",
                                  textAlign: "center",
                                }}
                              >
                                <DeltaBadge delta={delta} />
                              </td>
                              <td
                                style={{
                                  padding: "11px 20px",
                                  textAlign: "center",
                                }}
                              >
                                {aWins && (
                                  <span
                                    style={{
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: 4,
                                      padding: "3px 10px",
                                      borderRadius: 20,
                                      fontSize: 11,
                                      fontWeight: 700,
                                      background: `${COLOR_A}18`,
                                      color: COLOR_A,
                                    }}
                                  >
                                    🏆 {labelA}
                                  </span>
                                )}
                                {bWins && (
                                  <span
                                    style={{
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: 4,
                                      padding: "3px 10px",
                                      borderRadius: 20,
                                      fontSize: 11,
                                      fontWeight: 700,
                                      background: `${COLOR_B}18`,
                                      color: COLOR_B,
                                    }}
                                  >
                                    🏆 {labelB}
                                  </span>
                                )}
                                {!aWins && !bWins && delta !== null && (
                                  <span
                                    style={{ fontSize: 11, color: "#9ca3af" }}
                                  >
                                    Seimbang
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                        {(
                          [
                            [
                              "Total Produksi",
                              aggA.totProd,
                              aggB.totProd,
                              "bal",
                            ],
                            [
                              "Total Defect",
                              aggA.totRusak,
                              aggB.totRusak,
                              "bal",
                            ],
                            ["Hari Data", aggA.days, aggB.days, "hari"],
                          ] as [string, number, number, string][]
                        ).map(([lbl, vA, vB, unit]) => (
                          <tr
                            key={String(lbl)}
                            className="tbl-row"
                            style={{ borderTop: "1px solid #f3f4f6" }}
                          >
                            <td
                              style={{
                                padding: "11px 20px",
                                fontWeight: 600,
                                color: "#374151",
                              }}
                            >
                              {lbl}
                            </td>
                            <td
                              style={{
                                padding: "11px 20px",
                                textAlign: "center",
                                fontWeight: 700,
                                color: COLOR_A,
                              }}
                            >
                              {numFmt(vA)} {unit}
                            </td>
                            <td
                              style={{
                                padding: "11px 20px",
                                textAlign: "center",
                                fontWeight: 700,
                                color: COLOR_B,
                              }}
                            >
                              {numFmt(vB)} {unit}
                            </td>
                            <td
                              style={{
                                padding: "11px 20px",
                                textAlign: "center",
                              }}
                            >
                              {lbl !== "Hari Data" && (
                                <DeltaBadge delta={vA - vB} />
                              )}
                            </td>
                            <td
                              style={{
                                padding: "11px 20px",
                                textAlign: "center",
                              }}
                            >
                              {lbl === "Total Produksi" && (
                                <span
                                  style={{
                                    fontSize: 11,
                                    fontWeight: 700,
                                    padding: "3px 10px",
                                    borderRadius: 20,
                                    background:
                                      vA >= vB
                                        ? `${COLOR_A}18`
                                        : `${COLOR_B}18`,
                                    color: vA >= vB ? COLOR_A : COLOR_B,
                                  }}
                                >
                                  🏆 {vA >= vB ? labelA : labelB}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}

      <div
        style={{
          textAlign: "center",
          fontSize: 10,
          color: "#9ca3af",
          paddingTop: 20,
          paddingBottom: 8,
        }}
      >
        OEE = Availability × Performance × Quality &nbsp;·&nbsp; Target ≥ 85%
        &nbsp;·&nbsp; PMP {cfg.name}
      </div>
    </div>
  );
}
