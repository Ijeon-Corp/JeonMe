"use client";

import { useRouter } from "next/navigation";
import { EmbeddedCatalogBlock } from "@/lib/api-client";
import { buildEmbeddableTypes } from "@/lib/catalog-blocks";
import { IconLock } from "@/components/icons";
import { useLocale } from "@/lib/locale-context";

// CatalogBlockTypePicker -- dipindahkan verbatim dari
// components/CatalogBlocksEditor.tsx, 6 September 2026 (redesain editor
// katalog/FAQ jadi drill-down gaya Linktree -- lihat
// components/BlockDrilldownEditor.tsx), supaya dipakai bersama oleh editor
// baru itu DAN CatalogBlocksEditor.tsx lama (sementara masih hidup di balik
// flag `page_builder`, dashboard-flags.ts).
export function CatalogBlockTypePicker({
  isPremium,
  disabled,
  onPick,
}: {
  isPremium: boolean;
  disabled: boolean;
  onPick: (type: EmbeddedCatalogBlock["block_type"]) => void;
}) {
  const router = useRouter();
  const { t } = useLocale();
  const embeddableTypes = buildEmbeddableTypes(t);
  return (
    <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
      {embeddableTypes.map((opt) => {
        const locked = !!opt.premiumOnly && !isPremium;
        return (
          <button
            key={opt.type}
            type="button"
            disabled={disabled && !locked}
            onClick={() => (locked ? router.push("/dashboard/settings/subscription") : onPick(opt.type))}
            title={
              locked
                ? t("dashboard.components.catalogBlocksEditor.premiumOnlyTitle")
                : disabled
                  ? t("dashboard.components.catalogBlocksEditor.atLimitTitle")
                  : undefined
            }
            className={`flex flex-col items-center gap-1 rounded-xl border-2 border-jeon-ink px-2 py-2.5 text-center text-[10.5px] font-semibold text-app-ink transition-colors hover:border-jeon-purple hover:text-jeon-purple disabled:cursor-not-allowed disabled:opacity-40 ${
              locked ? "relative" : ""
            }`}
          >
            {locked ? <IconLock className="h-4 w-4 text-app-muted" /> : <opt.Icon className="h-4 w-4" />}
            <span>
              {opt.label}
              {locked && (
                <span className="block text-[9px] text-app-muted">
                  {t("dashboard.components.catalogBlocksEditor.premiumBadge")}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default CatalogBlockTypePicker;
