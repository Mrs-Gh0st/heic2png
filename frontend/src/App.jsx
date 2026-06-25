import React, { useState, useRef, useCallback } from "react";
import axios from "axios";
import styles from "./App.module.css";

const API = import.meta.env.VITE_API_URL || "";

const fmt = (bytes) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export default function App() {
  const [files, setFiles] = useState([]);
  const [format, setFormat] = useState("png");
  const [quality, setQuality] = useState(90);
  const [status, setStatus] = useState("idle"); // idle | uploading | done | error
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef();

  const addFiles = useCallback((incoming) => {
    const heic = [...incoming].filter(f =>
      /\.(heic|heif)$/i.test(f.name) || f.type === "image/heic" || f.type === "image/heif"
    );
    if (!heic.length) {
      setError("Only HEIC / HEIF files are accepted.");
      return;
    }
    setError("");
    setResult(null);
    setStatus("idle");
    setFiles(prev => {
      const combined = [...prev, ...heic];
      return combined.slice(0, 89);
    });
  }, []);

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    addFiles(e.dataTransfer.files);
  };

  const removeFile = (idx) => {
    setFiles(prev => prev.filter((_, i) => i !== idx));
    if (files.length <= 1) { setResult(null); setStatus("idle"); }
  };

  const reset = () => {
    setFiles([]);
    setResult(null);
    setStatus("idle");
    setError("");
    setProgress(0);
  };

  const convert = async () => {
    if (!files.length) return;
    setStatus("uploading");
    setProgress(0);
    setError("");
    setResult(null);

    const fd = new FormData();
    files.forEach(f => fd.append("files", f));
    fd.append("format", format);
    fd.append("quality", quality);

    try {
      const { data } = await axios.post(`${API}/api/convert`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (e) => {
          setProgress(Math.round((e.loaded / e.total) * 100));
        },
      });
      setResult(data);
      setStatus("done");
    } catch (err) {
      setError(err.response?.data?.error || "Upload failed. Is the server running?");
      setStatus("error");
    }
  };

  const downloadAll = () => {
    window.open(`${API}/api/download/${result.sessionId}/zip`, "_blank");
  };

  const downloadOne = (fileId) => {
    window.open(`${API}/api/download/${result.sessionId}/${fileId}`, "_blank");
  };

  return (
    <div className={styles.shell}>
      {/* Header */}
      <header className={styles.header}>
        <span className={styles.logo}>HEIC<span>→</span>IMG</span>
        <span className={styles.tagline}>Server-side batch converter</span>
      </header>

      <main className={styles.main}>
        {/* Drop zone */}
        {status !== "done" && (
          <div
            className={`${styles.dropzone} ${dragging ? styles.dragging : ""}`}
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current.click()}
            role="button"
            tabIndex={0}
            aria-label="Upload HEIC files"
            onKeyDown={e => e.key === "Enter" && inputRef.current.click()}
          >
            <input ref={inputRef} type="file" accept=".heic,.heif" multiple onChange={e => addFiles(e.target.files)} />
            <div className={styles.dropIcon}>⬆</div>
            <p className={styles.dropTitle}>
              {files.length ? `${files.length} file${files.length > 1 ? "s" : ""} selected` : "Drop HEIC files here"}
            </p>
            <p className={styles.dropSub}>
              {files.length ? "Click to add more · max 89 files" : "or click to browse · up to 89 files · 50 MB each"}
            </p>
          </div>
        )}

        {/* Options */}
        {files.length > 0 && status !== "done" && (
          <div className={styles.options}>
            <div className={styles.optGroup}>
              <label>Output format</label>
              <div className={styles.toggle}>
                <button className={format === "png" ? styles.active : ""} onClick={() => setFormat("png")}>PNG</button>
                <button className={format === "jpeg" ? styles.active : ""} onClick={() => setFormat("jpeg")}>JPEG</button>
              </div>
            </div>
            {format === "jpeg" && (
              <div className={styles.optGroup}>
                <label>Quality — <span className={styles.mono}>{quality}%</span></label>
                <input
                  type="range" min={40} max={100} step={5} value={quality}
                  onChange={e => setQuality(Number(e.target.value))}
                  className={styles.slider}
                />
              </div>
            )}
          </div>
        )}

        {/* File list */}
        {files.length > 0 && status !== "done" && (
          <ul className={styles.fileList}>
            {files.map((f, i) => (
              <li key={i} className={styles.fileRow}>
                <span className={styles.fileIcon}>🖼</span>
                <span className={styles.fileName}>{f.name}</span>
                <span className={styles.fileSize}>{fmt(f.size)}</span>
                <button className={styles.removeBtn} onClick={() => removeFile(i)} aria-label="Remove">✕</button>
              </li>
            ))}
          </ul>
        )}

        {/* Upload progress */}
        {status === "uploading" && (
          <div className={styles.progressBox}>
            <div className={styles.progressLabel}>
              Uploading & converting… <span className={styles.mono}>{progress}%</span>
            </div>
            <div className={styles.progressTrack}>
              <div className={styles.progressFill} style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}

        {/* Error */}
        {error && <div className={styles.errorBox}>{error}</div>}

        {/* Action buttons */}
        {files.length > 0 && status !== "done" && status !== "uploading" && (
          <div className={styles.actions}>
            <button className={styles.btnPrimary} onClick={convert}>
              Convert {files.length} file{files.length > 1 ? "s" : ""}
            </button>
            <button className={styles.btnGhost} onClick={reset}>Clear</button>
          </div>
        )}

        {/* Results */}
        {status === "done" && result && (
          <div className={styles.results}>
            <div className={styles.resultHeader}>
              <div className={styles.resultStats}>
                <span className={styles.statChip} data-type="total">
                  {result.total} total
                </span>
                <span className={styles.statChip} data-type="success">
                  ✓ {result.success} converted
                </span>
                {result.failed > 0 && (
                  <span className={styles.statChip} data-type="error">
                    ✕ {result.failed} failed
                  </span>
                )}
              </div>
              <div className={styles.resultActions}>
                {result.success > 0 && (
                  <button className={styles.btnPrimary} onClick={downloadAll}>
                    ↓ Download all as ZIP
                  </button>
                )}
                <button className={styles.btnGhost} onClick={reset}>Convert more</button>
              </div>
            </div>

            <ul className={styles.resultList}>
              {result.files.map(f => (
                <li key={f.id} className={`${styles.resultRow} ${f.status === "error" ? styles.rowError : ""}`}>
                  <span className={styles.resultStatus}>{f.status === "success" ? "✓" : "✕"}</span>
                  <span className={styles.resultName}>{f.originalName}</span>
                  <span className={styles.resultArrow}>→</span>
                  <span className={styles.resultOut}>{f.outputName}</span>
                  {f.status === "success" && (
                    <span className={styles.resultSize}>{fmt(f.size)}</span>
                  )}
                  {f.status === "error" && (
                    <span className={styles.resultErr}>{f.error}</span>
                  )}
                  {f.status === "success" && (
                    <button className={styles.dlBtn} onClick={() => downloadOne(f.id)}>↓</button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </main>

      <footer className={styles.footer}>
        Files are deleted from the server automatically after 1 hour.
      </footer>
    </div>
  );
}
