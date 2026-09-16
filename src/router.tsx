import { createBrowserRouter } from "react-router";
import { AppShell } from "./components/AppShell";
import { HomeRoute } from "./routes/Home";
import { CoursesRoute } from "./routes/Courses";
import { CourseDetailRoute } from "./routes/CourseDetail";
import { CourseEditRoute } from "./routes/CourseEdit";
import { NewRoundRoute } from "./routes/NewRound";
import { ScorecardRoute } from "./routes/Scorecard";
import { RoundSummaryRoute } from "./routes/RoundSummary";
import { RoundsRoute } from "./routes/Rounds";
import { StatsRoute } from "./routes/Stats";
import { SettingsRoute } from "./routes/Settings";
import { NotFoundRoute } from "./routes/NotFound";

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
