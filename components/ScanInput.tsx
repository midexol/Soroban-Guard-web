"use client";

import { useState, useRef, useEffect } from "react";
import { SAMPLE_CONTRACT } from "@/lib/sampleContract";
import { isValidCid, fetchFromIpfs } from "@/lib/ipfs";
import { isValidNpmPackage, fetchNpmSource } from "@/lib/npm";
import { requestPermission } from "@/lib/notifications";
import { extractContractIdFromUrl, getContractWasmSize } from "@/lib/stellar";
import { NETWORKS } from "@/types/stellar";
import {
  isValidGistUrl,
  fetchGistFiles,
  fetchGistFileContent,
  type GistFile,
} from "@/lib/gist";
import { useT } from "@/lib/useT";

const MAX_CHARS = 500_000;

const NOTIF_PREF_KEY = "sg_notifications_enabled";
const TG_BOT_TOKEN_KEY = "sg_tg_bot_token";
const TG_CHAT_ID_KEY = "sg_tg_chat_id";

type InputMode = "code" | "github" | "contractId" | "ipfs" | "gist" | "npm";

interface Props {
  onScan: (
    source: string,
    mode: InputMode,
    options?: {
      slackWebhookUrl?: string;
      telegramConfig?: { botToken: string; chatId: string };
    },
  ) => void;
  loading: boolean;
  countdown?: number;
  initialValue?: string;
  initialMode?: InputMode;
  error?: string | null;
  isTimeout?: boolean;
  onRetry?: () => void;
}

