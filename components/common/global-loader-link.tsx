"use client";

import Link, { type LinkProps } from "next/link";
import { usePathname } from "next/navigation";

import {
  useGlobalLoader,
} from "@/components/common/global-loader-provider";
import {
  GLOBAL_LOADER_TIMINGS,
  type GlobalLoaderMode,
} from "@/lib/global-loader-state";

type GlobalLoaderLinkProps = LinkProps &
  Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps> & {
    loaderMessage?: string;
    loaderMode?: GlobalLoaderMode;
  };

function normalizeHrefValue(href: LinkProps["href"]) {
  if (typeof href === "string") {
    return href;
  }

  const pathname = href.pathname ?? "";
  const search =
    typeof href.query === "string"
      ? href.query
      : new URLSearchParams(
          Object.entries(href.query ?? {}).reduce<Record<string, string>>(
            (accumulator, [key, value]) => {
              if (value === undefined) {
                return accumulator;
              }

              accumulator[key] = String(value);
              return accumulator;
            },
            {},
          ),
        ).toString();

  return search ? `${pathname}?${search}` : pathname;
}

export function GlobalLoaderLink({
  href,
  loaderMessage,
  loaderMode = "blocking",
  onClick,
  children,
  ...props
}: GlobalLoaderLinkProps) {
  const pathname = usePathname();
  const { beginRouteTransition, hideLoader } = useGlobalLoader();

  function handleClick(event: React.MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);

    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    const nextHref = normalizeHrefValue(href);
    const nextPathname = nextHref.split("?")[0] ?? nextHref;

    if (!nextHref || nextPathname === pathname || nextHref.startsWith("#")) {
      return;
    }

    const token = beginRouteTransition(loaderMessage, loaderMode);
    window.setTimeout(() => {
      hideLoader(token);
    }, GLOBAL_LOADER_TIMINGS.routeGuardMs);
  }

  return (
    <Link href={href} onClick={handleClick} {...props}>
      {children}
    </Link>
  );
}
