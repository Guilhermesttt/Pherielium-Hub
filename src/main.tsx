import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/archivo-black/400.css";
import "@fontsource/stix-two-text/400.css";
import "@fontsource/stix-two-text/700.css";
import "./index.css";
import { Navigate, createBrowserRouter, createHashRouter, RouterProvider } from "react-router-dom";

import LoadingState from "./components/ui/loading-state";

const Landing = lazy(() => import("./Landing"));
const DownloadPage = lazy(() => import("./pages/Download"));
const Login = lazy(() => import("./pages/Login"));
const DesktopAuth = lazy(() => import("./pages/DesktopAuth"));
const AppRoot = lazy(() => import("./App"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const isDesktopRuntime = Boolean(window.electronAPI);

const routeFallback = (
  <div className="flex min-h-screen items-center justify-center bg-[#030405] text-white">
    <LoadingState label="Iniciando Pherielium" variant="working" />
  </div>
);

const desktopRoutes = [
  {
    path: "/",
    element: <Navigate to="/login" replace />,
  },
  {
    path: "/login",
    element: (
      <Suspense fallback={routeFallback}>
        <Login />
      </Suspense>
    ),
  },
  {
    path: "/desktop-auth",
    element: (
      <Suspense fallback={routeFallback}>
        <DesktopAuth />
      </Suspense>
    ),
  },
  {
    path: "/app",
    element: (
      <Suspense fallback={routeFallback}>
        <AppRoot />
      </Suspense>
    ),
  },
  {
    path: "*",
    element: <Navigate to="/login" replace />,
  },
];

const webRoutes = [
  {
    path: "/",
    element: (
      <Suspense fallback={routeFallback}>
        <Landing />
      </Suspense>
    ),
  },
  {
    path: "/download",
    element: (
      <Suspense fallback={routeFallback}>
        <DownloadPage />
      </Suspense>
    ),
  },
  {
    path: "/login",
    element: <Navigate to="/download" replace />,
  },
  {
    path: "/app",
    element: <Navigate to="/" replace />,
  },
  {
    path: "/desktop-auth",
    element: <Navigate to="/" replace />,
  },
  {
    path: "/privacy-policy",
    element: (
      <Suspense fallback={routeFallback}>
        <PrivacyPolicy />
      </Suspense>
    ),
  },
  {
    path: "/privacy",
    element: (
      <Suspense fallback={routeFallback}>
        <PrivacyPolicy />
      </Suspense>
    ),
  },
  {
    path: "*",
    element: <Navigate to="/" replace />,
  },
];

const router = isDesktopRuntime ? createHashRouter(desktopRoutes) : createBrowserRouter(webRoutes);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
