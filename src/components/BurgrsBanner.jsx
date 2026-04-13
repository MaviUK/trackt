import { useEffect, useState } from "react";

export default function BurgrsBanner() {
  const [small, setSmall] = useState(false);

  useEffect(() => {
    function handleScroll() {
      setSmall(window.scrollY > 40);
    }

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header className={`burgrs-banner ${small ? "small" : ""}`}>
      <div className="burgrs-banner-overlay" />

      <div className="burgrs-banner-center">
        <img
          src="/burger-rating.png"
          alt="Burger"
          className="burgrs-banner-burger"
        />
        <h1 className="burgrs-banner-title">BURGRS</h1>
      </div>
    </header>
  );
}
