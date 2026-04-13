import {
  BrowserRouter,
  Routes,
  Route,
  NavLink,
  useLocation,
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

function DesktopNav() {
  return (
    <div className="nav-wrap desktop-nav">
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

        <NavLink
          to="/login"
          className={({ isActive }) => `top-tab${isActive ? " active" : ""}`}
        >
          Login
        </NavLink>
      </nav>
    </div>
  );
}

function MobileBottomNav() {
  const location = useLocation();

  if (location.pathname === "/login") {
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

function AppLayout() {
  return (
    <>
      <DesktopNav />

      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/search" element={<Search />} />
        <Route path="/login" element={<Login />} />
        <Route path="/show/:id" element={<ShowDetails />} />
        <Route path="/my-shows" element={<MyShows />} />
        <Route path="/my-shows/:id" element={<MyShowDetails />} />
        <Route path="/actor/:name" element={<ActorPage />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/profile/edit" element={<ProfileEdit />} />
        <Route path="/rankd" element={<Rankd />} />
      </Routes>

      <MobileBottomNav />
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
