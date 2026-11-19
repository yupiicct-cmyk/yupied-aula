import { useEffect, useState } from "react";
import { Form, Link, NavLink, Outlet, useFetcher, useLocation, useNavigation } from "react-router";
import { useTranslation } from "react-i18next";
import {
  Bell, BookOpen, CalendarDays, ClipboardCheck, ClipboardList, FileBarChart, FolderOpen, GraduationCap, Home,
  Layers, LogOut, Megaphone, Menu, MessageSquare, Moon, NotebookPen, Settings, Sun, TrendingUp, UserRound, Users, X, Award,
} from "lucide-react";
import type { Route } from "./+types/app-layout";
import { requireUser, getSupabase } from "~/services/auth.server";
import { getCourses } from "~/services/courses.server";
import { getEnv } from "~/services/env.server";
import { getAppName } from "~/services/settings.server";
import { LanguageSwitcher } from "~/components/layout/language-switcher";
import { Avatar } from "~/components/ui";
import { cn } from "~/utils/cn";
import { fullName, initials } from "~/utils/format";

export async function loader({ request, context }: Route.LoaderArgs) {
  const { user, supabase } = await requireUser(request, context);
  const [{ courses, course }, unread] = await Promise.all([
    getCourses(request, supabase),
    supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null),
  ]);
  return {
    appName: await getAppName(getSupabase(context), getEnv(context).APP_NAME),
    user: { id: user.id, name: fullName(user.profile), initials: initials(user.profile), email: user.email, isTeacher: user.isTeacher, isAdmin: user.isAdmin, isStudent: user.isStudent },
    courses: courses.map((c) => ({ id: c.id, name: c.name })),
    activeCourseId: course?.id ?? null,
    unread: unread.count ?? 0,
  };
}

type NavItem = { to: string; key: string; icon: typeof Home; end?: boolean };

const teacherNav: NavItem[] = [
  { to: "/app", key: "nav.summary", icon: Home, end: true },
  { to: "/app/students", key: "nav.students", icon: Users },
  { to: "/app/courses", key: "nav.courses", icon: GraduationCap },
  { to: "/app/modules", key: "nav.modules", icon: Layers },
  { to: "/app/lessons", key: "nav.lessons", icon: BookOpen },
  { to: "/app/library", key: "nav.library", icon: FolderOpen },
  { to: "/app/activities", key: "nav.activities", icon: ClipboardList },
  { to: "/app/assessments", key: "nav.assessments", icon: NotebookPen },
  { to: "/app/grades", key: "nav.grades", icon: Award },
  { to: "/app/attendance", key: "nav.attendance", icon: ClipboardCheck },
  { to: "/app/announcements", key: "nav.communications", icon: Megaphone },
  { to: "/app/messages", key: "nav.messages", icon: MessageSquare },
  { to: "/app/calendar", key: "nav.calendar", icon: CalendarDays },
  { to: "/app/reports", key: "nav.reports", icon: FileBarChart },
  { to: "/app/settings", key: "nav.settings", icon: Settings },
];

const studentNav: NavItem[] = [
  { to: "/app", key: "nav.my_classroom", icon: Home, end: true },
  { to: "/app/courses", key: "nav.my_courses", icon: GraduationCap },
  { to: "/app/modules", key: "nav.my_modules", icon: Layers },
  { to: "/app/lessons", key: "nav.my_classes", icon: BookOpen },
  { to: "/app/library", key: "nav.my_materials", icon: FolderOpen },
  { to: "/app/activities", key: "nav.my_activities", icon: ClipboardList },
  { to: "/app/assessments", key: "nav.my_assessments", icon: NotebookPen },
  { to: "/app/grades", key: "nav.my_grades", icon: Award },
  { to: "/app/attendance", key: "nav.my_attendance", icon: ClipboardCheck },
  { to: "/app/progress", key: "nav.my_progress", icon: TrendingUp },
  { to: "/app/calendar", key: "nav.calendar", icon: CalendarDays },
  { to: "/app/announcements", key: "nav.announcements", icon: Megaphone },
  { to: "/app/messages", key: "nav.messages", icon: MessageSquare },
  { to: "/app/profile", key: "nav.my_profile", icon: UserRound },
];

