import { BrowserRouter, Routes, Route, NavLink, Navigate } from "react-router-dom";
import { useEffect, useState } from "react";
import "./index.css";
import { supabase } from "./lib/supabase";

import ProfileEdit from "./pages/ProfileEdit";
import Search from "./pages/Search";
import Login from "./pages/Login";
import ShowDetails from "./pages/ShowDetails";
import MyShows from "./pages/MyShows";
import MyShowDetails from "./pages/MyShowDetails";
import AiringNextPage from "./pages/airingnext";
import ReadyToWatchPage from "./pages/readytowatch";
import ReadyShowPage from "./pages/readyShow";
import Dashboard from "./pages/Dashboard";
import CalendarPage from "./pages/CalendarPage";
import ActorPage from "./pages/ActorPage";

function AppNav({ isLoggedIn }) {
  return (
    <div className="nav-wrap">
      <nav className="top-tabs">
        <NavLink
          to="/"
          end
          className={({ isActive }) => `top-tab${isActive ? " active" : ""}`}
        >
          Dashboard
        </NavLink>

        <NavLink
          to="/search"
          className={({ isActive }) => `top-tab${isActive ? " active" : ""}`}
        >
          Search
        </NavLink>

        <NavLink
          to="/my-shows"
          className={({ isActive }) => `top-tab${isActive ? " active" : ""}`}
        >
          My Shows
        </NavLink>

        <NavLink
          to="/airing-next"
          className={({ isActive }) => `top-tab${isActive ? " active" : ""}`}
        >
          Airing Next
        </NavLink>

        <NavLink
          to="/ready-to-watch"
          className={({ isActive }) => `top-tab${isActive ? " active" : ""}`}
        >
          Ready To Watch
        </NavLink>

        {!isLoggedIn && (
          <NavLink
            to="/login"
            className={({ isActive }) => `top-tab${isActive ? " active" : ""}`}
          >
            Login
          </NavLink>
        )}

        <NavLink
          to="/calendar"
          className={({ isActive }) => `top-tab${isActive ? " active" : ""}`}
        >
          Calendar
        </NavLink>
      </nav>
    </div>
  );
}

function HomeRoute({ sessionLoading, isLoggedIn }) {
  if (sessionLoading) {
    return <div className="page">Loading...</div>;
  }

  return isLoggedIn ? <Dashboard /> : <Navigate to="/login" replace />;
}

function LoginRoute({ sessionLoading, isLoggedIn }) {
  if (sessionLoading) {
    return <div className="page">Loading...</div>;
  }

  return isLoggedIn ? <Navigate to="/" replace /> : <Login />;
}

function ProtectedRoute({ sessionLoading, isLoggedIn, children }) {
  if (sessionLoading) {
    return <div className="page">Loading...</div>;
  }

  return isLoggedIn ? children : <Navigate to="/login" replace />;
}

function App() {
  const [sessionLoading, setSessionLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function loadSession() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!mounted) return;

      setIsLoggedIn(!!session);
      setSessionLoading(false);
    }

    loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsLoggedIn(!!session);
      setSessionLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return (
    <BrowserRouter>
      <AppNav isLoggedIn={isLoggedIn} />

      <Routes>
        <Route
          path="/"
          element={
            <HomeRoute
              sessionLoading={sessionLoading}
              isLoggedIn={isLoggedIn}
            />
          }
        />

        <Route
          path="/login"
          element={
            <LoginRoute
              sessionLoading={sessionLoading}
              isLoggedIn={isLoggedIn}
            />
          }
        />

        <Route
          path="/search"
          element={
            <ProtectedRoute
              sessionLoading={sessionLoading}
              isLoggedIn={isLoggedIn}
            >
              <Search />
            </ProtectedRoute>
          }
        />

        <Route
          path="/show/:id"
          element={
            <ProtectedRoute
              sessionLoading={sessionLoading}
              isLoggedIn={isLoggedIn}
            >
              <ShowDetails />
            </ProtectedRoute>
          }
        />

        <Route
          path="/my-shows"
          element={
            <ProtectedRoute
              sessionLoading={sessionLoading}
              isLoggedIn={isLoggedIn}
            >
              <MyShows />
            </ProtectedRoute>
          }
        />

        <Route
          path="/my-shows/:id"
          element={
            <ProtectedRoute
              sessionLoading={sessionLoading}
              isLoggedIn={isLoggedIn}
            >
              <MyShowDetails />
            </ProtectedRoute>
          }
        />

        <Route
          path="/actor/:name"
          element={
            <ProtectedRoute
              sessionLoading={sessionLoading}
              isLoggedIn={isLoggedIn}
            >
              <ActorPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/airing-next"
          element={
            <ProtectedRoute
              sessionLoading={sessionLoading}
              isLoggedIn={isLoggedIn}
            >
              <AiringNextPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/ready-to-watch"
          element={
            <ProtectedRoute
              sessionLoading={sessionLoading}
              isLoggedIn={isLoggedIn}
            >
              <ReadyToWatchPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/ready/:id"
          element={
            <ProtectedRoute
              sessionLoading={sessionLoading}
              isLoggedIn={isLoggedIn}
            >
              <ReadyShowPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/calendar"
          element={
            <ProtectedRoute
              sessionLoading={sessionLoading}
              isLoggedIn={isLoggedIn}
            >
              <CalendarPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/profile/edit"
          element={
            <ProtectedRoute
              sessionLoading={sessionLoading}
              isLoggedIn={isLoggedIn}
            >
              <ProfileEdit />
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
