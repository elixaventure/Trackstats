import { lazy, Suspense, type ReactNode } from "react";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { Loading } from "./components/States";
import Home from "./pages/Home";
import NotFound from "./pages/NotFound";

const StartRide = lazy(() => import("./pages/StartRide"));
const ImportRide = lazy(() => import("./pages/Import"));
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
const Garage = lazy(() => import("./pages/Garage"));
const BikeService = lazy(() => import("./pages/BikeService"));
const ServiceHistoryPrint = lazy(() => import("./pages/ServiceHistoryPrint"));
const RiderEdit = lazy(() => import("./pages/RiderEdit"));
const BikeEdit = lazy(() => import("./pages/BikeEdit"));
const Transponders = lazy(() => import("./pages/Transponders"));
const Groups = lazy(() => import("./pages/Groups"));
const Settings = lazy(() => import("./pages/Settings"));
const SignIn = lazy(() => import("./pages/SignIn"));
const Welcome = lazy(() => import("./pages/Welcome"));
const Redeem = lazy(() => import("./pages/Redeem"));

const s = (el: ReactNode) => <Suspense fallback={<Loading />}>{el}</Suspense>;

const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { index: true, element: <Home /> },
      { path: "ride", element: s(<StartRide />) },
      { path: "import", element: s(<ImportRide />) },
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
      { path: "garage", element: s(<Garage />) },
      { path: "garage/:bikeId", element: s(<BikeService />) },
      { path: "profile/rider/:id", element: s(<RiderEdit />) },
      { path: "profile/bikes/:id", element: s(<BikeEdit />) },
      { path: "transponders", element: s(<Transponders />) },
      { path: "groups", element: s(<Groups />) },
      { path: "settings", element: s(<Settings />) },
      { path: "sign-in", element: s(<SignIn />) },
      { path: "redeem", element: s(<Redeem />) },
      { path: "*", element: <NotFound /> },
    ],
  },
  { path: "welcome", element: s(<Welcome />) },
  // Live ride is full-screen: no navigation chrome to mis-tap with gloves.
  { path: "ride/live", element: s(<LiveRide />) },
  // Printable service history: plain page without app navigation.
  { path: "garage/:bikeId/history", element: s(<ServiceHistoryPrint />) },
], {
  // "/" normally; "/Bacup-mx-track-" when hosted on GitHub Pages.
  basename: import.meta.env.BASE_URL.replace(/\/$/, "") || "/",
});

export function App() {
  return <RouterProvider router={router} />;
}
