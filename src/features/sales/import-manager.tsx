"use client";

import type { ImportType } from "@prisma/client";
import { AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ImportHistoryTable } from "./import-history-table";
import { ImportMappingStep } from "./import-mapping-step";
import { ImportPreviewStep } from "./import-preview-step";
import { ImportUploadCard } from "./import-upload-card";
import type {
  ColumnMapping,
  ImportHistoryEntryDto,
  ImportPreviewResult,
  ImportsBootstrapDto,
} from "./schemas";

interface ParsedDraft {
  type: ImportType;
  fileName: string;
  format: "csv" | "xlsx";
  headers: string[];
  rawRows: string[][];
  mapping: ColumnMapping;
  hasSavedMapping: boolean;
  itemOverrides: Record<string, string>;
  preview: ImportPreviewResult;
}

interface ImportManagerProps {
  initialBootstrap: ImportsBootstrapDto;
}

export function ImportManager({ initialBootstrap }: ImportManagerProps) {
  const t = useTranslations("sales");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [importType, setImportType] = useState<ImportType>("SALES");
  const [pasteText, setPasteText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [history, setHistory] = useState<ImportHistoryEntryDto[]>(
    initialBootstrap.history,
  );
  const [draft, setDraft] = useState<ParsedDraft | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const resetDraft = () => {
    setDraft(null);
    setErrorBanner(null);
    setPasteText("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleTypeChange = (nextType: string) => {
    setImportType(nextType === "PURCHASES" ? "PURCHASES" : "SALES");
    resetDraft();
  };

  const resolveErrorMessage = (
    status: number,
    fallbackKey: "parseFailed" | "confirmFailed",
  ): string => {
    if (status === 401) {
      return t("errors.sessionExpired");
    }
    if (status === 413) {
      return t("errors.fileTooLarge");
    }
    return t(`errors.${fallbackKey}`);
  };

  const submitParseFormData = async (formData: FormData) => {
    setParsing(true);
    setErrorBanner(null);
    try {
      const response = await fetch("/api/imports/parse", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        const message = resolveErrorMessage(response.status, "parseFailed");
        setErrorBanner(message);
        toast.error(message);
        return;
      }
      const payload = await response.json();

      setDraft({
        type: payload.type,
        fileName: payload.fileName,
        format: payload.format,
        headers: payload.headers,
        rawRows: payload.rawRows,
        mapping: payload.mapping,
        hasSavedMapping: Boolean(payload.hasSavedMapping),
        itemOverrides: {},
        preview: payload.preview,
      });
    } catch {
      const message = t("errors.parseFailed");
      setErrorBanner(message);
      toast.error(message);
    } finally {
      setParsing(false);
    }
  };

  const handleUploadFile = (file: File) => {
    const formData = new FormData();
    formData.set("type", importType);
    formData.set("file", file);
    void submitParseFormData(formData);
  };

  const handleParsePasted = () => {
    if (!pasteText.trim()) return;
    const formData = new FormData();
    formData.set("type", importType);
    formData.set("fileName", `${importType.toLowerCase()}-pasted.csv`);
    formData.set("text", pasteText);
    void submitParseFormData(formData);
  };

  const reevaluateDraft = async (
    nextMapping: ColumnMapping,
    nextOverrides: Record<string, string>,
  ) => {
    if (!draft) return;
    setParsing(true);
    setErrorBanner(null);
    try {
      const response = await fetch("/api/imports/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: draft.type,
          fileName: draft.fileName,
          headers: draft.headers,
          rawRows: draft.rawRows,
          mapping: nextMapping,
          itemOverrides: nextOverrides,
        }),
      });
      if (!response.ok) {
        const message = resolveErrorMessage(response.status, "parseFailed");
        setErrorBanner(message);
        toast.error(message);
        return;
      }
      const payload = await response.json();

      setDraft((prev) =>
        prev
          ? {
              ...prev,
              mapping: payload.mapping,
              itemOverrides: nextOverrides,
              preview: payload.preview,
            }
          : null,
      );
    } catch {
      const message = t("errors.parseFailed");
      setErrorBanner(message);
      toast.error(message);
    } finally {
      setParsing(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!draft) return;
    setConfirming(true);
    setErrorBanner(null);
    try {
      const response = await fetch("/api/imports/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: draft.type,
          fileName: draft.fileName,
          headers: draft.headers,
          rawRows: draft.rawRows,
          mapping: draft.mapping,
          itemOverrides: draft.itemOverrides,
        }),
      });
      if (!response.ok) {
        const message = resolveErrorMessage(response.status, "confirmFailed");
        setErrorBanner(message);
        toast.error(message);
        return;
      }
      const payload = await response.json();

      setHistory((prev) => [payload.batch, ...prev]);
      toast.success(
        t("preview.successToast", {
          imported: payload.batch.rowsImported,
          duplicates: payload.batch.rowsDuplicate,
        }),
      );
      resetDraft();
    } catch {
      toast.error(t("errors.confirmFailed"));
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {t("title")}
          </h1>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </div>

        <Tabs value={importType} onValueChange={handleTypeChange}>
          <TabsList>
            <TabsTrigger value="SALES" data-testid="tab-sales">
              {t("types.SALES")}
            </TabsTrigger>
            <TabsTrigger value="PURCHASES" data-testid="tab-purchases">
              {t("types.PURCHASES")}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {errorBanner ? (
        <div
          role="alert"
          data-testid="import-error-alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive text-start"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>{errorBanner}</span>
        </div>
      ) : null}

      <ImportUploadCard
        importType={importType}
        fileInputRef={fileInputRef}
        pasteText={pasteText}
        parsing={parsing}
        confirming={confirming}
        activeDraft={
          draft
            ? {
                fileName: draft.fileName,
                format: draft.format,
                rowCount: draft.rawRows.length,
              }
            : null
        }
        onPasteTextChange={setPasteText}
        onFileSelected={handleUploadFile}
        onParsePasted={handleParsePasted}
        onReset={resetDraft}
      />

      {draft && (
        <>
          <ImportMappingStep
            type={draft.type}
            headers={draft.headers}
            mapping={draft.mapping}
            hasSavedMapping={draft.hasSavedMapping}
            unmatchedItems={draft.preview.unmatchedItems}
            menuItems={initialBootstrap.menuItems}
            disabled={parsing || confirming}
            onChangeMapping={(nextMapping) =>
              void reevaluateDraft(nextMapping, draft.itemOverrides)
            }
            onChangeItemOverride={(rawName, target) =>
              void reevaluateDraft(draft.mapping, {
                ...draft.itemOverrides,
                [rawName]: target,
              })
            }
          />

          <ImportPreviewStep
            type={draft.type}
            fileName={draft.fileName}
            preview={draft.preview}
            confirming={confirming}
            onConfirm={() => void handleConfirmImport()}
          />
        </>
      )}

      <ImportHistoryTable history={history} />
    </div>
  );
}
