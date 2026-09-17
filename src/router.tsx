import { lazy, Suspense, type ComponentType } from "react";
import { createBrowserRouter, isRouteErrorResponse, useRouteError } from "react-router";
import { AppShell } from "./components/AppShell";
import { HomeRoute } from "./routes/Home";
import { RoundsRoute } from "./routes/Rounds";
import { RoundSummaryRoute } from "./routes/RoundSummary";
import { SettingsRoute } from "./routes/Settings";
import { NotFoundRoute } from "./routes/NotFound";
import { Spinner } from "./components/ui";

function lazyRoute(loader: () => Promise<{ [k: string]: ComponentType }>, name: string) {
  const C = lazy(() => loader().then((m) => ({ default: m[name] })));
  return function LazyRoute() {
    return (
      <Suspense
        fallback={
          <div className="grid min-h-dvh place-items-center">
            <Spinner />
          </div>
        }
      >
        <C />
      </Suspense>
    );
  };
}

const CoursesRoute = lazyRoute(() => import("./routes/Courses"), "CoursesRoute");
const CourseDetailRoute = lazyRoute(() => import("./routes/CourseDetail"), "CourseDetailRoute");
const CourseEditRoute = lazyRoute(() => import("./routes/CourseEdit"), "CourseEditRoute");
const NewRoundRoute = lazyRoute(() => import("./routes/NewRound"), "NewRoundRoute");
const ScorecardRoute = lazyRoute(() => import("./routes/Scorecard"), "ScorecardRoute");
const StatsRoute = lazyRoute(() => import("./routes/Stats"), "StatsRoute");

function RouteError() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error) ? `${error.status} ${error.statusText}` : error instanceof Error ? error.message : "Something went wrong";
  return (
    <div className="mx-auto flex min-h-dvh max-w-[480px] flex-col items-center justify-center px-6 text-center">
      <h1 className="text-xl font-bold">Something broke</h1>
      <p className="mt-2 text-sm text-ink-2">{message}</p>
      <div className="mt-5 flex gap-2">
        <button className="h-11 rounded-full bg-accent px-5 font-semibold text-accent-ink" onClick={() => window.location.reload()}>
          Reload
        </button>
        <button className="h-11 rounded-full bg-surface-2 px-5 font-semibold" onClick={() => (window.location.href = "/")}>
          Home
        </button>
      </div>
      <p className="mt-4 text-xs text-ink-3">Your rounds are safe. This only affects the current screen.</p>
    </div>
  );
}

export const router = createBrowserRouter([
  {
    path: "/",
    Component: AppShell,
    ErrorBoundary: RouteError,
    children: [
      { index: true, Component: HomeRoute },
      { path: "courses", Component: CoursesRoute },
      { path: "courses/new", Component: CourseEditRoute },
      { path: "courses/:id", Component: CourseDetailRoute },
      { path: "courses/:id/edit", Component: CourseEditRoute },
      { path: "play", Component: NewRoundRoute },
      { path: "rounds", Component: RoundsRoute },
      { path: "rounds/:id", Component: RoundSummaryRoute },
      { path: "rounds/:id/play", Component: ScorecardRoute },
      { path: "stats", Component: StatsRoute },
      { path: "settings", Component: SettingsRoute },
      { path: "*", Component: NotFoundRoute },
    ],
  },
]);
