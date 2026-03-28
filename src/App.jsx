import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import "./index.css";

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

function AppNav() {
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

        <NavLink
          to="/login"
          className={({ isActive }) => `top-tab${isActive ? " active" : ""}`}
        >
          Login
        </NavLink>

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

function App() {
  return (
    <BrowserRouter>
      <AppNav />

      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/search" element={<Search />} />
        <Route path="/login" element={<Login />} />
        <Route path="/show/:id" element={<ShowDetails />} />
        <Route path="/my-shows" element={<MyShows />} />
        <Route path="/my-shows/:id" element={<MyShowDetails />} />
        <Route path="/actor/:name" element={<ActorPage />} />
        <Route path="/airing-next" element={<AiringNextPage />} />
        <Route path="/ready-to-watch" element={<ReadyToWatchPage />} />
        <Route path="/ready/:id" element={<ReadyShowPage />} />
        <Route path="/calendar" element={<CalendarPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
