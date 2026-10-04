import { buttonClass } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { partsShop } from "@/config/shops";

/** Opens a shop search for a part. Labelled when the link is an affiliate one. */
export function GetPartsLink({ query, label = "Get parts", compact = false }: { query: string; label?: string; compact?: boolean }) {
  const shop = partsShop();
  return (
    <a
      href={shop.searchUrl(query)}
      target="_blank"
      rel={`noopener noreferrer${shop.affiliate ? " sponsored" : ""}`}
      aria-label={`${label}: search ${shop.name} for ${query}${shop.affiliate ? " (affiliate link)" : ""}`}
      className={compact ? "grid size-12 shrink-0 place-items-center rounded-xl text-plate hover:bg-surface-2" : buttonClass("secondary", "md", "min-h-11 shrink-0 px-3 text-sm")}
    >
      <Icon name="cart" className="size-5" />
      {!compact && <span>{label}</span>}
    </a>
  );
}

export function PartsDisclosure() {
  const shop = partsShop();
  return (
    <p className="text-xs text-muted">
      {shop.affiliate
        ? `Parts links go to ${shop.name}. They're affiliate links: TrackStats may earn a small commission, at no extra cost to you.`
        : "Parts links open a web shopping search for your bike and brand. TrackStats doesn't earn anything from them."}
    </p>
  );
}
