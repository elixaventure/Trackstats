import { lazy, Suspense, type ReactNode } from "react";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { Loading } from "./components/States";
import Home from "./pages/Home";
import NotFound from "./pages/NotFound";

const StartRide = lazy(() => import("./pages/StartRide"));
const LiveRide = lazy(() => import("./pages/LiveRide"));
const Sessions = lazy(() => import("./pages/Sessions"));
const SessionResults = lazy(() => import("./pages/SessionResults"));
const ShareCard = lazy(() => import("./pages/ShareCard"));
const Progress = lazy(() => import("./pages/Progress"));
const RoutesPage = lazy(() => import("./pages/Routes"));
const RecordRoute = lazy(() => import("./pages/RecordRoute"));
const RouteDetail = lazy(() => import("./pages/RouteDetail"));
const Leaderboards = lazy(() => import("./pages/Leaderboards"));
const Achievements = lazy(() => import("./pages/Achievements"));
const Profile = lazy(() => import("./pages/Profile"));
const RiderEdit = lazy(() => import("./pages/RiderEdit"));
const BikeEdit = lazy(() => import("./pages/BikeEdit"));
const Transponders = lazy(() => import("./pages/Transponders"));
const Groups = lazy(() => import("./pages/Groups"));
const Settings = lazy(() => import("./pages/Settings"));
const SignIn = lazy(() => import("./pages/SignIn"));

const s = (el: ReactNode) => <Suspense fallback={<Loading />}>{el}</Suspense>;

const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { index: true, element: <Home /> },
      { path: "ride", element: s(<StartRide />) },
      { path: "sessions", element: s(<Sessions />) },
      { path: "sessions/:id", element: s(<SessionResults />) },
      { path: "sessions/:id/share", element: s(<ShareCard />) },
      { path: "progress", element: s(<Progress />) },
      { path: "routes", element: s(<RoutesPage />) },
      { path: "routes/new", element: s(<RecordRoute />) },
      { path: "routes/:id", element: s(<RouteDetail />) },
      { path: "leaderboards", element: s(<Leaderboards />) },
      { path: "achievements", element: s(<Achievements />) },
      { path: "profile", element: s(<Profile />) },
      { path: "profile/rider/:id", element: s(<RiderEdit />) },
      { path: "profile/bikes/:id", element: s(<BikeEdit />) },
      { path: "transponders", element: s(<Transponders />) },
      { path: "groups", element: s(<Groups />) },
      { path: "settings", element: s(<Settings />) },
      { path: "sign-in", element: s(<SignIn />) },
      { path: "*", element: <NotFound /> },
    ],
  },
  // Live ride is full-screen: no navigation chrome to mis-tap with gloves.
  { path: "ride/live", element: s(<LiveRide />) },
]);

export function App() {
  return <RouterProvider router={router} />;
}