function validateGithub(url: string): { valid: boolean; error?: string } {
  try {
    const u = new URL(url);
    if (u.hostname !== "github.com")
      return { valid: false, error: "github.errorNotGithub" };
    const parts = u.pathname.replace(/^\//, "").split("/");
    if (parts.length < 2 || !parts[0] || !parts[1])
      return {
        valid: false,
        error: "github.errorInvalidRepo",
      };
    return { valid: true };
  } catch {
    return { valid: false, error: "github.errorInvalidUrl" };
  }
}

export default function ScanInput({
  onScan,
  loading,
  countdown = 0,
  initialValue = "",
  initialMode,
  error,
  isTimeout,
  onRetry,
}: Props) {
  const { t } = useT();
  const [mode, setMode] = useState<InputMode>(() => {
    if (initialMode) return initialMode;
    if (initialValue.startsWith("https://github.com")) return "github";
    if (initialValue.startsWith("C") && initialValue.length >= 56)
      return "contractId";
    return "code";
  });
  const [code, setCode] = useState(() =>
    (initialMode ??
      (initialValue.startsWith("https://github.com")
        ? "github"
        : initialValue.startsWith("C") && initialValue.length >= 56
          ? "contractId"
          : "code")) === "code"
      ? initialValue
      : "",
  );
  const [repoUrl, setRepoUrl] = useState(() =>
    initialMode === "github" ||
    (!initialMode && initialValue.startsWith("https://github.com"))
      ? initialValue
      : "",
  );
  const [contractId, setContractId] = useState(() =>
    initialMode === "contractId" ||
    (!initialMode && initialValue.startsWith("C") && initialValue.length >= 56)
      ? initialValue
      : "",
  );
  const [cid, setCid] = useState("");
  const [ipfsPreview, setIpfsPreview] = useState<string | null>(null);
  const [ipfsFetching, setIpfsFetching] = useState(false);
  const [ipfsError, setIpfsError] = useState<string | null>(null);
  const [packageName, setPackageName] = useState("");
  const [npmVersion, setNpmVersion] = useState("");
  const [npmPreview, setNpmPreview] = useState<string | null>(null);
  const [npmFetching, setNpmFetching] = useState(false);
  const [npmError, setNpmError] = useState<string | null>(null);
  const [npmPackageValid, setNpmPackageValid] = useState(false);
  const [normalized, setNormalized] = useState(false);
  const [extractedFromUrl, setExtractedFromUrl] = useState(false);
  const [wasmSize, setWasmSize] = useState<number | null>(null);
  // Gist state
  const [gistUrl, setGistUrl] = useState("");
  const [gistFiles, setGistFiles] = useState<GistFile[]>([]);
  const [gistSelectedFile, setGistSelectedFile] = useState<string>("");
  const [gistContent, setGistContent] = useState<string | null>(null);
  const [gistFetching, setGistFetching] = useState(false);
  const [gistError, setGistError] = useState<string | null>(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(NOTIF_PREF_KEY) === "true";
  });
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [slackWebhookUrl, setSlackWebhookUrl] = useState(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("sg_slack_webhook") ?? "";
  });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [tgBotToken, setTgBotToken] = useState(() =>
    typeof window !== "undefined"
      ? (localStorage.getItem(TG_BOT_TOKEN_KEY) ?? "")
      : "",
  );
  const [tgChatId, setTgChatId] = useState(() =>
    typeof window !== "undefined"
      ? (localStorage.getItem(TG_CHAT_ID_KEY) ?? "")
      : "",
  );
  const [selectedNetwork, setSelectedNetwork] = useState(NETWORKS.testnet);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const normalizedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const contractValid = contractId.length >= 56 && contractId.startsWith("C");
  const repoValidation = validateGithub(repoUrl);
  const repoError =
    repoUrl.length > 0 && !repoValidation.valid
      ? repoValidation.error
      : undefined;

  useEffect(() => {
    if (!contractValid) { setWasmSize(null); return; }
    const network = (typeof selectedNetwork !== "undefined" ? selectedNetwork : null) ?? NETWORKS.testnet;
    getContractWasmSize(contractId, network).then(setWasmSize);
  }, [contractId, contractValid]);

  function handleContractIdChange(raw: string) {
    setExtractedFromUrl(false);
    const extracted = extractContractIdFromUrl(raw);
    if (extracted) {
      setContractId(extracted);
      setExtractedFromUrl(true);
      return;
    }
    const clean = raw.trim().toUpperCase();
    setContractId(clean);
    if (clean !== raw) {
      if (normalizedTimer.current) clearTimeout(normalizedTimer.current);
      setNormalized(true);
      normalizedTimer.current = setTimeout(() => setNormalized(false), 1000);
    }
  }

  function handleCidChange(value: string) {
    setCid(value);
    setIpfsPreview(null);
    setIpfsError(null);
  }

  async function handleFetchIpfs() {
    if (!isValidCid(cid)) {
      setIpfsError("Invalid CID — must start with Qm… or bafy…");
      return;
    }
    setIpfsFetching(true);
    setIpfsError(null);
    setIpfsPreview(null);
    try {
      const content = await fetchFromIpfs(cid);
      setIpfsPreview(content);
    } catch (err) {
      setIpfsError(
        err instanceof Error ? err.message : "Failed to fetch from IPFS",
      );
    } finally {
      setIpfsFetching(false);
    }
  }

  async function handleFetchGist() {
    if (!isValidGistUrl(gistUrl)) {
      setGistError(
        "Invalid Gist URL. Expected: https://gist.github.com/{user}/{id}",
      );
      return;
    }
    setGistFetching(true);
    setGistError(null);
    setGistContent(null);
    setGistFiles([]);
    setGistSelectedFile("");
    try {
      const data = await fetchGistFiles(gistUrl);
      setGistFiles(data.files);
      if (data.files.length === 1) {
        const content = await fetchGistFileContent(data.files[0].raw_url);
        setGistContent(content);
        setGistSelectedFile(data.files[0].filename);
      } else if (data.files.length > 1) {
        setGistSelectedFile(data.files[0].filename);
      }
    } catch (err) {
      setGistError(err instanceof Error ? err.message : "Failed to fetch Gist");
    } finally {
      setGistFetching(false);
    }
  }

  async function handleGistFileSelect(filename: string) {
    setGistSelectedFile(filename);
    const file = gistFiles.find((f) => f.filename === filename);
    if (!file) return;
    setGistFetching(true);
    try {
      const content = await fetchGistFileContent(file.raw_url);
      setGistContent(content);
    } catch (err) {
      setGistError(err instanceof Error ? err.message : "Failed to fetch file");
    } finally {
      setGistFetching(false);
    }
  }

  async function toggleNotifications() {
    if (!notificationsEnabled) {
      const granted = await requestPermission();
      if (!granted) return;
      setNotificationsEnabled(true);
      localStorage.setItem(NOTIF_PREF_KEY, "true");
    } else {
      setNotificationsEnabled(false);
      localStorage.setItem(NOTIF_PREF_KEY, "false");
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const options = {
      slackWebhookUrl: slackWebhookUrl.trim() || undefined,
      telegramConfig:
        tgBotToken && tgChatId
          ? { botToken: tgBotToken, chatId: tgChatId }
          : undefined,
    };
    if (mode === "ipfs") {
      if (ipfsPreview) onScan(ipfsPreview, mode, options);
      return;
    }
    if (mode === "gist") {
      if (gistContent) onScan(gistContent, "code");
      return;
    }
    if (mode === "npm") {
      if (npmPreview) onScan(npmPreview, mode);
      return;
    }
    const source =
      mode === "code"
        ? code.trim()
        : mode === "github"
          ? repoUrl.trim()
          : contractId.trim();
    if (!source) return;
    onScan(source, mode, options);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      if (canSubmit) handleSubmit(e as unknown as React.FormEvent);
    }
  }

  const isRateLimited = countdown > 0;

  const canSubmit =
    !loading &&
    !isRateLimited &&
    (mode === "code"
      ? code.trim().length > 0 && code.length <= MAX_CHARS
      : mode === "github"
        ? repoUrl.trim().length > 0 && repoValidation.valid
        : mode === "contractId"
          ? contractId.trim().length > 0 && contractValid
          : mode === "gist"
            ? gistContent !== null
            : ipfsPreview !== null);

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Network selector */}
      <div data-tour-id="network-selector" className="flex items-center gap-2">
        <label htmlFor="network-selector" className="text-xs text-slate-400">
          {t('scanInput.network')}
        </label>
        <select
          id="network-selector"
          value={selectedNetwork.name}
          onChange={(e) => {
            const network = NETWORKS[e.target.value]
            if (network) setSelectedNetwork(network)
          }}
          className="rounded-lg border border-[#2a2d3a] bg-[#12151f] px-2 py-1 text-xs text-slate-300 outline-none transition focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/30"
        >
          <option value="mainnet">{t('scanInput.networks.mainnet')}</option>
          <option value="testnet">{t('scanInput.networks.testnet')}</option>
          <option value="futurenet">{t('scanInput.networks.futurenet')}</option>
        </select>
      </div>

      {/* Mode toggle */}
      <div className="flex rounded-lg bg-[#12151f] p-1 ring-1 ring-[#2a2d3a]">
        <TabButton
          active={mode === "code"}
          onClick={() => setMode("code")}
          icon={
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
              />
            </svg>
          }
        >
          {t('scanInput.tabs.code')}
        </TabButton>
        <TabButton
          active={mode === "github"}
          onClick={() => setMode("github")}
          icon={
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
            </svg>
          }
        >
          {t('scanInput.tabs.github')}
        </TabButton>
        <TabButton
          active={mode === "contractId"}
          onClick={() => setMode("contractId")}
          icon={
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
              />
            </svg>
          }
        >
          {t('scanInput.tabs.contractId')}
        </TabButton>
        <TabButton
          active={mode === "ipfs"}
          onClick={() => setMode("ipfs")}
          icon={
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
              />
            </svg>
          }
        >
          {t('scanInput.tabs.ipfs')}
        </TabButton>
        <TabButton
          active={mode === "gist"}
          onClick={() => setMode("gist")}
          icon={
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
            </svg>
          }
        >
          {t('scanInput.tabs.gist')}
        </TabButton>
      </div>

      {/* Input area */}
      {mode === "code" ? (
        <div className="relative">
          <textarea
            ref={textareaRef}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`#![no_std]\nuse soroban_sdk::{contract, contractimpl, Env};\n\n#[contract]\npub struct MyContract;\n\n#[contractimpl]\nimpl MyContract {\n    pub fn hello(env: Env) -> String {\n        // paste your contract here...\n    }\n}`}
            rows={16}
            className="code-textarea w-full resize-y rounded-xl border border-[#2a2d3a] bg-[#12151f] px-4 py-3 text-slate-300 placeholder-slate-600 outline-none transition focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/30"
            spellCheck={false}
            disabled={loading}
          />
          {code.length > 0 && (
            <span
              aria-live="polite"
              className={`absolute bottom-3 right-3 mr-2 text-xs ${
                code.length > MAX_CHARS
                  ? "text-red-400"
                  : code.length > MAX_CHARS / 2
                    ? "text-amber-400"
                    : "text-slate-600"
              }`}
            >
              {t('scanInput.code.charCount', {
                lines: code.split('\n').length.toLocaleString(),
                chars: code.length.toLocaleString(),
              })}
            </span>
          )}
          {code.length > MAX_CHARS && (
            <p className="mt-1.5 text-xs text-red-400">
              {t('scanInput.code.tooLarge', { max: MAX_CHARS.toLocaleString() })}
            </p>
          )}
          {code.length > MAX_CHARS / 2 && code.length <= MAX_CHARS && (
            <p className="mt-1.5 text-xs text-amber-400">
              {t('scanInput.code.largeWarning')}
            </p>
          )}
        </div>
      ) : mode === "github" ? (
        <div className="space-y-2">
          <input
            type="url"
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="https://github.com/org/repo"
            className={`w-full rounded-xl border px-4 py-3 text-slate-300 placeholder-slate-600 outline-none transition bg-[#12151f] ${
              repoUrl && !repoValidation.valid
                ? "border-red-500/50 focus:border-red-500/60 focus:ring-1 focus:ring-red-500/30"
                : "border-[#2a2d3a] focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/30"
            }`}
            disabled={loading}
          />
          {repoError && (
            <div className="flex items-start gap-2">
              <svg
                className="mt-0.5 h-4 w-4 shrink-0 text-red-400"
                fill="currentColor"
                viewBox="0 0 20 20"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
              <p className="text-xs text-red-400">{t(`scanInput.${repoError}`)}</p>
            </div>
          )}
          {!repoError && (
            <p className="text-xs text-slate-500">
              {t('scanInput.github.hint').split('.rs').map((part, i, arr) =>
                i < arr.length - 1 ? (
                  <span key={i}>{part}<code className="rounded bg-[#1a1d27] px-1 text-slate-400">.rs</code></span>
                ) : (
                  <span key={i}>{part}</span>
                )
              )}
            </p>
          )}
        </div>
      ) : mode === "contractId" ? (
        <div className="space-y-2">
          <div className="relative">
            <input
              type="text"
              value={contractId}
              onChange={(e) => handleContractIdChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM"
              className="w-full rounded-xl border border-[#2a2d3a] bg-[#12151f] px-4 py-3 font-mono text-sm text-slate-300 placeholder-slate-600 outline-none transition focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/30"
              disabled={loading}
              spellCheck={false}
            />
            {normalized && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 rounded bg-indigo-500/20 px-2 py-0.5 text-xs text-indigo-300 transition-opacity duration-500">
                {t('scanInput.contractId.normalized')}
              </span>
            )}
          </div>
          {extractedFromUrl && (
            <p className="text-xs text-emerald-400">
              {t('scanInput.contractId.extractedFromUrl')}
            </p>
          )}
          {wasmSize !== null && (
            <p className="text-xs text-indigo-300">
              WASM size: {wasmSize.toLocaleString()} bytes ({(wasmSize / 1024).toFixed(1)} KB)
            </p>
          )}
          <p className="text-xs text-slate-500">
            {t('scanInput.contractId.hint')}
          </p>
        </div>
      ) : mode === "ipfs" ? (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              type="text"
              value={cid}
              onChange={(e) => handleCidChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Qm… or bafy…"
              className="flex-1 rounded-xl border border-[#2a2d3a] bg-[#12151f] px-4 py-3 font-mono text-sm text-slate-300 placeholder-slate-600 outline-none transition focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/30"
              disabled={loading || ipfsFetching}
              spellCheck={false}
            />
            <button
              type="button"
              onClick={handleFetchIpfs}
              disabled={!cid.trim() || ipfsFetching || loading}
              className="flex items-center gap-1.5 rounded-xl border border-[#2a2d3a] bg-[#12151f] px-4 py-3 text-sm text-slate-300 transition hover:border-indigo-500/50 hover:text-indigo-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {ipfsFetching ? (
                <svg
                  className="spinner h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path strokeLinecap="round" d="M12 2a10 10 0 0 1 10 10" />
                </svg>
              ) : (
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                  />
                </svg>
              )}
              Fetch
            </button>
          </div>
          {ipfsError && <p className="text-xs text-rose-400">{ipfsError}</p>}
          {!ipfsError && !ipfsPreview && (
            <p className="text-xs text-slate-500">
              {t('scanInput.ipfs.hint').split('Qm…').map((part, i, arr) =>
                i < arr.length - 1 ? (
                  <span key={i}>{part}<code className="rounded bg-[#1a1d27] px-1 text-slate-400">Qm…</code></span>
                ) : part.split('bafy…').map((p, j, a) =>
                    j < a.length - 1 ? (
                      <span key={j}>{p}<code className="rounded bg-[#1a1d27] px-1 text-slate-400">bafy…</code></span>
                    ) : (
                      <span key={j}>{p}</span>
                    )
                  )
              )}
            </p>
          )}
          {ipfsPreview !== null && (
            <div className="space-y-1">
              <p className="text-xs text-emerald-400">
                {t('scanInput.ipfs.fetchedChars', { chars: ipfsPreview.length.toLocaleString() })}
              </p>
              <textarea
                readOnly
                value={ipfsPreview}
                rows={10}
                className="code-textarea w-full resize-y rounded-xl border border-emerald-500/30 bg-[#12151f] px-4 py-3 text-sm text-slate-400 outline-none"
                spellCheck={false}
              />
            </div>
          )}
        </div>
      ) : (
        /* Gist URL mode */
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              type="url"
              value={gistUrl}
              onChange={(e) => {
                setGistUrl(e.target.value);
                setGistError(null);
                setGistContent(null);
                setGistFiles([]);
              }}
              onKeyDown={handleKeyDown}
              placeholder="https://gist.github.com/user/abc123"
              className="flex-1 rounded-xl border border-[#2a2d3a] bg-[#12151f] px-4 py-3 text-slate-300 placeholder-slate-600 outline-none transition focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/30"
              disabled={loading || gistFetching}
            />
            <button
              type="button"
              onClick={handleFetchGist}
              disabled={!gistUrl.trim() || gistFetching || loading}
              className="flex items-center gap-1.5 rounded-xl border border-[#2a2d3a] bg-[#12151f] px-4 py-3 text-sm text-slate-300 transition hover:border-indigo-500/50 hover:text-indigo-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {gistFetching ? (
                <svg
                  className="spinner h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path strokeLinecap="round" d="M12 2a10 10 0 0 1 10 10" />
                </svg>
              ) : (
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                  />
                </svg>
              )}
              Fetch
            </button>
          </div>
          {gistError && <p className="text-xs text-rose-400">{gistError}</p>}
          {!gistError && gistFiles.length === 0 && (
            <p className="text-xs text-slate-500">
              {t('scanInput.gist.hint')}
            </p>
          )}
          {/* Multi-file selector */}
          {gistFiles.length > 1 && (
            <div className="space-y-1">
              <label
                htmlFor="gist-file-select"
                className="text-xs text-slate-500"
              >
                {t('scanInput.gist.selectFile')}
              </label>
              <select
                id="gist-file-select"
                value={gistSelectedFile}
                onChange={(e) => handleGistFileSelect(e.target.value)}
                className="w-full rounded-lg border border-[#2a2d3a] bg-[#12151f] px-3 py-2 text-sm text-slate-300 outline-none focus:border-indigo-500/60"
                disabled={gistFetching}
              >
                {gistFiles.map((f) => (
                  <option key={f.filename} value={f.filename}>
                    {f.filename}
                  </option>
                ))}
              </select>
            </div>
          )}
          {gistContent !== null && (
            <div className="space-y-1">
              <p className="text-xs text-emerald-400">
                {t('scanInput.gist.fetchedChars', { chars: gistContent.length.toLocaleString() })}
              </p>
              <textarea
                readOnly
                value={gistContent}
                rows={10}
                className="code-textarea w-full resize-y rounded-xl border border-emerald-500/30 bg-[#12151f] px-4 py-3 text-sm text-slate-400 outline-none"
                spellCheck={false}
              />
            </div>
          )}
        </div>
      )}

      {/* Try sample — code mode only */}
      {mode === "code" && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setCode(SAMPLE_CONTRACT)}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-[#2a2d3a] bg-[#12151f] px-3 py-1.5 text-xs text-slate-400 transition hover:border-indigo-500/50 hover:text-indigo-300 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
              />
            </svg>
            {t('scanInput.code.trySample')}
          </button>
        </div>
      )}

      <div className="space-y-2">
        <button
          type="button"
          onClick={() => setAdvancedOpen((open) => !open)}
          className="flex items-center gap-2 text-sm text-slate-400 transition hover:text-slate-200"
        >
          <svg
            className={`h-4 w-4 transition ${advancedOpen ? "rotate-90" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 5l7 7-7 7"
            />
          </svg>
          {t('scanInput.advanced.toggle')}
        </button>
        {advancedOpen && (
          <div className="rounded-lg border border-[#2a2d3a] bg-[#12151f] p-4">
            <label
              htmlFor="slack-webhook-url"
              className="mb-1 block text-sm font-medium text-slate-300"
            >
              {t('scanInput.advanced.slackLabel')}
            </label>
            <input
              id="slack-webhook-url"
              type="url"
              value={slackWebhookUrl}
              onChange={(e) => {
                setSlackWebhookUrl(e.target.value);
                localStorage.setItem("sg_slack_webhook", e.target.value);
              }}
              placeholder={t('scanInput.advanced.slackPlaceholder')}
              disabled={loading}
              className="w-full rounded-lg border border-[#2a2d3a] bg-[#0a0c0f] px-3 py-2 text-sm text-slate-300 placeholder-slate-600 outline-none transition focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/30 disabled:opacity-50"
            />
            <p className="text-xs font-medium text-slate-400 mt-3">
              {t('scanInput.advanced.telegramLabel')}
            </p>
            <div className="space-y-2 mt-2">
              <input
                type="text"
                value={tgBotToken}
                onChange={(e) => {
                  setTgBotToken(e.target.value);
                  localStorage.setItem(TG_BOT_TOKEN_KEY, e.target.value);
                }}
                placeholder={t('scanInput.advanced.telegramBotPlaceholder')}
                className="w-full rounded-lg border border-[#2a2d3a] bg-[#0d0f17] px-3 py-2 text-xs text-slate-300 placeholder-slate-600 outline-none focus:border-indigo-500/60"
                disabled={loading}
              />
              <input
                type="text"
                value={tgChatId}
                onChange={(e) => {
                  setTgChatId(e.target.value);
                  localStorage.setItem(TG_CHAT_ID_KEY, e.target.value);
                }}
                placeholder={t('scanInput.advanced.telegramChatPlaceholder')}
                className="w-full rounded-lg border border-[#2a2d3a] bg-[#0d0f17] px-3 py-2 text-xs text-slate-300 placeholder-slate-600 outline-none focus:border-indigo-500/60"
                disabled={loading}
              />
              <p className="text-xs text-slate-600">
                {t('scanInput.advanced.telegramHint')}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Submit */}
      {error && (
        <div className="flex items-start gap-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          <svg className="mt-0.5 h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div className="flex-1 space-y-2">
            <span>{error}</span>
            {isTimeout && onRetry && (
              <div>
                <button
                  type="button"
                  onClick={onRetry}
                  className="mt-1 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-300 transition hover:bg-red-500/20"
                >
                  {t('scanInput.submit.retry')}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={!canSubmit}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            {isRateLimited ? (
              <>
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                {t('scanInput.submit.rateLimited', { seconds: countdown })}
              </>
            ) : loading ? (
              <>
                <svg
                  className="spinner h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path strokeLinecap="round" d="M12 2a10 10 0 0 1 10 10" />
                </svg>
                {t('scanInput.submit.scanning')}
              </>
            ) : (
              <>
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                  />
                </svg>
                {t('scanInput.submit.scan')}
              </>
            )}
          </button>
          <button
            type="button"
            onClick={toggleNotifications}
            aria-label={
              notificationsEnabled
                ? t('scanInput.submit.notificationsDisable')
                : t('scanInput.submit.notificationsEnable')
            }
            title={
              notificationsEnabled
                ? t('scanInput.submit.notificationsDisable')
                : t('scanInput.submit.notificationsEnable')
            }
            className={`flex items-center justify-center rounded-xl border px-3 py-3 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
              notificationsEnabled
                ? "border-indigo-500/60 bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20"
                : "border-[#2a2d3a] bg-[#12151f] text-slate-500 hover:text-slate-300"
            }`}
          >
            {notificationsEnabled ? (
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                />
              </svg>
            ) : (
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            )}
          </button>
        </div>
        <p className="text-center text-xs text-slate-600">{t('scanInput.submit.shortcut')}</p>
      </div>
    </form>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition ${
        active
          ? "bg-indigo-600 text-white shadow"
          : "text-slate-400 hover:text-slate-200"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}