export default function AppLayout({ loaderData }: Route.ComponentProps) {
  const { t } = useTranslation();
  const { user, courses, activeCourseId, unread, appName } = loaderData;
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const navigation = useNavigation();
  const nav = user.isTeacher ? teacherNav : studentNav;
  useEffect(() => setOpen(false), [location.pathname]);

  return (
    <div className="min-h-screen lg:pl-64">
      {/* Menú lateral */}
      <aside className={cn("no-print fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-navy-900 text-slate-200 transition-transform lg:translate-x-0",
        open ? "translate-x-0" : "-translate-x-full")} aria-label={t("nav.menu")}>
        <div className="flex h-16 items-center gap-2 border-b border-white/10 px-5">
          <GraduationCap className="h-7 w-7 text-brand-500" aria-hidden />
          <span className="truncate font-semibold text-white">{appName}</span>
          <button className="ml-auto lg:hidden" onClick={() => setOpen(false)} aria-label={t("common.close")}><X className="h-5 w-5" /></button>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
          {nav.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} prefetch="intent"
              className={({ isActive }) => cn("flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive ? "bg-brand-500 text-white" : "text-slate-300 hover:bg-white/10 hover:text-white")}>
              <item.icon className="h-4.5 w-4.5 shrink-0" aria-hidden />
              {t(item.key)}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-white/10 p-3">
          <Form method="post" action="/logout">
            <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-white/10 hover:text-white">
              <LogOut className="h-4 w-4" aria-hidden /> {t("auth.sign_out")}
            </button>
          </Form>
        </div>
      </aside>
      {open && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setOpen(false)} aria-hidden />}

      {/* Barra superior */}
      <header className="no-print sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur dark:border-white/10 dark:bg-navy-950/90 sm:px-6">
        <button className="lg:hidden" onClick={() => setOpen(true)} aria-label={t("nav.menu")}><Menu className="h-6 w-6" /></button>
        {courses.length > 0 && (
          <Form method="post" action="/api/preferences" className="min-w-0">
            <input type="hidden" name="intent" value="course" />
            <input type="hidden" name="back" value={location.pathname} />
            <label className="sr-only" htmlFor="course-switch">{t("nav.active_course")}</label>
            <select id="course-switch" name="course" defaultValue={activeCourseId ?? ""} key={activeCourseId}
              onChange={(e) => e.currentTarget.form?.requestSubmit()}
              className="max-w-[46vw] truncate rounded-lg border border-slate-200 bg-white py-1.5 pl-3 pr-8 text-sm font-medium dark:border-white/15 dark:bg-navy-900 sm:max-w-xs">
              {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Form>
        )}
        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <div className="hidden sm:block"><LanguageSwitcher /></div>
          <ThemeToggle />
          <Link to="/app/notifications" className="relative rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10" aria-label={t("nav.notifications")}>
            <Bell className="h-5 w-5" />
            {unread > 0 && <span className="absolute -right-0.5 -top-0.5 min-w-5 rounded-full bg-red-500 px-1 text-center text-[10px] font-bold leading-5 text-white">{unread > 99 ? "99+" : unread}</span>}
          </Link>
          <Link to="/app/profile" className="flex items-center gap-2" title={user.email}>
            <Avatar name={user.initials} size={34} />
            <span className="hidden text-sm font-medium md:block">{user.name}</span>
          </Link>
        </div>
      </header>
      {navigation.state === "loading" && <div className="fixed inset-x-0 top-0 z-50 h-0.5 animate-pulse bg-brand-500" aria-hidden />}
      <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
        <div className="mb-4 sm:hidden"><LanguageSwitcher /></div>
        <Outlet />
      </main>
    </div>
  );
}

function ThemeToggle() {
  const fetcher = useFetcher();
  const { t } = useTranslation();
  const toggle = () => {
    const dark = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", dark);
    void fetcher.submit({ intent: "theme", theme: dark ? "dark" : "light" }, { method: "post", action: "/api/preferences" });
  };
  return (
    <button type="button" onClick={toggle} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10" aria-label={t("common.toggle_theme")}>
      <Moon className="h-5 w-5 dark:hidden" /><Sun className="hidden h-5 w-5 dark:block" />
    </button>
  );
}
