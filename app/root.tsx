import { useMemo } from "react";
import { I18nextProvider, useTranslation } from "react-i18next";
import { isRouteErrorResponse, Links, Meta, Outlet, Scripts, ScrollRestoration, useRouteLoaderData, data } from "react-router";
import type { Route } from "./+types/root";
import "./app.css";
import { detectLocale, makeI18n, type Locale } from "~/services/i18n";
import { getOptionalUser, getSupabase, sessionMiddleware } from "~/services/auth.server";
import { getAppName } from "~/services/settings.server";
import { getEnv } from "~/services/env.server";
import { AppError } from "~/utils/errors";
import { countryBySlug, preferredCountry } from "~/countries/registry";
import { ButtonLink } from "~/components/ui";

export const middleware: Route.MiddlewareFunction[] = [sessionMiddleware()];

export const links: Route.LinksFunction = () => [
  { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
  { rel: "manifest", href: "/manifest.webmanifest" },
];

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await getOptionalUser(context);
  const slug = new URL(request.url).pathname.split("/").filter(Boolean)[0];
  const country = countryBySlug(slug) ?? preferredCountry(request);
  const locale = detectLocale(request, user?.profile.locale, country?.localization.defaultLocale);
  const theme = (request.headers.get("Cookie") ?? "").match(/aula_theme=(light|dark|system)/)?.[1] ?? "system";
  return data({ locale, theme, appName: await getAppName(getSupabase(context), getEnv(context).APP_NAME) });
}

export function Layout({ children }: { children: React.ReactNode }) {
  const root = useRouteLoaderData<typeof loader>("root");
  const locale: Locale = root?.locale ?? "es";
  const theme = root?.theme ?? "system";
  const i18n = useMemo(() => makeI18n(locale), [locale]);
  return (
    <html lang={locale} className={theme === "dark" ? "dark" : undefined} suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#08265E" />
        <Meta />
        <Links />
        {theme === "system" && (
          <script dangerouslySetInnerHTML={{ __html: "if(matchMedia('(prefers-color-scheme: dark)').matches)document.documentElement.classList.add('dark')" }} />
        )}
      </head>
      <body>
        <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export const meta: Route.MetaFunction = ({ loaderData }) => [{ title: loaderData?.appName ?? "Yupiii" }];

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const { t } = useTranslation();
  let code = "unexpected";
  let status = 500;
  if (isRouteErrorResponse(error)) {
    status = error.status;
    code = status === 404 ? "not_found" : typeof error.data === "string" && error.data ? error.data : "unexpected";
  } else if (error instanceof AppError) {
    code = error.code;
    status = error.status;
  } else if (error instanceof Error && /^[a-z_]+$/.test(error.message)) {
    code = error.message;
  }
  if (import.meta.env.DEV && error instanceof Error) console.error(error);
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="card max-w-md p-8 text-center">
        <p className="text-5xl font-bold text-brand-500">{status}</p>
        <h1 className="mt-3 text-lg font-semibold">{t(`errors.${code}`, { defaultValue: t("errors.unexpected") })}</h1>
        <div className="mt-6 flex justify-center gap-2">
          <ButtonLink to="/app">{t("common.go_home")}</ButtonLink>
        </div>
      </div>
    </main>
  );
}
