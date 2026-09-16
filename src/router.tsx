import { lazy, Suspense, type ComponentType } from "react";
import { createBrowserRouter } from "react-router";
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

export const router = createBrowserRouter([
  {
    path: "/",
    Component: AppShell,
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
