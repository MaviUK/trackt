import { BrowserRouter, Routes, Route, Link } from "react-router-dom"
import Home from "./pages/Home"
import Search from "./pages/Search"
import Login from "./pages/Login"
import ShowDetails from "./pages/ShowDetails"
import MyShows from "./pages/MyShows"
import MyShowDetails from "./pages/MyShowDetails"
import AiringNextPage from "./pages/airingnext";
import ReadyToWatchPage from "./pages/readytowatch";
import ReadyShowPage from "./pages/readyShow";
import Dashboard from "./pages/Dashboard";

function AppNav() {
  return (
    <nav className="top-tabs">
      <NavLink to="/" end className={({ isActive }) => `top-tab ${isActive ? "active" : ""}`}>
        Dashboard
      </NavLink>
      <NavLink to="/search" className={({ isActive }) => `top-tab ${isActive ? "active" : ""}`}>
        Search
      </NavLink>
      <NavLink to="/my-shows" className={({ isActive }) => `top-tab ${isActive ? "active" : ""}`}>
        My Shows
      </NavLink>
      <NavLink to="/airing-next" className={({ isActive }) => `top-tab ${isActive ? "active" : ""}`}>
        Airing Next
      </NavLink>
      <NavLink to="/ready-to-watch" className={({ isActive }) => `top-tab ${isActive ? "active" : ""}`}>
        Ready To Watch
      </NavLink>
    </nav>
  );
}

export default AppNav;

        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/search" element={<Search />} />
          <Route path="/login" element={<Login />} />
          <Route path="/show/:id" element={<ShowDetails />} />
          <Route path="/my-shows" element={<MyShows />} />
          <Route path="/my-shows/:id" element={<MyShowDetails />} />
          <Route path="/airing-next" element={<AiringNextPage />} />
          <Route path="/ready-to-watch" element={<ReadyToWatchPage />} />
          <Route path="/ready/:id" element={<ReadyShowPage />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}

export default App
