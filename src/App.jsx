import { useEffect, useState } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  NavLink,
  useLocation,
  Navigate,
} from "react-router-dom";
import "./index.css";
import ProfileEdit from "./pages/ProfileEdit";

import Search from "./pages/Search";
import Login from "./pages/Login";
import ShowDetails from "./pages/ShowDetails";
import MyShows from "./pages/MyShows";
import MyShowDetails from "./pages/MyShowDetails";
import Dashboard from "./pages/Dashboard";
import CalendarPage from "./pages/CalendarPage";
import ActorPage from "./pages/ActorPage";
import Rankd from "./pages/Rankd";
import BurgrsBanner from "./components/BurgrsBanner";
import { supabase } from "./lib/supabase";
import TmdbShowDetails from "./pages/TmdbShowDetails";

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M3 10.5 12 3l9 7.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5.5 9.5V20h13V9.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle
        cx="11"
        cy="11"
        r="6.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M16 16l5 5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ShowsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect
        x="3"
        y="5"
        width="18"
        height="14"
        rx="2.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M7 3v4M17 3v4M3 9h18"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect
        x="3"
        y="5"
        width="18"
        height="16"
        rx="2.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M8 3v4M16 3v4M3 9h18"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M8 13h3M13 13h3M8 17h3"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function RankdIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M8 6h8"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M6 10h12"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M4 14h16"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M10 18h4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function UserProfileLink({ session, profile, className = "top-profile-link" }) {
  if (!session) return null;

  const displayName =
    profile?.username ||
    profile?.full_name ||
    session.user?.user_metadata?.username ||
    session.user?.user_metadata?.full_name ||
    session.user?.email?.split("@")[0] ||
    "Profile";

  const avatarUrl =
    profile?.avatar_url ||
    session.user?.user_metadata?.avatar_url ||
    "";

  const initial = displayName.charAt(0).toUpperCase();

  return (
    <NavLink to="/profile/edit" className={className}>
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={displayName}
          className="top-profile-avatar"
        />
      ) : (
        <div className="top-profile-avatar top-profile-avatar-placeholder">
          {initial}
        </div>
      )}
      <span className="top-profile-text">
        <span className="top-profile-name">{displayName}</span>
      </span>
    </NavLink>
  );
}

function DesktopNav({ session, profile }) {
  if (!session) return null;

  return (
    <div className="nav-wrap desktop-nav">
      <div className="top-header-bar">
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
            to="/rankd"
            className={({ isActive }) => `top-tab${isActive ? " active" : ""}`}
          >
            Rank'd
          </NavLink>

          <NavLink
            to="/calendar"
            className={({ isActive }) => `top-tab${isActive ? " active" : ""}`}
          >
            Calendar
          </NavLink>
        </nav>

        <UserProfileLink session={session} profile={profile} />
      </div>
    </div>
  );
}

function MobileTopBanner({ session, profile }) {
  const location = useLocation();

  if (!session || location.pathname === "/login") {
    return null;
  }

  return (
    <div className="mobile-top-banner-wrap">
      <BurgrsBanner />
      <UserProfileLink
        session={session}
        profile={profile}
        className="top-profile-link mobile-profile-link"
      />
    </div>
  );
}

function MobileBottomNav({ session }) {
  const location = useLocation();

  if (!session || location.pathname === "/login") {
    return null;
  }

  return (
    <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
      <NavLink
        to="/"
        end
        className={({ isActive }) =>
          `mobile-nav-item${isActive ? " active" : ""}`
        }
      >
        <span className="mobile-nav-icon">
          <HomeIcon />
        </span>
        <span className="mobile-nav-label">Home</span>
      </NavLink>

      <NavLink
        to="/search"
        className={({ isActive }) =>
          `mobile-nav-item${isActive ? " active" : ""}`
        }
      >
        <span className="mobile-nav-icon">
          <SearchIcon />
        </span>
        <span className="mobile-nav-label">Search</span>
      </NavLink>

      <NavLink
        to="/my-shows"
        className={({ isActive }) =>
          `mobile-nav-item${isActive ? " active" : ""}`
        }
      >
        <span className="mobile-nav-icon">
          <ShowsIcon />
        </span>
        <span className="mobile-nav-label">Shows</span>
      </NavLink>

      <NavLink
        to="/rankd"
        className={({ isActive }) =>
          `mobile-nav-item${isActive ? " active" : ""}`
        }
      >
        <span className="mobile-nav-icon">
          <RankdIcon />
        </span>
        <span className="mobile-nav-label">Rank</span>
      </NavLink>

      <NavLink
        to="/calendar"
        className={({ isActive }) =>
          `mobile-nav-item${isActive ? " active" : ""}`
        }
      >
        <span className="mobile-nav-icon">
          <CalendarIcon />
        </span>
        <span className="mobile-nav-label">Cal</span>
      </NavLink>
    </nav>
  );
}

function AuthRedirect({ session }) {
  if (session) {
    return <Dashboard />;
  }

  return <Navigate to="/login" replace />;
}

function ProtectedRoute({ session, children }) {
  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

function LoginRoute({ session }) {
  if (session) {
    return <Navigate to="/" replace />;
  }

  return <Login />;
}

function AppLayout() {
  const [session, setSession] = useState(undefined);
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    let mounted = true;

    const loadSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (mounted) {
        setSession(data.session ?? null);
      }
    };

    loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession ?? null);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function loadProfile() {
      if (!session?.user?.id) {
        setProfile(null);
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("id, username, full_name, avatar_url")
        .eq("id", session.user.id)
        .maybeSingle();

      if (!active) return;

      if (error) {
        console.error("Error loading header profile:", error);
        setProfile(null);
        return;
      }

      setProfile(data || null);
    }

    loadProfile();

    return () => {
      active = false;
    };
  }, [session?.user?.id]);

  if (session === undefined) {
    return null;
  }

  return (
    <>
      <DesktopNav session={session} profile={profile} />
      <MobileTopBanner session={session} profile={profile} />

      <Routes>
        <Route path="/" element={<AuthRedirect session={session} />} />
        <Route path="/login" element={<LoginRoute session={session} />} />

        <Route
          path="/search"
          element={
            <ProtectedRoute session={session}>
              <Search />
            </ProtectedRoute>
          }
        />
        <Route
          path="/show/:id"
          element={
            <ProtectedRoute session={session}>
              <ShowDetails />
            </ProtectedRoute>
          }
        />
        <Route
          path="/my-shows"
          element={
            <ProtectedRoute session={session}>
              <MyShows />
            </ProtectedRoute>
          }
        />
        <Route
          path="/my-shows/:id"
          element={
            <ProtectedRoute session={session}>
              <MyShowDetails />
            </ProtectedRoute>
          }
        />
        <Route
          path="/actor/:name"
          element={
            <ProtectedRoute session={session}>
              <ActorPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/calendar"
          element={
            <ProtectedRoute session={session}>
              <CalendarPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile/edit"
          element={
            <ProtectedRoute session={session}>
              <ProfileEdit />
            </ProtectedRoute>
          }
        />
        <Route
          path="/rankd"
          element={
            <ProtectedRoute session={session}>
              <Rankd />
            </ProtectedRoute>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
        <Route path="/show/tmdb/:tmdbId" element={<TmdbShowDetails />} />
      </Routes>

      <MobileBottomNav session={session} />
    </>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppLayout />
    </BrowserRouter>
  );
}

export default App;
